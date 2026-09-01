import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { asc } from "drizzle-orm";
import {
  costEntriesTable,
  customersTable,
  db,
  employeesTable,
  invoicesTable,
  projectPhasesTable,
  projectsTable,
  quotesTable,
} from "@workspace/db";
import type { LineItemJson } from "@workspace/db";
import {
  COMPANY_INFO,
  renderGanttHtml,
  renderInvoiceHtml,
  renderLedgerHtml,
  renderQuoteHtml,
  type GanttForPrint,
  type InvoiceForPrint,
  type LedgerForPrint,
  type QuoteForPrint,
} from "@workspace/print-html";
import { computeTotals, isoDate, n } from "../lib/serializers";

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

router.get("/print/ledger/:projectId", async (req, res): Promise<void> => {
  const projectId = String(req.params.projectId);
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).send("Not found");
    return;
  }
  const [customer] = project.customerId
    ? await db
        .select({ name: customersTable.name })
        .from(customersTable)
        .where(eq(customersTable.id, project.customerId))
    : [];
  const entries = await db
    .select()
    .from(costEntriesTable)
    .where(eq(costEntriesTable.projectId, projectId))
    .orderBy(asc(costEntriesTable.entryDate), asc(costEntriesTable.createdAt));
  const actualCost = entries.reduce((s, e) => s + n(e.actualAmount), 0);
  const plannedCost = entries.reduce((s, e) => s + n(e.plannedAmount), 0);
  const data: LedgerForPrint = {
    project: {
      code: project.code ?? null,
      name: project.name,
      customerName: customer?.name ?? null,
      unitNumber: project.unitNumber ?? null,
      startDate: isoDate(project.startDate),
      endDate: isoDate(project.endDate),
      salesRep: project.salesRep ?? null,
      siteSupervisor: project.siteSupervisor ?? null,
      salesCommissionRate:
        project.salesCommissionRate != null ? n(project.salesCommissionRate) : null,
      standardProfitRate:
        project.standardProfitRate != null ? n(project.standardProfitRate) : null,
      supervisorCommissionRate:
        project.supervisorCommissionRate != null
          ? n(project.supervisorCommissionRate)
          : null,
    },
    contractAmount: n(project.contractAmount),
    plannedCost,
    actualCost,
    entries: entries.map((e) => ({
      category: e.category,
      description: e.description,
      vendor: e.vendor ?? null,
      plannedAmount: n(e.plannedAmount),
      actualAmount: n(e.actualAmount),
      entryDate: isoDate(e.entryDate)!,
    })),
  };
  res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
    .send(withAutoPrint(renderLedgerHtml(data), req.query.autoprint));
});

router.get("/print/gantt/:projectId", async (req, res): Promise<void> => {
  const projectId = String(req.params.projectId);
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).send("Not found");
    return;
  }
  const [customer] = project.customerId
    ? await db
        .select({ name: customersTable.name })
        .from(customersTable)
        .where(eq(customersTable.id, project.customerId))
    : [];
  // 監督電話番号: project.siteSupervisor の名前で employees を検索 → phone を引く。
  // 未登録なら COMPANY_INFO.tel にフォールバック (PrintGanttSheet と同じロジック)。
  let supervisorPhone: string | null = null;
  if (project.siteSupervisor) {
    const [emp] = await db
      .select({ phone: employeesTable.phone })
      .from(employeesTable)
      .where(eq(employeesTable.name, project.siteSupervisor));
    supervisorPhone = emp?.phone ?? null;
  }
  if (!supervisorPhone) supervisorPhone = COMPANY_INFO.tel;
  const phases = await db
    .select()
    .from(projectPhasesTable)
    .where(eq(projectPhasesTable.projectId, projectId))
    .orderBy(
      asc(projectPhasesTable.sortOrder),
      asc(projectPhasesTable.startDate),
    );
  const data: GanttForPrint = {
    project: {
      name: project.name,
      customerName: customer?.name ?? null,
      unitNumber: project.unitNumber ?? null,
      startDate: isoDate(project.startDate),
      endDate: isoDate(project.endDate),
      saturdayWork: project.saturdayWork,
      siteSupervisor: project.siteSupervisor ?? null,
      supervisorPhone,
      companyName: COMPANY_INFO.name,
    },
    phases: phases.map((p) => ({
      id: p.id,
      name: p.name,
      startDate: isoDate(p.startDate)!,
      endDate: isoDate(p.endDate)!,
    })),
  };
  res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .set("Cache-Control", "no-store")
    .send(withAutoPrint(renderGanttHtml(data), req.query.autoprint));
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
