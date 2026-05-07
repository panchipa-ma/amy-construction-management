import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  quotesTable,
  projectsTable,
  customersTable,
  invoicesTable,
  costEntriesTable,
} from "@workspace/db";
import type { LineItemJson } from "@workspace/db";
import {
  CreateQuoteBody,
  UpdateQuoteParams,
  UpdateQuoteBody,
  DeleteQuoteParams,
  GetQuoteParams,
  ListQuotesQueryParams,
  ListQuotesResponse,
  CreateQuoteResponse,
  GetQuoteResponse,
  UpdateQuoteResponse,
  ConvertQuoteToInvoiceParams,
  ConvertQuoteToInvoiceBody,
  ConvertQuoteToInvoiceResponse,
  ImportQuoteToLedgerParams,
  ImportQuoteToLedgerBody,
  ImportQuoteToLedgerResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime, computeTotals, n } from "../lib/serializers";

const router: IRouter = Router();

async function syncProjectContractAmount(projectId: string): Promise<void> {
  const [latest] = await db
    .select({ items: quotesTable.items })
    .from(quotesTable)
    .where(eq(quotesTable.projectId, projectId))
    .orderBy(desc(quotesTable.createdAt))
    .limit(1);
  const items = (latest?.items ?? []) as LineItemJson[];
  const { total } = computeTotals(items);
  await db
    .update(projectsTable)
    .set({ contractAmount: String(total) })
    .where(eq(projectsTable.id, projectId));
}

async function serialize(q: typeof quotesTable.$inferSelect) {
  const [project] = await db
    .select({ name: projectsTable.name, customerId: projectsTable.customerId })
    .from(projectsTable)
    .where(eq(projectsTable.id, q.projectId));
  let customerName: string | null = null;
  if (project?.customerId) {
    const [c] = await db
      .select({ name: customersTable.name })
      .from(customersTable)
      .where(eq(customersTable.id, project.customerId));
    customerName = c?.name ?? null;
  }
  const items = (q.items ?? []) as LineItemJson[];
  const { subtotal, tax, total } = computeTotals(items);
  return {
    id: q.id,
    projectId: q.projectId,
    projectName: project?.name ?? "",
    customerId: project?.customerId ?? null,
    customerName,
    subject: q.subject,
    contactName: q.contactName,
    quoteNumber: q.quoteNumber,
    issueDate: isoDate(q.issueDate)!,
    validUntil: isoDate(q.validUntil),
    notes: q.notes,
    items,
    subtotal,
    tax,
    total,
    createdAt: isoDateTime(q.createdAt),
  };
}

router.get("/quotes", async (req, res): Promise<void> => {
  const parsedQuery = ListQuotesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { projectId } = parsedQuery.data;
  const rows = projectId
    ? await db
        .select()
        .from(quotesTable)
        .where(eq(quotesTable.projectId, projectId))
    : await db.select().from(quotesTable);
  const serialized = await Promise.all(rows.map(serialize));
  res.json(ListQuotesResponse.parse(serialized));
});

router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(quotesTable)
    .values({
      projectId: parsed.data.projectId,
      subject: parsed.data.subject ?? null,
      contactName: parsed.data.contactName ?? null,
      quoteNumber: parsed.data.quoteNumber,
      issueDate: parsed.data.issueDate as unknown as string,
      validUntil: (parsed.data.validUntil as unknown as string | null) ?? null,
      notes: parsed.data.notes ?? null,
      items: parsed.data.items as LineItemJson[],
    })
    .returning();
  await syncProjectContractAmount(row.projectId);
  res.json(CreateQuoteResponse.parse(await serialize(row)));
});

