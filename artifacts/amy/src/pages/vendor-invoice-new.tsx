import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useListVendorQuotes,
  useCreateVendorInvoice,
  useRequestUploadUrl,
  getListVendorInvoicesQueryKey,
  getListVendorQuotesQueryKey,
  getListProjectsQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
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
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { useUser } from "@clerk/react";
import { readProfile } from "@/lib/profile";
import { addCanvasToPdfWithRowBreaks } from "@/lib/pdf-row-breaks";

// Per-invoice form state (recipient + author). Issuer + bank info are loaded
// from the signed-in user's Clerk profile so each user sees only their own info.
const FORM_STORAGE_KEY = "amy.vendorInvoiceForm.v1";

const RECIPIENT_PRESETS = ["株式会社AMY"];

type CreatorDefaults = {
  recipientName: string;
  authorName: string;
  registrationNumber: string;
  companyName: string;
  postalCode: string;
  address: string;
  tel: string;
  fax: string;
  email: string;
  bankName: string;
  branchName: string;
  branchCode: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

const EMPTY_DEFAULTS: CreatorDefaults = {
  recipientName: "株式会社AMY",
  authorName: "",
  registrationNumber: "",
  companyName: "",
  postalCode: "",
  address: "",
  tel: "",
  fax: "",
  email: "",
  bankName: "",
  branchName: "",
  branchCode: "",
  accountType: "普通",
  accountNumber: "",
  accountHolder: "",
};

type LineRow = { description: string; quantity: number; unitPrice: number };

function loadFormDefaults(): { recipientName: string; authorName: string } {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) return { recipientName: "株式会社AMY", authorName: "" };
    const parsed = JSON.parse(raw);
    return {
      recipientName: parsed.recipientName ?? "株式会社AMY",
      authorName: parsed.authorName ?? "",
    };
  } catch {
    return { recipientName: "株式会社AMY", authorName: "" };
  }
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function endOfMonthISO(base: string): string {
  const d = new Date(base);
  const eom = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const y = eom.getFullYear();
  const m = String(eom.getMonth() + 1).padStart(2, "0");
  const day = String(eom.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseAuthorRecipient(notes: string | null | undefined): {
  authorName?: string;
  recipientName?: string;
  rest?: string;
} {
  if (!notes) return {};
  const parts = notes.split(" / ").map((s) => s.trim());
  const out: { authorName?: string; recipientName?: string; rest?: string } = {};
  const remaining: string[] = [];
  for (const p of parts) {
    const a = p.match(/^作成者:\s*(.+)$/);
    const r = p.match(/^宛名:\s*(.+)$/);
    if (a) out.authorName = a[1];
    else if (r) out.recipientName = r[1];
    else remaining.push(p);
  }
  if (remaining.length > 0) out.rest = remaining.join(" / ");
  return out;
}

export default function VendorInvoiceNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const projectsQ = useListProjects();
  const createMut = useCreateVendorInvoice();
  const requestUrlMut = useRequestUploadUrl();

  const { user } = useUser();
  const profile = useMemo(() => readProfile(user), [user]);

  // ?fromVendorQuoteId=<id> — prefill from a vendor quote (Plan A: regenerate
  // a real 請求書 PDF instead of reusing the quote's PDF).
  const search = useSearch();
  const [fromVendorQuoteId] = useState<string>(() => {
    const params = new URLSearchParams(search);
    return params.get("fromVendorQuoteId") ?? "";
  });
  const vendorQuotesQ = useListVendorQuotes(undefined, {
    query: {
      enabled: !!fromVendorQuoteId,
      queryKey: getListVendorQuotesQueryKey(),
    },
  });
  const sourceQuote = useMemo(
    () =>
      fromVendorQuoteId
        ? (vendorQuotesQ.data ?? []).find((q) => q.id === fromVendorQuoteId)
        : undefined,
    [fromVendorQuoteId, vendorQuotesQ.data],
  );
  const prefilledFromQuoteRef = useRef(false);

  const [defaults, setDefaults] = useState<CreatorDefaults>(EMPTY_DEFAULTS);
  const [projectId, setProjectId] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(todayISO());
  const [dueDate, setDueDate] = useState<string>(endOfMonthISO(todayISO()));
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<LineRow[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Auto-generated 請求No (display-only — not persisted server-side).
  // Format: INV-YYYYMMDD-XXX. Stable across re-renders, regenerates when
  // issueDate changes so the date prefix stays in sync.
  const [invoiceNoSuffix] = useState<string>(() =>
    String(Math.floor(100 + Math.random() * 900)),
  );
  const invoiceNo = useMemo(() => {
    const datePart = (issueDate || todayISO()).replace(/-/g, "");
    return `INV-${datePart}-${invoiceNoSuffix}`;
  }, [issueDate, invoiceNoSuffix]);

  // Hydrate from profile (Clerk metadata) + per-invoice form storage on mount/profile-change.
  // Skip after a vendor-quote prefill has already populated companyName/recipient/author —
  // otherwise a Clerk user-object refresh would clobber the prefilled values.
  useEffect(() => {
    if (prefilledFromQuoteRef.current) return;
    const form = loadFormDefaults();
    setDefaults({
      ...EMPTY_DEFAULTS,
      ...profile,
      recipientName: form.recipientName,
      authorName: form.authorName || user?.fullName || "",
    });
  }, [profile, user]);

  // Prefill from source vendor quote (one-shot). Runs once both the quote and
  // the projects list have loaded. If the list finishes loading without the
  // quote appearing (deleted, or external user with no access), surface an
  // error toast instead of silently leaving the form blank.
  const missingQuoteToastedRef = useRef(false);
  useEffect(() => {
    if (prefilledFromQuoteRef.current) return;
    if (!fromVendorQuoteId) return;
    if (!sourceQuote) {
      if (
        !vendorQuotesQ.isLoading &&
        vendorQuotesQ.isFetched &&
        !missingQuoteToastedRef.current
      ) {
        missingQuoteToastedRef.current = true;
        toast({
          title: "見積書が見つかりませんでした",
          description: "削除された、もしくはアクセス権がない可能性があります。フォームは空のまま開いています。",
          variant: "destructive",
        });
      }
      return;
    }
    prefilledFromQuoteRef.current = true;

    if (sourceQuote.projectId) setProjectId(sourceQuote.projectId);

    const parsed = parseAuthorRecipient(sourceQuote.notes);
    setDefaults((d) => ({
      ...d,
      recipientName: parsed.recipientName || d.recipientName,
      authorName: parsed.authorName || d.authorName,
      companyName: sourceQuote.vendorName || d.companyName,
    }));
    if (parsed.rest) setNotes(parsed.rest);

    // Vendor quotes only store a single tax-included `amount`. Convert back to
    // a tax-excluded subtotal for the single summary line so total ≈ amount.
    const subtotalGuess = Math.round(sourceQuote.amount / 1.1);
    const projName = sourceQuote.projectName || sourceQuote.vendorName || "工事一式";
    setItems([
      {
        description: `${projName} 工事一式`,
        quantity: 1,
        unitPrice: subtotalGuess,
      },
    ]);

    toast({
      title: "見積書から内容を引き継ぎました",
      description:
        "明細は1行にまとめています。必要に応じて編集し、請求日を確認してください。",
    });
  }, [fromVendorQuoteId, sourceQuote, toast]);

  const updateDefault = <K extends keyof CreatorDefaults>(
    k: K,
    v: CreatorDefaults[K],
  ) => {
    setDefaults((d) => ({ ...d, [k]: v }));
  };

  const project = useMemo(
    () => (projectsQ.data ?? []).find((p) => p.id === projectId),
    [projectsQ.data, projectId],
  );

  const subtotal = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;

  const addRow = () =>
    setItems((rs) => [...rs, { description: "", quantity: 1, unitPrice: 0 }]);
  const removeRow = (i: number) =>
    setItems((rs) => rs.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<LineRow>) =>
    setItems((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const validate = (): string | null => {
    if (!defaults.companyName.trim()) return "会社名を入力してください";
    if (!projectId) return "件名（案件）を選択してください";
    const valid = items.filter((it) => it.description.trim() && it.unitPrice > 0);
    if (valid.length === 0) return "明細を1行以上入力してください";
    if (!issueDate) return "請求書発行日を入力してください";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    if (!printRef.current) return;
    setSubmitting(true);
    try {
      // Persist per-invoice form fields (recipient + author) only.
      // Issuer + bank info live on the user's Clerk profile.
      localStorage.setItem(
        FORM_STORAGE_KEY,
        JSON.stringify({
          recipientName: defaults.recipientName,
          authorName: defaults.authorName,
        }),
      );

      // Render the printable area to PDF
      const [{ default: jsPDF }, html2canvas] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro").then((m) => m.default),
      ]);
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      addCanvasToPdfWithRowBreaks(pdf, canvas, printRef.current);
      const pdfBlob = pdf.output("blob");

      const fileName = `請求書_${defaults.companyName || "vendor"}_${issueDate}.pdf`;
      const contentType = "application/pdf";

      // Request upload URL & PUT
      const reqRes = await requestUrlMut.mutateAsync({
        data: { name: fileName, size: pdfBlob.size, contentType },
      });
      const putRes = await fetch(reqRes.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: pdfBlob,
      });
      if (!putRes.ok) {
        throw new Error("PDFのアップロードに失敗しました");
      }
      const servePath = reqRes.objectPath.startsWith("/objects/")
        ? `/api/storage${reqRes.objectPath}`
        : reqRes.objectPath;

      // Create vendor_invoice record (auto-routes via project's unitNumber)
      const unitNumber = project?.unitNumber || project?.name || "未設定";
      const noteParts: string[] = [];
      if (defaults.authorName) noteParts.push(`作成者: ${defaults.authorName}`);
      if (defaults.recipientName)
        noteParts.push(`宛名: ${defaults.recipientName}`);
      if (notes) noteParts.push(notes);

      await createMut.mutateAsync({
        data: {
          vendorName: defaults.companyName,
          unitNumber,
          amount: total,
          invoiceDate: issueDate,
          fileUrl: servePath,
          fileName,
          notes: noteParts.length > 0 ? noteParts.join(" / ") : null,
        },
      });

      // Refresh related queries
      await queryClient.invalidateQueries({
        queryKey: getListVendorInvoicesQueryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });
      if (projectId) {
        await queryClient.invalidateQueries({
          queryKey: getGetProjectLedgerQueryKey(projectId),
        });
        await queryClient.invalidateQueries({
          queryKey: getGetProjectQueryKey(projectId),
        });
      }
      await invalidateDashboard(queryClient);

      toast({
        title: "請求書を作成しました",
        description: `${defaults.companyName} / ${formatCurrency(total)}`,
      });
      setLocation("/vendor-invoices");
    } catch (e) {
      toast({ title: apiErrorMessage(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const projectLabel = (p: {
    name: string;
    unitNumber?: string | null;
  }) => (p.unitNumber ? `${p.name} (${p.unitNumber})` : p.name);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Link
          href="/vendor-invoices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          職人請求書一覧に戻る
        </Link>
        <Button onClick={handleSave} disabled={submitting} className="gap-2">
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          PDFを生成して保存
        </Button>
      </div>

      <h1 className="text-2xl font-bold">請求書を作成</h1>

      {/* Form */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>宛名</Label>
              <div className="flex gap-2">
                <Select
                  value={
                    RECIPIENT_PRESETS.includes(defaults.recipientName)
                      ? defaults.recipientName
                      : "__custom__"
                  }
                  onValueChange={(v) => {
                    if (v !== "__custom__") updateDefault("recipientName", v);
                    else updateDefault("recipientName", "");
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECIPIENT_PRESETS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">その他（直接入力）</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={defaults.recipientName}
                  onChange={(e) => updateDefault("recipientName", e.target.value)}
                  placeholder="宛名"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>作成者</Label>
              <Input
                value={defaults.authorName}
                onChange={(e) => updateDefault("authorName", e.target.value)}
                placeholder="例: 山田 太郎"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>件名（案件）</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="案件を選択" />
                </SelectTrigger>
                <SelectContent>
                  {(projectsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {projectLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>請求書発行日</Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>お支払い期限</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </section>

          <section className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">
                発行元情報・お振込先（あなたのプロフィールから自動反映）
              </div>
              <Link href="/profile">
                <Button variant="outline" size="sm" data-testid="button-edit-profile">
                  プロフィールを編集
                </Button>
              </Link>
            </div>
            <div className="rounded-md border bg-muted/30 p-4 text-sm grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <span className="text-muted-foreground">会社名：</span>
                <span className="font-medium">{defaults.companyName || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">インボイス登録番号：</span>
                <span className="font-medium">
                  {defaults.registrationNumber || "（未登録）"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">郵便番号：</span>
                <span className="font-medium">{defaults.postalCode || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">住所：</span>
                <span className="font-medium">{defaults.address || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">TEL：</span>
                <span className="font-medium">{defaults.tel || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">FAX：</span>
                <span className="font-medium">{defaults.fax || "—"}</span>
              </div>
              <div className="md:col-span-2">
                <span className="text-muted-foreground">メール：</span>
                <span className="font-medium">{defaults.email || "—"}</span>
              </div>
              <div className="md:col-span-2 border-t pt-2 mt-1 text-xs text-muted-foreground">
                お振込先
              </div>
              <div>
                <span className="text-muted-foreground">銀行：</span>
                <span className="font-medium">
                  {defaults.bankName || "—"} {defaults.branchName}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">店番号／口座番号：</span>
                <span className="font-medium">
                  {defaults.accountType}{" "}
                  {defaults.branchCode ? `${defaults.branchCode} / ` : ""}
                  {defaults.accountNumber || "—"}
                </span>
              </div>
              <div className="md:col-span-2">
                <span className="text-muted-foreground">口座名義：</span>
                <span className="font-medium">{defaults.accountHolder || "—"}</span>
              </div>
            </div>
          </section>

          <section className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">明細</div>
              <Button size="sm" variant="outline" onClick={addRow} className="gap-1">
                <Plus className="w-3 h-3" />
                行を追加
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_100px_140px_140px_40px] gap-2 text-xs text-muted-foreground px-2 mb-1">
              <div>摘要</div>
              <div className="text-right">数量</div>
              <div className="text-right">単価</div>
              <div className="text-right">金額</div>
              <div></div>
            </div>
            {items.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_100px_140px_140px_40px] gap-2 mb-1.5 items-center"
              >
                <Input
                  value={row.description}
                  onChange={(e) =>
                    updateRow(i, { description: e.target.value })
                  }
                  placeholder="例: 大工工事"
                />
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={row.quantity || ""}
                  onChange={(e) =>
                    updateRow(i, {
                      quantity: Number(e.target.value) || 0,
                    })
                  }
                  className="text-right tabular-nums"
                />
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={row.unitPrice || ""}
                  onChange={(e) =>
                    updateRow(i, {
                      unitPrice: Number(e.target.value) || 0,
                    })
                  }
                  className="text-right tabular-nums"
                />
                <div className="text-right tabular-nums text-sm py-2 px-2">
                  {formatCurrency((row.quantity || 0) * (row.unitPrice || 0))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(i)}
                  disabled={items.length <= 1}
                  className="text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex justify-end gap-6 mt-3 pt-3 border-t text-sm">
              <div>
                <span className="text-muted-foreground mr-2">小計</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div>
                <span className="text-muted-foreground mr-2">消費税(10%)</span>
                <span className="tabular-nums">{formatCurrency(tax)}</span>
              </div>
              <div className="font-bold">
                <span className="text-muted-foreground mr-2">合計</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>
          </section>

          <section className="border-t pt-4">
            <Label>備考</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="（任意）"
            />
          </section>
        </CardContent>
      </Card>

      {/* Preview / printable area */}
      <div className="text-sm font-medium text-muted-foreground">
        プレビュー（このレイアウトでPDFが生成されます）
      </div>
      {/*
        IMPORTANT: This printable area uses INLINE styles instead of Tailwind
        utility classes. html2canvas-pro does not always pick up styles defined
        inside @layer cascade layers (which is where Tailwind v4 places all
        utilities), and arbitrary-value utilities can also get tree-shaken from
        the production CSS bundle. Inline styles are guaranteed to render the
        same in dev and prod and are always seen by html2canvas.
      */}
      {/*
        Outer wrapper: shows an A4-sized white "page" so the user can visually
        gauge how much fits on one A4. NOT captured by html2canvas — the inner
        printRef sizes to actual content, so the generated PDF only uses as
        many A4 pages as needed.
      */}
      <div
        style={{
          width: "210mm",
          minHeight: "297mm",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          boxSizing: "border-box",
        }}
      >
      {/*
        Printable area styled to match invoice-detail.tsx exactly:
          navy = hsl(220,50%,25%) ≈ #204180  (header bar / totals labels)
          cell border = #e2e8f0  (slate-200, equivalent to "border-border")
          zebra row = rgba(239,246,255,0.4)  (equivalent to "bg-blue-50/40")
      */}
      <div
        ref={printRef}
        className="quote-paper"
        style={{
          width: "210mm",
          boxSizing: "border-box",
          padding: "10mm 12mm",
          background: "#ffffff",
          color: "#0f172a",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif",
          fontSize: "13px",
          lineHeight: 1.5,
        }}
      >
        <h1
          style={{
            textAlign: "center",
            fontSize: "24px",
            fontWeight: 700,
            letterSpacing: "0.5em",
            margin: "0 0 24px 0",
          }}
        >
          請　求　書
        </h1>

        {/* Header: left=recipient/subject, right=meta+issuer card */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "24px",
            marginBottom: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px" }}>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  borderBottom: "1px solid #0f172a",
                  paddingBottom: "2px",
                  minWidth: "200px",
                  display: "inline-block",
                }}
              >
                {defaults.recipientName || "—"}
              </span>
              <span style={{ fontSize: "16px", fontWeight: 500, paddingBottom: "2px", marginLeft: "8px" }}>
                御中
              </span>
            </div>
            <div style={{ marginTop: "12px", fontSize: "13px" }}>
              <span style={{ color: "#64748b" }}>ご担当：</span>
            </div>
            <div style={{ marginTop: "8px", fontSize: "13px" }}>
              <span style={{ color: "#64748b" }}>件名：</span>
              <span style={{ fontWeight: 500, marginLeft: "4px" }}>
                {project ? projectLabel(project) : ""}
              </span>
            </div>
            <p style={{ margin: "12px 0 0 0", fontSize: "13px" }}>
              下記の通り、ご請求申し上げます。
            </p>
          </div>
          <div style={{ fontSize: "13px", minWidth: "240px" }}>
            {/* 請求No / 請求日 — right-aligned */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                columnGap: "16px",
                rowGap: "2px",
                textAlign: "right",
              }}
            >
              <span style={{ color: "#64748b" }}>請求No.</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{invoiceNo}</span>
              <span style={{ color: "#64748b" }}>請求日</span>
              <span>{issueDate ? formatDate(issueDate) : ""}</span>
            </div>
            {/* Issuer card with border-top separator */}
            <div
              style={{
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid #e2e8f0",
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 700 }}>{defaults.companyName || "—"}</div>
              {defaults.postalCode && (
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  〒{defaults.postalCode}
                </div>
              )}
              {defaults.address && (
                <div style={{ fontSize: "11px" }}>{defaults.address}</div>
              )}
              {defaults.registrationNumber && (
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  登録番号：T{defaults.registrationNumber.replace(/^T/i, "")}
                </div>
              )}
              <div style={{ marginTop: "4px" }}>
                {defaults.tel && (
                  <div style={{ fontSize: "11px" }}>TEL：{defaults.tel}</div>
                )}
                {defaults.fax && (
                  <div style={{ fontSize: "11px" }}>FAX：{defaults.fax}</div>
                )}
                {defaults.email && (
                  <div style={{ fontSize: "11px" }}>E-Mail：{defaults.email}</div>
                )}
              </div>
              {defaults.authorName && (
                <div style={{ fontSize: "11px", marginTop: "4px" }}>
                  担当：{defaults.authorName}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 合計金額 hero — border-y-2 (top + bottom) like invoice-detail */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderTop: "2px solid #0f172a",
            borderBottom: "2px solid #0f172a",
            padding: "8px 4px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
            <span style={{ fontWeight: 700, fontSize: "14px" }}>合計金額</span>
            <span style={{ fontSize: "22px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(total)}
            </span>
            <span style={{ fontSize: "12px", color: "#64748b" }}>（税込）</span>
          </div>
          <div style={{ marginLeft: "auto", fontSize: "13px" }}>
            <span style={{ color: "#64748b" }}>お支払期限：</span>
            <span style={{ fontWeight: 500, marginLeft: "6px" }}>
              {dueDate ? formatDate(dueDate) : "月末日"}
            </span>
          </div>
        </div>

        {/* Line items table — 5 cols (No / 摘要 / 数量 / 単価 / 金額) */}
        {(() => {
          const MIN_ROWS = 17;
          const padded = items.length >= MIN_ROWS
            ? items
            : [
                ...items,
                ...Array.from({ length: MIN_ROWS - items.length }, () => ({
                  description: "",
                  quantity: 0,
                  unitPrice: 0,
                })),
              ];
          const headBase = {
            border: "1px solid #204180",
            padding: "5px 8px",
            textAlign: "center" as const,
            fontWeight: 500,
            fontSize: "12px",
          };
          const cellBase = {
            border: "1px solid #e2e8f0",
            padding: "4px 8px",
            fontVariantNumeric: "tabular-nums" as const,
            fontSize: "12px",
            height: "22px",
          };
          return (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "16px",
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "40px" }} />
                <col />
                <col style={{ width: "64px" }} />
                <col style={{ width: "96px" }} />
                <col style={{ width: "112px" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#204180", color: "#ffffff" }}>
                  <th style={headBase}>No.</th>
                  <th style={{ ...headBase, textAlign: "left" }}>摘要</th>
                  <th style={headBase}>数量</th>
                  <th style={{ ...headBase, textAlign: "right" }}>単価</th>
                  <th style={{ ...headBase, textAlign: "right" }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {padded.map((it, i) => {
                  const has = it.description.trim();
                  const amt = (it.quantity || 0) * (it.unitPrice || 0);
                  // Zebra striping — bg-blue-50/40 equivalent on even rows
                  const rowBg = i % 2 === 0 ? "rgba(239, 246, 255, 0.4)" : "transparent";
                  return (
                    <tr key={i} data-pdf-row="true" style={{ background: rowBg }}>
                      <td style={{ ...cellBase, textAlign: "center", color: "#64748b" }}>
                        {i + 1}
                      </td>
                      <td style={{ ...cellBase, textAlign: "left" }}>
                        {has ? it.description : ""}
                      </td>
                      <td style={{ ...cellBase, textAlign: "center" }}>
                        {has ? it.quantity : ""}
                      </td>
                      <td style={{ ...cellBase, textAlign: "right" }}>
                        {has ? formatCurrency(it.unitPrice) : ""}
                      </td>
                      <td style={{ ...cellBase, textAlign: "right" }}>
                        {has ? formatCurrency(amt) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}

        {/* Bottom: bank info (left) + totals box (right, w-256) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 256px",
            gap: "24px",
            alignItems: "start",
          }}
        >
          <div style={{ fontSize: "13px" }}>
            <div style={{ fontWeight: 500, color: "#64748b", marginBottom: "4px" }}>
              お振込先
            </div>
            <div style={{ paddingLeft: "8px", lineHeight: 1.6 }}>
              {(defaults.bankName || defaults.branchName) && (
                <div>
                  {defaults.bankName}　{defaults.branchName}
                </div>
              )}
              {defaults.accountType && <div>{defaults.accountType}</div>}
              {defaults.branchCode && <div>店番号：{defaults.branchCode}</div>}
              {defaults.accountNumber && <div>口座番号：{defaults.accountNumber}</div>}
              {defaults.accountHolder && <div>{defaults.accountHolder}</div>}
            </div>
            {notes && (
              <div style={{ marginTop: "12px", paddingTop: "8px", borderTop: "1px solid #e2e8f0" }}>
                <div style={{ color: "#64748b", marginBottom: "2px" }}>備考</div>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{notes}</p>
              </div>
            )}
          </div>

          {/* Totals — navy label + white-bg value (matches invoice-detail) */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    background: "#204180",
                    color: "#ffffff",
                    padding: "5px 12px",
                    textAlign: "center",
                    fontWeight: 500,
                    border: "1px solid #204180",
                  }}
                >
                  小計
                </td>
                <td
                  style={{
                    background: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #204180",
                    padding: "5px 12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatCurrency(subtotal)}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    background: "#204180",
                    color: "#ffffff",
                    padding: "5px 12px",
                    textAlign: "center",
                    fontWeight: 500,
                    border: "1px solid #204180",
                  }}
                >
                  消費税(10%)
                </td>
                <td
                  style={{
                    background: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #204180",
                    padding: "5px 12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatCurrency(tax)}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    background: "#204180",
                    color: "#ffffff",
                    padding: "5px 12px",
                    textAlign: "center",
                    fontWeight: 700,
                    border: "1px solid #204180",
                  }}
                >
                  合計
                </td>
                <td
                  style={{
                    background: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #204180",
                    padding: "5px 12px",
                    textAlign: "right",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatCurrency(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
