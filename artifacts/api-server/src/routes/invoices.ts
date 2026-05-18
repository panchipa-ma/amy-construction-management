import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  costEntriesTable,
  db,
  invoicesTable,
  projectsTable,
} from "@workspace/db";
import type { LineItemJson } from "@workspace/db";
import { n } from "../lib/serializers";
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
    paidAt: isoDate(inv.paidAt),
    sentToClient: inv.sentToClient,
    sentAt: isoDate(inv.sentAt),
    createdAt: isoDateTime(inv.createdAt),
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// 請求書 → 施工台帳 (実績原価) 自動取込。
// 請求書の作成・更新ごとに sourceInvoiceId で紐付く既存エントリを削除して再作成。
// 請求書削除時は FK cascade で消える。category default は subcontract、台帳側で手動編集可。
async function syncCostEntriesFromInvoice(
  inv: typeof invoicesTable.$inferSelect,
): Promise<void> {
  const items = (inv.items ?? []) as LineItemJson[];
  await db.transaction(async (tx) => {
    await tx
      .delete(costEntriesTable)
      .where(eq(costEntriesTable.sourceInvoiceId, inv.id));
    if (items.length === 0) return;
    await tx.insert(costEntriesTable).values(
      items.map((it) => ({
        projectId: inv.projectId,
        category: "subcontract",
        description: it.description,
        vendor: null,
        plannedAmount: "0",
        actualAmount: String(n(it.quantity) * n(it.unitPrice)),
        entryDate: inv.issueDate,
        notes: `請求 ${inv.invoiceNumber} より自動取込`,
        sourceInvoiceId: inv.id,
      })),
    );
  });
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
  const sentToClient = parsed.data.sentToClient ?? false;
  const sentAt =
    (parsed.data.sentAt as unknown as string | null | undefined) ??
    (sentToClient ? todayIso() : null);
  const paid = parsed.data.paid ?? false;
  const paidAt =
    (parsed.data.paidAt as unknown as string | null | undefined) ??
    (paid ? todayIso() : null);
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
      paid,
      paidAt,
      sentToClient,
      sentAt,
      items: parsed.data.items as LineItemJson[],
      createdBy: me.clerkUserId,
    })
    .returning();
  await syncCostEntriesFromInvoice(row);
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
  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  const sentToClient = parsed.data.sentToClient ?? false;
  // sentAt: client-supplied wins; else if 送付済 が false→true なら本日;
  // 送付済 を解除 (true→false) したら null にリセット; 変化なしなら既存値を維持。
  let sentAt: string | null;
  if (parsed.data.sentAt !== undefined) {
    sentAt = (parsed.data.sentAt as unknown as string | null) ?? null;
  } else if (sentToClient && !existing.sentToClient) {
    sentAt = todayIso();
  } else if (!sentToClient && existing.sentToClient) {
    sentAt = null;
  } else {
    sentAt = existing.sentAt;
  }
  // paid: 明示指定なしなら既存値を維持 (PATCH の partial update 対応)
  const paid = parsed.data.paid ?? existing.paid;
  // paidAt: client-supplied wins; else if paid が false→true なら本日;
  // 入金済 を解除 (true→false) したら null にリセット; 変化なしなら既存値を維持。
  let paidAt: string | null;
  if (parsed.data.paidAt !== undefined) {
    paidAt = (parsed.data.paidAt as unknown as string | null) ?? null;
  } else if (paid && !existing.paid) {
    paidAt = todayIso();
  } else if (!paid && existing.paid) {
    paidAt = null;
  } else {
    paidAt = existing.paidAt;
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
      paid,
      paidAt,
      sentToClient,
      sentAt,
      items: parsed.data.items as LineItemJson[],
    })
    .where(eq(invoicesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  await syncCostEntriesFromInvoice(row);
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
