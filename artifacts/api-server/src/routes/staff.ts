import { Router, type IRouter } from "express";
import { eq, gte, lte, and, type SQL } from "drizzle-orm";
import {
  db,
  staffTable,
  scheduleEntriesTable,
  projectsTable,
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
    dailyRate: s.dailyRate == null ? null : n(s.dailyRate),
    company: s.company,
    createdAt: isoDateTime(s.createdAt),
  };
}

router.get("/staff", async (_req, res): Promise<void> => {
  const rows = await db.select().from(staffTable).orderBy(staffTable.createdAt);
  res.json(ListStaffResponse.parse(rows.map(serialize)));
});

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
  for (const e of entries) {
    const dateStr = isoDate(e.date)!;
    let projMap = byStaff.get(e.staffId);
    if (!projMap) {
      projMap = new Map();
      byStaff.set(e.staffId, projMap);
    }
    let acc = projMap.get(e.projectId);
    if (!acc) {
      acc = {
        projectId: e.projectId,
        projectName: e.projectName,
        unitNumber: e.unitNumber,
        days: new Set(),
        firstDate: dateStr,
        lastDate: dateStr,
      };
      projMap.set(e.projectId, acc);
    }
    acc.days.add(dateStr);
    if (dateStr < acc.firstDate) acc.firstDate = dateStr;
    if (dateStr > acc.lastDate) acc.lastDate = dateStr;
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

router.post("/staff", async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = {
    ...parsed.data,
    dailyRate: parsed.data.dailyRate == null ? null : String(parsed.data.dailyRate),
  };
  const [row] = await db.insert(staffTable).values(data).returning();
  res.json(CreateStaffResponse.parse(serialize(row)));
});

router.patch("/staff/:id", async (req, res): Promise<void> => {
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
  const data = {
    ...parsed.data,
    dailyRate: parsed.data.dailyRate == null ? null : String(parsed.data.dailyRate),
  };
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

router.delete("/staff/:id", async (req, res): Promise<void> => {
  const params = DeleteStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(staffTable).where(eq(staffTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
