import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  vendorQuotesTable,
  staffTable,
  projectsTable,
  costEntriesTable,
} from "@workspace/db";
import {
  CreateVendorQuoteBody,
  ListVendorQuotesQueryParams,
  ListVendorQuotesResponse,
  CreateVendorQuoteResponse,
  DeleteVendorQuoteParams,
  MatchVendorQuoteParams,
  MatchVendorQuoteBody,
  MatchVendorQuoteResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime, n } from "../lib/serializers";

const router: IRouter = Router();

type VendorQuoteRow = typeof vendorQuotesTable.$inferSelect;

async function serialize(v: VendorQuoteRow) {
  let staffName: string | null = null;
  if (v.staffId) {
    const [staff] = await db
      .select({ name: staffTable.name })
      .from(staffTable)
      .where(eq(staffTable.id, v.staffId));
    staffName = staff?.name ?? null;
  }
  let projectName: string | null = null;
  if (v.projectId) {
    const [p] = await db
      .select({ name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.id, v.projectId));
    projectName = p?.name ?? null;
  }
  return {
    id: v.id,
    staffId: v.staffId,
    staffName,
    vendorName: v.vendorName ?? "",
    projectId: v.projectId,
    projectName,
    costEntryId: v.costEntryId,
    unitNumber: v.unitNumber,
    amount: n(v.amount),
    quoteDate: isoDate(v.quoteDate)!,
    validUntil: isoDate(v.validUntil),
    fileUrl: v.fileUrl,
    fileName: v.fileName,
    notes: v.notes,
    status: v.status as "matched" | "unmatched",
    uploadedAt: isoDateTime(v.uploadedAt),
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

/**
 * Create a planned cost entry (想定原価). Mirrors createCostEntryForInvoice
 * in vendor-invoices.ts but writes to plannedAmount instead of actualAmount.
 */
async function createCostEntryForQuote(opts: {
  projectId: string;
  staffId: string | null;
  staffName: string;
  amount: number;
  quoteDate: string;
  unitNumber: string;
}) {
  let category: "labor" | "subcontract" = "subcontract";
  if (opts.staffId) {
    const [staff] = await db
      .select({ role: staffTable.role })
      .from(staffTable)
      .where(eq(staffTable.id, opts.staffId));
    const role = staff?.role ?? "";
    if (role.includes("社員") || role.includes("自社")) category = "labor";
  }
  const [entry] = await db
    .insert(costEntriesTable)
    .values({
      projectId: opts.projectId,
      category,
      description: `${opts.staffName} 見積 (${opts.unitNumber})`,
      vendor: opts.staffName,
      plannedAmount: String(opts.amount),
      actualAmount: "0",
      entryDate: opts.quoteDate,
      notes: "職人見積書より自動登録（想定原価）",
    })
    .returning();
  return entry.id;
}

router.get("/vendor-quotes", async (req, res): Promise<void> => {
  const parsed = ListVendorQuotesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { projectId, staffId, status } = parsed.data;
  const conds = [];
  if (projectId) conds.push(eq(vendorQuotesTable.projectId, projectId));
  if (staffId) conds.push(eq(vendorQuotesTable.staffId, staffId));
  if (status) conds.push(eq(vendorQuotesTable.status, status));
  const rows =
    conds.length > 0
      ? await db
          .select()
          .from(vendorQuotesTable)
          .where(and(...conds))
      : await db.select().from(vendorQuotesTable);
  const serialized = await Promise.all(rows.map(serialize));
  serialized.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json(ListVendorQuotesResponse.parse(serialized));
});

router.post("/vendor-quotes", async (req, res): Promise<void> => {
  const parsed = CreateVendorQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let staffId: string | null = parsed.data.staffId ?? null;
  let staffName = parsed.data.vendorName;
  if (staffId) {
    const [staff] = await db
      .select({ name: staffTable.name })
      .from(staffTable)
      .where(eq(staffTable.id, staffId));
    if (!staff) {
      res.status(400).json({ error: "Staff not found" });
      return;
    }
    staffName = staff.name;
  }

  const matched = await findProjectByUnit(parsed.data.unitNumber);
  let costEntryId: string | null = null;
  if (matched) {
    costEntryId = await createCostEntryForQuote({
      projectId: matched.id,
      staffId,
      staffName,
      amount: parsed.data.amount,
      quoteDate: parsed.data.quoteDate as unknown as string,
      unitNumber: parsed.data.unitNumber,
    });
  }
  const [row] = await db
    .insert(vendorQuotesTable)
    .values({
      staffId,
      vendorName: parsed.data.vendorName,
      projectId: matched?.id ?? null,
      costEntryId,
      unitNumber: parsed.data.unitNumber,
      amount: String(parsed.data.amount),
      quoteDate: parsed.data.quoteDate as unknown as string,
      validUntil: (parsed.data.validUntil as unknown as string | null) ?? null,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      notes: parsed.data.notes ?? null,
      status: matched ? "matched" : "unmatched",
    })
    .returning();
  res.json(CreateVendorQuoteResponse.parse(await serialize(row)));
});

router.delete("/vendor-quotes/:id", async (req, res): Promise<void> => {
  const params = DeleteVendorQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(vendorQuotesTable)
    .where(eq(vendorQuotesTable.id, params.data.id));
  if (existing?.costEntryId) {
    await db
      .delete(costEntriesTable)
      .where(eq(costEntriesTable.id, existing.costEntryId));
  }
  await db
    .delete(vendorQuotesTable)
    .where(eq(vendorQuotesTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/vendor-quotes/:id/match", async (req, res): Promise<void> => {
  const params = MatchVendorQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MatchVendorQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(vendorQuotesTable)
    .where(eq(vendorQuotesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Vendor quote not found" });
    return;
  }
  if (existing.costEntryId) {
    await db
      .delete(costEntriesTable)
      .where(eq(costEntriesTable.id, existing.costEntryId));
  }
  let staffName = existing.vendorName ?? "職人";
  if (existing.staffId) {
    const [staff] = await db
      .select({ name: staffTable.name })
      .from(staffTable)
      .where(eq(staffTable.id, existing.staffId));
    if (staff?.name) staffName = staff.name;
  }
  const costEntryId = await createCostEntryForQuote({
    projectId: parsed.data.projectId,
    staffId: existing.staffId,
    staffName,
    amount: n(existing.amount),
    quoteDate: isoDate(existing.quoteDate)!,
    unitNumber: existing.unitNumber,
  });
  const [row] = await db
    .update(vendorQuotesTable)
    .set({
      projectId: parsed.data.projectId,
      costEntryId,
      status: "matched",
    })
    .where(eq(vendorQuotesTable.id, params.data.id))
    .returning();
  res.json(MatchVendorQuoteResponse.parse(await serialize(row)));
});

export default router;
