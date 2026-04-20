import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, staffTable } from "@workspace/db";
import {
  CreateStaffBody,
  UpdateStaffParams,
  UpdateStaffBody,
  DeleteStaffParams,
  ListStaffResponse,
  CreateStaffResponse,
  UpdateStaffResponse,
} from "@workspace/api-zod";
import { isoDateTime, n } from "../lib/serializers";

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
