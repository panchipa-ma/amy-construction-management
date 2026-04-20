import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetQuote,
  useDeleteQuote,
  useConvertQuoteToInvoice,
  useImportQuoteToLedger,
  useGetProject,
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  getListInvoicesQueryKey,
  getGetProjectQueryKey,
  getGetProjectLedgerQueryKey,
  CostCategory,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Trash2,
  FileText,
  BookOpen,
  Printer,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { COMPANY_INFO, QUOTE_TERMS } from "@/lib/company-info";

const MIN_ROWS = 16;

function formatJpDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const era = d.getFullYear() >= 2019 ? `R${d.getFullYear() - 2018}` : `${d.getFullYear()}`;
  return `${era}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function QuoteDetailPage() {
  const [, params] = useRoute("/quotes/:id");
  const id = params?.id ?? "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: quote, isLoading } = useGetQuote(id, {
    query: { enabled: !!id, queryKey: getGetQuoteQueryKey(id) },
  });
  const projectIdForQuery = quote?.projectId ?? "";
  const { data: project } = useGetProject(projectIdForQuery, {
    query: {
      enabled: !!projectIdForQuery,
      queryKey: getGetProjectQueryKey(projectIdForQuery),
    },
  });
  const deleteMut = useDeleteQuote();
  const convertMut = useConvertQuoteToInvoice();
  const importMut = useImportQuoteToLedger();
  const [askDelete, setAskDelete] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [convertForm, setConvertForm] = useState({
    invoiceNumber: "",
    issueDate: today,
    dueDate: "",
  });
  const [importForm, setImportForm] = useState({
    category: CostCategory.material as CostCategory,
    entryDate: today,
    replaceExisting: false,
  });

  const handleConvert = async () => {
    if (!convertForm.invoiceNumber) {
      toast({ title: "請求書番号は必須です", variant: "destructive" });
      return;
    }
    try {
      const inv = await convertMut.mutateAsync({
        id,
        data: {
          invoiceNumber: convertForm.invoiceNumber,
          issueDate: convertForm.issueDate,
          dueDate: convertForm.dueDate || null,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "請求書を作成しました" });
      setConvertOpen(false);
      setLocation(`/invoices/${inv.id}`);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!quote) return;
    try {
      await importMut.mutateAsync({
        id,
        data: {
          category: importForm.category,
          entryDate: importForm.entryDate,
          replaceExisting: importForm.replaceExisting,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectLedgerQueryKey(quote.projectId),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(quote.projectId),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "施工台帳に取込みました" });
      setImportOpen(false);
      setLocation(`/projects/${quote.projectId}`);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      await invalidateDashboard(queryClient);
      toast({ title: "見積書を削除しました" });
      setLocation("/quotes");
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  if (isLoading || !quote) {
    return <Skeleton className="h-96 w-full max-w-4xl" />;
  }

  const customerName = project?.customerName ?? "";
  const subjectName = quote.projectName ?? project?.name ?? "";
  const items = quote.items;
  const displayCount = Math.max(items.length, MIN_ROWS);

  return (
    <div className="space-y-6">
      {/* Action header — hidden in print */}
      <div className="print:hidden flex items-center justify-between max-w-[820px]">
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          見積書一覧に戻る
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-2"
          >
            <Printer className="w-4 h-4" />
            印刷
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConvertForm({
                invoiceNumber: quote.quoteNumber.replace(/^Q/i, "INV"),
                issueDate: today,
                dueDate: "",
              });
              setConvertOpen(true);
            }}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            請求書に変換
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-2"
          >
            <BookOpen className="w-4 h-4" />
            台帳に取込
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

      {/* Quote document */}
      <div className="bg-white border border-border max-w-[820px] mx-auto p-8 text-[13px] text-foreground print:border-0 print:p-0 print:max-w-none print:mx-0">
        <h1 className="text-center text-2xl font-bold tracking-[0.5em] pb-2 mb-4">
          御 見 積 書
        </h1>

        {/* Top section: customer (left) + meta (right) */}
        <div className="grid grid-cols-2 gap-6 mb-3">
          <div className="space-y-1">
            <div className="flex items-end gap-2 border-b border-foreground pb-1">
              <span className="text-xl font-semibold flex-1">
                {customerName || "—"}
              </span>
              <span className="text-base">御中</span>
            </div>
            <div className="grid grid-cols-[80px_1fr] text-xs">
              <div className="border border-foreground px-2 py-1 bg-muted/40">
                ご担当
              </div>
              <div className="border border-foreground border-l-0 px-2 py-1 flex items-center justify-end gap-1">
                <span></span>
                <span className="text-muted-foreground">様</span>
              </div>
            </div>
          </div>
          <div className="text-xs space-y-1">
            <div className="grid grid-cols-[80px_1fr]">
              <div className="border border-foreground px-2 py-1 bg-muted/40">
                見積No.
              </div>
              <div className="border border-foreground border-l-0 px-2 py-1 text-right tabular-nums">
                {quote.quoteNumber}
              </div>
            </div>
            <div className="grid grid-cols-[80px_1fr]">
              <div className="border border-foreground px-2 py-1 bg-muted/40">
                見積日
              </div>
              <div className="border border-foreground border-l-0 px-2 py-1 text-right tabular-nums">
                {formatJpDate(quote.issueDate)}
              </div>
            </div>
          </div>
        </div>

        {/* 件名 + 自社情報 */}
        <div className="grid grid-cols-2 gap-6 mb-3">
          <div>
            <div className="grid grid-cols-[60px_1fr] mb-2">
              <div className="border border-foreground px-2 py-1 bg-muted/40 font-semibold">
                件名:
              </div>
              <div className="border border-foreground border-l-0 px-2 py-1">
                {subjectName}
              </div>
            </div>
            <p className="text-xs leading-relaxed">
              下記のとおり、御見積もり申し上げます。
            </p>
          </div>
          <div className="text-xs leading-relaxed">
            <div className="font-semibold">{COMPANY_INFO.name}</div>
            <div>{COMPANY_INFO.postalCode}</div>
            <div>{COMPANY_INFO.address}</div>
            <div className="mt-1">TEL: {COMPANY_INFO.tel}</div>
            <div>FAX: {COMPANY_INFO.fax}</div>
            <div>
              E-Mail:{" "}
              <a
                href={`mailto:${COMPANY_INFO.email}`}
                className="text-accent hover:underline print:text-foreground print:no-underline"
              >
                {COMPANY_INFO.email}
              </a>
            </div>
            <div>担当: {COMPANY_INFO.contact}</div>
          </div>
        </div>

        {/* Terms row */}
        <div className="grid grid-cols-3 text-xs mb-3">
          <div className="border border-foreground px-2 py-1">
            <span className="text-muted-foreground">納期:</span>{" "}
            {QUOTE_TERMS.delivery}
          </div>
          <div className="border border-foreground border-l-0 px-2 py-1">
            <span className="text-muted-foreground">支払条件:</span>{" "}
            {QUOTE_TERMS.payment}
          </div>
          <div className="border border-foreground border-l-0 px-2 py-1">
            <span className="text-muted-foreground">有効期限:</span>{" "}
            {quote.validUntil ? formatJpDate(quote.validUntil) : QUOTE_TERMS.validity}
          </div>
        </div>

        {/* 合計金額 prominent */}
        <div className="flex items-stretch border border-foreground mb-3">
          <div className="w-32 px-3 py-2 bg-muted/40 font-semibold border-r border-foreground flex items-center">
            合計金額
          </div>
          <div className="flex-1 px-4 py-2 flex items-center justify-end gap-3">
            <span className="text-2xl font-bold tabular-nums">
              {formatCurrency(quote.total)}
            </span>
            <span className="text-xs text-muted-foreground">(税込)</span>
          </div>
        </div>

        {/* Items table */}
        <div className="border border-foreground">
          <div className="grid grid-cols-[40px_1fr_80px_120px_140px] bg-muted/40 text-xs font-semibold">
            <div className="px-2 py-1.5 text-center border-r border-foreground">
              No.
            </div>
            <div className="px-2 py-1.5 border-r border-foreground">摘要</div>
            <div className="px-2 py-1.5 border-r border-foreground text-right">
              数量
            </div>
            <div className="px-2 py-1.5 border-r border-foreground text-right">
              単価
            </div>
            <div className="px-2 py-1.5 text-right">金額</div>
          </div>
          {Array.from({ length: displayCount }).map((_, i) => {
            const item = items[i];
            const amount = item ? item.quantity * item.unitPrice : 0;
            return (
              <div
                key={i}
                className="grid grid-cols-[40px_1fr_80px_120px_140px] border-t border-foreground text-xs min-h-[24px]"
              >
                <div className="px-2 py-1 text-center text-muted-foreground tabular-nums border-r border-foreground">
                  {i + 1}
                </div>
                <div className="px-2 py-1 border-r border-foreground">
                  {item?.description ?? ""}
                </div>
                <div className="px-2 py-1 text-right tabular-nums border-r border-foreground">
                  {item ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : ""}
                </div>
                <div className="px-2 py-1 text-right tabular-nums border-r border-foreground">
                  {item ? formatCurrency(item.unitPrice) : ""}
                </div>
                <div className="px-2 py-1 text-right tabular-nums">
                  {item ? formatCurrency(amount) : ""}
                </div>
              </div>
            );
          })}
          {/* totals rows */}
          <div className="grid grid-cols-[40px_1fr_80px_120px_140px] border-t border-foreground text-xs">
            <div className="col-span-3"></div>
            <div className="px-2 py-1 bg-muted/40 border-l border-foreground text-right font-semibold">
              小計
            </div>
            <div className="px-2 py-1 border-l border-foreground text-right tabular-nums">
              {formatCurrency(quote.subtotal)}
            </div>
          </div>
          <div className="grid grid-cols-[40px_1fr_80px_120px_140px] border-t border-foreground text-xs">
            <div className="col-span-3"></div>
            <div className="px-2 py-1 bg-muted/40 border-l border-foreground text-right font-semibold">
              消費税
            </div>
            <div className="px-2 py-1 border-l border-foreground text-right tabular-nums">
              {formatCurrency(quote.tax)}
            </div>
          </div>
          <div className="grid grid-cols-[40px_1fr_80px_120px_140px] border-t border-foreground text-xs">
            <div className="col-span-3"></div>
            <div className="px-2 py-1 bg-muted/40 border-l border-foreground text-right font-bold">
              合計
            </div>
            <div className="px-2 py-1 border-l border-foreground text-right tabular-nums font-bold">
              {formatCurrency(quote.total)}
            </div>
          </div>
        </div>

        {/* 備考 */}
        <div className="grid grid-cols-[60px_1fr] mt-4 border border-foreground">
          <div className="px-2 py-2 bg-muted/40 border-r border-foreground text-xs">
            備考
          </div>
          <div className="px-3 py-2 text-xs whitespace-pre-wrap min-h-[60px]">
            {quote.notes ?? ""}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>請求書に変換</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              この見積書の明細をコピーして新しい請求書を作成します。
            </p>
            <div>
              <Label htmlFor="invoiceNumber">請求書番号 *</Label>
              <Input
                id="invoiceNumber"
                value={convertForm.invoiceNumber}
                onChange={(e) =>
                  setConvertForm({
                    ...convertForm,
                    invoiceNumber: e.target.value,
                  })
                }
                placeholder="例: INV-2026-001"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cIssueDate">発行日</Label>
                <Input
                  id="cIssueDate"
                  type="date"
                  value={convertForm.issueDate}
                  onChange={(e) =>
                    setConvertForm({
                      ...convertForm,
                      issueDate: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="cDueDate">支払期日</Label>
                <Input
                  id="cDueDate"
                  type="date"
                  value={convertForm.dueDate}
                  onChange={(e) =>
                    setConvertForm({
                      ...convertForm,
                      dueDate: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleConvert} disabled={convertMut.isPending}>
              請求書を作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>施工台帳に取込</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              見積明細の各行を予算原価として施工台帳 (案件「{subjectName}」) に登録します。
            </p>
            <div>
              <Label>原価カテゴリ</Label>
              <Select
                value={importForm.category}
                onValueChange={(v) =>
                  setImportForm({ ...importForm, category: v as CostCategory })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CostCategory.material}>材料費</SelectItem>
                  <SelectItem value={CostCategory.subcontract}>
                    外注費
                  </SelectItem>
                  <SelectItem value={CostCategory.labor}>労務費</SelectItem>
                  <SelectItem value={CostCategory.expense}>経費</SelectItem>
                  <SelectItem value={CostCategory.other}>その他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="iEntryDate">計上日</Label>
              <Input
                id="iEntryDate"
                type="date"
                value={importForm.entryDate}
                onChange={(e) =>
                  setImportForm({ ...importForm, entryDate: e.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={importForm.replaceExisting}
                onCheckedChange={(v) =>
                  setImportForm({
                    ...importForm,
                    replaceExisting: v === true,
                  })
                }
              />
              既存の原価明細を全て削除してから取込む
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleImport} disabled={importMut.isPending}>
              取込実行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>見積書を削除しますか?</AlertDialogTitle>
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