router.get("/quotes/:id", async (req, res): Promise<void> => {
  const params = GetQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  res.json(GetQuoteResponse.parse(await serialize(row)));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const params = UpdateQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(quotesTable)
    .set({
      projectId: parsed.data.projectId,
      subject: parsed.data.subject ?? null,
      contactName: parsed.data.contactName ?? null,
      quoteNumber: parsed.data.quoteNumber,
      issueDate: parsed.data.issueDate as unknown as string,
      validUntil: (parsed.data.validUntil as unknown as string | null) ?? null,
      notes: parsed.data.notes ?? null,
      items: parsed.data.items as LineItemJson[],
    })
    .where(eq(quotesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }
  await syncProjectContractAmount(row.projectId);
  res.json(UpdateQuoteResponse.parse(await serialize(row)));
});

router.post(
  "/quotes/:id/convert-to-invoice",
  async (req, res): Promise<void> => {
    const params = ConvertQuoteToInvoiceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ConvertQuoteToInvoiceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [quote] = await db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.id, params.data.id));
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    const [project] = await db
      .select({ name: projectsTable.name, customerId: projectsTable.customerId })
      .from(projectsTable)
      .where(eq(projectsTable.id, quote.projectId));
    let customerName: string | null = null;
    if (project?.customerId) {
      const [c] = await db
        .select({ name: customersTable.name })
        .from(customersTable)
        .where(eq(customersTable.id, project.customerId));
      customerName = c?.name ?? null;
    }
    const quoteItems = (quote.items ?? []) as LineItemJson[];
    const { subtotal: quoteSubtotal } = computeTotals(quoteItems);
    const subjectName = quote.subject || project?.name || "";
    const invoiceItems: LineItemJson[] = [
      {
        description: subjectName,
        unit: "式",
        quantity: 1,
        unitPrice: quoteSubtotal,
      },
    ];
    const [inv] = await db
      .insert(invoicesTable)
      .values({
        projectId: quote.projectId,
        invoiceNumber: parsed.data.invoiceNumber,
        customerName,
        contactName: quote.contactName ?? null,
        subject: subjectName || null,
        issueDate: parsed.data.issueDate as unknown as string,
        dueDate: (parsed.data.dueDate as unknown as string | null) ?? null,
        notes: quote.notes,
        paid: false,
        items: invoiceItems,
      })
      .returning();
    const { subtotal, tax, total } = computeTotals(invoiceItems);
    res.json(
      ConvertQuoteToInvoiceResponse.parse({
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
        items: invoiceItems,
        subtotal,
        tax,
        total,
        paid: inv.paid,
        createdAt: isoDateTime(inv.createdAt),
      }),
    );
  },
);

router.post(
  "/quotes/:id/import-to-ledger",
  async (req, res): Promise<void> => {
    const params = ImportQuoteToLedgerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ImportQuoteToLedgerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [quote] = await db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.id, params.data.id));
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    const [project] = await db
      .select({ name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.id, quote.projectId));
    const items = (quote.items ?? []) as LineItemJson[];
    if (items.length === 0) {
      if (parsed.data.replaceExisting) {
        await db
          .delete(costEntriesTable)
          .where(eq(costEntriesTable.projectId, quote.projectId));
      }
      res.json(ImportQuoteToLedgerResponse.parse([]));
      return;
    }
    const inserted = await db.transaction(async (tx) => {
      if (parsed.data.replaceExisting) {
        await tx
          .delete(costEntriesTable)
          .where(eq(costEntriesTable.projectId, quote.projectId));
      }
      return tx
        .insert(costEntriesTable)
        .values(
          items.map((it) => ({
            projectId: quote.projectId,
            category: parsed.data.category,
            description: it.description,
            vendor: null,
            plannedAmount: String(n(it.quantity) * n(it.unitPrice)),
            actualAmount: "0",
            entryDate: parsed.data.entryDate as unknown as string,
            notes: `見積 ${quote.quoteNumber} より取込`,
          })),
        )
        .returning();
    });
    res.json(
      ImportQuoteToLedgerResponse.parse(
        inserted.map((e) => ({
          id: e.id,
          projectId: e.projectId,
          projectName: project?.name ?? "",
          category: e.category as never,
          description: e.description,
          vendor: e.vendor,
          plannedAmount: n(e.plannedAmount),
          actualAmount: n(e.actualAmount),
          entryDate: isoDate(e.entryDate)!,
          notes: e.notes,
          createdAt: isoDateTime(e.createdAt),
        })),
      ),
    );
  },
);

router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const params = DeleteQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ projectId: quotesTable.projectId })
    .from(quotesTable)
    .where(eq(quotesTable.id, params.data.id));
  await db.delete(quotesTable).where(eq(quotesTable.id, params.data.id));
  if (existing) await syncProjectContractAmount(existing.projectId);
  res.sendStatus(204);
});

export default router;
