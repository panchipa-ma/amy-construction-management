import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  customersTable,
  db,
  invoicesTable,
  projectsTable,
  quotesTable,
} from "@workspace/db";
import type { LineItemJson } from "@workspace/db";
import {
  renderInvoiceHtml,
  renderQuoteHtml,
  type InvoiceForPrint,
  type QuoteForPrint,
} from "@workspace/print-html";
import { computeTotals, isoDate } from "../lib/serializers";

const router: IRouter = Router();

router.get("/print/invoice/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const [inv] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, id));
  if (!inv) {
    res.status(404).send("Not found");
    return;
  }
  const [project] = await db
    .select({ name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.id, inv.projectId));
  const items = (inv.items ?? []) as LineItemJson[];
  const { subtotal, tax, total } = computeTotals(items);
  const data: InvoiceForPrint = {
    invoiceNumber: inv.invoiceNumber,
    issueDate: isoDate(inv.issueDate)!,
    dueDate: isoDate(inv.dueDate),
    customerName: inv.customerName ?? null,
    projectName: project?.name ?? null,
    contactName: inv.contactName ?? null,
    subject: inv.subject ?? null,
    notes: inv.notes ?? null,
    items: items.map((it) => ({
      description: it.description,
      unit: it.unit ?? null,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      notes: it.notes ?? null,
    })),
    subtotal,
    tax,
    total,
  };
  res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
    .send(withAutoPrint(renderInvoiceHtml(data), req.query.autoprint));
});

router.get("/print/quote/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, id));
  if (!quote) {
    res.status(404).send("Not found");
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
  const items = (quote.items ?? []) as LineItemJson[];
  const { subtotal, tax, total } = computeTotals(items);
  const data: QuoteForPrint = {
    quoteNumber: quote.quoteNumber,
    issueDate: isoDate(quote.issueDate)!,
    validUntil: isoDate(quote.validUntil),
    customerName,
    projectName: project?.name ?? null,
    contactName: quote.contactName ?? null,
    subject: quote.subject ?? null,
    notes: quote.notes ?? null,
    items: items.map((it) => ({
      description: it.description,
      unit: it.unit ?? null,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      notes: it.notes ?? null,
    })),
    subtotal,
    tax,
    total,
  };
  res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
    .send(withAutoPrint(renderQuoteHtml(data), req.query.autoprint));
});

/**
 * `?autoprint=1` が付いている場合、ブラウザで開かれた時点で自動的に
 * `window.print()` を呼ぶスクリプトを <body> 末尾に挿入する。Web 側 UI から
 * `window.open(url + "?autoprint=1")` で呼ばれた時に使用する。
 * モバイル expo-print は HTML をオフスクリーンでレンダリングするだけなので
 * このスクリプトが走っても影響しない (ダイアログは表示されない)。
 */
function withAutoPrint(html: string, autoprint: unknown): string {
  if (!autoprint) return html;
  const script = `<script>window.addEventListener("load",function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},150);});</script>`;
  return html.replace(/<\/body>/i, `${script}</body>`);
}

export default router;
