import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetQuote,
  useUpdateQuote,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Pencil,
  Save,
  X,
  Plus,
  Copy,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { COMPANY_INFO, QUOTE_TERMS } from "@/lib/company-info";

const MIN_ROWS = 8;

type EditItem = {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  notes: string;
};

function formatJpDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const era = d.getFullYear() >= 2019 ? `R${d.getFullYear() - 2018}` : `${d.getFullYear()}`;
  return `${era}.${d.getMonth() + 1}.${d.getDate()}`;
}

function toISODate(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
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
  const updateMut = useUpdateQuote();
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

  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editQuoteNumber, setEditQuoteNumber] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editValidUntil, setEditValidUntil] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editItems, setEditItems] = useState<EditItem[]>([]);

  const startEditing = () => {
    if (!quote) return;
    setEditSubject(quote.subject || quote.projectName || project?.name || "");
    setEditContact(quote.contactName ?? "");
    setEditQuoteNumber(quote.quoteNumber);
    setEditIssueDate(toISODate(quote.issueDate));
    setEditValidUntil(toISODate(quote.validUntil));
    setEditNotes(quote.notes ?? "");
    setEditItems(
      quote.items.map((it) => ({
        description: it.description,
        unit: it.unit ?? "式",
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        notes: it.notes ?? "",
      })),
    );
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const addItem = () => {
    setEditItems([
      ...editItems,
      { description: "", unit: "式", quantity: 1, unitPrice: 0, notes: "" },
    ]);
  };

  const removeItem = (idx: number) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, patch: Partial<EditItem>) => {
    setEditItems(editItems.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const saveEdits = async () => {
    if (!quote) return;
    if (!editQuoteNumber.trim()) {
      toast({ title: "見積No.は必須です", variant: "destructive" });
      return;
    }
    if (!editIssueDate) {
      toast({ title: "見積日は必須です", variant: "destructive" });
      return;
    }
    const items = editItems
      .filter((it) => it.description.trim())
      .map((it) => ({
        description: it.description,
        unit: it.unit || null,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        notes: it.notes || null,
      }));
    try {
      await updateMut.mutateAsync({
        id,
        data: {
          projectId: quote.projectId,
          subject: editSubject || null,
          contactName: editContact || null,
          quoteNumber: editQuoteNumber,
          issueDate: editIssueDate,
          validUntil: editValidUntil || null,
          notes: editNotes || null,
          items,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetQuoteQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      await invalidateDashboard(queryClient);
      toast({ title: "見積書を更新しました" });
      setEditing(false);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

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

  const customerName =
    quote.customerName ?? project?.customerName ?? "";
  const subjectName = quote.subject || quote.projectName || project?.name || "";
  const contactName = quote.contactName ?? "";
  const items = quote.items;
  const displayCount = Math.max(items.length, MIN_ROWS);

  const editSubtotal = editItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const editTax = Math.round(editSubtotal * 0.1);
  const editTotal = editSubtotal + editTax;

  return (
    <div className="quote-workbench -m-8 min-h-[calc(100vh-0px)] py-6 px-6 print:p-0 print:m-0 print:min-h-0">
      <div className="print:hidden max-w-[1040px] mx-auto flex items-center justify-between mb-4">
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          見積書一覧に戻る
        </Link>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEditing}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                キャンセル
              </Button>
              <Button
                size="sm"
                onClick={saveEdits}
                disabled={updateMut.isPending}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                保存
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={startEditing}
                className="gap-2"
              >
                <Pencil className="w-4 h-4" />
                編集
              </Button>
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
                onClick={() => setLocation(`/quotes/new?fromQuoteId=${id}`)}
                className="gap-2"
                title="この見積書の内容で新規見積書を作成します"
              >
                <Copy className="w-4 h-4" />
                複製して新規作成
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
            </>
          )}
        </div>
      </div>

      <div className="quote-paper max-w-[1040px] mx-auto px-8 py-8 text-[14px] text-foreground print:border-0 print:p-0 print:max-w-none print:mx-0 print:shadow-none">
        <div className="text-center mb-6 -mt-2">
          <h1 className="quote-title inline-block text-[36px] font-semibold text-foreground tracking-[0.5em] pl-[0.5em]">
            御&nbsp;&nbsp;見&nbsp;&nbsp;積&nbsp;&nbsp;書
          </h1>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr] gap-8 mb-5">
          <div className="space-y-3 min-w-0">
            <div className="flex items-end gap-3 border-b-2 border-foreground pb-1.5">
              <span className="quote-customer text-[22px] flex-1 truncate">
                {customerName || "—"}
              </span>
              <span className="quote-customer text-[18px] pb-0.5 shrink-0">御中</span>
            </div>
            <div className="flex items-center gap-3 text-[13px]">
              <span className="text-muted-foreground w-14 shrink-0">ご担当</span>
              {editing ? (
                <Input
                  value={editContact}
                  onChange={(e) => setEditContact(e.target.value)}
                  className="h-7 text-[13px]"
                  placeholder="担当者名"
                />
              ) : (
                <span className="flex-1 min-w-0 border-b border-border py-0.5 truncate">
                  {contactName || "\u00A0"}
                </span>
              )}
              {!editing && contactName && <span className="text-sm shrink-0">様</span>}
            </div>
          </div>
          <div className="text-[12px] border border-foreground self-start">
            <div className="grid grid-cols-[78px_1fr] border-b border-foreground">
              <div className="px-2.5 py-1.5 bg-muted/50 border-r border-foreground">
                見積No.
              </div>
              <div className="px-2.5 py-1.5 text-right tabular-nums truncate">
                {editing ? (
                  <Input
                    value={editQuoteNumber}
                    onChange={(e) => setEditQuoteNumber(e.target.value)}
                    className="h-6 text-[12px] text-right"
                  />
                ) : (
                  quote.quoteNumber
                )}
              </div>
            </div>
            <div className="grid grid-cols-[78px_1fr] border-b border-foreground">
              <div className="px-2.5 py-1.5 bg-muted/50 border-r border-foreground">
                見積日
              </div>
              <div className="px-2.5 py-1.5 text-right tabular-nums">
                {editing ? (
                  <Input
                    type="date"
                    value={editIssueDate}
                    onChange={(e) => setEditIssueDate(e.target.value)}
                    className="h-6 text-[12px] text-right"
                  />
                ) : (
                  formatJpDate(quote.issueDate)
                )}
              </div>
            </div>
            <div className="grid grid-cols-[78px_1fr]">
              <div className="px-2.5 py-1.5 bg-muted/50 border-r border-foreground">
                有効期限
              </div>
              <div className="px-2.5 py-1.5 text-right tabular-nums">
                {editing ? (
                  <Input
                    type="date"
                    value={editValidUntil}
                    onChange={(e) => setEditValidUntil(e.target.value)}
                    className="h-6 text-[12px] text-right"
                  />
                ) : (
                  quote.validUntil
                    ? formatJpDate(quote.validUntil)
                    : QUOTE_TERMS.validity
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr] gap-8 mb-5">
          <div className="space-y-3 min-w-0">
            <div className="border-l-4 border-primary pl-3 py-0.5">
              <div className="text-[10px] tracking-[0.3em] text-muted-foreground mb-0.5">
                件名
              </div>
              {editing ? (
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="h-8 text-[16px] font-semibold"
                  placeholder="件名"
                />
              ) : (
                <div className="text-[16px] font-semibold leading-snug">
                  {subjectName || "—"}
                </div>
              )}
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              下記のとおり、御見積もり申し上げます。
            </p>
          </div>
          <div className="bg-muted/30 border border-border px-4 py-3 text-[11.5px] leading-[1.6] min-w-0">
            <div className="quote-customer text-[14px] mb-0.5">
              {COMPANY_INFO.name}
            </div>
            <div className="text-muted-foreground truncate">
              {COMPANY_INFO.postalCode} {COMPANY_INFO.address}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3">
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
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="text-muted-foreground mr-1">担当</span>
                {COMPANY_INFO.contact}
              </span>
              <span className="w-9 h-9 border-2 border-destructive/40 rounded-full flex items-center justify-center text-destructive/50 text-[10px] font-serif shrink-0">
                印
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-stretch border-2 border-primary mb-4 bg-primary/[0.02]">
          <div className="w-36 px-4 py-2.5 bg-primary text-primary-foreground font-semibold border-r-2 border-primary flex items-center justify-center text-[13px] tracking-[0.25em]">
            合 計 金 額
          </div>
          <div className="flex-1 px-5 py-2.5 flex items-baseline justify-end gap-2">
            <span className="text-muted-foreground text-sm">¥</span>
            <span className="text-[28px] font-bold tabular-nums leading-none">
              {editing
                ? editTotal.toLocaleString()
                : quote.total.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">
              （税込）
            </span>
          </div>
        </div>

        {editing ? (
          <div className="border-2 border-foreground mb-4">
            <div className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)_32px] bg-primary text-primary-foreground text-[11.5px] font-semibold tracking-wider">
              <div className="px-1.5 py-1.5 text-center border-r border-primary-foreground/20">No.</div>
              <div className="px-3 py-1.5 border-r border-primary-foreground/20">工事項目・摘要</div>
              <div className="px-1.5 py-1.5 border-r border-primary-foreground/20 text-center">単位</div>
              <div className="px-1.5 py-1.5 border-r border-primary-foreground/20 text-right">数量</div>
              <div className="px-2 py-1.5 border-r border-primary-foreground/20 text-right">単価</div>
              <div className="px-2 py-1.5 text-right border-r border-primary-foreground/20">金額</div>
              <div className="px-3 py-1.5 border-r border-primary-foreground/20">備考</div>
              <div className="px-1 py-1.5"></div>
            </div>
            {editItems.map((item, i) => (
              <div
                key={i}
                className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)_32px] border-t border-foreground/30 text-[13px] min-h-[34px]"
              >
                <div className="px-1.5 py-1 text-center text-muted-foreground tabular-nums border-r border-foreground/30 text-[12px] flex items-center justify-center">
                  {i + 1}
                </div>
                <div className="px-1 py-0.5 border-r border-foreground/30">
                  <Textarea
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    className="min-h-[28px] h-7 text-[13px] border-0 shadow-none focus-visible:ring-1 p-1 resize-none"
                    placeholder="工事項目"
                  />
                </div>
                <div className="px-0.5 py-0.5 border-r border-foreground/30">
                  <Input
                    value={item.unit}
                    onChange={(e) => updateItem(i, { unit: e.target.value })}
                    className="h-7 text-[12px] text-center border-0 shadow-none focus-visible:ring-1 px-1"
                  />
                </div>
                <div className="px-0.5 py-0.5 border-r border-foreground/30">
                  <Input
                    type="number"
                    value={item.quantity || ""}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })}
                    className="h-7 text-[13px] text-right border-0 shadow-none focus-visible:ring-1 px-1 tabular-nums"
                  />
                </div>
                <div className="px-0.5 py-0.5 border-r border-foreground/30">
                  <Input
                    type="number"
                    value={item.unitPrice || ""}
                    onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) || 0 })}
                    className="h-7 text-[13px] text-right border-0 shadow-none focus-visible:ring-1 px-1 tabular-nums"
                  />
                </div>
                <div className="px-2 py-1.5 text-right tabular-nums font-medium border-r border-foreground/30 flex items-center justify-end">
                  {formatCurrency(item.quantity * item.unitPrice)}
                </div>
                <div className="px-0.5 py-0.5 border-r border-foreground/30">
                  <Input
                    value={item.notes}
                    onChange={(e) => updateItem(i, { notes: e.target.value })}
                    className="h-7 text-[12.5px] border-0 shadow-none focus-visible:ring-1 px-1"
                    placeholder="備考"
                  />
                </div>
                <div className="flex items-center justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => removeItem(i)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="border-t border-foreground/30 px-3 py-1.5">
              <Button variant="ghost" size="sm" onClick={addItem} className="gap-1 text-xs h-7">
                <Plus className="w-3 h-3" />
                行を追加
              </Button>
            </div>
            <div className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)_32px] border-t-2 border-foreground text-[12px] bg-muted/30">
              <div className="col-span-4"></div>
              <div className="px-2 py-1.5 border-l border-foreground/30 text-right font-semibold">小計</div>
              <div className="px-2 py-1.5 border-l border-foreground/30 text-right tabular-nums">{formatCurrency(editSubtotal)}</div>
              <div className="col-span-2 border-l border-foreground/30"></div>
            </div>
            <div className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)_32px] border-t border-foreground/30 text-[12px] bg-muted/30">
              <div className="col-span-4"></div>
              <div className="px-2 py-1.5 border-l border-foreground/30 text-right font-semibold">消費税</div>
              <div className="px-2 py-1.5 border-l border-foreground/30 text-right tabular-nums">{formatCurrency(editTax)}</div>
              <div className="col-span-2 border-l border-foreground/30"></div>
            </div>
            <div className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)_32px] border-t border-foreground/30 text-[13px] bg-primary text-primary-foreground">
              <div className="col-span-4"></div>
              <div className="px-2 py-2 border-l border-primary-foreground/20 text-right font-bold">合計</div>
              <div className="px-2 py-2 border-l border-primary-foreground/20 text-right tabular-nums font-bold">{formatCurrency(editTotal)}</div>
              <div className="col-span-2 border-l border-primary-foreground/20"></div>
            </div>
          </div>
        ) : (
          <div className="border-2 border-foreground mb-4">
            <div className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)] bg-primary text-primary-foreground text-[11.5px] font-semibold tracking-wider">
              <div className="px-1.5 py-1.5 text-center border-r border-primary-foreground/20">
                No.
              </div>
              <div className="px-3 py-1.5 border-r border-primary-foreground/20">
                工事項目・摘要
              </div>
              <div className="px-1.5 py-1.5 border-r border-primary-foreground/20 text-center">
                単位
              </div>
              <div className="px-1.5 py-1.5 border-r border-primary-foreground/20 text-right">
                数量
              </div>
              <div className="px-2 py-1.5 border-r border-primary-foreground/20 text-right">
                単価
              </div>
              <div className="px-2 py-1.5 text-right border-r border-primary-foreground/20">
                金額
              </div>
              <div className="px-3 py-1.5">備考</div>
            </div>
            {Array.from({ length: displayCount }).map((_, i) => {
              const item = items[i];
              const amount = item ? item.quantity * item.unitPrice : 0;
              return (
                <div
                  key={i}
                  className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)] border-t border-foreground/30 text-[13px] min-h-[34px]"
                >
                  <div className="px-1.5 py-1.5 text-center text-muted-foreground tabular-nums border-r border-foreground/30 text-[12px]">
                    {item ? i + 1 : ""}
                  </div>
                  <div className="px-3 py-1.5 border-r border-foreground/30 whitespace-pre-wrap leading-snug">
                    {item?.description ?? ""}
                  </div>
                  <div className="px-1.5 py-1.5 text-center border-r border-foreground/30 text-[12px]">
                    {item?.unit ?? ""}
                  </div>
                  <div className="px-1.5 py-1.5 text-right tabular-nums border-r border-foreground/30">
                    {item ? item.quantity : ""}
                  </div>
                  <div className="px-2 py-1.5 text-right tabular-nums border-r border-foreground/30">
                    {item ? formatCurrency(item.unitPrice) : ""}
                  </div>
                  <div className="px-2 py-1.5 text-right tabular-nums font-medium border-r border-foreground/30">
                    {item ? formatCurrency(amount) : ""}
                  </div>
                  <div className="px-3 py-1.5 whitespace-pre-wrap leading-snug text-[12.5px] text-muted-foreground">
                    {item?.notes ?? ""}
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)] border-t-2 border-foreground text-[12px] bg-muted/30">
              <div className="col-span-4"></div>
              <div className="px-2 py-1.5 border-l border-foreground/30 text-right font-semibold">
                小計
              </div>
              <div className="px-2 py-1.5 border-l border-foreground/30 text-right tabular-nums">
                {formatCurrency(quote.subtotal)}
              </div>
              <div className="border-l border-foreground/30"></div>
            </div>
            <div className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)] border-t border-foreground/30 text-[12px] bg-muted/30">
              <div className="col-span-4"></div>
              <div className="px-2 py-1.5 border-l border-foreground/30 text-right font-semibold">
                消費税
              </div>
              <div className="px-2 py-1.5 border-l border-foreground/30 text-right tabular-nums">
                {formatCurrency(quote.tax)}
              </div>
              <div className="border-l border-foreground/30"></div>
            </div>
            <div className="grid grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)] border-t border-foreground/30 text-[13px] bg-primary text-primary-foreground">
              <div className="col-span-4"></div>
              <div className="px-2 py-2 border-l border-primary-foreground/20 text-right font-bold">
                合計
              </div>
              <div className="px-2 py-2 border-l border-primary-foreground/20 text-right tabular-nums font-bold">
                {formatCurrency(quote.total)}
              </div>
              <div className="border-l border-primary-foreground/20"></div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-5 mb-2">
          <div className="space-y-1.5">
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground">
              取引条件
            </div>
            <div className="border border-foreground/40 divide-y divide-foreground/30 text-[11.5px]">
              <div className="grid grid-cols-[72px_1fr]">
                <div className="px-2.5 py-1.5 bg-muted/40 border-r border-foreground/30">
                  納期
                </div>
                <div className="px-2.5 py-1.5">{QUOTE_TERMS.delivery}</div>
              </div>
              <div className="grid grid-cols-[72px_1fr]">
                <div className="px-2.5 py-1.5 bg-muted/40 border-r border-foreground/30">
                  支払条件
                </div>
                <div className="px-2.5 py-1.5">{QUOTE_TERMS.payment}</div>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground">
              備考
            </div>
            {editing ? (
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full border border-foreground/40 px-2.5 py-1.5 text-[11.5px] leading-relaxed min-h-[64px] resize-none"
                placeholder="備考"
              />
            ) : (
              <div className="w-full border border-foreground/40 px-2.5 py-1.5 text-[11.5px] leading-relaxed whitespace-pre-wrap min-h-[64px]">
                {quote.notes ?? ""}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 pt-2 border-t border-border text-center text-[10px] text-muted-foreground tracking-widest">
          {COMPANY_INFO.name}　|　{COMPANY_INFO.tel}
        </div>
      </div>

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
              <Label htmlFor="importDate">計上日</Label>
              <Input
                id="importDate"
                type="date"
                value={importForm.entryDate}
                onChange={(e) =>
                  setImportForm({ ...importForm, entryDate: e.target.value })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="replaceExisting"
                checked={importForm.replaceExisting}
                onCheckedChange={(c) =>
                  setImportForm({
                    ...importForm,
                    replaceExisting: c === true,
                  })
                }
              />
              <Label htmlFor="replaceExisting" className="text-sm">
                既存の計画原価を上書きする
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleImport} disabled={importMut.isPending}>
              台帳に取込
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この見積書を削除しますか?</AlertDialogTitle>
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
