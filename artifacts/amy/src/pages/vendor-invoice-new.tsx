import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useCreateVendorInvoice,
  useRequestUploadUrl,
  getListVendorInvoicesQueryKey,
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

const STORAGE_KEY = "amy.vendorInvoiceCreator.v1";

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

type LineRow = { description: string; quantity: number; unitPrice: number };

function loadDefaults(): CreatorDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_DEFAULTS, ...parsed };
  } catch {
    return EMPTY_DEFAULTS;
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

export default function VendorInvoiceNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const projectsQ = useListProjects();
  const createMut = useCreateVendorInvoice();
  const requestUrlMut = useRequestUploadUrl();

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

  // Load creator defaults on mount
  useEffect(() => {
    setDefaults(loadDefaults());
  }, []);

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
      // Persist creator defaults for next time
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));

      // Render the printable area to PDF
      const [{ default: jsPDF }, html2canvas] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro").then((m) => m.default),
      ]);
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let position = 0;
      let remaining = imgH;
      // First page
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      remaining -= pageH;
      // Additional pages if content longer than one page
      while (remaining > 0) {
        pdf.addPage();
        position -= pageH;
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        remaining -= pageH;
      }
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
            <div className="text-sm font-medium mb-3">
              発行元情報（次回以降は自動で記入されます）
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>会社名</Label>
                <Input
                  value={defaults.companyName}
                  onChange={(e) => updateDefault("companyName", e.target.value)}
                  placeholder="例: 有限会社 浪速"
                />
              </div>
              <div className="space-y-2">
                <Label>インボイス登録番号</Label>
                <Input
                  value={defaults.registrationNumber}
                  onChange={(e) =>
                    updateDefault("registrationNumber", e.target.value)
                  }
                  placeholder="例: T1234567890123"
                />
              </div>
              <div className="space-y-2">
                <Label>郵便番号</Label>
                <Input
                  value={defaults.postalCode}
                  onChange={(e) => updateDefault("postalCode", e.target.value)}
                  placeholder="〒000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label>会社住所</Label>
                <Input
                  value={defaults.address}
                  onChange={(e) => updateDefault("address", e.target.value)}
                  placeholder="例: 大阪府..."
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>会社メールアドレス</Label>
                <Input
                  type="email"
                  value={defaults.email}
                  onChange={(e) => updateDefault("email", e.target.value)}
                  placeholder="example@example.com"
                />
              </div>
            </div>
          </section>

          <section className="border-t pt-4">
            <div className="text-sm font-medium mb-3">お振込先</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>銀行名</Label>
                <Input
                  value={defaults.bankName}
                  onChange={(e) => updateDefault("bankName", e.target.value)}
                  placeholder="例: 三井住友銀行"
                />
              </div>
              <div className="space-y-2">
                <Label>支店名</Label>
                <Input
                  value={defaults.branchName}
                  onChange={(e) => updateDefault("branchName", e.target.value)}
                  placeholder="例: 守口支店"
                />
              </div>
              <div className="space-y-2">
                <Label>種別</Label>
                <Select
                  value={defaults.accountType}
                  onValueChange={(v) => updateDefault("accountType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="普通">普通</SelectItem>
                    <SelectItem value="当座">当座</SelectItem>
                    <SelectItem value="貯蓄">貯蓄</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>口座番号</Label>
                <Input
                  value={defaults.accountNumber}
                  onChange={(e) =>
                    updateDefault("accountNumber", e.target.value)
                  }
                  placeholder="例: 1234567"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>口座名義</Label>
                <Input
                  value={defaults.accountHolder}
                  onChange={(e) =>
                    updateDefault("accountHolder", e.target.value)
                  }
                  placeholder="例: ユウゲンガイシャ ナニワ"
                />
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
      <div
        ref={printRef}
        className="bg-white border border-border shadow-sm p-8 text-foreground"
        style={{ width: "210mm", minHeight: "297mm", boxSizing: "border-box" }}
      >
        <h1 className="text-center text-2xl font-bold tracking-[0.5em] mb-6">
          請　求　書
        </h1>
        <div className="grid grid-cols-[1fr_auto] gap-6 mb-4">
          <div className="space-y-3">
            <div className="flex items-end gap-1">
              <span className="text-lg font-bold border-b border-foreground pb-0.5 min-w-[200px]">
                {defaults.recipientName || "—"}
              </span>
              <span className="text-base font-medium pb-0.5 ml-2">御中</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">件名：</span>
              <span className="font-medium">
                {project ? projectLabel(project) : ""}
              </span>
            </div>
            <p className="text-sm mt-3">下記の通り、ご請求申し上げます。</p>
          </div>
          <div className="text-sm space-y-1">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-right">
              <span className="text-muted-foreground">請求日</span>
              <span>{issueDate ? formatDate(issueDate) : ""}</span>
              <span className="text-muted-foreground">支払期限</span>
              <span>{dueDate ? formatDate(dueDate) : ""}</span>
            </div>
            <div className="mt-3 pt-3 border-t text-left">
              <div className="font-bold">{defaults.companyName || "—"}</div>
              {defaults.postalCode && (
                <div className="text-xs text-muted-foreground">
                  {defaults.postalCode}
                </div>
              )}
              {defaults.address && (
                <div className="text-xs">{defaults.address}</div>
              )}
              {defaults.registrationNumber && (
                <div className="text-xs text-muted-foreground">
                  登録番号：{defaults.registrationNumber}
                </div>
              )}
              {defaults.email && (
                <div className="text-xs">E-Mail：{defaults.email}</div>
              )}
              {defaults.authorName && (
                <div className="text-xs mt-1">担当：{defaults.authorName}</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 border-y-2 border-foreground py-2 mb-4">
          <span className="font-bold text-sm">合計金額</span>
          <span className="text-xl font-bold tabular-nums">
            {formatCurrency(total)}
          </span>
          <span className="text-xs text-muted-foreground">（税込）</span>
        </div>

        <table className="w-full border-collapse text-sm mb-4">
          <thead>
            <tr className="bg-[hsl(220,50%,25%)] text-white">
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 w-10 text-center font-medium">
                No.
              </th>
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 text-left font-medium">
                摘要
              </th>
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 w-16 text-center font-medium">
                数量
              </th>
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 w-24 text-right font-medium">
                単価
              </th>
              <th className="border border-[hsl(220,50%,25%)] px-2 py-1.5 w-28 text-right font-medium">
                金額
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const has = it.description.trim();
              const amt = (it.quantity || 0) * (it.unitPrice || 0);
              return (
                <tr key={i} className={i % 2 === 0 ? "bg-blue-50/40" : ""}>
                  <td className="border border-border px-2 py-1 text-center text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="border border-border px-2 py-1">
                    {has ? it.description : ""}
                  </td>
                  <td className="border border-border px-2 py-1 text-center tabular-nums">
                    {has ? it.quantity : ""}
                  </td>
                  <td className="border border-border px-2 py-1 text-right tabular-nums">
                    {has ? formatCurrency(it.unitPrice) : ""}
                  </td>
                  <td className="border border-border px-2 py-1 text-right tabular-nums">
                    {has ? formatCurrency(amt) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-[1fr_auto] gap-6">
          <div className="text-sm space-y-1">
            <div className="font-medium text-muted-foreground mb-1">
              お振込先
            </div>
            <div className="pl-2 space-y-0.5">
              {(defaults.bankName || defaults.branchName) && (
                <div>
                  {defaults.bankName} {defaults.branchName}
                </div>
              )}
              {defaults.accountType && <div>{defaults.accountType}</div>}
              {defaults.accountNumber && (
                <div>口座番号：{defaults.accountNumber}</div>
              )}
              {defaults.accountHolder && <div>{defaults.accountHolder}</div>}
            </div>
          </div>
          <div className="w-64">
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr className="bg-[hsl(220,50%,25%)] text-white">
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 font-medium text-center">
                    小計
                  </td>
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 text-right tabular-nums bg-white text-foreground">
                    {formatCurrency(subtotal)}
                  </td>
                </tr>
                <tr className="bg-[hsl(220,50%,25%)] text-white">
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 font-medium text-center">
                    消費税(10%)
                  </td>
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 text-right tabular-nums bg-white text-foreground">
                    {formatCurrency(tax)}
                  </td>
                </tr>
                <tr className="bg-[hsl(220,50%,25%)] text-white">
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 font-bold text-center">
                    合計
                  </td>
                  <td className="border border-[hsl(220,50%,25%)] px-3 py-1.5 text-right tabular-nums font-bold bg-white text-foreground">
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {notes && (
          <div className="mt-4 border-t pt-3">
            <div className="inline-block bg-muted px-3 py-1 text-sm font-medium mb-1">
              備考
            </div>
            <p className="text-sm whitespace-pre-wrap pl-1">{notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
