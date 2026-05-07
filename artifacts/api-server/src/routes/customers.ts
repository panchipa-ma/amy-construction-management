import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";
import {
  CreateCustomerBody,
  UpdateCustomerParams,
  UpdateCustomerBody,
  DeleteCustomerParams,
  ListCustomersResponse,
  CreateCustomerResponse,
  UpdateCustomerResponse,
} from "@workspace/api-zod";
import { isoDateTime, n } from "../lib/serializers";

const router: IRouter = Router();

function serialize(c: typeof customersTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    contactName: c.contactName,
    phone: c.phone,
    email: c.email,
    address: c.address,
    notes: c.notes,
    defaultProfitRate: n(c.defaultProfitRate),
    defaultSalesCommissionRate: n(c.defaultSalesCommissionRate),
    defaultSupervisorCommissionRate: n(c.defaultSupervisorCommissionRate),
    createdAt: isoDateTime(c.createdAt),
  };
}

function toDbValues(input: {
  name?: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  defaultProfitRate?: number | null;
  defaultSalesCommissionRate?: number | null;
  defaultSupervisorCommissionRate?: number | null;
}) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.contactName !== undefined) data.contactName = input.contactName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.address !== undefined) data.address = input.address;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.defaultProfitRate != null)
    data.defaultProfitRate = String(input.defaultProfitRate);
  if (input.defaultSalesCommissionRate != null)
    data.defaultSalesCommissionRate = String(input.defaultSalesCommissionRate);
  if (input.defaultSupervisorCommissionRate != null)
    data.defaultSupervisorCommissionRate = String(
      input.defaultSupervisorCommissionRate,
    );
  return data;
}

router.get("/customers", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(customersTable)
    .orderBy(customersTable.createdAt);
  res.json(ListCustomersResponse.parse(rows.map(serialize)));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(customersTable)
    .values(toDbValues(parsed.data) as typeof customersTable.$inferInsert)
    .returning();
  res.json(CreateCustomerResponse.parse(serialize(row)));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(customersTable)
    .set(toDbValues(parsed.data))
    .where(eq(customersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(UpdateCustomerResponse.parse(serialize(row)));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const params = DeleteCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(customersTable)
    .where(eq(customersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
