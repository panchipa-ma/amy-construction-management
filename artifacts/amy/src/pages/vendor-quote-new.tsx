import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useCreateVendorQuote,
  useRequestUploadUrl,
  getListVendorQuotesQueryKey,
  getListProjectsQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { useUser } from "@clerk/react";
import { readProfile } from "@/lib/profile";
import { UNIT_OPTIONS } from "@/lib/units";
import { QUOTE_TERMS } from "@/lib/company-info";

// Per-quote form state (recipient + author). Issuer + bank info come from the
// signed-in user's Clerk profile (same as 職人請求書).
const FORM_STORAGE_KEY = "amy.vendorQuoteForm.v1";

const RECIPIENT_PRESETS = ["株式会社AMY"];

type CreatorDefaults = {
  recipientName: string;
  authorName: string;
  registrationNumber: string;
  companyName: string;
  postalCode: string;
  address: string;
  email: string;
  bankName: string;
  branchName: string;
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
  email: "",
  bankName: "",
  branchName: "",
  accountType: "普通",
  accountNumber: "",
  accountHolder: "",
};

type LineRow = {
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  notes: string;
};

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

function plus30DaysISO(base: string): string {
  const d = new Date(base);
  d.setDate(d.getDate() + 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function VendorQuoteNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const projectsQ = useListProjects();
  const createMut = useCreateVendorQuote();
  const requestUrlMut = useRequestUploadUrl();

  const { user } = useUser();
  const profile = useMemo(() => readProfile(user), [user]);

  const [defaults, setDefaults] = useState<CreatorDefaults>(EMPTY_DEFAULTS);
  const [projectId, setProjectId] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(todayISO());
  const [validUntil, setValidUntil] = useState<string>(plus30DaysISO(todayISO()));
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<LineRow[]>([
    { description: "", unit: "", quantity: 0, unitPrice: 0, notes: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = loadFormDefaults();
    setDefaults({
      ...EMPTY_DEFAULTS,
      ...profile,
      recipientName: form.recipientName,
      authorName: form.authorName || user?.fullName || "",
    });
  }, [profile, user]);

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

  const emptyRow = (): LineRow => ({
    description: "",
    unit: "",
    quantity: 0,
    unitPrice: 0,
    notes: "",
  });
  const addRow = () => setItems((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) =>
    setItems((rs) => rs.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<LineRow>) =>
    setItems((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const focusCell = (rowIdx: number, col: string) => {
    const sel = `[data-cell="r${rowIdx}-c${col}"]`;
    const el = printRef.current?.querySelector<HTMLElement>(sel);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e.nativeEvent as any).isComposing
    )
      return;
    e.preventDefault();
    setItems((prev) => {
      // Ensure a row exists at currentRow + 1
      if (currentRow >= prev.length - 1) {
        return [...prev, emptyRow()];
      }
      return prev;
    });
    setTimeout(() => focusCell(currentRow + 1, col), 0);
  };

  const validate = (): string | null => {
    if (!defaults.companyName.trim()) return "会社名を入力してください";
    if (!projectId) return "件名（案件）を選択してください";
    const valid = items.filter(
      (it) => it.description.trim() && it.quantity > 0 && it.unitPrice > 0,
    );
    if (valid.length === 0)
      return "明細を1行以上入力してください（摘要・数量・単価が必要です）";
    if (!issueDate) return "見積書発行日を入力してください";
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
      localStorage.setItem(
        FORM_STORAGE_KEY,
        JSON.stringify({
          recipientName: defaults.recipientName,
          authorName: defaults.authorName,
        }),
      );

      const [{ default: jsPDF }, html2canvas] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro").then((m) => m.default),
      ]);
      // Blur any focused field so html2canvas doesn't capture caret/focus ring.
      (document.activeElement as HTMLElement | null)?.blur?.();
      // Temporarily hide editing chrome (delete buttons, "行を追加", placeholders).
      const hidden: HTMLElement[] = [];
      printRef.current
        .querySelectorAll<HTMLElement>('[data-pdf-hide="true"]')
        .forEach((el) => {
          hidden.push(el);
          el.style.visibility = "hidden";
        });
      let canvas;
      try {
        canvas = await html2canvas(printRef.current, {
          scale: 2,
          backgroundColor: "#ffffff",
        });
      } finally {
        hidden.forEach((el) => (el.style.visibility = ""));
      }
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let position = 0;
      let remaining = imgH;
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      remaining -= pageH;
      // 1mm tolerance avoids spurious extra blank pages from rounding.
      while (remaining > 1) {
        pdf.addPage();
        position -= pageH;
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        remaining -= pageH;
      }
      const pdfBlob = pdf.output("blob");

      const fileName = `見積書_${defaults.companyName || "vendor"}_${issueDate}.pdf`;
      const contentType = "application/pdf";

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
          quoteDate: issueDate,
          validUntil: validUntil || null,
          fileUrl: servePath,
          fileName,
          notes: noteParts.length > 0 ? noteParts.join(" / ") : null,
        },
      });

      await queryClient.invalidateQueries({
        queryKey: getListVendorQuotesQueryKey(),
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
        title: "見積書を作成しました",
        description: `${defaults.companyName} / ${formatCurrency(total)}（想定原価として施工台帳に反映）`,
      });
      setLocation("/vendor-quotes");
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
          href="/vendor-quotes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          職人見積書一覧に戻る
        </Link>
        <Button onClick={handleSave} disabled={submitting} className="gap-2" data-testid="button-save-quote">
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          PDFを生成して保存
        </Button>
      </div>

      <h1 className="text-2xl font-bold">見積書を作成</h1>
      <p className="text-sm text-muted-foreground -mt-3">
        作成した見積書は<span className="font-medium text-foreground">想定原価</span>として施工台帳に自動反映されます（実績ではありません）。
      </p>

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
                <SelectTrigger data-testid="select-project">
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
              <Label>見積書発行日</Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>見積有効期限</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </section>

          <section className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">
                発行元情報・お振込先（あなたのプロフィールから自動反映）
              </div>
              <Link href="/profile">
                <Button variant="outline" size="sm">
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
              <div className="md:col-span-2">
                <span className="text-muted-foreground">メール：</span>
                <span className="font-medium">{defaults.email || "—"}</span>
              </div>
            </div>
          </section>

        </CardContent>
      </Card>

      <div className="text-sm font-medium text-muted-foreground">
        プレビュー（このレイアウトでPDFが生成されます）— 明細・備考は下のプレビュー上で直接入力できます
      </div>
      {/*
        IMPORTANT: Inline styles only — html2canvas-pro does not always pick up
        styles defined inside @layer cascade layers (which is where Tailwind v4
        places all utilities), causing the generated PDF to look unstyled in
        production. Inline styles are guaranteed to render the same in dev and
        prod.
      */}
      {/*
        Outer wrapper: visual A4 page outline (NOT captured by html2canvas).
        Inner printRef sizes to actual content so the PDF only uses as many
        A4 pages as needed.
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
      <div
        ref={printRef}
        className="quote-paper"
        style={{
          width: "210mm",
          boxSizing: "border-box",
          padding: "16px 18px",
          background: "#ffffff",
          color: "#0f172a",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif",
          fontSize: "13px",
          lineHeight: 1.5,
        }}
      >
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "16px", marginTop: 0 }}>
          <h1
            style={{
              display: "inline-block",
              fontSize: "34px",
              fontWeight: 600,
              letterSpacing: "0.5em",
              paddingLeft: "0.5em",
              margin: 0,
            }}
          >
            御見積書
          </h1>
        </div>

        {/* Customer + Meta */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "32px", marginBottom: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", borderBottom: "2px solid #0f172a", paddingBottom: "6px" }}>
              <span style={{ fontSize: "22px", fontWeight: 700, flex: 1 }}>{defaults.recipientName || "—"}</span>
              <span style={{ fontSize: "18px" }}>御中</span>
            </div>
            {defaults.authorName && (
              <div style={{ display: "flex", gap: "12px", marginTop: "10px", alignItems: "center", fontSize: "13px" }}>
                <span style={{ color: "#64748b", width: "56px" }}>ご担当</span>
                <span style={{ flex: 1, borderBottom: "1px solid #e2e8f0", paddingBottom: "2px" }}>{defaults.authorName}</span>
                <span>様</span>
              </div>
            )}
          </div>
          <div style={{ border: "1px solid #0f172a", fontSize: "12px", alignSelf: "flex-start" }}>
            <div style={{ display: "grid", gridTemplateColumns: "78px 1fr", borderBottom: "1px solid #0f172a" }}>
              <div style={{ padding: "6px 10px", background: "#f1f5f9", borderRight: "1px solid #0f172a" }}>見積日</div>
              <div style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{issueDate ? formatDate(issueDate) : ""}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "78px 1fr" }}>
              <div style={{ padding: "6px 10px", background: "#f1f5f9", borderRight: "1px solid #0f172a" }}>有効期限</div>
              <div style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{validUntil ? formatDate(validUntil) : ""}</div>
            </div>
          </div>
        </div>

        {/* 件名 + Issuer card */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "32px", marginBottom: "20px" }}>
          <div>
            {project && (
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#64748b", marginBottom: "4px" }}>案件</div>
                <div style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: "4px", fontSize: "14px" }}>{projectLabel(project)}</div>
              </div>
            )}
            <div style={{ borderLeft: "4px solid #1f3a66", paddingLeft: "12px", paddingTop: "2px", paddingBottom: "2px" }}>
              <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#64748b" }}>件名</div>
              <div style={{ fontSize: "16px", fontWeight: 600 }}>{project ? projectLabel(project) : "—"}</div>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", marginTop: "12px", lineHeight: 1.6 }}>下記のとおり、御見積もり申し上げます。</p>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px 16px", fontSize: "11.5px", lineHeight: 1.7 }}>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "2px" }}>{defaults.companyName || "—"}</div>
            {(defaults.postalCode || defaults.address) && (
              <div style={{ color: "#64748b" }}>
                {defaults.postalCode && <span style={{ marginRight: "6px" }}>{defaults.postalCode}</span>}
                {defaults.address}
              </div>
            )}
            {defaults.registrationNumber && (
              <div><span style={{ color: "#64748b", marginRight: "4px" }}>登録番号</span>{defaults.registrationNumber}</div>
            )}
            {defaults.email && (
              <div><span style={{ color: "#64748b", marginRight: "4px" }}>E</span>{defaults.email}</div>
            )}
            {defaults.authorName && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                <span><span style={{ color: "#64748b", marginRight: "4px" }}>担当</span>{defaults.authorName}</span>
                <span style={{ width: "34px", height: "34px", border: "2px solid rgba(220,38,38,0.4)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(220,38,38,0.5)", fontSize: "11px", fontFamily: "serif" }}>印</span>
              </div>
            )}
          </div>
        </div>

        {/* 合計金額 hero */}
        <div style={{ display: "flex", border: "2px solid #1f3a66", marginBottom: "16px", background: "#fafbfd" }}>
          <div style={{ width: "144px", padding: "10px 16px", background: "#1f3a66", color: "#ffffff", fontWeight: 600, borderRight: "2px solid #1f3a66", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", letterSpacing: "0.25em" }}>合 計 金 額</div>
          <div style={{ flex: 1, padding: "10px 20px", display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: "8px" }}>
            <span style={{ color: "#64748b", fontSize: "14px" }}>¥</span>
            <span style={{ fontSize: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{total.toLocaleString()}</span>
            <span style={{ fontSize: "11px", color: "#64748b" }}>（税込）</span>
          </div>
        </div>

        {/* Inline-edit CSS: strip native chrome from inputs/textareas in the print area */}
        <style>{`
          .vq-cell-input {
            border: none;
            outline: none;
            background: transparent;
            font: inherit;
            color: inherit;
            width: 100%;
            padding: 0;
            margin: 0;
            display: block;
            box-sizing: border-box;
            -webkit-appearance: none;
            -moz-appearance: textfield;
            appearance: none;
            border-radius: 0;
          }
          .vq-cell-input::-webkit-outer-spin-button,
          .vq-cell-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
          .vq-cell-input:focus { background: #fff7d6; }
          .vq-cell-input::placeholder { color: #cbd5e1; }
          .vq-textarea { resize: none; overflow: hidden; line-height: 1.5; }
          select.vq-cell-input {
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 5'><path fill='%2364748b' d='M0 0l4 5 4-5z'/></svg>");
            background-repeat: no-repeat;
            background-position: right 4px center;
            background-size: 7px 5px;
            padding-right: 12px;
          }
        `}</style>

        {/* Items table */}
        {(() => {
          const MIN_ROWS = 8;
          const visibleCount = Math.max(items.length, MIN_ROWS);
          const cols = "32px 1fr 52px 60px 88px 108px 1fr";
          const headBorder = "1px solid #d8dbe6";
          const rowBorder = "1px solid #cbd5e1";
          const rows = Array.from({ length: visibleCount }, (_, i) => ({
            row: items[i] as LineRow | undefined,
            i,
          }));
          return (
            <div style={{ border: "2px solid #0f172a", marginBottom: "0", position: "relative" }}>
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: cols, background: "#1f3a66", color: "#ffffff", fontSize: "11.5px", fontWeight: 600 }}>
                <div style={{ padding: "8px 4px", textAlign: "center", borderRight: headBorder }}>No.</div>
                <div style={{ padding: "8px 12px", borderRight: headBorder }}>工事項目・摘要</div>
                <div style={{ padding: "8px 4px", textAlign: "center", borderRight: headBorder }}>単位</div>
                <div style={{ padding: "8px 4px", textAlign: "right", borderRight: headBorder }}>数量</div>
                <div style={{ padding: "8px", textAlign: "right", borderRight: headBorder }}>単価</div>
                <div style={{ padding: "8px", textAlign: "right", borderRight: headBorder }}>金額</div>
                <div style={{ padding: "8px 12px" }}>備考</div>
              </div>
              {/* Rows */}
              {(() => {
                const firstEmptyIdx = items.findIndex(
                  (it) => !it.description.trim() && !it.unitPrice && !it.quantity,
                );
                return rows.map(({ row, i }) => {
                  const exists = !!row;
                  const r: LineRow = row || emptyRow();
                  const amt = (r.quantity || 0) * (r.unitPrice || 0);
                  const isFirstEmpty = exists ? i === firstEmptyIdx : i === items.length;
                  const ensureRow = () => {
                    if (!exists) {
                      setItems((rs) => {
                        const next = [...rs];
                        while (next.length <= i) {
                          next.push(emptyRow());
                        }
                        return next;
                      });
                    }
                  };
                  return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: cols, borderTop: rowBorder, fontSize: "13px", minHeight: "32px", position: "relative" }}>
                    <div style={{ padding: "6px 4px", textAlign: "center", color: "#64748b", borderRight: rowBorder, fontVariantNumeric: "tabular-nums", fontSize: "12px" }}>{exists ? i + 1 : ""}</div>
                    <div style={{ padding: "4px 8px", borderRight: rowBorder }}>
                      <input
                        className="vq-cell-input"
                        data-cell={`r${i}-cdesc`}
                        value={r.description}
                        placeholder={isFirstEmpty ? "例: クロス貼り工事 (リビング・寝室)" : ""}
                        onFocus={ensureRow}
                        onChange={(e) => updateRow(i, { description: e.target.value })}
                        onKeyDown={(e) => handleEnterDown(e, i, "desc")}
                      />
                    </div>
                    <div style={{ padding: "4px 0", borderRight: rowBorder, textAlign: "center" }}>
                      <select
                        className="vq-cell-input"
                        data-cell={`r${i}-cunit`}
                        value={r.unit ?? ""}
                        onFocus={ensureRow}
                        onChange={(e) => updateRow(i, { unit: e.target.value })}
                        style={{
                          textAlign: "center",
                          textAlignLast: "center",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <option value="">—</option>
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ padding: "4px 4px", borderRight: rowBorder }}>
                      <input
                        className="vq-cell-input"
                        data-cell={`r${i}-cqty`}
                        type="number"
                        min="0"
                        step="any"
                        value={r.quantity || ""}
                        placeholder=""
                        onFocus={ensureRow}
                        onChange={(e) => updateRow(i, { quantity: Number(e.target.value) || 0 })}
                        onKeyDown={(e) => handleEnterDown(e, i, "qty")}
                        style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      />
                    </div>
                    <div style={{ padding: "4px 6px", borderRight: rowBorder }}>
                      <input
                        className="vq-cell-input"
                        data-cell={`r${i}-cprice`}
                        type="number"
                        min="0"
                        step="any"
                        value={r.unitPrice || ""}
                        placeholder=""
                        onFocus={ensureRow}
                        onChange={(e) => updateRow(i, { unitPrice: Number(e.target.value) || 0 })}
                        onKeyDown={(e) => handleEnterDown(e, i, "price")}
                        style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      />
                    </div>
                    <div style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", borderRight: rowBorder, fontWeight: 500 }}>
                      {exists && amt > 0 ? formatCurrency(amt) : ""}
                    </div>
                    <div style={{ padding: "4px 8px" }}>
                      <input
                        className="vq-cell-input"
                        data-cell={`r${i}-cnotes`}
                        value={r.notes}
                        placeholder=""
                        onFocus={ensureRow}
                        onChange={(e) => updateRow(i, { notes: e.target.value })}
                        onKeyDown={(e) => handleEnterDown(e, i, "notes")}
                        style={{ fontSize: "12.5px" }}
                      />
                    </div>
                    {/* Per-row delete button (hidden in PDF) */}
                    {exists && items.length > 1 && (
                      <button
                        type="button"
                        data-pdf-hide="true"
                        onClick={() => removeRow(i)}
                        title="この行を削除"
                        style={{
                          position: "absolute",
                          top: "50%",
                          right: "-26px",
                          transform: "translateY(-50%)",
                          width: "22px",
                          height: "22px",
                          border: "1px solid #fca5a5",
                          background: "#fff",
                          color: "#dc2626",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                          lineHeight: 1,
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
                });
              })()}
              {/* Totals footer */}
              <div style={{ display: "grid", gridTemplateColumns: cols, borderTop: "2px solid #0f172a", background: "#f1f5f9", fontSize: "12px" }}>
                <div style={{ gridColumn: "1 / span 4" }}></div>
                <div style={{ padding: "8px", borderLeft: rowBorder, textAlign: "right", fontWeight: 600 }}>小計</div>
                <div style={{ padding: "8px", borderLeft: rowBorder, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(subtotal)}</div>
                <div style={{ borderLeft: rowBorder }}></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: cols, borderTop: rowBorder, background: "#f1f5f9", fontSize: "12px" }}>
                <div style={{ gridColumn: "1 / span 4" }}></div>
                <div style={{ padding: "8px", borderLeft: rowBorder, textAlign: "right", fontWeight: 600 }}>消費税</div>
                <div style={{ padding: "8px", borderLeft: rowBorder, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(tax)}</div>
                <div style={{ borderLeft: rowBorder }}></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: cols, borderTop: rowBorder, background: "#1f3a66", color: "#ffffff", fontSize: "13px" }}>
                <div style={{ gridColumn: "1 / span 4" }}></div>
                <div style={{ padding: "10px 8px", borderLeft: headBorder, textAlign: "right", fontWeight: 700 }}>合計</div>
                <div style={{ padding: "10px 8px", borderLeft: headBorder, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{formatCurrency(total)}</div>
                <div style={{ borderLeft: headBorder }}></div>
              </div>
            </div>
          );
        })()}

        {/* 行を追加 (hidden in PDF) */}
        <div data-pdf-hide="true" style={{ marginTop: "6px", textAlign: "right" }}>
          <button
            type="button"
            onClick={addRow}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              border: "1px dashed #94a3b8",
              background: "#fff",
              color: "#475569",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            ＋ 行を追加
          </button>
        </div>

        {/* Datalist for unit autocomplete */}
        <datalist id="vq-unit-options">
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        {/* Terms + Notes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "16px", marginBottom: "8px" }}>
          <div>
            <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#64748b", marginBottom: "6px" }}>取引条件</div>
            <div style={{ border: "1px solid #94a3b8", fontSize: "11.5px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", borderBottom: "1px solid #cbd5e1" }}>
                <div style={{ padding: "6px 10px", background: "#f1f5f9", borderRight: "1px solid #cbd5e1" }}>納期</div>
                <div style={{ padding: "6px 10px" }}>{QUOTE_TERMS.delivery}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "72px 1fr" }}>
                <div style={{ padding: "6px 10px", background: "#f1f5f9", borderRight: "1px solid #cbd5e1" }}>支払条件</div>
                <div style={{ padding: "6px 10px" }}>{QUOTE_TERMS.payment}</div>
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#64748b", marginBottom: "6px" }}>備考</div>
            <textarea
              className="vq-cell-input vq-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="お客様への補足事項などを記入"
              rows={3}
              style={{ border: "1px solid #94a3b8", padding: "8px 10px", fontSize: "11.5px", minHeight: "60px", lineHeight: 1.6, width: "100%" }}
            />
          </div>
        </div>

        {/* Footer credit line */}
        <div style={{ marginTop: "20px", paddingTop: "8px", borderTop: "1px solid #e2e8f0", textAlign: "center", fontSize: "10px", color: "#64748b", letterSpacing: "0.15em" }}>
          {defaults.companyName || "—"}
        </div>
      </div>
      </div>
    </div>
  );
}
