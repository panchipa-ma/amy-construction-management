import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  receiptsTable,
  projectsTable,
  costEntriesTable,
} from "@workspace/db";
import {
  CreateReceiptBody,
  ListReceiptsQueryParams,
  ListReceiptsResponse,
  CreateReceiptResponse,
  DeleteReceiptParams,
  MatchReceiptParams,
  MatchReceiptBody,
  MatchReceiptResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime, n } from "./../lib/serializers";

const router: IRouter = Router();

type ReceiptRow = typeof receiptsTable.$inferSelect;

async function serialize(r: ReceiptRow) {
  let projectName: string | null = null;
  if (r.projectId) {
    const [p] = await db
      .select({ name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.id, r.projectId));
    projectName = p?.name ?? null;
  }
  return {
    id: r.id,
    projectId: r.projectId,
    projectName,
    costEntryId: r.costEntryId,
    vendor: r.vendor,
    unitNumber: r.unitNumber,
    amount: n(r.amount),
    receiptDate: isoDate(r.receiptDate)!,
    category: r.category as "material" | "subcontract" | "labor" | "expense" | "other",
    fileUrl: r.fileUrl,
    fileName: r.fileName,
    notes: r.notes,
    status: r.status as "matched" | "unmatched",
    uploadedAt: isoDateTime(r.uploadedAt),
  };
}

function normalizeUnit(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/号室|号|室/g, "")
    .toUpperCase();
}

async function findProjectByUnit(unitNumber: string) {
  const target = normalizeUnit(unitNumber);
  if (!target) return null;
  const all = await db
    .select({ id: projectsTable.id, unitNumber: projectsTable.unitNumber })
    .from(projectsTable);
  return (
    all.find(
      (p) => p.unitNumber && normalizeUnit(p.unitNumber) === target,
    ) ?? null
  );
}

async function createCostEntryForReceipt(opts: {
  projectId: string;
  vendor: string;
  category: string;
  amount: number;
  receiptDate: string;
  unitNumber: string | null;
}) {
  const desc = opts.unitNumber
    ? `${opts.vendor} 領収書 (${opts.unitNumber})`
    : `${opts.vendor} 領収書`;
  const [entry] = await db
    .insert(costEntriesTable)
    .values({
      projectId: opts.projectId,
      category: opts.category,
      description: desc,
      vendor: opts.vendor,
      plannedAmount: "0",
      actualAmount: String(opts.amount),
      entryDate: opts.receiptDate,
      notes: "領収書アップロードより自動登録",
    })
    .returning();
  return entry.id;
}

router.get("/receipts", async (req, res): Promise<void> => {
  const parsed = ListReceiptsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { projectId, status } = parsed.data;
  const conds = [];
  if (projectId) conds.push(eq(receiptsTable.projectId, projectId));
  if (status) conds.push(eq(receiptsTable.status, status));
  const rows =
    conds.length > 0
      ? await db.select().from(receiptsTable).where(and(...conds))
      : await db.select().from(receiptsTable);
  const serialized = await Promise.all(rows.map(serialize));
  serialized.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json(ListReceiptsResponse.parse(serialized));
});

router.post("/receipts", async (req, res): Promise<void> => {
  const parsed = CreateReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let matchedProjectId: string | null = null;
  let costEntryId: string | null = null;
  if (parsed.data.unitNumber) {
    const matched = await findProjectByUnit(parsed.data.unitNumber);
    if (matched) {
      matchedProjectId = matched.id;
      costEntryId = await createCostEntryForReceipt({
        projectId: matched.id,
        vendor: parsed.data.vendor,
        category: parsed.data.category,
        amount: parsed.data.amount,
        receiptDate: parsed.data.receiptDate as unknown as string,
        unitNumber: parsed.data.unitNumber,
      });
    }
  }
  const [row] = await db
    .insert(receiptsTable)
    .values({
      projectId: matchedProjectId,
      costEntryId,
      vendor: parsed.data.vendor,
      unitNumber: parsed.data.unitNumber ?? null,
      amount: String(parsed.data.amount),
      receiptDate: parsed.data.receiptDate as unknown as string,
      category: parsed.data.category,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      notes: parsed.data.notes ?? null,
      status: matchedProjectId ? "matched" : "unmatched",
    })
    .returning();
  res.json(CreateReceiptResponse.parse(await serialize(row)));
});

router.delete("/receipts/:id", async (req, res): Promise<void> => {
  const params = DeleteReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.id, params.data.id));
  if (existing?.costEntryId) {
    await db
      .delete(costEntriesTable)
      .where(eq(costEntriesTable.id, existing.costEntryId));
  }
  await db.delete(receiptsTable).where(eq(receiptsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/receipts/:id/match", async (req, res): Promise<void> => {
  const params = MatchReceiptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MatchReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }
  if (existing.costEntryId) {
    await db
      .delete(costEntriesTable)
      .where(eq(costEntriesTable.id, existing.costEntryId));
  }
  const costEntryId = await createCostEntryForReceipt({
    projectId: parsed.data.projectId,
    vendor: existing.vendor,
    category: existing.category,
    amount: n(existing.amount),
    receiptDate: isoDate(existing.receiptDate)!,
    unitNumber: existing.unitNumber,
  });
  const [row] = await db
    .update(receiptsTable)
    .set({
      projectId: parsed.data.projectId,
      costEntryId,
      status: "matched",
    })
    .where(eq(receiptsTable.id, params.data.id))
    .returning();
  res.json(MatchReceiptResponse.parse(await serialize(row)));
});

export default router;
