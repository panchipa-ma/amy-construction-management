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
} from "@workspace/db";
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
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const completedThisMonth = projects.filter(
    (p) =>
      p.status === "completed" &&
      new Date(p.createdAt as unknown as string) >= monthStart,
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

  const unpaidInvoiceTotal = invoices
    .filter((inv) => !inv.paid)
    .reduce((s, inv) => {
      const items = (inv.items ?? []) as LineItemJson[];
      return s + computeTotals(items).total;
    }, 0);

  const allStatuses = [
    "estimating",
    "contracted",
    "in_progress",
    "completed",
    "archived",
  ] as const;
  const statusBreakdown = allStatuses.map((status) => ({
    status,
    count: projects.filter((p) => p.status === status).length,
  }));

  res.json(
    GetDashboardSummaryResponse.parse({
      activeProjects: activeProjects.length,
      completedThisMonth,
      contractValueActive,
      plannedCostActive,
      actualCostActive,
      grossProfitActive,
      unpaidInvoiceTotal,
      statusBreakdown,
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

  const items: Activity[] = projects.map((p) => ({
    id: `project-${p.id}`,
    kind: "project",
    title: `案件「${p.name}」を登録`,
    subtitle: null,
    projectId: p.id,
    projectName: p.name,
    timestamp: isoDateTime(p.createdAt),
  }));

  const costs = await db
    .select()
    .from(costEntriesTable)
    .orderBy(sql`${costEntriesTable.createdAt} desc`)
    .limit(10);
  for (const c of costs) {
    const projectName = await ensureProjectName(c.projectId);
    items.push({
      id: `cost-${c.id}`,
      kind: "cost",
      title: `原価「${c.description}」を記録`,
      subtitle: `実績 ¥${n(c.actualAmount).toLocaleString()}`,
      projectId: c.projectId,
      projectName,
      timestamp: isoDateTime(c.createdAt),
    });
  }

  const quotes = await db
    .select()
    .from(quotesTable)
    .orderBy(sql`${quotesTable.createdAt} desc`)
    .limit(5);
  for (const q of quotes) {
    const projectName = await ensureProjectName(q.projectId);
    items.push({
      id: `quote-${q.id}`,
      kind: "quote",
      title: `見積書 ${q.quoteNumber} を作成`,
      subtitle: null,
      projectId: q.projectId,
      projectName,
      timestamp: isoDateTime(q.createdAt),
    });
  }

  const invs = await db
    .select()
    .from(invoicesTable)
    .orderBy(sql`${invoicesTable.createdAt} desc`)
    .limit(5);
  for (const inv of invs) {
    const projectName = await ensureProjectName(inv.projectId);
    items.push({
      id: `invoice-${inv.id}`,
      kind: "invoice",
      title: `請求書 ${inv.invoiceNumber} を作成`,
      subtitle: inv.paid ? "入金済" : "未入金",
      projectId: inv.projectId,
      projectName,
      timestamp: isoDateTime(inv.createdAt),
    });
  }

  const schedules = await db
    .select()
    .from(scheduleEntriesTable)
    .orderBy(sql`${scheduleEntriesTable.createdAt} desc`)
    .limit(5);
  for (const s of schedules) {
    const projectName = await ensureProjectName(s.projectId);
    items.push({
      id: `schedule-${s.id}`,
      kind: "schedule",
      title: `予定「${s.task}」を登録`,
      subtitle: null,
      projectId: s.projectId,
      projectName,
      timestamp: isoDateTime(s.createdAt),
    });
  }

  const logs = await db
    .select()
    .from(progressLogsTable)
    .orderBy(sql`${progressLogsTable.createdAt} desc`)
    .limit(5);
  for (const l of logs) {
    const projectName = await ensureProjectName(l.projectId);
    items.push({
      id: `progress-${l.id}`,
      kind: "progress",
      title: `現場記録「${l.title}」を追加`,
      subtitle: null,
      projectId: l.projectId,
      projectName,
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
