import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  customersTable,
  costEntriesTable,
} from "@workspace/db";
import {
  CreateProjectBody,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
  GetProjectParams,
  GetProjectLedgerParams,
  ListProjectsQueryParams,
  ListProjectsResponse,
  CreateProjectResponse,
  GetProjectResponse,
  UpdateProjectResponse,
  GetProjectLedgerResponse,
} from "@workspace/api-zod";
import { isoDateTime, isoDate, n } from "../lib/serializers";
import { getOrCreateAppUser } from "../lib/auth";

const router: IRouter = Router();

type ProjectRow = typeof projectsTable.$inferSelect;

async function aggregateCosts(projectId: string) {
  const entries = await db
    .select()
    .from(costEntriesTable)
    .where(eq(costEntriesTable.projectId, projectId));
  const planned = entries.reduce((s, e) => s + n(e.plannedAmount), 0);
  const actual = entries.reduce((s, e) => s + n(e.actualAmount), 0);
  return { entries, planned, actual };
}

async function serializeProject(p: ProjectRow) {
  const [customer] = await db
    .select({
      name: customersTable.name,
      defaultProfitRate: customersTable.defaultProfitRate,
      defaultSupervisorCommissionRate:
        customersTable.defaultSupervisorCommissionRate,
    })
    .from(customersTable)
    .where(eq(customersTable.id, p.customerId));
  const { planned, actual } = await aggregateCosts(p.id);
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    status: p.status as never,
    customerId: p.customerId,
    customerName: customer?.name ?? "",
    siteAddress: p.siteAddress,
    unitNumber: p.unitNumber,
    startDate: isoDate(p.startDate),
    endDate: isoDate(p.endDate),
    contractAmount: n(p.contractAmount),
    plannedCost: planned,
    actualCost: actual,
    salesCommissionRate: n(p.salesCommissionRate),
    standardProfitRate: customer ? n(customer.defaultProfitRate) : 20,
    supervisorCommissionRate: customer
      ? n(customer.defaultSupervisorCommissionRate)
      : 30,
    salesRep: p.salesRep,
    siteSupervisor: p.siteSupervisor,
    notes: p.notes,
    createdAt: isoDateTime(p.createdAt),
  };
}

router.get("/projects", async (req, res): Promise<void> => {
  const parsedQuery = ListProjectsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { status } = parsedQuery.data;
  const rows = status
    ? await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.status, status))
        .orderBy(sql`${projectsTable.createdAt} desc`)
    : await db
        .select()
        .from(projectsTable)
        .orderBy(sql`${projectsTable.createdAt} desc`);
  const serialized = await Promise.all(rows.map(serializeProject));
  res.json(ListProjectsResponse.parse(serialized));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = await getOrCreateAppUser(req);
  const [row] = await db
    .insert(projectsTable)
    .values({
      name: parsed.data.name,
      code: parsed.data.code ?? null,
      status: parsed.data.status,
      customerId: parsed.data.customerId,
      siteAddress: parsed.data.siteAddress ?? null,
      unitNumber: parsed.data.unitNumber ?? null,
      startDate: isoDate(parsed.data.startDate),
      endDate: isoDate(parsed.data.endDate),
      contractAmount:
        parsed.data.contractAmount == null
          ? "0"
          : String(parsed.data.contractAmount),
      salesCommissionRate:
        parsed.data.salesCommissionRate == null
          ? "5"
          : String(parsed.data.salesCommissionRate),
      salesRep: parsed.data.salesRep ?? null,
      siteSupervisor: parsed.data.siteSupervisor ?? null,
      notes: parsed.data.notes ?? null,
      createdBy: me.clerkUserId,
    })
    .returning();
  res.json(CreateProjectResponse.parse(await serializeProject(row)));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(GetProjectResponse.parse(await serializeProject(row)));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.contractAmount != null) {
    data.contractAmount = String(parsed.data.contractAmount);
  }
  if (parsed.data.salesCommissionRate != null) {
    data.salesCommissionRate = String(parsed.data.salesCommissionRate);
  }
  if ("startDate" in parsed.data) data.startDate = isoDate(parsed.data.startDate);
  if ("endDate" in parsed.data) data.endDate = isoDate(parsed.data.endDate);
  const [row] = await db
    .update(projectsTable)
    .set(data)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(UpdateProjectResponse.parse(await serializeProject(row)));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(projectsTable).where(eq(projectsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/projects/:id/ledger", async (req, res): Promise<void> => {
  const params = GetProjectLedgerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { entries, planned, actual } = await aggregateCosts(project.id);
  const contract = n(project.contractAmount);
  const grossProfit = contract - actual;
  const grossProfitRate = contract > 0 ? (grossProfit / contract) * 100 : 0;

  const categories = ["material", "subcontract", "labor", "expense", "other"];
  const byCategory = categories.map((category) => {
    const filtered = entries.filter((e) => e.category === category);
    return {
      category: category as never,
      plannedAmount: filtered.reduce((s, e) => s + n(e.plannedAmount), 0),
      actualAmount: filtered.reduce((s, e) => s + n(e.actualAmount), 0),
    };
  });

  const serializedEntries = entries.map((e) => ({
    id: e.id,
    projectId: e.projectId,
    projectName: project.name,
    category: e.category as never,
    description: e.description,
    vendor: e.vendor,
    plannedAmount: n(e.plannedAmount),
    actualAmount: n(e.actualAmount),
    entryDate: isoDate(e.entryDate)!,
    notes: e.notes,
    createdAt: isoDateTime(e.createdAt),
  }));

  res.json(
    GetProjectLedgerResponse.parse({
      projectId: project.id,
      projectName: project.name,
      contractAmount: contract,
      plannedCost: planned,
      actualCost: actual,
      grossProfit,
      grossProfitRate: Math.round(grossProfitRate * 10) / 10,
      byCategory,
      entries: serializedEntries,
    }),
  );
});

export default router;
