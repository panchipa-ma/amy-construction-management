import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateQuote,
  useListProjects,
  getListQuotesQueryKey,
  type LineItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LineItemsEditor } from "@/components/line-items-editor";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { ArrowLeft, Save } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { COMPANY_INFO, QUOTE_TERMS } from "@/lib/company-info";
import { formatCurrency } from "@/lib/format";

function searchParamProjectId(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("projectId") ?? "";
}

export default function QuoteNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const projectsQ = useListProjects();
  const createMut = useCreateQuote();

  const [projectId, setProjectId] = useState(searchParamProjectId());
  const [quoteNumber, setQuoteNumber] = useState(() => {
    const d = new Date();
    return `Q-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
  });
  const [issueDate, setIssueDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { description: "", unit: "式", quantity: 1, unitPrice: 0 },
  ]);

  const selectedProject = useMemo(
    () => (projectsQ.data ?? []).find((p) => p.id === projectId),
    [projectsQ.data, projectId],
  );

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (s, it) => s + it.quantity * it.unitPrice,
      0,
    );
    const tax = Math.floor(subtotal * 0.1);
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !quoteNumber || !issueDate) {
      toast({
        title: "案件・見積番号・発行日は必須です",
        variant: "destructive",
      });
      return;
    }
    const filtered = items.filter(
      (it) => it.description.trim() !== "" || it.unitPrice > 0,
    );
    if (filtered.length === 0) {
      toast({ title: "明細を1行以上入力してください", variant: "destructive" });
      return;
    }
    try {
      const res = await createMut.mutateAsync({
        data: {
          projectId,
          quoteNumber,
          issueDate,
          validUntil: validUntil || null,
          notes: notes || null,
          items: filtered,
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

  return (
    <div className="max-w-[900px] space-y-5">
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

      <div>
        <h1 className="text-2xl font-bold">見積書を作成</h1>
        <p className="text-sm text-muted-foreground mt-1">
          下のフォームを上から順に埋めるだけで、印刷用の御見積書ができます。
        </p>
      </div>

      <form id="quote-form" onSubmit={submit} className="space-y-5">
        {/* Form mirrors the printed layout: top → bottom */}
        <div className="bg-white border border-border p-6 space-y-4 rounded">
          <div className="text-center text-xl font-bold tracking-[0.5em] pb-2 border-b border-border">
            御 見 積 書
          </div>

          {/* Customer + meta */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  御中 (案件 → お客様自動入力)
                </Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="案件を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projectsQ.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.customerName} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProject && (
                  <div className="mt-2 px-3 py-2 bg-muted/40 rounded text-sm">
                    <span className="font-semibold">
                      {selectedProject.customerName}
                    </span>
                    <span className="text-muted-foreground"> 御中</span>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="qn" className="text-xs text-muted-foreground">
                  見積No.
                </Label>
                <Input
                  id="qn"
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="iss" className="text-xs text-muted-foreground">
                    見積日
                  </Label>
                  <Input
                    id="iss"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="vu" className="text-xs text-muted-foreground">
                    有効期限 (任意)
                  </Label>
                  <Input
                    id="vu"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 件名 + 自社情報 (display only) */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label className="text-xs text-muted-foreground">件名</Label>
              <div className="mt-1 px-3 py-2 bg-muted/40 rounded text-sm min-h-[36px] flex items-center">
                {selectedProject?.name ?? (
                  <span className="text-muted-foreground">
                    案件選択で自動入力されます
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs leading-relaxed text-muted-foreground">
              <div className="font-semibold text-foreground">
                {COMPANY_INFO.name}
              </div>
              <div>{COMPANY_INFO.postalCode}</div>
              <div>{COMPANY_INFO.address}</div>
              <div>TEL: {COMPANY_INFO.tel} / FAX: {COMPANY_INFO.fax}</div>
              <div>担当: {COMPANY_INFO.contact}</div>
            </div>
          </div>

          {/* Terms (display only) */}
          <div className="grid grid-cols-3 text-xs gap-3 text-muted-foreground border-t border-border pt-3">
            <div>納期: {QUOTE_TERMS.delivery}</div>
            <div>支払条件: {QUOTE_TERMS.payment}</div>
            <div>有効期限: {QUOTE_TERMS.validity}</div>
          </div>

          {/* 合計プレビュー */}
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded px-4 py-3">
            <div className="text-sm font-semibold">合計金額</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-primary">
                {formatCurrency(totals.total)}
              </span>
              <span className="text-xs text-muted-foreground">(税込)</span>
            </div>
          </div>
        </div>

        {/* 明細編集 */}
        <div className="bg-white border border-border p-6 rounded space-y-3">
          <div>
            <h2 className="text-base font-semibold">明細</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              摘要にカーソルがある状態で Enter キーを押すと、新しい行が追加されます。
            </p>
          </div>
          <LineItemsEditor items={items} onChange={setItems} minRows={8} />
        </div>

        {/* 備考 */}
        <div className="bg-white border border-border p-6 rounded">
          <Label htmlFor="qnotes" className="text-sm font-semibold">
            備考
          </Label>
          <Textarea
            id="qnotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="特記事項があれば記入してください (任意)"
            className="mt-2"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Link href="/quotes">
            <Button type="button" variant="outline">
              キャンセル
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={createMut.isPending}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            作成する
          </Button>
        </div>
      </form>
    </div>
  );
}
