import { Router, type IRouter } from "express";
import { and, gte, lte, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  db,
  invoicesTable,
  projectsTable,
  customersTable,
  costEntriesTable,
  staffTable,
  employeesTable,
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

type Line = {
  invoiceId: string;
  invoiceNumber: string;
  projectId: string;
  projectName: string;
  salesRep: string | null;
  siteSupervisor: string | null;
  // 歩合発生基準日: 営業/マネジメントは sentAt、監督は paidAt が入る。
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

  // 対象月に「送付済」または「入金済」になった請求書を取得。
  // 営業歩合 + マネジメント報酬 → sentAt 月で発生。
  // 現場監督歩合 → paidAt 月で発生。
  // (案件のステータスは問わない — 請求書の状態のみがトリガー)
  const monthInvoices = await db
    .select()
    .from(invoicesTable)
    .where(
      or(
        and(
          isNotNull(invoicesTable.sentAt),
          gte(invoicesTable.sentAt, start),
          lte(invoicesTable.sentAt, end),
        ),
        and(
          isNotNull(invoicesTable.paidAt),
          gte(invoicesTable.paidAt, start),
          lte(invoicesTable.paidAt, end),
        ),
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

  // 当月送付分のみで集計する活動指標 (画面上の「送付済請求件数 / 送付額合計」)。
  const sentInvoices = monthInvoices.filter((i) => {
    const d = isoDate(i.sentAt);
    return d != null && d >= start && d <= end;
  });
  const paidInvoices = monthInvoices.filter((i) => {
    const d = isoDate(i.paidAt);
    return d != null && d >= start && d <= end;
  });

  const projectIds = [...new Set(monthInvoices.map((i) => i.projectId))];
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

  // 監督歩合用: paidAt が当月の請求書ごとに「規定超過粗利」を出すため、
  // 案件の実原価合計 と 案件の請求書合計 (税込) を取得して請求額按分する。
  const paidProjectIds = [...new Set(paidInvoices.map((i) => i.projectId))];
  const allInvoicesForPaid =
    paidProjectIds.length > 0
      ? await db
          .select()
          .from(invoicesTable)
          .where(inArray(invoicesTable.projectId, paidProjectIds))
      : [];
  const projectInvoicedTotal = new Map<string, number>();
  for (const inv of allInvoicesForPaid) {
    const items = (inv.items ?? []) as LineItemJson[];
    const { total } = computeTotals(items);
    projectInvoicedTotal.set(
      inv.projectId,
      (projectInvoicedTotal.get(inv.projectId) ?? 0) + total,
    );
  }
  const costEntries =
    paidProjectIds.length > 0
      ? await db
          .select({
            projectId: costEntriesTable.projectId,
            actualAmount: costEntriesTable.actualAmount,
          })
          .from(costEntriesTable)
          .where(inArray(costEntriesTable.projectId, paidProjectIds))
      : [];
  const actualByProject = new Map<string, number>();
  for (const ce of costEntries) {
    actualByProject.set(
      ce.projectId,
      (actualByProject.get(ce.projectId) ?? 0) + n(ce.actualAmount),
    );
  }

  // 社員マスタ (営業/現場監督/事務) — 人物マッチ用
  const allEmployees = await db.select().from(employeesTable);
  // 職人マスタは表示用フォールバック (人物名が社員になければ職人を見る)
  const allStaff = await db.select().from(staffTable);

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
      const emp = allEmployees.find((e) => e.name.trim() === key);
      const staff = emp ? null : allStaff.find((s) => s.name.trim() === key);
      p = {
        name: key,
        staffId: emp?.id ?? staff?.id ?? null,
        salesCommission: 0,
        supervisorCommission: 0,
        otherSalesBonus: 0,
        lines: [],
      };
      people.set(key, p);
    }
    return p;
  }

  // 月内送付請求書の合計 (歩合ゲート前の活動指標)
  let totalInvoiceAmount = 0;
  for (const inv of sentInvoices) {
    const items = (inv.items ?? []) as LineItemJson[];
    totalInvoiceAmount += computeTotals(items).total;
  }

  function bonusForProject(
    project: typeof projects[number],
  ): { recipient: string; rate: number } | null {
    const recipient = project.otherSalesBonusRecipient?.trim();
    if (!recipient) return null;
    const rate =
      project.otherSalesBonusRate == null ? 0 : n(project.otherSalesBonusRate);
    if (rate <= 0) return null;
    const salesRep = project.salesRep?.trim() || null;
    if (salesRep && salesRep === recipient) return null;
    return { recipient, rate };
  }

  // 1) 営業歩合 + マネジメント報酬 — 当月送付済の請求書ごとに per-invoice で計上。
  for (const inv of sentInvoices) {
    const project = projectMap.get(inv.projectId);
    if (!project) continue;
    const items = (inv.items ?? []) as LineItemJson[];
    const sales = computeTotals(items).total;
    if (sales <= 0) continue;
    const sentAt = isoDate(inv.sentAt)!;
    const salesRep = project.salesRep?.trim() || null;
    const siteSupervisor = project.siteSupervisor?.trim() || null;
    const bonus = bonusForProject(project);

    // 営業歩合
    if (salesRep) {
      const rate = n(project.salesCommissionRate);
      const bonusOut = bonus?.rate ?? 0;
      const effectiveRate = Math.max(0, rate - bonusOut);
      const amount = Math.round((sales * effectiveRate) / 100);
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
          invoiceTotal: sales,
          kind: "sales",
          amount,
          rate: effectiveRate,
          baseAmount: sales,
          note:
            bonusOut > 0
              ? `${rate}% − マネジメント報酬 ${bonusOut}% = ${effectiveRate}% (送付月)`
              : `請求額 × ${effectiveRate}% (送付月)`,
        });
      }
    }

    // マネジメント報酬
    if (bonus) {
      const amount = Math.round((sales * bonus.rate) / 100);
      if (amount > 0) {
        const p = getPerson(bonus.recipient);
        p.otherSalesBonus += amount;
        p.lines.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          projectId: project.id,
          projectName: project.name,
          salesRep,
          siteSupervisor,
          sentAt,
          invoiceTotal: sales,
          kind: "other_sales_bonus",
          amount,
          rate: bonus.rate,
          baseAmount: sales,
          note: salesRep
            ? `${salesRep} 獲得分から ${bonus.rate}% (送付月)`
            : `${bonus.rate}% (送付月)`,
        });
      }
    }
  }

  // 2) 現場監督歩合 — 当月入金済の請求書ごとに per-invoice で計上。
  // 規定超過粗利 = invoice.total − invoice.total×営業率% − invoice.total×規定利益率% − 案件実原価×按分率
  // 按分率 = invoice.total / 案件全請求書合計 (税込)
  for (const inv of paidInvoices) {
    const project = projectMap.get(inv.projectId);
    if (!project) continue;
    const items = (inv.items ?? []) as LineItemJson[];
    const sales = computeTotals(items).total;
    if (sales <= 0) continue;
    const paidAt = isoDate(inv.paidAt)!;
    const salesRep = project.salesRep?.trim() || null;
    const siteSupervisor = project.siteSupervisor?.trim() || null;
    if (!siteSupervisor) continue;

    const customer = customerMap.get(project.customerId);
    const standardRate =
      project.standardProfitRate != null
        ? n(project.standardProfitRate)
        : customer
          ? n(customer.defaultProfitRate)
          : 20;
    const salesRate = n(project.salesCommissionRate);
    const supervisorRate = n(project.supervisorCommissionRate);
    const projectInvTotal = projectInvoicedTotal.get(project.id) ?? sales;
    const allocationRatio = projectInvTotal > 0 ? sales / projectInvTotal : 1;
    const allocatedActual =
      (actualByProject.get(project.id) ?? 0) * allocationRatio;
    const salesCom = sales * (salesRate / 100);
    const standardProfit = sales * (standardRate / 100);
    const excessProfit = Math.max(
      0,
      sales - salesCom - standardProfit - allocatedActual,
    );
    const amount = Math.round((excessProfit * supervisorRate) / 100);
    if (amount > 0) {
      const p = getPerson(siteSupervisor);
      p.supervisorCommission += amount;
      p.lines.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        projectId: project.id,
        projectName: project.name,
        salesRep,
        siteSupervisor,
        sentAt: paidAt,
        invoiceTotal: sales,
        kind: "supervisor",
        amount,
        rate: supervisorRate,
        baseAmount: excessProfit,
        note: `規定超過粗利 ¥${Math.round(excessProfit).toLocaleString()} × ${supervisorRate}% (入金月)`,
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
        invoiceCount: sentInvoices.length,
        invoiceTotal: totalInvoiceAmount,
      },
      people: peopleArr,
    }),
  );
});

export default router;
