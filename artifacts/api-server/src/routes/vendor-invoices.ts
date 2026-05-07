import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  vendorInvoicesTable,
  staffTable,
  projectsTable,
  costEntriesTable,
} from "@workspace/db";
import {
  CreateVendorInvoiceBody,
  ListVendorInvoicesQueryParams,
  ListVendorInvoicesResponse,
  CreateVendorInvoiceResponse,
  DeleteVendorInvoiceParams,
  MatchVendorInvoiceParams,
  MatchVendorInvoiceBody,
  MatchVendorInvoiceResponse,
  AssignVendorInvoiceStaffParams,
  AssignVendorInvoiceStaffBody,
  AssignVendorInvoiceStaffResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime, n } from "../lib/serializers";
import { getOrCreateAppUser } from "../lib/auth";

const router: IRouter = Router();

type VendorInvoiceRow = typeof vendorInvoicesTable.$inferSelect;

async function serialize(v: VendorInvoiceRow) {
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
    invoiceDate: isoDate(v.invoiceDate)!,
    fileUrl: v.fileUrl,
    fileName: v.fileName,
    notes: v.notes,
    status: v.status as "matched" | "unmatched",
    uploadedAt: isoDateTime(v.uploadedAt),
  };
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()株式会社合同会社有限会社\.,・]/g, "");
}

async function findStaffByVendor(vendorName: string): Promise<string | null> {
  if (!vendorName) return null;
  const target = normalizeName(vendorName);
  if (!target) return null;
  const all = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable);
  // Exact normalized match first
  const exact = all.find((s) => normalizeName(s.name) === target);
  if (exact) return exact.id;
  // Partial: target contains staff name, or staff name contains target
  const partial = all.find((s) => {
    const n = normalizeName(s.name);
    return n.length >= 2 && (target.includes(n) || n.includes(target));
  });
  return partial?.id ?? null;
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

async function createCostEntryForInvoice(opts: {
  projectId: string;
  staffId: string | null;
  staffName: string;
  amount: number;
  invoiceDate: string;
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
      description: `${opts.staffName} 請求 (${opts.unitNumber})`,
      vendor: opts.staffName,
      plannedAmount: "0",
      actualAmount: String(opts.amount),
      entryDate: opts.invoiceDate,
      notes: "職人請求書アップロードより自動登録",
    })
    .returning();
  return entry.id;
}

router.get("/vendor-invoices", async (req, res): Promise<void> => {
  const parsed = ListVendorInvoicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = await getOrCreateAppUser(req);
  const { projectId, staffId, status } = parsed.data;
  const conds = [];
  if (projectId) conds.push(eq(vendorInvoicesTable.projectId, projectId));
  if (staffId) conds.push(eq(vendorInvoicesTable.staffId, staffId));
  if (status) conds.push(eq(vendorInvoicesTable.status, status));
  if (me.role === "external") {
    conds.push(eq(vendorInvoicesTable.createdBy, me.clerkUserId));
  }
  const rows =
    conds.length > 0
      ? await db
          .select()
          .from(vendorInvoicesTable)
          .where(and(...conds))
      : await db.select().from(vendorInvoicesTable);
  const serialized = await Promise.all(rows.map(serialize));
  serialized.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json(ListVendorInvoicesResponse.parse(serialized));
});

router.post("/vendor-invoices", async (req, res): Promise<void> => {
  const parsed = CreateVendorInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Resolve staff: either explicit staffId, or fuzzy-match by vendorName
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
  } else {
    const found = await findStaffByVendor(parsed.data.vendorName);
    if (found) {
      staffId = found;
      const [staff] = await db
        .select({ name: staffTable.name })
        .from(staffTable)
        .where(eq(staffTable.id, found));
      staffName = staff?.name ?? parsed.data.vendorName;
    }
  }

  const matched = await findProjectByUnit(parsed.data.unitNumber);
  let costEntryId: string | null = null;
  if (matched) {
    costEntryId = await createCostEntryForInvoice({
      projectId: matched.id,
      staffId,
      staffName,
      amount: parsed.data.amount,
      invoiceDate: parsed.data.invoiceDate as unknown as string,
      unitNumber: parsed.data.unitNumber,
    });
  }
  const me = await getOrCreateAppUser(req);
  const [row] = await db
    .insert(vendorInvoicesTable)
    .values({
      staffId,
      vendorName: parsed.data.vendorName,
      projectId: matched?.id ?? null,
      costEntryId,
      unitNumber: parsed.data.unitNumber,
      amount: String(parsed.data.amount),
      invoiceDate: parsed.data.invoiceDate as unknown as string,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      notes: parsed.data.notes ?? null,
      status: matched ? "matched" : "unmatched",
      createdBy: me.clerkUserId,
    })
    .returning();
  res.json(CreateVendorInvoiceResponse.parse(await serialize(row)));
});

router.delete("/vendor-invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteVendorInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const me = await getOrCreateAppUser(req);
  const [existing] = await db
    .select()
    .from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.id, params.data.id));
  if (me.role === "external" && existing && existing.createdBy !== me.clerkUserId) {
    res.status(403).json({ error: "他のアカウントが作成した職人請求書は削除できません" });
    return;
  }
  if (existing?.costEntryId) {
    await db
      .delete(costEntriesTable)
      .where(eq(costEntriesTable.id, existing.costEntryId));
  }
  await db
    .delete(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/vendor-invoices/:id/match", async (req, res): Promise<void> => {
  const params = MatchVendorInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MatchVendorInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Vendor invoice not found" });
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
  const costEntryId = await createCostEntryForInvoice({
    projectId: parsed.data.projectId,
    staffId: existing.staffId,
    staffName,
    amount: n(existing.amount),
    invoiceDate: isoDate(existing.invoiceDate)!,
    unitNumber: existing.unitNumber,
  });
  const [row] = await db
    .update(vendorInvoicesTable)
    .set({
      projectId: parsed.data.projectId,
      costEntryId,
      status: "matched",
    })
    .where(eq(vendorInvoicesTable.id, params.data.id))
    .returning();
  res.json(MatchVendorInvoiceResponse.parse(await serialize(row)));
});

router.post(
  "/vendor-invoices/:id/assign-staff",
  async (req, res): Promise<void> => {
    const params = AssignVendorInvoiceStaffParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = AssignVendorInvoiceStaffBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(vendorInvoicesTable)
      .where(eq(vendorInvoicesTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Vendor invoice not found" });
      return;
    }
    if (parsed.data.staffId) {
      const [staff] = await db
        .select({ id: staffTable.id })
        .from(staffTable)
        .where(eq(staffTable.id, parsed.data.staffId));
      if (!staff) {
        res.status(400).json({ error: "Staff not found" });
        return;
      }
    }
    const [row] = await db
      .update(vendorInvoicesTable)
      .set({ staffId: parsed.data.staffId })
      .where(eq(vendorInvoicesTable.id, params.data.id))
      .returning();
    res.json(AssignVendorInvoiceStaffResponse.parse(await serialize(row)));
  },
);

export default router;
