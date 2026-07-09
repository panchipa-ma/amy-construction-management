import { Router, type IRouter } from "express";
import {
  eq,
  asc,
  gte,
  lte,
  and,
  min,
  max,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { db, projectPhasesTable, staffTable, projectsTable } from "@workspace/db";
import {
  ListProjectPhasesParams,
  ListProjectPhasesResponse,
  ListAllProjectPhasesResponse,
  CreateProjectPhaseParams,
  CreateProjectPhaseBody,
  CreateProjectPhaseResponse,
  UpdateProjectPhaseParams,
  UpdateProjectPhaseBody,
  UpdateProjectPhaseResponse,
  DeleteProjectPhaseParams,
} from "@workspace/api-zod";
import { isoDate, isoDateTime, n } from "../lib/serializers";
import { getOrCreateAppUser, requireInternal } from "../lib/auth";

const router: IRouter = Router();

// 工程表 (project_phases) の startDate/endDate から
// projects.startDate (= MIN(phase.startDate)) と
// projects.endDate (= MAX(phase.endDate)) を自動同期。
// Phase が無い場合は null にクリアする (案件登録 form で入力しない方針)。
// 施工台帳側で manual に edit したい場合は phase 追加後に上書き可。
async function syncProjectDatesFromPhases(projectId: string): Promise<void> {
  const [agg] = await db
    .select({
      minStart: min(projectPhasesTable.startDate),
      maxEnd: max(projectPhasesTable.endDate),
    })
    .from(projectPhasesTable)
    .where(eq(projectPhasesTable.projectId, projectId));
  await db
    .update(projectsTable)
    .set({
      startDate: (agg?.minStart as string | null | undefined) ?? null,
      endDate: (agg?.maxEnd as string | null | undefined) ?? null,
    })
    .where(eq(projectsTable.id, projectId));
}

type Row = typeof projectPhasesTable.$inferSelect;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidISODate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function serialize(p: Row, staffName?: string | null) {
  return {
    id: p.id,
    projectId: p.projectId,
    staffId: p.staffId ?? null,
    staffName: staffName ?? null,
    name: p.name,
    startDate: isoDate(p.startDate)!,
    endDate: isoDate(p.endDate)!,
    status: p.status as "planned" | "in_progress" | "done",
    color: p.color,
    sortOrder: n(p.sortOrder),
    notes: p.notes,
    createdAt: isoDateTime(p.createdAt),
  };
}

router.get(
  "/projects/:projectId/phases",
  requireInternal,
  async (req, res): Promise<void> => {
    const params = ListProjectPhasesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select({
        phase: projectPhasesTable,
        staffName: staffTable.name,
      })
      .from(projectPhasesTable)
      .leftJoin(staffTable, eq(projectPhasesTable.staffId, staffTable.id))
      .where(eq(projectPhasesTable.projectId, params.data.projectId))
      .orderBy(
        asc(projectPhasesTable.sortOrder),
        asc(projectPhasesTable.startDate),
      );
    res.json(
      ListProjectPhasesResponse.parse(
        rows.map((r) => serialize(r.phase, r.staffName)),
      ),
    );
  },
);

router.post(
  "/projects/:projectId/phases",
  requireInternal,
  async (req, res): Promise<void> => {
    const params = CreateProjectPhaseParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateProjectPhaseBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const sd = isoDate(body.data.startDate);
    const ed = isoDate(body.data.endDate);
    if (!sd || !ed || !isValidISODate(sd) || !isValidISODate(ed)) {
      res.status(400).json({ error: "Invalid date (expected YYYY-MM-DD)" });
      return;
    }
    if (sd > ed) {
      res
        .status(400)
        .json({ error: "startDate must be on or before endDate" });
      return;
    }
    const [row] = await db
      .insert(projectPhasesTable)
      .values({
        projectId: params.data.projectId,
        name: body.data.name,
        startDate: sd,
        endDate: ed,
        status: body.data.status ?? "planned",
        staffId: body.data.staffId ?? null,
        color: body.data.color ?? null,
        sortOrder: String(body.data.sortOrder ?? 0),
        notes: body.data.notes ?? null,
      })
      .returning();
    await syncProjectDatesFromPhases(params.data.projectId);
    let staffName: string | null = null;
    if (row.staffId) {
      const [s] = await db
        .select({ name: staffTable.name })
        .from(staffTable)
        .where(eq(staffTable.id, row.staffId));
      staffName = s?.name ?? null;
    }
    res.json(CreateProjectPhaseResponse.parse(serialize(row, staffName)));
  },
);

router.get("/project-phases/overview", async (req, res): Promise<void> => {
  const me = await getOrCreateAppUser(req);
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if ((from && !isValidISODate(from)) || (to && !isValidISODate(to))) {
    res.status(400).json({ error: "from/to must be valid YYYY-MM-DD dates" });
    return;
  }
  const conds: SQL[] = [];
  if (from) conds.push(gte(projectPhasesTable.endDate, from));
  if (to) conds.push(lte(projectPhasesTable.startDate, to));
  // 社外(職人)ユーザーは、自分のメールアドレスに紐付いた staff に
  // アサインされた工程のみ表示する。メール一致で自動連携。
  // 連絡用メール (staff.email) とログイン用メールが異なる場合は
  // staff.app_login_email に登録されたアドレスでも連携できる。
  if (me.role === "external") {
    const email = me.email?.trim();
    if (!email) {
      res.json(ListAllProjectPhasesResponse.parse([]));
      return;
    }
    const linked = await db
      .select({ id: staffTable.id })
      .from(staffTable)
      .where(
        sql`lower(${staffTable.email}) = lower(${email}) OR lower(${staffTable.appLoginEmail}) = lower(${email})`,
      );
    if (linked.length === 0) {
      res.json(ListAllProjectPhasesResponse.parse([]));
      return;
    }
    conds.push(
      inArray(
        projectPhasesTable.staffId,
        linked.map((s) => s.id),
      ),
    );
  }
  const rows = await db
    .select({
      phaseId: projectPhasesTable.id,
      projectId: projectPhasesTable.projectId,
      projectName: projectsTable.name,
      phaseName: projectPhasesTable.name,
      startDate: projectPhasesTable.startDate,
      endDate: projectPhasesTable.endDate,
      status: projectPhasesTable.status,
      staffId: projectPhasesTable.staffId,
      staffName: staffTable.name,
    })
    .from(projectPhasesTable)
    .innerJoin(projectsTable, eq(projectPhasesTable.projectId, projectsTable.id))
    .leftJoin(staffTable, eq(projectPhasesTable.staffId, staffTable.id))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(asc(projectPhasesTable.startDate));
  const result = rows.map((r) => ({
    phaseId: r.phaseId,
    projectId: r.projectId,
    projectName: r.projectName,
    phaseName: r.phaseName,
    startDate: isoDate(r.startDate)!,
    endDate: isoDate(r.endDate)!,
    status: r.status as "planned" | "in_progress" | "done",
    staffId: r.staffId ?? null,
    staffName: r.staffName ?? null,
  }));
  res.json(ListAllProjectPhasesResponse.parse(result));
});

router.patch("/project-phases/:id", requireInternal, async (req, res): Promise<void> => {
  const params = UpdateProjectPhaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProjectPhaseBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const update: Record<string, unknown> = {};
  if (body.data.name !== undefined) update.name = body.data.name;
  if (body.data.startDate !== undefined) {
    const sd = isoDate(body.data.startDate);
    if (!sd || !isValidISODate(sd)) {
      res.status(400).json({ error: "Invalid startDate" });
      return;
    }
    update.startDate = sd;
  }
  if (body.data.endDate !== undefined) {
    const ed = isoDate(body.data.endDate);
    if (!ed || !isValidISODate(ed)) {
      res.status(400).json({ error: "Invalid endDate" });
      return;
    }
    update.endDate = ed;
  }
  if (body.data.status !== undefined) update.status = body.data.status;
  if (body.data.color !== undefined) update.color = body.data.color;
  if (body.data.sortOrder !== undefined)
    update.sortOrder = String(body.data.sortOrder);
  if (body.data.notes !== undefined) update.notes = body.data.notes;
  if (body.data.staffId !== undefined) update.staffId = body.data.staffId;
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  if (
    typeof update.startDate === "string" &&
    typeof update.endDate === "string" &&
    update.startDate > update.endDate
  ) {
    res
      .status(400)
      .json({ error: "startDate must be on or before endDate" });
    return;
  }
  if (typeof update.startDate === "string" || typeof update.endDate === "string") {
    const [existing] = await db
      .select()
      .from(projectPhasesTable)
      .where(eq(projectPhasesTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    const finalStart =
      (update.startDate as string | undefined) ?? existing.startDate;
    const finalEnd = (update.endDate as string | undefined) ?? existing.endDate;
    if (finalStart > finalEnd) {
      res
        .status(400)
        .json({ error: "startDate must be on or before endDate" });
      return;
    }
  }
  const [row] = await db
    .update(projectPhasesTable)
    .set(update)
    .where(eq(projectPhasesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  if (update.startDate !== undefined || update.endDate !== undefined) {
    await syncProjectDatesFromPhases(row.projectId);
  }
  let staffName: string | null = null;
  if (row.staffId) {
    const [s] = await db
      .select({ name: staffTable.name })
      .from(staffTable)
      .where(eq(staffTable.id, row.staffId));
    staffName = s?.name ?? null;
  }
  res.json(UpdateProjectPhaseResponse.parse(serialize(row, staffName)));
});

router.delete("/project-phases/:id", requireInternal, async (req, res): Promise<void> => {
  const params = DeleteProjectPhaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ projectId: projectPhasesTable.projectId })
    .from(projectPhasesTable)
    .where(eq(projectPhasesTable.id, params.data.id));
  await db
    .delete(projectPhasesTable)
    .where(eq(projectPhasesTable.id, params.data.id));
  if (existing) await syncProjectDatesFromPhases(existing.projectId);
  res.sendStatus(204);
});

export default router;
