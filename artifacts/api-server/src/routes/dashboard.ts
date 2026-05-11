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
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  let unpaidInvoiceTotal = 0;
  const outstandingProjectIds = new Set<string>();
  for (const inv of invoices) {
    if (inv.paid) continue;
    const issue = inv.issueDate ? String(inv.issueDate) : null;
    if (!issue || !/^\d{4}-\d{2}-\d{2}/.test(issue)) continue;
    if (new Date(issue) >= monthEnd) continue;
    const items = (inv.items ?? []) as LineItemJson[];
    unpaidInvoiceTotal += computeTotals(items).total;
    outstandingProjectIds.add(inv.projectId);
  }
  const billedProjectsCount = outstandingProjectIds.size;

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
  type Activity = {
    id: string;
    kind:
      | "project"
      | "cost"
      | "quote"
      | "invoice"
      | "schedule"
      | "progress";
    title: string;
    subtitle: string | null;
    projectId: string | null;
    projectName: string | null;
    actorName: string | null;
    timestamp: string;
  };

  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(sql`${projectsTable.createdAt} desc`)
    .limit(20);
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const ensureProjectName = async (id: string) => {
    if (projectMap.has(id)) return projectMap.get(id)!;
    const [p] = await db
      .select({ name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    const name = p?.name ?? "";
    projectMap.set(id, name);
    return name;
  };

  const costs = await db
    .select()
    .from(costEntriesTable)
    .orderBy(sql`${costEntriesTable.createdAt} desc`)
    .limit(10);
  const quotes = await db
    .select()
    .from(quotesTable)
    .orderBy(sql`${quotesTable.createdAt} desc`)
    .limit(5);
  const invs = await db
    .select()
    .from(invoicesTable)
    .orderBy(sql`${invoicesTable.createdAt} desc`)
    .limit(5);
  const schedules = await db
    .select()
    .from(scheduleEntriesTable)
    .orderBy(sql`${scheduleEntriesTable.createdAt} desc`)
    .limit(5);
  const logs = await db
    .select()
    .from(progressLogsTable)
    .orderBy(sql`${progressLogsTable.createdAt} desc`)
    .limit(5);

  // Collect every distinct Clerk userId that authored anything we'll show,
  // then resolve them to display names in a single query. Pre-Clerk rows
  // (createdBy = NULL) get actorName = null and the UI hides the byline.
  const actorIds = new Set<string>();
  const collect = (id: string | null | undefined) => {
    if (id) actorIds.add(id);
  };
  projects.forEach((p) => collect(p.createdBy));
  costs.forEach((c) => collect(c.createdBy));
  quotes.forEach((q) => collect(q.createdBy));
  invs.forEach((i) => collect(i.createdBy));
  schedules.forEach((s) => collect(s.createdBy));
  logs.forEach((l) => collect(l.createdBy));

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
  const actorOf = (id: string | null | undefined): string | null =>
    id ? actorMap.get(id) ?? null : null;

  const items: Activity[] = projects.map((p) => ({
    id: `project-${p.id}`,
    kind: "project",
    title: `案件「${p.name}」を登録`,
    subtitle: null,
    projectId: p.id,
    projectName: p.name,
    actorName: actorOf(p.createdBy),
    timestamp: isoDateTime(p.createdAt),
  }));

  for (const c of costs) {
    const projectName = await ensureProjectName(c.projectId);
    items.push({
      id: `cost-${c.id}`,
      kind: "cost",
      title: `原価「${c.description}」を記録`,
      subtitle: `実績 ¥${n(c.actualAmount).toLocaleString()}`,
      projectId: c.projectId,
      projectName,
      actorName: actorOf(c.createdBy),
      timestamp: isoDateTime(c.createdAt),
    });
  }

  for (const q of quotes) {
    const projectName = await ensureProjectName(q.projectId);
    items.push({
      id: `quote-${q.id}`,
      kind: "quote",
      title: `見積書 ${q.quoteNumber} を作成`,
      subtitle: null,
      projectId: q.projectId,
      projectName,
      actorName: actorOf(q.createdBy),
      timestamp: isoDateTime(q.createdAt),
    });
  }

  for (const inv of invs) {
    const projectName = await ensureProjectName(inv.projectId);
    items.push({
      id: `invoice-${inv.id}`,
      kind: "invoice",
      title: `請求書 ${inv.invoiceNumber} を作成`,
      subtitle: inv.paid ? "入金済" : "未入金",
      projectId: inv.projectId,
      projectName,
      actorName: actorOf(inv.createdBy),
      timestamp: isoDateTime(inv.createdAt),
    });
  }

  for (const s of schedules) {
    const projectName = await ensureProjectName(s.projectId);
    items.push({
      id: `schedule-${s.id}`,
      kind: "schedule",
      title: `予定「${s.task}」を登録`,
      subtitle: null,
      projectId: s.projectId,
      projectName,
      actorName: actorOf(s.createdBy),
      timestamp: isoDateTime(s.createdAt),
    });
  }

  for (const l of logs) {
    const projectName = await ensureProjectName(l.projectId);
    items.push({
      id: `progress-${l.id}`,
      kind: "progress",
      title: `現場記録「${l.title}」を追加`,
      subtitle: null,
      projectId: l.projectId,
      projectName,
      actorName: actorOf(l.createdBy),
      timestamp: isoDateTime(l.createdAt),
    });
  }

  items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  res.json(GetRecentActivityResponse.parse(items.slice(0, 25)));
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
