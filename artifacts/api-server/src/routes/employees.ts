import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, employeesTable, appUsersTable } from "@workspace/db";
import {
  CreateEmployeeBody,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  DeleteEmployeeParams,
  ListEmployeesResponse,
  CreateEmployeeResponse,
  UpdateEmployeeResponse,
} from "@workspace/api-zod";
import { isoDateTime, n } from "../lib/serializers";

const router: IRouter = Router();

function serialize(
  e: typeof employeesTable.$inferSelect,
  appUser?: { email: string | null; displayName: string | null } | null,
) {
  return {
    id: e.id,
    name: e.name,
    role: e.role,
    phone: e.phone,
    email: e.email,
    otherSalesBonusRate:
      e.otherSalesBonusRate == null ? null : n(e.otherSalesBonusRate),
    notes: e.notes,
    appUserId: e.appUserId,
    appUserEmail: appUser?.email ?? null,
    appUserName: appUser?.displayName ?? null,
    createdAt: isoDateTime(e.createdAt),
  };
}

async function fetchAppUser(id: string | null) {
  if (!id) return null;
  const [u] = await db
    .select({ email: appUsersTable.email, displayName: appUsersTable.displayName })
    .from(appUsersTable)
    .where(eq(appUsersTable.id, id));
  return u ?? null;
}

router.get("/employees", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      e: employeesTable,
      u: {
        email: appUsersTable.email,
        displayName: appUsersTable.displayName,
      },
    })
    .from(employeesTable)
    .leftJoin(appUsersTable, eq(employeesTable.appUserId, appUsersTable.id))
    .orderBy(employeesTable.createdAt);
  res.json(
    ListEmployeesResponse.parse(rows.map((r) => serialize(r.e, r.u))),
  );
});

router.post("/employees", async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(employeesTable).values(parsed.data).returning();
  res.json(CreateEmployeeResponse.parse(serialize(row, await fetchAppUser(row.appUserId))));
});

router.patch("/employees/:id", async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(employeesTable)
    .set(parsed.data)
    .where(eq(employeesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json(UpdateEmployeeResponse.parse(serialize(row, await fetchAppUser(row.appUserId))));
});

router.delete("/employees/:id", async (req, res): Promise<void> => {
  const params = DeleteEmployeeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(employeesTable).where(eq(employeesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
