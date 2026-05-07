import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql, isNotNull } from "drizzle-orm";
import {
  db,
  scheduleEntriesTable,
  projectsTable,
  staffTable,
  projectPhasesTable,
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
import { getOrCreateAppUser } from "../lib/auth";

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

const MAX_EXPAND_DAYS = 90;

function expandDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cur <= last && dates.length < MAX_EXPAND_DAYS) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

async function getPhaseVirtualEntries(opts: {
  projectId?: string;
  from?: string;
  to?: string;
}) {
  const phaseConds = [isNotNull(projectPhasesTable.staffId)];
  if (opts.projectId)
    phaseConds.push(eq(projectPhasesTable.projectId, opts.projectId));
  if (opts.from) phaseConds.push(gte(projectPhasesTable.endDate, opts.from));
  if (opts.to) phaseConds.push(lte(projectPhasesTable.startDate, opts.to));

  const phases = await db
    .select({
      id: projectPhasesTable.id,
      projectId: projectPhasesTable.projectId,
      staffId: projectPhasesTable.staffId,
      name: projectPhasesTable.name,
      startDate: projectPhasesTable.startDate,
      endDate: projectPhasesTable.endDate,
      createdAt: projectPhasesTable.createdAt,
      projectName: projectsTable.name,
      staffName: staffTable.name,
    })
    .from(projectPhasesTable)
    .innerJoin(projectsTable, eq(projectPhasesTable.projectId, projectsTable.id))
    .innerJoin(staffTable, eq(projectPhasesTable.staffId, staffTable.id))
    .where(and(...phaseConds));

  const virtual: Array<{
    id: string;
    projectId: string;
    projectName: string;
    staffId: string;
    staffName: string;
    date: string;
    task: string;
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
    createdAt: string;
  }> = [];

  for (const p of phases) {
    const sd = isoDate(p.startDate)!;
    const ed = isoDate(p.endDate)!;
    const clampedStart = opts.from && opts.from > sd ? opts.from : sd;
    const clampedEnd = opts.to && opts.to < ed ? opts.to : ed;
    const dates = expandDates(clampedStart, clampedEnd);
    for (const d of dates) {
      virtual.push({
        id: `phase-${p.id}-${d}`,
        projectId: p.projectId,
        projectName: p.projectName,
        staffId: p.staffId!,
        staffName: p.staffName,
        date: d,
        task: p.name,
        startTime: null,
        endTime: null,
        notes: null,
        createdAt: isoDateTime(p.createdAt),
      });
    }
  }
  return virtual;
}

router.get("/schedule", async (req, res): Promise<void> => {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if ((from && !ISO.test(from)) || (to && !ISO.test(to))) {
    res.status(400).json({ error: "from/to must be YYYY-MM-DD" });
    return;
  }
  const me = await getOrCreateAppUser(req);
  const filters = [];
  if (projectId) filters.push(eq(scheduleEntriesTable.projectId, projectId));
  if (from)
    filters.push(
      gte(scheduleEntriesTable.date, from as unknown as string),
    );
  if (to)
    filters.push(lte(scheduleEntriesTable.date, to as unknown as string));
  if (me.role === "external") {
    filters.push(eq(scheduleEntriesTable.createdBy, me.clerkUserId));
  }
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

  // External users only see their own entries — skip the global phase
  // overview merge so they cannot see other accounts' assignments.
  if (me.role !== "external") {
    const phaseEntries = await getPhaseVirtualEntries({ projectId, from, to });
    const existingKeys = new Set(
      serialized.map((e) => `${e.staffId}:${e.projectId}:${e.date}`),
    );
    for (const ve of phaseEntries) {
      if (!existingKeys.has(`${ve.staffId}:${ve.projectId}:${ve.date}`)) {
        serialized.push(ve);
      }
    }
  }

  serialized.sort((a, b) => a.date.localeCompare(b.date));
  res.json(ListScheduleEntriesResponse.parse(serialized));
});

router.post("/schedule", async (req, res): Promise<void> => {
  const parsed = CreateScheduleEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = await getOrCreateAppUser(req);
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
      createdBy: me.clerkUserId,
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
  const me = await getOrCreateAppUser(req);
  if (me.role === "external") {
    const [existing] = await db
      .select({ createdBy: scheduleEntriesTable.createdBy })
      .from(scheduleEntriesTable)
      .where(eq(scheduleEntriesTable.id, params.data.id));
    if (existing && existing.createdBy !== me.clerkUserId) {
      res.status(403).json({ error: "他のアカウントの予定は編集できません" });
      return;
    }
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
  const me = await getOrCreateAppUser(req);
  if (me.role === "external") {
    const [existing] = await db
      .select({ createdBy: scheduleEntriesTable.createdBy })
      .from(scheduleEntriesTable)
      .where(eq(scheduleEntriesTable.id, params.data.id));
    if (existing && existing.createdBy !== me.clerkUserId) {
      res.status(403).json({ error: "他のアカウントの予定は削除できません" });
      return;
    }
  }
  await db
    .delete(scheduleEntriesTable)
    .where(eq(scheduleEntriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
