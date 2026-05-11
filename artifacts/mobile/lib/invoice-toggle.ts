import type { QueryClient } from "@tanstack/react-query";
import {
  type Invoice,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  updateInvoice,
} from "@workspace/api-client-react";

import { invalidateDashboard } from "./invalidate";

export async function toggleInvoiceField(
  qc: QueryClient,
  inv: Invoice,
  field: "paid" | "sentToClient",
  value: boolean,
): Promise<void> {
  const paid = field === "paid" ? value : inv.paid;
  const sentToClient =
    field === "sentToClient" ? value : inv.sentToClient;

  const updated = await updateInvoice(inv.id, {
    projectId: inv.projectId,
    invoiceNumber: inv.invoiceNumber,
    customerName: inv.customerName ?? null,
    contactName: inv.contactName ?? null,
    subject: inv.subject ?? null,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate ?? null,
    notes: inv.notes ?? null,
    paid,
    sentToClient,
    items: inv.items,
  });

  // 即時反映: detail / list 両方の cache を更新
  qc.setQueryData(getGetInvoiceQueryKey(inv.id), updated);
  qc.setQueriesData<Invoice[]>(
    { queryKey: getListInvoicesQueryKey() },
    (old) => (old ? old.map((i) => (i.id === updated.id ? updated : i)) : old),
  );

  await Promise.all([
    qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(inv.id) }),
    qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() }),
    invalidateDashboard(qc),
  ]);
}
