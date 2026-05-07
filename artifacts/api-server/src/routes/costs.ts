import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, costEntriesTable, projectsTable } from "@workspace/db";
import {
  CreateCostEntryBody,
  UpdateCostEntryParams,
  UpdateCostEntryBody,
  DeleteCostEntryParams,
  ListCostEntriesQueryParams,
  ListCostEntriesResponse,
  CreateCostEntryResponse,
  UpdateCostEntryResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime, n } from "../lib/serializers";
import { getOrCreateAppUser } from "../lib/auth";

const router: IRouter = Router();

async function serialize(c: typeof costEntriesTable.$inferSelect) {
  const [project] = await db
    .select({ name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.id, c.projectId));
  return {
    id: c.id,
    projectId: c.projectId,
    projectName: project?.name ?? "",
    category: c.category as never,
    description: c.description,
    vendor: c.vendor,
    plannedAmount: n(c.plannedAmount),
    actualAmount: n(c.actualAmount),
    entryDate: isoDate(c.entryDate)!,
    notes: c.notes,
    createdAt: isoDateTime(c.createdAt),
  };
}

router.get("/cost-entries", async (req, res): Promise<void> => {
  const parsedQuery = ListCostEntriesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { projectId } = parsedQuery.data;
  const rows = projectId
    ? await db
        .select()
        .from(costEntriesTable)
        .where(eq(costEntriesTable.projectId, projectId))
        .orderBy(sql`${costEntriesTable.entryDate} desc`)
    : await db
        .select()
        .from(costEntriesTable)
        .orderBy(sql`${costEntriesTable.entryDate} desc`);
  const serialized = await Promise.all(rows.map(serialize));
  res.json(ListCostEntriesResponse.parse(serialized));
});

router.post("/cost-entries", async (req, res): Promise<void> => {
  const parsed = CreateCostEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = await getOrCreateAppUser(req);
  const [row] = await db
    .insert(costEntriesTable)
    .values({
      projectId: parsed.data.projectId,
      category: parsed.data.category,
      description: parsed.data.description,
      vendor: parsed.data.vendor ?? null,
      plannedAmount: String(parsed.data.plannedAmount),
      actualAmount: String(parsed.data.actualAmount),
      entryDate: parsed.data.entryDate as unknown as string,
      notes: parsed.data.notes ?? null,
      createdBy: me.clerkUserId,
    })
    .returning();
  res.json(CreateCostEntryResponse.parse(await serialize(row)));
});

router.patch("/cost-entries/:id", async (req, res): Promise<void> => {
  const params = UpdateCostEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCostEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(costEntriesTable)
    .set({
      projectId: parsed.data.projectId,
      category: parsed.data.category,
      description: parsed.data.description,
      vendor: parsed.data.vendor ?? null,
      plannedAmount: String(parsed.data.plannedAmount),
      actualAmount: String(parsed.data.actualAmount),
      entryDate: parsed.data.entryDate as unknown as string,
      notes: parsed.data.notes ?? null,
    })
    .where(eq(costEntriesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Cost entry not found" });
    return;
  }
  res.json(UpdateCostEntryResponse.parse(await serialize(row)));
});

router.delete("/cost-entries/:id", async (req, res): Promise<void> => {
  const params = DeleteCostEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(costEntriesTable)
    .where(eq(costEntriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
