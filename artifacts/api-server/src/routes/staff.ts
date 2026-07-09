import { Router, type IRouter } from "express";
import { eq, gte, lte, and, isNotNull, type SQL } from "drizzle-orm";
import {
  db,
  staffTable,
  scheduleEntriesTable,
  projectsTable,
  projectPhasesTable,
  appUsersTable,
} from "@workspace/db";
import {
  CreateStaffBody,
  UpdateStaffParams,
  UpdateStaffBody,
  DeleteStaffParams,
  ListStaffResponse,
  CreateStaffResponse,
  UpdateStaffResponse,
  ListStaffAssignmentsResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime, n } from "../lib/serializers";
import { getOrCreateAppUser, requireInternal } from "../lib/auth";

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
function parseAssignmentsQuery(
  q: unknown,
): { from?: string; to?: string } | { error: string } {
  if (typeof q !== "object" || q === null) return {};
  const obj = q as Record<string, unknown>;
  const out: { from?: string; to?: string } = {};
  if (obj.from !== undefined && obj.from !== "") {
    if (typeof obj.from !== "string" || !isValidISODate(obj.from))
      return { error: "Invalid 'from' (expected YYYY-MM-DD)" };
    out.from = obj.from;
  }
  if (obj.to !== undefined && obj.to !== "") {
    if (typeof obj.to !== "string" || !isValidISODate(obj.to))
      return { error: "Invalid 'to' (expected YYYY-MM-DD)" };
    out.to = obj.to;
  }
  if (out.from && out.to && out.from > out.to)
    return { error: "'from' must be on or before 'to'" };
  return out;
}

const router: IRouter = Router();

function serialize(s: typeof staffTable.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    phone: s.phone,
    email: s.email,
    appLoginEmail: s.appLoginEmail,
    dailyRate: s.dailyRate == null ? null : n(s.dailyRate),
    company: s.company,
    otherSalesBonusRate:
      s.otherSalesBonusRate == null ? null : n(s.otherSalesBonusRate),
    createdAt: isoDateTime(s.createdAt),
  };
}

router.get("/staff", async (req, res): Promise<void> => {
  const me = await getOrCreateAppUser(req);
  const rows = await db.select().from(staffTable).orderBy(staffTable.createdAt);
  const serialized = rows.map(serialize);
  // email / appLoginEmail は職人アプリ連携キー (PII)。社外ユーザーには開示しない。
  let payload;
  if (me.role === "internal") {
    // 承認済みアプリアカウントのメール集合と照合して連携状態を返す。
    const users = await db
      .select({ email: appUsersTable.email })
      .from(appUsersTable)
      .where(eq(appUsersTable.status, "approved"));
    const approvedEmails = new Set(
      users
        .map((u) => u.email?.trim().toLowerCase())
        .filter((e): e is string => !!e),
    );
    const linked = (s: (typeof serialized)[number]) => {
      const keys = [s.appLoginEmail, s.email]
        .map((e) => e?.trim().toLowerCase())
        .filter((e): e is string => !!e);
      return keys.some((k) => approvedEmails.has(k));
    };
    payload = serialized.map((s) => ({ ...s, appLinked: linked(s) }));
  } else {
    payload = serialized.map((s) => ({
      ...s,
      email: null,
      appLoginEmail: null,
      appLinked: null,
    }));
  }
  res.json(ListStaffResponse.parse(payload));
});

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

