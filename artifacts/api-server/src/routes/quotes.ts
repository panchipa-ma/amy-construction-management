import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, quotesTable, projectsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { isoDate, isoDateTime, computeTotals } from "../lib/serializers";

const router: IRouter = Router();

async function serialize(q: typeof quotesTable.$inferSelect) {
  const [project] = await db
    .select({ name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.id, q.projectId));
  const items = (q.items ?? []) as LineItemJson[];
  const { subtotal, tax, total } = computeTotals(items);
  return {
    id: q.id,
    projectId: q.projectId,
    projectName: project?.name ?? "",
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
      quoteNumber: parsed.data.quoteNumber,
      issueDate: parsed.data.issueDate as unknown as string,
      validUntil: (parsed.data.validUntil as unknown as string | null) ?? null,
      notes: parsed.data.notes ?? null,
      items: parsed.data.items as LineItemJson[],
    })
    .returning();
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
  res.json(UpdateQuoteResponse.parse(await serialize(row)));
});

router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const params = DeleteQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(quotesTable).where(eq(quotesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
