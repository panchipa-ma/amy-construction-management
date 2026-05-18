import { useRoute, Link, useLocation } from "wouter";
import { useRef, useState } from "react";
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
import { ArrowLeft, Trash2, Printer, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { COMPANY_INFO, BANK_INFO } from "@/lib/company-info";

const ITEM_ROWS = 32;

function formatJpDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const era = d.getFullYear() >= 2019 ? `R${d.getFullYear() - 2018}` : `${d.getFullYear()}`;
  return `${era}.${d.getMonth() + 1}.${d.getDate()}`;
}

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

  const paperRef = useRef<HTMLDivElement>(null);
  const [pdfSaving, setPdfSaving] = useState(false);

  const handlePrint = () => {
    // ローカル DOM (`.quote-paper`) を `@media print` CSS で印刷。
    // iframe / cookie 制約を受けないので確実に動く。
    window.print();
  };

  const handleSavePdf = async () => {
    if (!paperRef.current || !inv) return;
    setPdfSaving(true);
    try {
      const [{ default: jsPDF }, html2canvas] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro").then((m) => m.default),
      ]);
      const canvas = await html2canvas(paperRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let y = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.95),
          "JPEG",
          0,
          y,
          imgW,
          imgH,
        );
        remaining -= pageH;
        if (remaining > 0) {
          pdf.addPage();
          y -= pageH;
        }
      }
      pdf.save(`請求書_${inv.invoiceNumber}.pdf`);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    } finally {
      setPdfSaving(false);
    }
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
            onClick={handleSavePdf}
            disabled={pdfSaving}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            {pdfSaving ? "保存中…" : "PDF保存"}
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

      <div ref={paperRef} className="quote-paper w-[210mm] min-h-[297mm] mx-auto px-[10mm] py-[6mm] text-[12px] text-foreground print:min-h-0 print:border-0 print:shadow-none">
        <div className="text-center mb-2 -mt-1">
          <h1 className="quote-title inline-block text-[24px] font-semibold text-foreground tracking-[0.5em] pl-[0.5em]">
            請&nbsp;&nbsp;求&nbsp;&nbsp;書
          </h1>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr] gap-6 mb-2">
          <div className="space-y-1 min-w-0">
            <div className="flex items-end gap-2 border-b-2 border-foreground pb-0.5">
              <span className="quote-customer text-[18px] flex-1 truncate">
                {inv.customerName || inv.projectName || "—"}
              </span>
              <span className="quote-customer text-[14px] pb-0.5 shrink-0">御中</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground w-12 shrink-0">ご担当</span>
              <span className="flex-1 min-w-0 border-b border-border truncate">
                {inv.contactName || "\u00A0"}
              </span>
              {inv.contactName && <span className="text-xs shrink-0">様</span>}
            </div>
          </div>
          <div className="text-[11px] border border-foreground self-start">
            <div className="grid grid-cols-[70px_1fr] border-b border-foreground">
              <div className="px-2 py-0.5 bg-muted/50 border-r border-foreground">
                請求No.
              </div>
              <div className="px-2 py-0.5 text-right tabular-nums truncate">
                {inv.invoiceNumber}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] border-b border-foreground">
              <div className="px-2 py-0.5 bg-muted/50 border-r border-foreground">
                請求日
              </div>
              <div className="px-2 py-0.5 text-right tabular-nums">
                {formatJpDate(inv.issueDate)}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr]">
              <div className="px-2 py-0.5 bg-muted/50 border-r border-foreground">
                お支払期限
              </div>
              <div className="px-2 py-0.5 text-right tabular-nums">
                {inv.dueDate ? formatJpDate(inv.dueDate) : "月末日"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr] gap-6 mb-2">
          <div className="space-y-1 min-w-0">
            <div className="border-l-4 border-primary pl-2 py-0">
              <div className="text-[9px] tracking-[0.3em] text-muted-foreground">
                件名
              </div>
              <div className="text-[13px] font-semibold leading-tight">
                {inv.subject || inv.projectName || "—"}
              </div>
            </div>
            <p className="text-[10px] leading-tight text-muted-foreground">
              下記の通り、ご請求申し上げます。
            </p>
          </div>
          <div className="bg-muted/30 border border-border px-3 py-1 text-[10px] leading-[1.4] min-w-0">
            <div className="quote-customer text-[12px]">
              {COMPANY_INFO.name}
            </div>
            <div className="text-muted-foreground truncate">
              {COMPANY_INFO.postalCode} {COMPANY_INFO.address}
            </div>
            <div className="truncate">
              <span className="text-muted-foreground mr-1">登録番号</span>
              {COMPANY_INFO.registrationNumber}
            </div>
            <div className="flex flex-wrap gap-x-2">
              <span>
                <span className="text-muted-foreground mr-1">TEL</span>
                {COMPANY_INFO.tel}
              </span>
              <span>
                <span className="text-muted-foreground mr-1">FAX</span>
                {COMPANY_INFO.fax}
              </span>
            </div>
            <div className="truncate">
              <span className="text-muted-foreground mr-1">E</span>
              {COMPANY_INFO.email}
            </div>
            <div className="truncate">
              <span className="text-muted-foreground mr-1">担当</span>
              {COMPANY_INFO.contact}
            </div>
          </div>
        </div>

        <div className="flex items-stretch border-2 border-primary mb-1.5 bg-primary/[0.02]">
          <div className="w-28 px-3 py-1 bg-primary text-primary-foreground font-semibold border-r-2 border-primary flex items-center justify-center text-[11px] tracking-[0.2em]">
            合 計 金 額
          </div>
          <div className="flex-1 px-4 py-1 flex items-baseline justify-end gap-1.5">
            <span className="text-muted-foreground text-[11px]">¥</span>
            <span className="text-[20px] font-bold tabular-nums leading-none">
              {inv.total.toLocaleString()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              （税込）
            </span>
          </div>
        </div>

        <div className="border-2 border-foreground mb-1">
          <div className="grid grid-cols-[26px_minmax(0,1fr)_44px_52px_80px_96px_minmax(0,1fr)] bg-primary text-primary-foreground text-[10px] font-semibold tracking-wider">
            <div className="px-1 py-0.5 text-center border-r border-primary-foreground/20">
              No.
            </div>
            <div className="px-2 py-0.5 border-r border-primary-foreground/20">
              工事項目・摘要
            </div>
            <div className="px-1 py-0.5 border-r border-primary-foreground/20 text-center">
              単位
            </div>
            <div className="px-1 py-0.5 border-r border-primary-foreground/20 text-right">
              数量
            </div>
            <div className="px-1.5 py-0.5 border-r border-primary-foreground/20 text-right">
              単価
            </div>
            <div className="px-1.5 py-0.5 text-right border-r border-primary-foreground/20">
              金額
            </div>
            <div className="px-2 py-0.5">備考</div>
          </div>
          {rows.map((item, i) => {
            const hasContent = !!item.description?.trim();
            const amount = hasContent ? item.quantity * item.unitPrice : 0;
            return (
              <div
                key={i}
                className="grid grid-cols-[26px_minmax(0,1fr)_44px_52px_80px_96px_minmax(0,1fr)] border-t border-foreground/30 text-[11px] min-h-[18px]"
              >
                <div className="px-1 py-0.5 text-center text-muted-foreground tabular-nums border-r border-foreground/30 text-[10px]">
                  {hasContent ? i + 1 : ""}
                </div>
                <div className="px-2 py-0.5 border-r border-foreground/30 whitespace-pre-wrap leading-tight">
                  {hasContent ? item.description : ""}
                </div>
                <div className="px-1 py-0.5 text-center border-r border-foreground/30 text-[10px]">
                  {hasContent ? (item.unit ?? "") : ""}
                </div>
                <div className="px-1 py-0.5 text-right tabular-nums border-r border-foreground/30">
                  {hasContent ? item.quantity : ""}
                </div>
                <div className="px-1.5 py-0.5 text-right tabular-nums border-r border-foreground/30">
                  {hasContent ? formatCurrency(item.unitPrice) : ""}
                </div>
                <div className="px-1.5 py-0.5 text-right tabular-nums font-medium border-r border-foreground/30">
                  {hasContent ? formatCurrency(amount) : ""}
                </div>
                <div className="px-2 py-0.5 whitespace-pre-wrap leading-tight text-[10.5px] text-muted-foreground">
                  {hasContent ? (item.notes ?? "") : ""}
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-[26px_minmax(0,1fr)_44px_52px_80px_96px_minmax(0,1fr)] border-t-2 border-foreground text-[10px] bg-muted/30">
            <div className="col-span-4"></div>
            <div className="px-1.5 py-0.5 border-l border-foreground/30 text-right font-semibold">
              小計
            </div>
            <div className="px-1.5 py-0.5 border-l border-foreground/30 text-right tabular-nums">
              {formatCurrency(inv.subtotal)}
            </div>
            <div className="border-l border-foreground/30"></div>
          </div>
          <div className="grid grid-cols-[26px_minmax(0,1fr)_44px_52px_80px_96px_minmax(0,1fr)] border-t border-foreground/30 text-[10px] bg-muted/30">
            <div className="col-span-4"></div>
            <div className="px-1.5 py-0.5 border-l border-foreground/30 text-right font-semibold">
              消費税
            </div>
            <div className="px-1.5 py-0.5 border-l border-foreground/30 text-right tabular-nums">
              {formatCurrency(inv.tax)}
            </div>
            <div className="border-l border-foreground/30"></div>
          </div>
          <div className="grid grid-cols-[26px_minmax(0,1fr)_44px_52px_80px_96px_minmax(0,1fr)] border-t border-foreground/30 text-[11px] bg-primary text-primary-foreground">
            <div className="col-span-4"></div>
            <div className="px-1.5 py-1 border-l border-primary-foreground/20 text-right font-bold">
              合計
            </div>
            <div className="px-1.5 py-1 border-l border-primary-foreground/20 text-right tabular-nums font-bold">
              {formatCurrency(inv.total)}
            </div>
            <div className="border-l border-primary-foreground/20"></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-1">
          <div className="space-y-0.5">
            <div className="text-[9px] tracking-[0.3em] text-muted-foreground">
              お振込先
            </div>
            <div className="border border-foreground/40 divide-y divide-foreground/30 text-[10px]">
              <div className="grid grid-cols-[64px_1fr]">
                <div className="px-2 py-0.5 bg-muted/40 border-r border-foreground/30">
                  銀行
                </div>
                <div className="px-2 py-0.5">
                  {BANK_INFO.bankName}　{BANK_INFO.branchName}
                </div>
              </div>
              <div className="grid grid-cols-[64px_1fr]">
                <div className="px-2 py-0.5 bg-muted/40 border-r border-foreground/30">
                  種別
                </div>
                <div className="px-2 py-0.5">
                  {BANK_INFO.accountType}　店番号 {BANK_INFO.branchCode}
                </div>
              </div>
              <div className="grid grid-cols-[64px_1fr]">
                <div className="px-2 py-0.5 bg-muted/40 border-r border-foreground/30">
                  口座番号
                </div>
                <div className="px-2 py-0.5 tabular-nums">
                  {BANK_INFO.accountNumber}
                </div>
              </div>
              <div className="grid grid-cols-[64px_1fr]">
                <div className="px-2 py-0.5 bg-muted/40 border-r border-foreground/30">
                  名義
                </div>
                <div className="px-2 py-0.5">{BANK_INFO.accountHolder}</div>
              </div>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[9px] tracking-[0.3em] text-muted-foreground">
              備考
            </div>
            <div className="w-full border border-foreground/40 px-2 py-0.5 text-[10px] leading-tight whitespace-pre-wrap min-h-[60px]">
              {inv.notes ?? ""}
            </div>
          </div>
        </div>

        <div className="mt-2 pt-1 border-t border-border text-center text-[9px] text-muted-foreground tracking-widest">
          {COMPANY_INFO.name}　|　{COMPANY_INFO.tel}
        </div>
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
