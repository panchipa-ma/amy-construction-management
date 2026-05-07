import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateQuote,
  useGetQuote,
  useListProjects,
  useListCustomers,
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  type LineItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { ArrowLeft, Save, Trash2, Plus } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { COMPANY_INFO, QUOTE_TERMS } from "@/lib/company-info";
import { formatCurrency } from "@/lib/format";
import { UNIT_OPTIONS } from "@/lib/units";

const ROWS = 8;

function AutoGrowTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
  dataCell,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  dataCell?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      rows={1}
      placeholder={placeholder}
      data-cell={dataCell}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

function searchParamProjectId(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("projectId") ?? "";
}

function searchParamFromQuoteId(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("fromQuoteId") ?? "";
}

function emptyItem(): LineItem {
  return { description: "", unit: "", quantity: 0, unitPrice: 0, notes: "" };
}

export default function QuoteNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const projectsQ = useListProjects();
  const customersQ = useListCustomers();
  const createMut = useCreateQuote();

  const [projectId, setProjectId] = useState(searchParamProjectId());
  const [customerId, setCustomerId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState(() => {
    const d = new Date();
    return `Q-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
  });
  const [issueDate, setIssueDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [validUntil, setValidUntil] = useState("");
  const [contactName, setContactName] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineItem[]>(() =>
    Array.from({ length: ROWS }, () => emptyItem()),
  );

  const subjectTouched = useRef(false);

  // 既存見積書から複製：?fromQuoteId=<id> をフェッチして本文・明細を流用。
  // 案件・顧客・見積No・見積日は引き継がない（新規案件用のため）。
  const [fromQuoteId] = useState(searchParamFromQuoteId);
  const fromQuoteQ = useGetQuote(fromQuoteId, {
    query: {
      enabled: !!fromQuoteId,
      queryKey: getGetQuoteQueryKey(fromQuoteId),
    },
  });
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!fromQuoteId || prefilledRef.current) return;
    const src = fromQuoteQ.data;
    if (!src) return;
    prefilledRef.current = true;
    if (src.subject) {
      setSubject(src.subject);
      // Mark as user-edited so the project picker doesn't overwrite it.
      subjectTouched.current = true;
    }
    if (src.contactName) setContactName(src.contactName);
    if (src.notes) setNotes(src.notes);
    if (Array.isArray(src.items) && src.items.length > 0) {
      const copied: LineItem[] = src.items.map((it) => ({
        description: it.description ?? "",
        unit: it.unit ?? "",
        quantity: it.quantity ?? 0,
        unitPrice: it.unitPrice ?? 0,
        notes: it.notes ?? "",
      }));
      // Pad to at least ROWS so the empty-row UX still works.
      while (copied.length < ROWS) copied.push(emptyItem());
      // Append a trailing empty row so typing into the last copied row appends.
      copied.push(emptyItem());
      setRows(copied);
    }
    toast({
      title: "見積書を複製しました",
      description: "案件・見積No・見積日を選び直してください。",
    });
  }, [fromQuoteId, fromQuoteQ.data, toast]);

  const selectedProject = useMemo(
    () => (projectsQ.data ?? []).find((p) => p.id === projectId),
    [projectsQ.data, projectId],
  );

  useEffect(() => {
    if (selectedProject && !subjectTouched.current) {
      setSubject(selectedProject.name);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject && selectedProject.customerId !== customerId) {
      setCustomerId(selectedProject.customerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]);

  useEffect(() => {
    if (
      selectedProject &&
      customerId &&
      selectedProject.customerId !== customerId
    ) {
      setProjectId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const totals = useMemo(() => {
    const subtotal = rows.reduce(
      (s, it) => s + (it.quantity || 0) * (it.unitPrice || 0),
      0,
    );
    const tax = Math.floor(subtotal * 0.1);
    return { subtotal, tax, total: subtotal + tax };
  }, [rows]);

  const tableRef = useRef<HTMLDivElement>(null);

  const isCellEmpty = (v: any) => v === "" || v === 0 || v === null || v === undefined;

  const updateRow = (i: number, field: keyof LineItem, value: any) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      // Auto-append empty row when typing into the last row
      if (i === prev.length - 1 && !isCellEmpty(value)) {
        next.push(emptyItem());
      }
      return next;
    });
  };

  const addRow = () => setRows([...rows, emptyItem()]);
  const clearRow = (i: number) => {
    const next = [...rows];
    next[i] = emptyItem();
    setRows(next);
  };

  const focusCell = (row: number, col: string) => {
    const el = tableRef.current?.querySelector<HTMLElement>(
      `[data-cell="r${row}-c${col}"]`,
    );
    el?.focus();
    if (el && (el as HTMLInputElement).select) {
      (el as HTMLInputElement).select?.();
    }
  };

  const handleEnterDown = (
    e: React.KeyboardEvent,
    currentRow: number,
    col: string,
  ) => {
    if (
      e.key !== "Enter" ||
      e.shiftKey ||
      e.altKey ||
      (e.nativeEvent as any).isComposing
    )
      return;
    e.preventDefault();
    if (currentRow >= rows.length - 1) {
      setRows((prev) => [...prev, emptyItem()]);
      setTimeout(() => focusCell(currentRow + 1, col), 0);
    } else {
      focusCell(currentRow + 1, col);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !quoteNumber || !issueDate) {
      toast({
        title: "案件・見積No・見積日は必須です",
        variant: "destructive",
      });
      return;
    }
    const items = rows.filter(
      (it) =>
        it.description.trim() !== "" ||
        it.quantity > 0 ||
        it.unitPrice > 0 ||
        (it.notes ?? "").trim() !== "",
    );
    if (items.length === 0) {
      toast({ title: "明細を1行以上入力してください", variant: "destructive" });
      return;
    }
    try {
      const res = await createMut.mutateAsync({
        data: {
          projectId,
          subject: subject || null,
          contactName: contactName || null,
          quoteNumber,
          issueDate,
          validUntil: validUntil || null,
          notes: notes || null,
          items,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListQuotesQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "見積書を作成しました" });
      setLocation(`/quotes/${res.id}`);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const filteredProjects = (projectsQ.data ?? []).filter(
    (p) => !customerId || p.customerId === customerId,
  );

  // Column template — description gets the widest space
  const colTemplate =
    "grid-cols-[32px_minmax(0,1fr)_52px_60px_88px_108px_minmax(0,1fr)_24px]";

  return (
    <div className="quote-workbench -m-8 min-h-[calc(100vh-0px)] py-6 px-6 print:p-0 print:m-0 print:min-h-0">
      {/* Top toolbar */}
      <div className="max-w-[1040px] mx-auto flex items-center justify-between mb-4 print:hidden">
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          見積書一覧に戻る
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/quotes">
            <Button type="button" variant="outline" size="sm">
              キャンセル
            </Button>
          </Link>
          <Button
            type="submit"
            form="quote-form"
            size="sm"
            disabled={createMut.isPending}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            作成して保存
          </Button>
        </div>
      </div>

      {/* The paper */}
      <form
        id="quote-form"
        onSubmit={submit}
        className="quote-paper max-w-[1040px] mx-auto px-8 py-8 text-[14px] text-foreground print:border-0 print:p-0 print:max-w-none print:mx-0 print:shadow-none"
      >
        {/* Title */}
        <div className="text-center mb-6 -mt-2">
          <h1 className="quote-title inline-block text-[36px] font-semibold text-foreground tracking-[0.5em] pl-[0.5em]">
            御&nbsp;&nbsp;見&nbsp;&nbsp;積&nbsp;&nbsp;書
          </h1>
        </div>

        {/* Customer + Meta */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-8 mb-5">
          {/* LEFT: Customer */}
          <div className="space-y-3 min-w-0">
            <div className="flex items-end gap-3 border-b-2 border-foreground pb-1.5">
              <div className="flex-1 min-w-0">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="border-0 shadow-none p-0 h-9 text-[22px] quote-customer focus:ring-0 [&>svg]:opacity-30 hover:[&>svg]:opacity-100 truncate">
                    <SelectValue placeholder="お客様を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customersQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="quote-customer text-[18px] pb-0.5 shrink-0">御中</span>
            </div>
            <div className="flex items-center gap-3 text-[13px]">
              <span className="text-muted-foreground w-14 shrink-0">ご担当</span>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="（任意）"
                className="flex-1 min-w-0 bg-transparent outline-none border-b border-border focus:border-foreground py-0.5 placeholder:text-muted-foreground/30"
              />
              <span className="text-sm shrink-0">様</span>
            </div>
          </div>

          {/* RIGHT: Quote meta */}
          <div className="text-[12px] border border-foreground self-start">
            <div className="grid grid-cols-[78px_1fr] border-b border-foreground">
              <div className="px-2.5 py-1.5 bg-muted/50 border-r border-foreground">
                見積No.
              </div>
              <input
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                className="px-2.5 py-1.5 text-right tabular-nums bg-transparent outline-none focus:bg-accent/10 min-w-0"
              />
            </div>
            <div className="grid grid-cols-[78px_1fr] border-b border-foreground">
              <div className="px-2.5 py-1.5 bg-muted/50 border-r border-foreground">
                見積日
              </div>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="px-2.5 py-1.5 text-right tabular-nums bg-transparent outline-none focus:bg-accent/10 min-w-0"
              />
            </div>
            <div className="grid grid-cols-[78px_1fr]">
              <div className="px-2.5 py-1.5 bg-muted/50 border-r border-foreground">
                有効期限
              </div>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="px-2.5 py-1.5 text-right tabular-nums bg-transparent outline-none focus:bg-accent/10 min-w-0"
              />
            </div>
          </div>
        </div>

        {/* 件名 + 自社情報 */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-8 mb-5">
          <div className="space-y-3 min-w-0">
            <div>
              <div className="text-[10px] tracking-[0.3em] text-muted-foreground mb-1">
                案件
              </div>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full border-0 border-b border-border shadow-none rounded-none px-1 py-1.5 h-auto text-[14px] focus:ring-0 [&>svg]:opacity-30 hover:[&>svg]:opacity-100 hover:border-foreground">
                  <SelectValue placeholder="案件を選択" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border-l-4 border-primary pl-3 py-0.5">
              <div className="text-[10px] tracking-[0.3em] text-muted-foreground mb-0.5">
                件名
              </div>
              <input
                value={subject}
                onChange={(e) => {
                  subjectTouched.current = true;
                  setSubject(e.target.value);
                }}
                placeholder="工事名・件名を入力"
                className="w-full text-[16px] font-semibold bg-transparent outline-none focus:bg-accent/10 placeholder:text-muted-foreground/30 placeholder:font-normal"
              />
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              下記のとおり、御見積もり申し上げます。
            </p>
          </div>

          {/* Company info card */}
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

        {/* 合計金額 — hero */}
        <div className="flex items-stretch border-2 border-primary mb-4 bg-primary/[0.02]">
          <div className="w-36 px-4 py-2.5 bg-primary text-primary-foreground font-semibold border-r-2 border-primary flex items-center justify-center text-[13px] tracking-[0.25em]">
            合 計 金 額
          </div>
          <div className="flex-1 px-5 py-2.5 flex items-baseline justify-end gap-2">
            <span className="text-muted-foreground text-sm">¥</span>
            <span className="text-[28px] font-bold tabular-nums leading-none">
              {totals.total.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">
              （税込）
            </span>
          </div>
        </div>

        {/* Items table */}
        <div ref={tableRef} className="border-2 border-foreground mb-2">
          <div
            className={`grid ${colTemplate} bg-primary text-primary-foreground text-[11.5px] font-semibold tracking-wider`}
          >
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
            <div className="px-3 py-1.5 border-r border-primary-foreground/20">
              備考
            </div>
            <div></div>
          </div>
          {rows.map((row, i) => {
            const amount = (row.quantity || 0) * (row.unitPrice || 0);
            const isFirstEmpty =
              i === 0 &&
              !row.description &&
              !row.unit &&
              !row.quantity &&
              !row.unitPrice;
            return (
              <div
                key={i}
                className={`grid ${colTemplate} border-t border-foreground/30 text-[13px] hover:bg-accent/5 items-stretch`}
              >
                <div className="px-1.5 py-1.5 text-center text-muted-foreground tabular-nums border-r border-foreground/30 text-[12px] flex items-start justify-center min-h-[34px]">
                  {i + 1}
                </div>
                <AutoGrowTextarea
                  value={row.description}
                  onChange={(v) => updateRow(i, "description", v)}
                  onKeyDown={(e) => handleEnterDown(e, i, "desc")}
                  placeholder={
                    isFirstEmpty
                      ? "例: クロス貼り工事 (リビング・寝室)"
                      : ""
                  }
                  className="block w-full px-3 py-1.5 bg-transparent outline-none focus:bg-accent/10 border-r border-foreground/30 resize-none leading-snug placeholder:text-muted-foreground/30 overflow-hidden min-h-[34px]"
                  dataCell={`r${i}-cdesc`}
                  ariaLabel={`摘要 ${i + 1}行目`}
                />
                <Select
                  value={row.unit ?? ""}
                  onValueChange={(v) => updateRow(i, "unit", v)}
                >
                  <SelectTrigger className="border-0 border-r border-foreground/30 rounded-none shadow-none h-auto py-1.5 px-1 text-center justify-center focus:ring-0 focus:bg-accent/10 [&>svg]:hidden self-start min-h-[34px] text-[12px]">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.quantity || ""}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    updateRow(i, "quantity", Number.isFinite(n) ? n : 0);
                  }}
                  onKeyDown={(e) => handleEnterDown(e, i, "qty")}
                  className="px-1.5 py-1.5 bg-transparent outline-none focus:bg-accent/10 border-r border-foreground/30 text-right tabular-nums min-w-0 self-start min-h-[34px] text-[13px]"
                  data-cell={`r${i}-cqty`}
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.unitPrice || ""}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    updateRow(i, "unitPrice", Number.isFinite(n) ? n : 0);
                  }}
                  onKeyDown={(e) => handleEnterDown(e, i, "price")}
                  className="px-2 py-1.5 bg-transparent outline-none focus:bg-accent/10 border-r border-foreground/30 text-right tabular-nums min-w-0 self-start min-h-[34px] text-[13px]"
                  data-cell={`r${i}-cprice`}
                />
                <div className="px-2 py-1.5 text-right tabular-nums border-r border-foreground/30 self-start min-h-[34px] font-medium">
                  {amount > 0 ? formatCurrency(amount) : ""}
                </div>
                <AutoGrowTextarea
                  value={row.notes ?? ""}
                  onChange={(v) => updateRow(i, "notes", v)}
                  onKeyDown={(e) => handleEnterDown(e, i, "notes")}
                  className="block w-full px-3 py-1.5 bg-transparent outline-none focus:bg-accent/10 border-r border-foreground/30 resize-none leading-snug placeholder:text-muted-foreground/30 overflow-hidden min-h-[34px] text-[12.5px]"
                  dataCell={`r${i}-cnotes`}
                  ariaLabel={`備考 ${i + 1}行目`}
                />
                <button
                  type="button"
                  onClick={() => clearRow(i)}
                  className="text-muted-foreground/20 hover:text-destructive flex items-start justify-center pt-2"
                  aria-label="行をクリア"
                  title="行をクリア"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* Totals footer */}
          <div
            className={`grid ${colTemplate} border-t-2 border-foreground text-[12px] bg-muted/30`}
          >
            <div className="col-span-4"></div>
            <div className="px-2 py-1.5 border-l border-foreground/30 text-right font-semibold">
              小計
            </div>
            <div className="px-2 py-1.5 border-l border-foreground/30 text-right tabular-nums">
              {formatCurrency(totals.subtotal)}
            </div>
            <div className="border-l border-foreground/30"></div>
            <div></div>
          </div>
          <div
            className={`grid ${colTemplate} border-t border-foreground/30 text-[12px] bg-muted/30`}
          >
            <div className="col-span-4"></div>
            <div className="px-2 py-1.5 border-l border-foreground/30 text-right font-semibold">
              消費税
            </div>
            <div className="px-2 py-1.5 border-l border-foreground/30 text-right tabular-nums">
              {formatCurrency(totals.tax)}
            </div>
            <div className="border-l border-foreground/30"></div>
            <div></div>
          </div>
          <div
            className={`grid ${colTemplate} border-t border-foreground/30 text-[13px] bg-primary text-primary-foreground`}
          >
            <div className="col-span-4"></div>
            <div className="px-2 py-2 border-l border-primary-foreground/20 text-right font-bold">
              合計
            </div>
            <div className="px-2 py-2 border-l border-primary-foreground/20 text-right tabular-nums font-bold">
              {formatCurrency(totals.total)}
            </div>
            <div className="border-l border-primary-foreground/20"></div>
            <div></div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-5 print:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3.5 h-3.5" />
            行を追加
          </Button>
          <span className="text-xs text-muted-foreground">{rows.length} 行</span>
        </div>

        {/* Terms + Notes */}
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="お客様への補足事項などを記入"
              className="w-full border border-foreground/40 px-2.5 py-1.5 text-[11.5px] resize-none focus:outline-none focus:bg-accent/10 placeholder:text-muted-foreground/30 leading-relaxed"
            />
          </div>
        </div>

        {/* Footer credit line */}
        <div className="mt-5 pt-2 border-t border-border text-center text-[10px] text-muted-foreground tracking-widest">
          {COMPANY_INFO.name}　|　{COMPANY_INFO.tel}
        </div>
      </form>

      {/* Bottom action bar */}
      <div className="max-w-[1040px] mx-auto flex justify-end gap-2 mt-4 pb-4 print:hidden">
        <Link href="/quotes">
          <Button type="button" variant="outline">
            キャンセル
          </Button>
        </Link>
        <Button
          type="submit"
          form="quote-form"
          disabled={createMut.isPending}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          作成して保存
        </Button>
      </div>
    </div>
  );
}
