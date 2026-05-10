import { useRoute, Link, useLocation } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvoice,
  useDeleteInvoice,
  useUpdateInvoice,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { COMPANY_INFO, BANK_INFO } from "@/lib/company-info";

const ITEM_ROWS = 17;

export default function InvoiceDetailPage() {
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id ?? "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: inv, isLoading } = useGetInvoice(id, {
    query: { enabled: !!id, queryKey: getGetInvoiceQueryKey(id) },
  });
  const deleteMut = useDeleteInvoice();
  const updateMut = useUpdateInvoice();
  const [askDelete, setAskDelete] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync({ id });
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "請求書を削除しました" });
      setLocation("/invoices");
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const togglePaid = async () => {
    if (!inv) return;
    try {
      await updateMut.mutateAsync({
        id,
        data: {
          projectId: inv.projectId,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName ?? null,
          contactName: inv.contactName ?? null,
          subject: inv.subject ?? null,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate ?? null,
          notes: inv.notes ?? null,
          paid: !inv.paid,
          sentToClient: inv.sentToClient,
          items: inv.items,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetInvoiceQueryKey(id),
      });
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await invalidateDashboard(queryClient);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handlePrint = () => {
    // 共有テンプレート (`@workspace/print-html`) を `?autoprint=1` で開いて
    // 印刷ダイアログを起動。モバイル版と完全に同一の出力を保証する。
    window.open(`/api/print/invoice/${id}?autoprint=1`, "_blank");
  };

  if (isLoading || !inv) {
    return <Skeleton className="h-96 w-full max-w-4xl" />;
  }

  const rows = [...inv.items];
  while (rows.length < ITEM_ROWS) {
    rows.push({ description: "", unit: null, quantity: 0, unitPrice: 0, notes: null });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          請求書一覧に戻る
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={inv.paid} onCheckedChange={togglePaid} />
            <Badge
              variant="outline"
              className={
                inv.paid
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-amber-100 text-amber-800 border-amber-200"
              }
            >
              {inv.paid ? "入金済" : "未入金"}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" />
            印刷
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAskDelete(true)}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            削除
          </Button>
        </div>
      </div>

      <div className="quote-paper bg-white border border-border shadow-sm w-[210mm] min-h-[297mm] mx-auto px-[12mm] py-[10mm] print:min-h-0 print:shadow-none print:border-none">
        <h1 className="text-center text-2xl font-bold tracking-[0.5em] mb-6">
          請　求　書
        </h1>

        <div className="grid grid-cols-[1fr_auto] gap-6 mb-4">
          <div className="space-y-3">
            <div className="flex items-end gap-1">
              <span className="text-lg font-bold border-b border-foreground pb-0.5 min-w-[200px]">
                {inv.customerName || inv.projectName || "—"}
              </span>
              <span className="text-base font-medium pb-0.5 ml-2">御中</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">ご担当：</span>
              <span>{inv.contactName || ""}</span>
              {inv.contactName && <span>様</span>}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">件名：</span>
              <span className="font-medium">{inv.subject || ""}</span>
            </div>
            <p className="text-sm mt-3">下記の通り、ご請求申し上げます。</p>
          </div>

          <div className="text-right space-y-1 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-right">
              <span className="text-muted-foreground">請求No.</span>
              <span className="tabular-nums">{inv.invoiceNumber}</span>
              <span className="text-muted-foreground">請求日</span>
              <span>{formatDate(inv.issueDate)}</span>
            </div>
            <div className="mt-3 pt-3 border-t text-left">
              <div className="font-bold">{COMPANY_INFO.name}</div>
              <div className="text-xs text-muted-foreground">
                {COMPANY_INFO.postalCode}
              </div>
              <div className="text-xs">{COMPANY_INFO.address}</div>
              <div className="text-xs text-muted-foreground">
                登録番号：{COMPANY_INFO.registrationNumber}
              </div>
              <div className="text-xs mt-1">
                TEL：{COMPANY_INFO.tel}
              </div>
              <div className="text-xs">
                FAX：{COMPANY_INFO.fax}
              </div>
              <div className="text-xs">
                E-Mail：{COMPANY_INFO.email}
              </div>
              <div className="text-xs mt-1">
                担当：{COMPANY_INFO.contact}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 border-y-2 border-foreground py-2 mb-4">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm">合計金額</span>
            <span className="text-xl font-bold tabular-nums">
              {formatCurrency(inv.total)}
            </span>
            <span className="text-xs text-muted-foreground">（税込）</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">お支払期限：</span>
            <span className="font-medium">{inv.dueDate ? formatDate(inv.dueDate) : "月末日"}</span>
          </div>
        </div>

        <table className="w-full border-collapse text-sm mb-4">
          <thead>
            <tr className="bg-[hsl(220,50%,25%)] text-white">
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 w-10 text-center font-medium">No.</th>
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 text-left font-medium">摘要</th>
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 w-16 text-center font-medium">数量</th>
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 w-24 text-right font-medium">単価</th>
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 w-28 text-right font-medium">金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => {
              const hasContent = item.description?.trim();
              const amount = hasContent ? item.quantity * item.unitPrice : 0;
              return (
                <tr key={i} className={i % 2 === 0 ? "bg-blue-50/40" : ""}>
                  <td className="border border-border px-2 py-1 text-center text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="border border-border px-2 py-1">
                    {hasContent ? item.description : ""}
                  </td>
                  <td className="border border-border px-2 py-1 text-center tabular-nums">
                    {hasContent ? item.quantity : ""}
                  </td>
                  <td className="border border-border px-2 py-1 text-right tabular-nums">
                    {hasContent ? formatCurrency(item.unitPrice) : ""}
                  </td>
                  <td className="border border-border px-2 py-1 text-right tabular-nums">
                    {hasContent ? formatCurrency(amount) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-[1fr_auto] gap-6">
          <div className="text-sm space-y-1">
            <div className="font-medium text-muted-foreground mb-1">お振込先</div>
            <div className="pl-2 space-y-0.5">
              <div>{BANK_INFO.bankName}　{BANK_INFO.branchName}</div>
              <div>{BANK_INFO.accountType}</div>
              <div>店番号：{BANK_INFO.branchCode}</div>
              <div>口座番号：{BANK_INFO.accountNumber}</div>
              <div>{BANK_INFO.accountHolder}</div>
            </div>
          </div>

          <div className="w-64">
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr className="bg-[hsl(220,50%,25%)] text-white">
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 font-medium text-center">小計</td>
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 text-right tabular-nums bg-white text-foreground">
                    {formatCurrency(inv.subtotal)}
                  </td>
                </tr>
                <tr className="bg-[hsl(220,50%,25%)] text-white">
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 font-medium text-center">消費税(10%)</td>
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 text-right tabular-nums bg-white text-foreground">
                    {formatCurrency(inv.tax)}
                  </td>
                </tr>
                <tr className="bg-[hsl(220,50%,25%)] text-white">
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 font-bold text-center">合計</td>
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 text-right tabular-nums font-bold bg-white text-foreground">
                    {formatCurrency(inv.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {inv.notes && (
          <div className="mt-4 border-t pt-3">
            <div className="inline-block bg-muted px-3 py-1 text-sm font-medium mb-1">備考</div>
            <p className="text-sm whitespace-pre-wrap pl-1">{inv.notes}</p>
          </div>
        )}
      </div>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>請求書を削除しますか?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
