import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  customersTable,
  costEntriesTable,
  vendorInvoicesTable,
  vendorQuotesTable,
  receiptsTable,
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
import { getOrCreateAppUser, requireInternal } from "../lib/auth";

const router: IRouter = Router();

type ProjectRow = typeof projectsTable.$inferSelect;

async function aggregateCosts(projectId: string) {
  const entries = await db
    .select()
    .from(costEntriesTable)
    .where(eq(costEntriesTable.projectId, projectId))
    .orderBy(sql`${costEntriesTable.createdAt} asc, ${costEntriesTable.id} asc`);
  const planned = entries.reduce((s, e) => s + n(e.plannedAmount), 0);
  const actual = entries.reduce((s, e) => s + n(e.actualAmount), 0);
  return { entries, planned, actual };
}

async function serializeProject(p: ProjectRow) {
  const [customer] = await db
    .select({
      name: customersTable.name,
      defaultProfitRate: customersTable.defaultProfitRate,
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
    saturdayWork: p.saturdayWork,
    contractAmount: n(p.contractAmount),
    plannedCost: planned,
    actualCost: actual,
    salesCommissionRate: n(p.salesCommissionRate),
    standardProfitRate:
      p.standardProfitRate != null
        ? n(p.standardProfitRate)
        : customer
          ? n(customer.defaultProfitRate)
          : 20,
    supervisorCommissionRate: n(p.supervisorCommissionRate),
    otherSalesBonusRecipient: p.otherSalesBonusRecipient,
    otherSalesBonusRate:
      p.otherSalesBonusRate == null ? null : n(p.otherSalesBonusRate),
    salesRep: p.salesRep,
    siteSupervisor: p.siteSupervisor,
    notes: p.notes,
    ledgerCompletedAt: isoDateTime(p.ledgerCompletedAt),
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

router.post("/projects", requireInternal, async (req, res): Promise<void> => {
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
      saturdayWork: parsed.data.saturdayWork ?? true,
      contractAmount:
        parsed.data.contractAmount == null
          ? "0"
          : String(parsed.data.contractAmount),
      salesCommissionRate:
        parsed.data.salesCommissionRate == null
          ? "5"
          : String(parsed.data.salesCommissionRate),
      standardProfitRate:
        parsed.data.standardProfitRate == null
          ? null
          : String(parsed.data.standardProfitRate),
      supervisorCommissionRate:
        parsed.data.supervisorCommissionRate == null
          ? "30"
          : String(parsed.data.supervisorCommissionRate),
      otherSalesBonusRecipient: parsed.data.otherSalesBonusRecipient ?? null,
      otherSalesBonusRate:
        parsed.data.otherSalesBonusRate == null
          ? null
          : String(parsed.data.otherSalesBonusRate),
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

router.patch("/projects/:id", requireInternal, async (req, res): Promise<void> => {
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
  if ("standardProfitRate" in parsed.data) {
    data.standardProfitRate =
      parsed.data.standardProfitRate == null
        ? null
        : String(parsed.data.standardProfitRate);
  }
  if (parsed.data.supervisorCommissionRate != null) {
    data.supervisorCommissionRate = String(parsed.data.supervisorCommissionRate);
  }
  if ("otherSalesBonusRate" in parsed.data) {
    data.otherSalesBonusRate =
      parsed.data.otherSalesBonusRate == null
        ? null
        : String(parsed.data.otherSalesBonusRate);
  }
  if ("otherSalesBonusRecipient" in parsed.data) {
    data.otherSalesBonusRecipient =
      parsed.data.otherSalesBonusRecipient || null;
  }
  if ("startDate" in parsed.data) data.startDate = isoDate(parsed.data.startDate);
  if ("endDate" in parsed.data) data.endDate = isoDate(parsed.data.endDate);
  if ("ledgerCompletedAt" in parsed.data) {
    data.ledgerCompletedAt = parsed.data.ledgerCompletedAt
      ? new Date(parsed.data.ledgerCompletedAt)
      : null;
  }
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

router.delete("/projects/:id", requireInternal, async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // 案件削除: 紐付く資料 (見積/請求/工程表/施工台帳/出面/進捗) は schema 側で
  // onDelete: cascade。職人見積・職人請求・領収書 は projectId set null なので
  // 明示的に削除して 案件と一緒に消す。
  const projectId = params.data.id;
  await db
    .delete(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.projectId, projectId));
  await db
    .delete(vendorQuotesTable)
    .where(eq(vendorQuotesTable.projectId, projectId));
  await db.delete(receiptsTable).where(eq(receiptsTable.projectId, projectId));
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
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
