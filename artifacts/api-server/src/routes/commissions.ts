import { Router, type IRouter } from "express";
import { and, gte, lte, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  invoicesTable,
  projectsTable,
  customersTable,
  costEntriesTable,
  staffTable,
} from "@workspace/db";
import type { LineItemJson } from "@workspace/db";
import { GetCommissionsResponse } from "@workspace/api-zod";
import { computeTotals, n, isoDate } from "../lib/serializers";

const router: IRouter = Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function monthOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

type Line = {
  invoiceId: string;
  invoiceNumber: string;
  projectId: string;
  projectName: string;
  salesRep: string | null;
  siteSupervisor: string | null;
  sentAt: string;
  invoiceTotal: number;
  kind: "sales" | "supervisor" | "other_sales_bonus";
  amount: number;
  rate: number;
  baseAmount: number | null;
  note: string | null;
};

router.get("/commissions", async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : "";
  if (!MONTH_RE.test(month)) {
    res.status(400).json({ error: "Invalid 'month' (expected YYYY-MM)" });
    return;
  }
  const { start, end } = monthRange(month);

  // 対象月に送付済になった請求書
  const monthInvoices = await db
    .select()
    .from(invoicesTable)
    .where(
      and(
        isNotNull(invoicesTable.sentAt),
        gte(invoicesTable.sentAt, start),
        lte(invoicesTable.sentAt, end),
      ),
    );

  if (monthInvoices.length === 0) {
    res.json(
      GetCommissionsResponse.parse({
        month,
        totals: {
          salesCommission: 0,
          supervisorCommission: 0,
          otherSalesBonus: 0,
          total: 0,
          invoiceCount: 0,
          invoiceTotal: 0,
        },
        people: [],
      }),
    );
    return;
  }

  const projectIds = [...new Set(monthInvoices.map((i) => i.projectId))];

  // 対象案件
  const projects = await db
    .select()
    .from(projectsTable)
    .where(inArray(projectsTable.id, projectIds));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // 顧客 (規定利率フォールバック用)
  const customerIds = [...new Set(projects.map((p) => p.customerId))];
  const customers =
    customerIds.length > 0
      ? await db
          .select()
          .from(customersTable)
          .where(inArray(customersTable.id, customerIds))
      : [];
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  // 監督歩合は「竣工案件のみ」「最新の送付請求書がこの月に入っている」案件で1回だけ計上。
  const completedIds = projects
    .filter((p) => p.status === "completed")
    .map((p) => p.id);
  const allCompletedInvoices =
    completedIds.length > 0
      ? await db
          .select({
            projectId: invoicesTable.projectId,
            sentAt: invoicesTable.sentAt,
          })
          .from(invoicesTable)
          .where(
            and(
              inArray(invoicesTable.projectId, completedIds),
              isNotNull(invoicesTable.sentAt),
            ),
          )
      : [];
  const latestSentByProject = new Map<string, string>();
  for (const inv of allCompletedInvoices) {
    const d = isoDate(inv.sentAt);
    if (!d) continue;
    const cur = latestSentByProject.get(inv.projectId);
    if (!cur || d > cur) latestSentByProject.set(inv.projectId, d);
  }

  // 監督歩合計算用に、案件の請求書合計 (税込) と実原価合計を取得
  const allInvoicesForCompleted =
    completedIds.length > 0
      ? await db
          .select()
          .from(invoicesTable)
          .where(inArray(invoicesTable.projectId, completedIds))
      : [];
  const invoiceTotalByProject = new Map<string, number>();
  for (const inv of allInvoicesForCompleted) {
    const items = (inv.items ?? []) as LineItemJson[];
    const { total } = computeTotals(items);
    invoiceTotalByProject.set(
      inv.projectId,
      (invoiceTotalByProject.get(inv.projectId) ?? 0) + total,
    );
  }
  const costEntries =
    completedIds.length > 0
      ? await db
          .select({
            projectId: costEntriesTable.projectId,
            actualAmount: costEntriesTable.actualAmount,
          })
          .from(costEntriesTable)
          .where(inArray(costEntriesTable.projectId, completedIds))
      : [];
  const actualByProject = new Map<string, number>();
  for (const ce of costEntries) {
    actualByProject.set(
      ce.projectId,
      (actualByProject.get(ce.projectId) ?? 0) + n(ce.actualAmount),
    );
  }

  // 職員マスタ — 他人売上ボーナス対象者と staffId マッチ用
  const allStaff = await db.select().from(staffTable);
  const bonusStaff = allStaff.filter(
    (s) => s.otherSalesBonusRate != null && n(s.otherSalesBonusRate) > 0,
  );

  // 担当者ごとに集計
  type Person = {
    name: string;
    staffId: string | null;
    salesCommission: number;
    supervisorCommission: number;
    otherSalesBonus: number;
    lines: Line[];
  };
  const people = new Map<string, Person>();
  function getPerson(name: string): Person {
    const key = name.trim();
    let p = people.get(key);
    if (!p) {
      const staff = allStaff.find((s) => s.name.trim() === key);
      p = {
        name: key,
        staffId: staff?.id ?? null,
        salesCommission: 0,
        supervisorCommission: 0,
        otherSalesBonus: 0,
        lines: [],
      };
      people.set(key, p);
    }
    return p;
  }

  let totalInvoiceAmount = 0;

  // 1) 営業歩合 (請求書ごと)
  for (const inv of monthInvoices) {
    const project = projectMap.get(inv.projectId);
    if (!project) continue;
    const items = (inv.items ?? []) as LineItemJson[];
    const { total } = computeTotals(items);
    totalInvoiceAmount += total;
    const sentAt = isoDate(inv.sentAt)!;
    const salesRep = project.salesRep?.trim() || null;
    const siteSupervisor = project.siteSupervisor?.trim() || null;

    if (salesRep && total > 0) {
      const rate = n(project.salesCommissionRate);
      const amount = Math.round((total * rate) / 100);
      if (amount > 0) {
        const p = getPerson(salesRep);
        p.salesCommission += amount;
        p.lines.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          projectId: project.id,
          projectName: project.name,
          salesRep,
          siteSupervisor,
          sentAt,
          invoiceTotal: total,
          kind: "sales",
          amount,
          rate,
          baseAmount: total,
          note: null,
        });
      }
    }
  }

  // 2) 監督歩合 (竣工 + 最新請求が当月)
  const supervisorProjects = projects.filter((p) => {
    if (p.status !== "completed") return false;
    const latest = latestSentByProject.get(p.id);
    return latest != null && monthOf(latest) === month;
  });
  for (const project of supervisorProjects) {
    const supervisor = project.siteSupervisor?.trim() || null;
    if (!supervisor) continue;
    const sales = invoiceTotalByProject.get(project.id) ?? 0;
    if (sales <= 0) continue;
    const customer = customerMap.get(project.customerId);
    const standardRate =
      project.standardProfitRate != null
        ? n(project.standardProfitRate)
        : customer
          ? n(customer.defaultProfitRate)
          : 20;
    const salesRate = n(project.salesCommissionRate);
    const supervisorRate = n(project.supervisorCommissionRate);
    const salesCom = sales * (salesRate / 100);
    const standardProfit = sales * (standardRate / 100);
    const actualCost = actualByProject.get(project.id) ?? 0;
    const excessProfit = Math.max(
      0,
      sales - salesCom - standardProfit - actualCost,
    );
    const amount = Math.round((excessProfit * supervisorRate) / 100);
    if (amount <= 0) continue;
    const latestSent = latestSentByProject.get(project.id)!;
    // 当月の最新請求書 (ライン表示用)
    const latestInv =
      monthInvoices.find(
        (i) => i.projectId === project.id && isoDate(i.sentAt) === latestSent,
      ) ?? monthInvoices.find((i) => i.projectId === project.id);
    const p = getPerson(supervisor);
    p.supervisorCommission += amount;
    p.lines.push({
      invoiceId: latestInv?.id ?? "",
      invoiceNumber: latestInv?.invoiceNumber ?? "",
      projectId: project.id,
      projectName: project.name,
      salesRep: project.salesRep?.trim() || null,
      siteSupervisor: supervisor,
      sentAt: latestSent,
      invoiceTotal: sales,
      kind: "supervisor",
      amount,
      rate: supervisorRate,
      baseAmount: excessProfit,
      note: `規定超過粗利 ¥${Math.round(excessProfit).toLocaleString()} × ${supervisorRate}%`,
    });
  }

  // 3) 他人売上ボーナス (亘ルール)
  for (const staff of bonusStaff) {
    const rate = n(staff.otherSalesBonusRate);
    const name = staff.name.trim();
    for (const inv of monthInvoices) {
      const project = projectMap.get(inv.projectId);
      if (!project) continue;
      const salesRep = project.salesRep?.trim() || null;
      // 自分が獲得した売上は対象外
      if (salesRep === name) continue;
      const items = (inv.items ?? []) as LineItemJson[];
      const { total } = computeTotals(items);
      if (total <= 0) continue;
      const amount = Math.round((total * rate) / 100);
      if (amount <= 0) continue;
      const p = getPerson(name);
      p.otherSalesBonus += amount;
      p.lines.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        projectId: project.id,
        projectName: project.name,
        salesRep,
        siteSupervisor: project.siteSupervisor?.trim() || null,
        sentAt: isoDate(inv.sentAt)!,
        invoiceTotal: total,
        kind: "other_sales_bonus",
        amount,
        rate,
        baseAmount: total,
        note: salesRep ? `${salesRep} 獲得分` : "担当営業未設定",
      });
    }
  }

  const peopleArr = [...people.values()]
    .map((p) => ({
      name: p.name,
      staffId: p.staffId,
      salesCommission: p.salesCommission,
      supervisorCommission: p.supervisorCommission,
      otherSalesBonus: p.otherSalesBonus,
      total: p.salesCommission + p.supervisorCommission + p.otherSalesBonus,
      lines: p.lines.sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);

  const totals = peopleArr.reduce(
    (acc, p) => {
      acc.salesCommission += p.salesCommission;
      acc.supervisorCommission += p.supervisorCommission;
      acc.otherSalesBonus += p.otherSalesBonus;
      acc.total += p.total;
      return acc;
    },
    { salesCommission: 0, supervisorCommission: 0, otherSalesBonus: 0, total: 0 },
  );

  res.json(
    GetCommissionsResponse.parse({
      month,
      totals: {
        ...totals,
        invoiceCount: monthInvoices.length,
        invoiceTotal: totalInvoiceAmount,
      },
      people: peopleArr,
    }),
  );
});

export default router;
