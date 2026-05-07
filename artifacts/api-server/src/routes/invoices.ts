import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, invoicesTable, projectsTable } from "@workspace/db";
import type { LineItemJson } from "@workspace/db";
import {
  CreateInvoiceBody,
  UpdateInvoiceParams,
  UpdateInvoiceBody,
  DeleteInvoiceParams,
  GetInvoiceParams,
  ListInvoicesQueryParams,
  ListInvoicesResponse,
  CreateInvoiceResponse,
  GetInvoiceResponse,
  UpdateInvoiceResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime, computeTotals } from "../lib/serializers";
import { getOrCreateAppUser } from "../lib/auth";

const router: IRouter = Router();

async function serialize(inv: typeof invoicesTable.$inferSelect) {
  const [project] = await db
    .select({ name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.id, inv.projectId));
  const items = (inv.items ?? []) as LineItemJson[];
  const { subtotal, tax, total } = computeTotals(items);
  return {
    id: inv.id,
    projectId: inv.projectId,
    projectName: project?.name ?? "",
    customerName: inv.customerName ?? null,
    contactName: inv.contactName ?? null,
    subject: inv.subject ?? null,
    invoiceNumber: inv.invoiceNumber,
    issueDate: isoDate(inv.issueDate)!,
    dueDate: isoDate(inv.dueDate),
    notes: inv.notes,
    items,
    subtotal,
    tax,
    total,
    paid: inv.paid,
    createdAt: isoDateTime(inv.createdAt),
  };
}

router.get("/invoices", async (req, res): Promise<void> => {
  const parsedQuery = ListInvoicesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { projectId } = parsedQuery.data;
  const rows = projectId
    ? await db
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.projectId, projectId))
    : await db.select().from(invoicesTable);
  const serialized = await Promise.all(rows.map(serialize));
  res.json(ListInvoicesResponse.parse(serialized));
});

router.post("/invoices", async (req, res): Promise<void> => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = await getOrCreateAppUser(req);
  const [row] = await db
    .insert(invoicesTable)
    .values({
      projectId: parsed.data.projectId,
      invoiceNumber: parsed.data.invoiceNumber,
      customerName: parsed.data.customerName ?? null,
      contactName: parsed.data.contactName ?? null,
      subject: parsed.data.subject ?? null,
      issueDate: parsed.data.issueDate as unknown as string,
      dueDate: (parsed.data.dueDate as unknown as string | null) ?? null,
      notes: parsed.data.notes ?? null,
      paid: parsed.data.paid ?? false,
      items: parsed.data.items as LineItemJson[],
      createdBy: me.clerkUserId,
    })
    .returning();
  res.json(CreateInvoiceResponse.parse(await serialize(row)));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(GetInvoiceResponse.parse(await serialize(row)));
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const params = UpdateInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(invoicesTable)
    .set({
      projectId: parsed.data.projectId,
      invoiceNumber: parsed.data.invoiceNumber,
      customerName: parsed.data.customerName ?? null,
      contactName: parsed.data.contactName ?? null,
      subject: parsed.data.subject ?? null,
      issueDate: parsed.data.issueDate as unknown as string,
      dueDate: (parsed.data.dueDate as unknown as string | null) ?? null,
      notes: parsed.data.notes ?? null,
      paid: parsed.data.paid ?? false,
      items: parsed.data.items as LineItemJson[],
    })
    .where(eq(invoicesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(UpdateInvoiceResponse.parse(await serialize(row)));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
