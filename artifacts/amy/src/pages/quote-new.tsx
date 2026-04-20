import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateQuote,
  useListProjects,
  useListCustomers,
  getListQuotesQueryKey,
  type LineItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { COMPANY_INFO, QUOTE_TERMS } from "@/lib/company-info";
import { formatCurrency } from "@/lib/format";

const ROWS = 16;

function searchParamProjectId(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("projectId") ?? "";
}

function emptyItem(): LineItem {
  return { description: "", unit: "", quantity: 0, unitPrice: 0 };
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

  const selectedProject = useMemo(
    () => (projectsQ.data ?? []).find((p) => p.id === projectId),
    [projectsQ.data, projectId],
  );

  // Auto-fill subject when project selected (only if user hasn't typed manually)
  useEffect(() => {
    if (selectedProject && !subjectTouched.current) {
      setSubject(selectedProject.name);
    }
  }, [selectedProject]);

  // Selecting a project always forces the customer to match that project
  useEffect(() => {
    if (selectedProject && selectedProject.customerId !== customerId) {
      setCustomerId(selectedProject.customerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]);

  // If user changes the customer to one that doesn't match the current project, clear the project
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

  const updateRow = (i: number, field: keyof LineItem, value: any) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: value };
    setRows(next);
  };

  const addRow = () => setRows([...rows, emptyItem()]);
  const clearRow = (i: number) => updateRowAll(i, emptyItem());

  const updateRowAll = (i: number, item: LineItem) => {
    const next = [...rows];
    next[i] = item;
    setRows(next);
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
        it.description.trim() !== "" || it.quantity > 0 || it.unitPrice > 0,
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

  const customerName = customerId
    ? (customersQ.data ?? []).find((c) => c.id === customerId)?.name ?? ""
    : "";

  const filteredProjects = (projectsQ.data ?? []).filter(
    (p) => !customerId || p.customerId === customerId,
  );

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
            作成する
          </Button>
        </div>
      </div>

      <form
        id="quote-form"
        onSubmit={submit}
        className="bg-white border border-border p-6 space-y-3 text-[13px] text-foreground rounded"
      >
        <h1 className="text-center text-2xl font-bold tracking-[0.5em] pb-2">
          御 見 積 書
        </h1>

        {/* Top: customer (left) + meta (right) */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-end gap-2 border-b border-foreground pb-1">
              <div className="flex-1">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="border-0 shadow-none p-0 h-8 text-lg font-semibold focus:ring-0">
                    <SelectValue placeholder="お客様を選択" />
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
              <span className="text-base pb-1">御中</span>
            </div>
            <div className="grid grid-cols-[80px_1fr] text-xs">
              <div className="border border-foreground px-2 py-1 bg-muted/40">
                ご担当
              </div>
              <div className="border border-foreground border-l-0 px-2 py-1 flex items-center">
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder=""
                  className="flex-1 bg-transparent outline-none text-sm"
                />
                <span className="text-muted-foreground ml-1">様</span>
              </div>
            </div>
          </div>
          <div className="text-xs space-y-1">
            <div className="grid grid-cols-[80px_1fr]">
              <div className="border border-foreground px-2 py-1 bg-muted/40">
                見積No.
              </div>
              <input
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                className="border border-foreground border-l-0 px-2 py-1 text-right tabular-nums bg-transparent outline-none focus:bg-accent/10"
              />
            </div>
            <div className="grid grid-cols-[80px_1fr]">
              <div className="border border-foreground px-2 py-1 bg-muted/40">
                見積日
              </div>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="border border-foreground border-l-0 px-2 py-1 text-right tabular-nums bg-transparent outline-none focus:bg-accent/10"
              />
            </div>
          </div>
        </div>

        {/* 案件 + 件名 + 自社情報 */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="grid grid-cols-[60px_1fr] text-xs">
              <div className="border border-foreground px-2 py-1 bg-muted/40">
                案件
              </div>
              <div className="border border-foreground border-l-0">
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="border-0 shadow-none h-8 text-sm focus:ring-0 px-2">
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
            </div>
            <div className="grid grid-cols-[60px_1fr] text-xs">
              <div className="border border-foreground px-2 py-1 bg-muted/40 font-semibold">
                件名:
              </div>
              <input
                value={subject}
                onChange={(e) => {
                  subjectTouched.current = true;
                  setSubject(e.target.value);
                }}
                placeholder="例: ○○マンション 102号室 内装工事"
                className="border border-foreground border-l-0 px-2 py-1 bg-transparent outline-none focus:bg-accent/10 text-sm"
              />
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
            <div>E-Mail: {COMPANY_INFO.email}</div>
            <div>担当: {COMPANY_INFO.contact}</div>
          </div>
        </div>

        {/* Terms row */}
        <div className="grid grid-cols-3 text-xs">
          <div className="border border-foreground px-2 py-1">
            <span className="text-muted-foreground">納期:</span>{" "}
            {QUOTE_TERMS.delivery}
          </div>
          <div className="border border-foreground border-l-0 px-2 py-1">
            <span className="text-muted-foreground">支払条件:</span>{" "}
            {QUOTE_TERMS.payment}
          </div>
          <div className="border border-foreground border-l-0 px-2 py-1 flex items-center gap-2">
            <span className="text-muted-foreground">有効期限:</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="flex-1 bg-transparent outline-none focus:bg-accent/10 text-xs"
            />
          </div>
        </div>

        {/* 合計金額 */}
        <div className="flex items-stretch border border-foreground">
          <div className="w-32 px-3 py-2 bg-muted/40 font-semibold border-r border-foreground flex items-center">
            合計金額
          </div>
          <div className="flex-1 px-4 py-2 flex items-center justify-end gap-3">
            <span className="text-2xl font-bold tabular-nums text-primary">
              {formatCurrency(totals.total)}
            </span>
            <span className="text-xs text-muted-foreground">(税込)</span>
          </div>
        </div>

        {/* Items table */}
        <div className="border border-foreground">
          <div className="grid grid-cols-[36px_1fr_56px_70px_100px_120px_28px] bg-muted/40 text-xs font-semibold">
            <div className="px-2 py-1.5 text-center border-r border-foreground">
              No.
            </div>
            <div className="px-2 py-1.5 border-r border-foreground">
              摘要 (工事内容)
            </div>
            <div className="px-2 py-1.5 border-r border-foreground text-center">
              単位
            </div>
            <div className="px-2 py-1.5 border-r border-foreground text-right">
              数量
            </div>
            <div className="px-2 py-1.5 border-r border-foreground text-right">
              単価
            </div>
            <div className="px-2 py-1.5 text-right border-r border-foreground">
              金額
            </div>
            <div></div>
          </div>
          {rows.map((row, i) => {
            const amount = (row.quantity || 0) * (row.unitPrice || 0);
            return (
              <div
                key={i}
                className="grid grid-cols-[36px_1fr_56px_70px_100px_120px_28px] border-t border-foreground text-xs hover:bg-accent/5 min-h-[36px]"
              >
                <div className="px-2 py-2 text-center text-muted-foreground tabular-nums border-r border-foreground self-stretch flex items-center justify-center">
                  {i + 1}
                </div>
                <textarea
                  value={row.description}
                  onChange={(e) => updateRow(i, "description", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      updateRow(i, "description", row.description + "\n");
                    }
                  }}
                  rows={1}
                  placeholder="例: クロス張替 LDK 天井・壁"
                  className="px-2 py-2 bg-transparent outline-none focus:bg-accent/10 border-r border-foreground min-w-0 resize-none text-xs leading-snug"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <input
                  type="text"
                  value={row.unit ?? ""}
                  onChange={(e) => updateRow(i, "unit", e.target.value)}
                  placeholder="式"
                  className="px-2 py-2 bg-transparent outline-none focus:bg-accent/10 border-r border-foreground text-center min-w-0 placeholder:text-muted-foreground/40"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.quantity || ""}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    updateRow(i, "quantity", Number.isFinite(n) ? n : 0);
                  }}
                  className="px-2 py-2 bg-transparent outline-none focus:bg-accent/10 border-r border-foreground text-right tabular-nums min-w-0"
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
                  className="px-2 py-2 bg-transparent outline-none focus:bg-accent/10 border-r border-foreground text-right tabular-nums min-w-0"
                />
                <div className="px-2 py-2 text-right tabular-nums border-r border-foreground self-center">
                  {amount > 0 ? formatCurrency(amount) : ""}
                </div>
                <button
                  type="button"
                  onClick={() => clearRow(i)}
                  className="text-muted-foreground hover:text-destructive flex items-center justify-center"
                  aria-label="行をクリア"
                  title="行をクリア"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {/* 小計 / 消費税 / 合計 footer rows */}
          <div className="grid grid-cols-[36px_1fr_56px_70px_100px_120px_28px] border-t border-foreground text-xs">
            <div className="col-span-4"></div>
            <div className="px-2 py-1 bg-muted/40 border-l border-foreground text-right font-semibold">
              小計
            </div>
            <div className="px-2 py-1 border-l border-foreground text-right tabular-nums">
              {formatCurrency(totals.subtotal)}
            </div>
            <div></div>
          </div>
          <div className="grid grid-cols-[36px_1fr_56px_70px_100px_120px_28px] border-t border-foreground text-xs">
            <div className="col-span-4"></div>
            <div className="px-2 py-1 bg-muted/40 border-l border-foreground text-right font-semibold">
              消費税
            </div>
            <div className="px-2 py-1 border-l border-foreground text-right tabular-nums">
              {formatCurrency(totals.tax)}
            </div>
            <div></div>
          </div>
          <div className="grid grid-cols-[36px_1fr_56px_70px_100px_120px_28px] border-t border-foreground text-xs">
            <div className="col-span-4"></div>
            <div className="px-2 py-1 bg-muted/40 border-l border-foreground text-right font-bold">
              合計
            </div>
            <div className="px-2 py-1 border-l border-foreground text-right tabular-nums font-bold">
              {formatCurrency(totals.total)}
            </div>
            <div></div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="gap-2"
          >
            + 行を追加
          </Button>
          <span className="text-xs text-muted-foreground">
            ({rows.length} 行)
          </span>
        </div>

        {/* 備考 */}
        <div className="grid grid-cols-[60px_1fr] border border-foreground">
          <div className="px-2 py-2 bg-muted/40 border-r border-foreground text-xs flex items-start">
            備考
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder=""
            className="border-0 rounded-none focus-visible:ring-0 text-xs resize-none"
          />
        </div>
      </form>

      {/* Helper info under document */}
      <div className="text-xs text-muted-foreground px-2">
        お客様 (御中) や案件名は上のプルダウンから選択 / 件名・ご担当・各明細はその場で直接入力できます。
        {customerName && (
          <span className="ml-2">→ 現在: {customerName} 御中</span>
        )}
      </div>

      <div className="flex justify-end gap-2 pb-8">
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
          作成する
        </Button>
      </div>
    </div>
  );
}
