import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  costEntriesTable,
  invoicesTable,
  quotesTable,
  scheduleEntriesTable,
  progressLogsTable,
  vendorInvoicesTable,
  vendorQuotesTable,
  appUsersTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import type { LineItemJson } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRecentActivityResponse,
  GetCostPipelineResponse,
} from "@workspace/api-zod";
import { isoDateTime, n, computeTotals } from "../lib/serializers";

const router: IRouter = Router();

const ACTIVE_STATUSES = ["estimating", "contracted", "in_progress"];

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable);
  const costs = await db.select().from(costEntriesTable);
  const invoices = await db.select().from(invoicesTable);

  const activeProjects = projects.filter((p) =>
    ACTIVE_STATUSES.includes(p.status),
  );
  const activeIds = new Set(activeProjects.map((p) => p.id));

  const now = new Date();
  const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // 「今月竣工」: 工期終了 (endDate) が当月の completed 案件。
  // 一覧 (/projects/completed) も endDate 月でフィルタするので 1:1 で揃う。
  const completedThisMonth = projects.filter(
    (p) =>
      p.status === "completed" &&
      p.endDate &&
      String(p.endDate).slice(0, 7) === yyyymm,
  ).length;

  const contractValueActive = activeProjects.reduce(
    (s, p) => s + n(p.contractAmount),
    0,
  );

  const activeCosts = costs.filter((c) => activeIds.has(c.projectId));
  const plannedCostActive = activeCosts.reduce(
    (s, c) => s + n(c.plannedAmount),
    0,
  );
  const actualCostActive = activeCosts.reduce(
    (s, c) => s + n(c.actualAmount),
    0,
  );
  const grossProfitActive = contractValueActive - actualCostActive;

  let invoicedTotal = 0;
  let paidInvoiceTotal = 0;
  for (const inv of invoices) {
    const items = (inv.items ?? []) as LineItemJson[];
    const total = computeTotals(items).total;
    invoicedTotal += total;
    if (inv.paid) paidInvoiceTotal += total;
  }

  // 「請求中案件」 — currentMonth 末日以前に発行された未入金請求書のみを対象。
  // 入金済になれば自動的に外れ、件数 / 金額両方から減る。
  const currentMonth = yyyymm;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let unpaidInvoiceTotal = 0;
  let currentMonthInvoiceTotal = 0;
  let priorOutstandingInvoiceTotal = 0;
  const outstandingProjectIds = new Set<string>();
  const currentMonthProjectIds = new Set<string>();
  const priorOutstandingProjectIds = new Set<string>();
  for (const inv of invoices) {
    if (inv.paid) continue;
    const issue = inv.issueDate ? String(inv.issueDate) : null;
    if (!issue || !/^\d{4}-\d{2}-\d{2}/.test(issue)) continue;
    const issueDate = new Date(issue);
    if (issueDate >= monthEnd) continue; // future month — out of scope
    const items = (inv.items ?? []) as LineItemJson[];
    const total = computeTotals(items).total;
    unpaidInvoiceTotal += total;
    outstandingProjectIds.add(inv.projectId);
    if (issueDate >= monthStart) {
      // 今月発行
      currentMonthInvoiceTotal += total;
      currentMonthProjectIds.add(inv.projectId);
    } else {
      // 今月より前に発行 → 未入金請求案件
      priorOutstandingInvoiceTotal += total;
      priorOutstandingProjectIds.add(inv.projectId);
    }
  }
  const billedProjectsCount = outstandingProjectIds.size;
  const currentMonthBilledProjectsCount = currentMonthProjectIds.size;
  const priorOutstandingProjectsCount = priorOutstandingProjectIds.size;

  // Monthly invoice totals grouped by the month of dueDate (支払期限).
  // Uses computeTotals over invoice line items so the figure exactly matches
  // the "金額 (税込)" column shown on /invoices.
  const monthlyMap = new Map<
    string,
    { total: number; paidTotal: number; unpaidTotal: number; count: number }
  >();
  let withoutDueDateCount = 0;
  let withoutDueDateTotal = 0;
  for (const inv of invoices) {
    const items = (inv.items ?? []) as LineItemJson[];
    const total = computeTotals(items).total;
    const due = inv.dueDate ? String(inv.dueDate) : null;
    if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) {
      withoutDueDateCount += 1;
      withoutDueDateTotal += total;
      continue;
    }
    const month = due.slice(0, 7); // YYYY-MM
    const cur = monthlyMap.get(month) ?? {
      total: 0,
      paidTotal: 0,
      unpaidTotal: 0,
      count: 0,
    };
    cur.total += total;
    if (inv.paid) cur.paidTotal += total;
    else cur.unpaidTotal += total;
    cur.count += 1;
    monthlyMap.set(month, cur);
  }
  const monthlyInvoiceTotals = Array.from(monthlyMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Bucket projects into 5 dashboard categories. Buckets are derived, not the
  // raw enum: a "completed" project that has been billed (sent to 元請) or
  // paid is shown as 請求済 / 入金済 instead, so we get a real progress
  // funnel (estimating → in_progress → completed → billed → paid).
  // contracted/archived are intentionally omitted from the chart.
  //
  // Bucket semantics for completed projects:
  //   入金済 = at least one invoice with paid=true (cash has come in)
  //   請求済 = at least one invoice with sentToClient=true (sent to 元請)
  //           but no paid invoice
  //   竣工   = otherwise (no invoices, or invoices exist but none sent)
  // Mixed paid + unpaid → 入金済 (cash takes precedence over send state).
  const invoicesByProject = new Map<
    string,
    { hasSent: boolean; hasPaid: boolean }
  >();
  for (const inv of invoices) {
    const cur = invoicesByProject.get(inv.projectId) ?? {
      hasSent: false,
      hasPaid: false,
    };
    if (inv.sentToClient) cur.hasSent = true;
    if (inv.paid) cur.hasPaid = true;
    invoicesByProject.set(inv.projectId, cur);
  }
  const buckets: Record<
    "estimating" | "in_progress" | "completed" | "billed" | "paid",
    number
  > = {
    estimating: 0,
    in_progress: 0,
    completed: 0,
    billed: 0,
    paid: 0,
  };
  for (const p of projects) {
    // archived projects are excluded from the funnel entirely, even if they
    // happen to carry invoices.
    if (p.status === "archived") continue;
    // estimating / in_progress are counted by their raw status — invoices
    // attached to them don't promote them out of the bucket, since the user
    // tracks them by where the project actually is in its lifecycle.
    if (p.status === "estimating") {
      buckets.estimating += 1;
      continue;
    }
    if (p.status === "in_progress" || p.status === "contracted") {
      buckets.in_progress += 1;
      continue;
    }
    // completed projects get promoted by invoice state: 入金済 (any paid
    // invoice) or 請求済 (any sentToClient=true invoice). An unsent invoice
    // alone does NOT promote the project out of 竣工.
    if (p.status === "completed") {
      const inv = invoicesByProject.get(p.id);
      if (inv?.hasPaid) buckets.paid += 1;
      else if (inv?.hasSent) buckets.billed += 1;
      else buckets.completed += 1;
    }
  }
  const statusBreakdown = (
    ["estimating", "in_progress", "completed", "billed", "paid"] as const
  ).map((status) => ({ status, count: buckets[status] }));

  res.json(
    GetDashboardSummaryResponse.parse({
      activeProjects: activeProjects.length,
      completedThisMonth,
      contractValueActive,
      plannedCostActive,
      actualCostActive,
      grossProfitActive,
      currentMonth,
      unpaidInvoiceTotal,
      billedProjectsCount,
      currentMonthBilledProjectsCount,
      currentMonthInvoiceTotal,
      priorOutstandingProjectsCount,
      priorOutstandingInvoiceTotal,
      invoicedTotal,
      paidInvoiceTotal,
      statusBreakdown,
      monthlyInvoiceTotals,
      invoicesWithoutDueDate: {
        count: withoutDueDateCount,
        total: withoutDueDateTotal,
      },
    }),
  );
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  // 案件ベースの集計: 案件本体 + 子レコード (原価/見積/請求/予定/進捗/職人請求/職人見積)
  // すべてを横断して各案件の最終更新 (createdAt) と最終アクター (createdBy) を求め、
  // 1 案件 1 行にまとめる。詳細 (金額や番号) は載せず、「だれがどの案件を触ったか」だけを示す。
  const [
    projects,
    costs,
    quotes,
    invs,
    schedules,
    logs,
    vendorInvs,
    vendorQuotes,
  ] = await Promise.all([
    db.select().from(projectsTable),
    db
      .select({
        projectId: costEntriesTable.projectId,
        createdAt: costEntriesTable.createdAt,
        createdBy: costEntriesTable.createdBy,
      })
      .from(costEntriesTable),
    db
      .select({
        projectId: quotesTable.projectId,
        createdAt: quotesTable.createdAt,
        createdBy: quotesTable.createdBy,
      })
      .from(quotesTable),
    db
      .select({
        projectId: invoicesTable.projectId,
        createdAt: invoicesTable.createdAt,
        createdBy: invoicesTable.createdBy,
      })
      .from(invoicesTable),
    db
      .select({
        projectId: scheduleEntriesTable.projectId,
        createdAt: scheduleEntriesTable.createdAt,
        createdBy: scheduleEntriesTable.createdBy,
      })
      .from(scheduleEntriesTable),
    db
      .select({
        projectId: progressLogsTable.projectId,
        createdAt: progressLogsTable.createdAt,
        createdBy: progressLogsTable.createdBy,
      })
      .from(progressLogsTable),
    db
      .select({
        projectId: vendorInvoicesTable.projectId,
        createdAt: vendorInvoicesTable.createdAt,
        createdBy: vendorInvoicesTable.createdBy,
      })
      .from(vendorInvoicesTable),
    db
      .select({
        projectId: vendorQuotesTable.projectId,
        createdAt: vendorQuotesTable.createdAt,
        createdBy: vendorQuotesTable.createdBy,
      })
      .from(vendorQuotesTable),
  ]);

  // 案件ごとの集計 bucket
  type Bucket = {
    projectId: string;
    projectName: string;
    projectCreatedAt: Date;
    latestAt: Date;
    latestBy: string | null;
    touched: boolean; // 子レコードによる更新があったか
  };
  const buckets = new Map<string, Bucket>();
  for (const p of projects) {
    buckets.set(p.id, {
      projectId: p.id,
      projectName: p.name,
      projectCreatedAt: p.createdAt,
      latestAt: p.createdAt,
      latestBy: p.createdBy ?? null,
      touched: false,
    });
  }

  const merge = (
    projectId: string | null | undefined,
    createdAt: Date | null | undefined,
    createdBy: string | null | undefined,
  ) => {
    if (!projectId || !createdAt) return;
    const b = buckets.get(projectId);
    if (!b) return; // 案件が削除済 → スキップ
    if (createdAt > b.latestAt) {
      b.latestAt = createdAt;
      b.latestBy = createdBy ?? null;
    }
    b.touched = true;
  };
  for (const r of costs) merge(r.projectId, r.createdAt, r.createdBy);
  for (const r of quotes) merge(r.projectId, r.createdAt, r.createdBy);
  for (const r of invs) merge(r.projectId, r.createdAt, r.createdBy);
  for (const r of schedules) merge(r.projectId, r.createdAt, r.createdBy);
  for (const r of logs) merge(r.projectId, r.createdAt, r.createdBy);
  for (const r of vendorInvs) merge(r.projectId, r.createdAt, r.createdBy);
  for (const r of vendorQuotes) merge(r.projectId, r.createdAt, r.createdBy);

  // アクター名一括解決
  const actorIds = new Set<string>();
  for (const b of buckets.values()) if (b.latestBy) actorIds.add(b.latestBy);
  const actorMap = new Map<string, string>();
  if (actorIds.size > 0) {
    const rows = await db
      .select({
        clerkUserId: appUsersTable.clerkUserId,
        displayName: appUsersTable.displayName,
        email: appUsersTable.email,
      })
      .from(appUsersTable)
      .where(inArray(appUsersTable.clerkUserId, Array.from(actorIds)));
    for (const r of rows) {
      const name = r.displayName?.trim() || r.email?.trim() || null;
      if (name) actorMap.set(r.clerkUserId, name);
    }
  }

  // 1 案件 1 行に整形。最新が案件作成時 (touched=false かつ latestAt===createdAt) なら「登録」、
  // それ以外は「更新」。
  const items = Array.from(buckets.values())
    .sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1))
    .slice(0, 25)
    .map((b) => {
      const verb = b.touched ? "更新" : "登録";
      return {
        id: `project-${b.projectId}`,
        kind: "project" as const,
        title: `案件「${b.projectName}」を${verb}`,
        subtitle: null,
        projectId: b.projectId,
        projectName: b.projectName,
        actorName: b.latestBy ? actorMap.get(b.latestBy) ?? null : null,
        timestamp: isoDateTime(b.latestAt),
      };
    });

  res.json(GetRecentActivityResponse.parse(items));
});

router.get("/dashboard/cost-pipeline", async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable);
  const costs = await db.select().from(costEntriesTable);

  const items = projects
    .filter((p) => ACTIVE_STATUSES.includes(p.status))
    .map((p) => {
      const projectCosts = costs.filter((c) => c.projectId === p.id);
      return {
        projectId: p.id,
        projectName: p.name,
        status: p.status as never,
        contractAmount: n(p.contractAmount),
        plannedCost: projectCosts.reduce((s, c) => s + n(c.plannedAmount), 0),
        actualCost: projectCosts.reduce((s, c) => s + n(c.actualAmount), 0),
      };
    });

  res.json(GetCostPipelineResponse.parse(items));
});

export default router;
