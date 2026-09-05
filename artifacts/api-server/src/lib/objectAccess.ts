import { eq, or } from "drizzle-orm";
import { db, vendorInvoicesTable, vendorQuotesTable } from "@workspace/db";
import type { AppUserRow } from "./auth";

/**
 * Authorization for GET /storage/objects/* and /ocr/extract.
 *
 * These two routes both take a caller-supplied objectPath (e.g.
 * "/objects/uploads/<uuid>") and need to answer: "may this signed-in user
 * read this particular file?" There is no per-object ACL row in the
 * database (see lib/objectAcl.ts — that scaffolding is unused), so instead
 * we derive access from the same tables/rules the rest of the API already
 * uses to decide external-user visibility:
 *
 *  - internal (approved) users can see all business data, so they can read
 *    any object.
 *  - external (approved) users may only read objects attached to a
 *    vendor_invoices / vendor_quotes row they themselves created
 *    (createdBy === their Clerk user id) — mirroring the createdBy filter
 *    already applied in routes/vendor-invoices.ts and
 *    routes/vendor-quotes.ts.
 *  - external users may also read a file they *just* uploaded via
 *    POST /storage/uploads/request-url but haven't attached to a saved
 *    vendor invoice/quote yet (the upload-then-preview-then-save flow in
 *    vendor-invoice-new.tsx / vendor-quote-new.tsx). That short-lived
 *    ownership is tracked in-memory by recordPendingUpload() below.
 *
 * Anything else (receipts, project photos, progress-log photos — all
 * internal-only data) is denied to external users by default (fail
 * closed), since there is no legitimate external-facing route that
 * references those objects.
 */

const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000; // 24h — generous enough to cover an abandoned draft form.
const PENDING_UPLOAD_MAX_ENTRIES = 5000;

type PendingUpload = { uploaderId: string; createdAt: number };

// In-memory only (per process). Same trade-off as the existing rate limiter
// in routes/review-login.ts: it doesn't survive a restart or share state
// across multiple server instances. Worst case here is a brief false
// negative (a pre-save preview 403s and the user retries), never a false
// positive, so it is safe to keep simple.
const pendingUploads = new Map<string, PendingUpload>();

function evictExpired(now: number): void {
  for (const [key, value] of pendingUploads) {
    if (now - value.createdAt > PENDING_UPLOAD_TTL_MS) {
      pendingUploads.delete(key);
    }
  }
}

/** Call this right after issuing a presigned upload URL, so the uploader can preview their own file before it's attached to a saved record. */
export function recordPendingUpload(objectPath: string, uploaderId: string): void {
  const now = Date.now();
  pendingUploads.set(objectPath, { uploaderId, createdAt: now });
  if (pendingUploads.size > PENDING_UPLOAD_MAX_ENTRIES) {
    evictExpired(now);
  }
}

function isPendingUploadOwnedBy(objectPath: string, uploaderId: string): boolean {
  const entry = pendingUploads.get(objectPath);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > PENDING_UPLOAD_TTL_MS) {
    pendingUploads.delete(objectPath);
    return false;
  }
  return entry.uploaderId === uploaderId;
}

/**
 * @param objectPath the "/objects/..." path (as built in routes/storage.ts
 *   and routes/ocr.ts) — NOT the "/api/storage/objects/..." href stored on
 *   the frontend.
 */
export async function canUserAccessObjectPath(
  me: AppUserRow,
  objectPath: string,
): Promise<boolean> {
  if (me.role !== "external") return true;

  const storedFileUrl = `/api/storage${objectPath}`;

  const [vendorInvoice] = await db
    .select({ createdBy: vendorInvoicesTable.createdBy })
    .from(vendorInvoicesTable)
    .where(
      or(
        eq(vendorInvoicesTable.fileUrl, storedFileUrl),
        eq(vendorInvoicesTable.quoteFileUrl, storedFileUrl),
      ),
    );
  if (vendorInvoice) return vendorInvoice.createdBy === me.clerkUserId;

  const [vendorQuote] = await db
    .select({ createdBy: vendorQuotesTable.createdBy })
    .from(vendorQuotesTable)
    .where(eq(vendorQuotesTable.fileUrl, storedFileUrl));
  if (vendorQuote) return vendorQuote.createdBy === me.clerkUserId;

  return isPendingUploadOwnedBy(objectPath, me.clerkUserId);
}