router.get("/staff/assignments", async (req, res): Promise<void> => {
  const parsed = parseAssignmentsQuery(req.query);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { from, to } = parsed;
  const conds: SQL[] = [];
  if (from) conds.push(gte(scheduleEntriesTable.date, from));
  if (to) conds.push(lte(scheduleEntriesTable.date, to));
  const baseQuery = db
    .select({
      staffId: scheduleEntriesTable.staffId,
      projectId: scheduleEntriesTable.projectId,
      date: scheduleEntriesTable.date,
      projectName: projectsTable.name,
      unitNumber: projectsTable.unitNumber,
    })
    .from(scheduleEntriesTable)
    .innerJoin(
      projectsTable,
      eq(scheduleEntriesTable.projectId, projectsTable.id),
    );
  const entries =
    conds.length > 0 ? await baseQuery.where(and(...conds)) : await baseQuery;

  const phaseConds: SQL[] = [isNotNull(projectPhasesTable.staffId)];
  if (from) phaseConds.push(gte(projectPhasesTable.endDate, from));
  if (to) phaseConds.push(lte(projectPhasesTable.startDate, to));
  const phases = await db
    .select({
      staffId: projectPhasesTable.staffId,
      projectId: projectPhasesTable.projectId,
      startDate: projectPhasesTable.startDate,
      endDate: projectPhasesTable.endDate,
      projectName: projectsTable.name,
      unitNumber: projectsTable.unitNumber,
    })
    .from(projectPhasesTable)
    .innerJoin(projectsTable, eq(projectPhasesTable.projectId, projectsTable.id))
    .where(and(...phaseConds));

  const allStaff = await db
    .select()
    .from(staffTable)
    .orderBy(staffTable.createdAt);

  type ProjAcc = {
    projectId: string;
    projectName: string;
    unitNumber: string | null;
    days: Set<string>;
    firstDate: string;
    lastDate: string;
  };
  const byStaff = new Map<string, Map<string, ProjAcc>>();

  function addEntry(staffId: string, projectId: string, dateStr: string, projectName: string, unitNumber: string | null) {
    let projMap = byStaff.get(staffId);
    if (!projMap) {
      projMap = new Map();
      byStaff.set(staffId, projMap);
    }
    let acc = projMap.get(projectId);
    if (!acc) {
      acc = {
        projectId,
        projectName,
        unitNumber,
        days: new Set(),
        firstDate: dateStr,
        lastDate: dateStr,
      };
      projMap.set(projectId, acc);
    }
    acc.days.add(dateStr);
    if (dateStr < acc.firstDate) acc.firstDate = dateStr;
    if (dateStr > acc.lastDate) acc.lastDate = dateStr;
  }

  for (const e of entries) {
    addEntry(e.staffId, e.projectId, isoDate(e.date)!, e.projectName, e.unitNumber);
  }

  for (const p of phases) {
    if (!p.staffId) continue;
    const sd = isoDate(p.startDate)!;
    const ed = isoDate(p.endDate)!;
    const clampedStart = from && from > sd ? from : sd;
    const clampedEnd = to && to < ed ? to : ed;
    const dates = expandDates(clampedStart, clampedEnd);
    for (const d of dates) {
      addEntry(p.staffId, p.projectId, d, p.projectName, p.unitNumber);
    }
  }

  const result = allStaff.map((s) => {
    const projMap = byStaff.get(s.id);
    const projects = projMap
      ? [...projMap.values()]
          .map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
            unitNumber: p.unitNumber,
            days: p.days.size,
            firstDate: p.firstDate,
            lastDate: p.lastDate,
          }))
          .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
      : [];
    return {
      staffId: s.id,
      staffName: s.name,
      role: s.role,
      company: s.company,
      projects,
    };
  });
  res.json(ListStaffAssignmentsResponse.parse(result));
});

router.post("/staff", requireInternal, async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = {
    ...parsed.data,
    dailyRate: parsed.data.dailyRate == null ? null : String(parsed.data.dailyRate),
    otherSalesBonusRate:
      parsed.data.otherSalesBonusRate == null
        ? null
        : String(parsed.data.otherSalesBonusRate),
  };
  const [row] = await db.insert(staffTable).values(data).returning();
  res.json(CreateStaffResponse.parse(serialize(row)));
});

router.patch("/staff/:id", requireInternal, async (req, res): Promise<void> => {
  const params = UpdateStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data: Record<string, unknown> = { ...parsed.data };
  if ("dailyRate" in parsed.data) {
    data.dailyRate =
      parsed.data.dailyRate == null ? null : String(parsed.data.dailyRate);
  }
  if ("otherSalesBonusRate" in parsed.data) {
    data.otherSalesBonusRate =
      parsed.data.otherSalesBonusRate == null
        ? null
        : String(parsed.data.otherSalesBonusRate);
  }
  const [row] = await db
    .update(staffTable)
    .set(data)
    .where(eq(staffTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }
  res.json(UpdateStaffResponse.parse(serialize(row)));
});

router.delete("/staff/:id", requireInternal, async (req, res): Promise<void> => {
  const params = DeleteStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(staffTable).where(eq(staffTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
