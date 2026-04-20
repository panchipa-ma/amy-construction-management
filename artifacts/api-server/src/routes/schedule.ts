import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  scheduleEntriesTable,
  projectsTable,
  staffTable,
} from "@workspace/db";
import {
  CreateScheduleEntryBody,
  UpdateScheduleEntryParams,
  UpdateScheduleEntryBody,
  DeleteScheduleEntryParams,
  ListScheduleEntriesQueryParams,
  ListScheduleEntriesResponse,
  CreateScheduleEntryResponse,
  UpdateScheduleEntryResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime } from "../lib/serializers";

const router: IRouter = Router();

async function serialize(s: typeof scheduleEntriesTable.$inferSelect) {
  const [project] = await db
    .select({ name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.id, s.projectId));
  const [st] = await db
    .select({ name: staffTable.name })
    .from(staffTable)
    .where(eq(staffTable.id, s.staffId));
  return {
    id: s.id,
    projectId: s.projectId,
    projectName: project?.name ?? "",
    staffId: s.staffId,
    staffName: st?.name ?? "",
    date: isoDate(s.date)!,
    task: s.task,
    startTime: s.startTime,
    endTime: s.endTime,
    notes: s.notes,
    createdAt: isoDateTime(s.createdAt),
  };
}

router.get("/schedule", async (req, res): Promise<void> => {
  const parsedQuery = ListScheduleEntriesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { projectId, from, to } = parsedQuery.data;
  const filters = [];
  if (projectId) filters.push(eq(scheduleEntriesTable.projectId, projectId));
  if (from)
    filters.push(
      gte(scheduleEntriesTable.date, from as unknown as string),
    );
  if (to)
    filters.push(lte(scheduleEntriesTable.date, to as unknown as string));
  const rows =
    filters.length > 0
      ? await db
          .select()
          .from(scheduleEntriesTable)
          .where(and(...filters))
          .orderBy(sql`${scheduleEntriesTable.date} asc`)
      : await db
          .select()
          .from(scheduleEntriesTable)
          .orderBy(sql`${scheduleEntriesTable.date} asc`);
  const serialized = await Promise.all(rows.map(serialize));
  res.json(ListScheduleEntriesResponse.parse(serialized));
});

router.post("/schedule", async (req, res): Promise<void> => {
  const parsed = CreateScheduleEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(scheduleEntriesTable)
    .values({
      projectId: parsed.data.projectId,
      staffId: parsed.data.staffId,
      date: parsed.data.date as unknown as string,
      task: parsed.data.task,
      startTime: parsed.data.startTime ?? null,
      endTime: parsed.data.endTime ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  res.json(CreateScheduleEntryResponse.parse(await serialize(row)));
});

router.patch("/schedule/:id", async (req, res): Promise<void> => {
  const params = UpdateScheduleEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateScheduleEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(scheduleEntriesTable)
    .set({
      projectId: parsed.data.projectId,
      staffId: parsed.data.staffId,
      date: parsed.data.date as unknown as string,
      task: parsed.data.task,
      startTime: parsed.data.startTime ?? null,
      endTime: parsed.data.endTime ?? null,
      notes: parsed.data.notes ?? null,
    })
    .where(eq(scheduleEntriesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }
  res.json(UpdateScheduleEntryResponse.parse(await serialize(row)));
});

router.delete("/schedule/:id", async (req, res): Promise<void> => {
  const params = DeleteScheduleEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(scheduleEntriesTable)
    .where(eq(scheduleEntriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
