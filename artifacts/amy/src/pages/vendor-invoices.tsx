import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendorInvoices,
  useCreateVendorInvoice,
  useDeleteVendorInvoice,
  useMatchVendorInvoice,
  useAssignVendorInvoiceStaff,
  useRequestUploadUrl,
  useExtractOcr,
  useListProjects,
  useListStaff,
  getListVendorInvoicesQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { Upload, Trash2, Link2, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";

export default function VendorInvoicesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const listQ = useListVendorInvoices();
  const projectsQ = useListProjects();
  const staffQ = useListStaff();
  const createMut = useCreateVendorInvoice();
  const deleteMut = useDeleteVendorInvoice();
  const matchMut = useMatchVendorInvoice();
  const assignMut = useAssignVendorInvoiceStaff();
  const requestUrlMut = useRequestUploadUrl();
  const ocrMut = useExtractOcr();

  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [matchTarget, setMatchTarget] = useState<{
    id: string;
    projectId: string;
  } | null>(null);
  const [assignTarget, setAssignTarget] = useState<{
    id: string;
    staffId: string;
  } | null>(null);
  const [processing, setProcessing] = useState(0);
  const lastObjectPathRef = useRef<string>("");
  const lastContentTypeRef = useRef<string>("");

  const refresh = async (projectIds?: (string | null | undefined)[]) => {
    await queryClient.invalidateQueries({
      queryKey: getListVendorInvoicesQueryKey(),
    });
    await queryClient.invalidateQueries({
      queryKey: getListProjectsQueryKey(),
    });
    const unique = new Set(
      (projectIds ?? []).filter((p): p is string => !!p),
    );
    for (const pid of unique) {
      await queryClient.invalidateQueries({
        queryKey: getGetProjectLedgerQueryKey(pid),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(pid),
      });
    }
    await invalidateDashboard(queryClient);
  };

  const handleProcessFile = async (fileName: string) => {
    const objectPath = lastObjectPathRef.current;
    const contentType = lastContentTypeRef.current;
    if (!objectPath) return;

    const servePath = objectPath.startsWith("/objects/")
      ? `/api/storage${objectPath}`
      : objectPath;

    setProcessing((n) => n + 1);
    try {
      const extracted = await ocrMut.mutateAsync({
        data: { objectPath, contentType, kind: "vendor_invoice" },
      });

      // Determine line items: prefer multi-item from OCR, fall back to single-row
      // synthesised from the top-level fields if items array is empty
      const lines =
        extracted.items.length > 0
          ? extracted.items
          : [
              {
                unitNumber: extracted.unitNumber ?? "未抽出",
                amount: extracted.amount,
                description: extracted.notes ?? null,
                date: extracted.date,
              },
            ];

      const projectIds: (string | null)[] = [];
      let matchedCount = 0;
      let failedCount = 0;
      const failures: string[] = [];
      for (const line of lines) {
        try {
          const created = await createMut.mutateAsync({
            data: {
              vendorName: extracted.vendor || fileName,
              unitNumber: line.unitNumber || "未抽出",
              amount: line.amount,
              invoiceDate: line.date ?? extracted.date,
              fileUrl: servePath,
              fileName,
              notes: line.description ?? extracted.notes ?? null,
            },
          });
          projectIds.push(created.projectId ?? null);
          if (created.status === "matched") matchedCount += 1;
        } catch (e) {
          failedCount += 1;
          failures.push(`${line.unitNumber}: ${apiErrorMessage(e)}`);
        }
      }
      await refresh(projectIds);

      const total = lines.length;
      const okCount = total - failedCount;
      if (failedCount > 0) {
        toast({
          title: `${okCount}件登録、${failedCount}件失敗`,
          description: failures.join(" / "),
          variant: "destructive",
        });
      } else {
        const summary =
          total === 1
            ? `${extracted.vendor || "(取引先不明)"} / ${formatCurrency(lines[0].amount)}`
            : `${extracted.vendor}：${total}件中 ${matchedCount}件を案件に自動振分け`;
        toast({
          title:
            total === 1 && matchedCount === 1
              ? "案件に自動振分けしました"
              : matchedCount === total
                ? "全件を自動振分けしました"
                : "請求書を登録しました（一部未振分）",
          description: summary,
        });
      }
    } catch (err) {
      toast({
        title: "自動読み取りに失敗しました",
        description: apiErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setProcessing((n) => n - 1);
    }
  };

  const handleDelete = async () => {
    if (!askDelete) return;
    const target = (listQ.data ?? []).find((v) => v.id === askDelete);
    try {
      await deleteMut.mutateAsync({ id: askDelete });
      await refresh([target?.projectId]);
      toast({ title: "削除しました" });
      setAskDelete(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleMatch = async () => {
    if (!matchTarget) return;
    try {
      const updated = await matchMut.mutateAsync({
        id: matchTarget.id,
        data: { projectId: matchTarget.projectId },
      });
      await refresh([updated.projectId]);
      toast({ title: "案件に紐付けました" });
      setMatchTarget(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">職人請求書</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            アップロードするだけで取引先・金額・日付を自動読み取りし、施工台帳に自動反映します。複数物件が混在していても明細ごとに自動振分けします。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {processing > 0 && (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" />
              読み取り中 ({processing})
            </span>
          )}
          <ObjectUploader
            maxNumberOfFiles={1}
            maxFileSize={20 * 1024 * 1024}
            buttonClassName="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            onGetUploadParameters={async (file) => {
              const contentType =
                (file.type as string) ?? "application/octet-stream";
              const res = await requestUrlMut.mutateAsync({
                data: {
                  name: (file.name as string) ?? "invoice.pdf",
                  size: (file.size as number) ?? 0,
                  contentType,
                },
              });
              lastObjectPathRef.current = res.objectPath;
              lastContentTypeRef.current = contentType;
              return {
                method: "PUT",
                url: res.uploadURL,
                headers: { "Content-Type": contentType },
              };
            }}
            onComplete={(result) => {
              const ok = result.successful?.[0];
              if (ok && lastObjectPathRef.current) {
                void handleProcessFile((ok.name as string) ?? "invoice");
              }
            }}
          >
            <Upload className="w-4 h-4" />
            請求書をアップロード
          </ObjectUploader>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">請求書一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (listQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              請求書はまだありません。右上のボタンからファイルをアップロードしてください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>アップロード日</TableHead>
                  <TableHead>取引先</TableHead>
                  <TableHead>請求日</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>振分先案件</TableHead>
                  <TableHead>ファイル</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQ.data ?? []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(v.uploadedAt.slice(0, 10))}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {v.vendorName || v.staffName || "(不明)"}
                      </div>
                      {v.staffName ? (
                        <div className="text-[11px] text-emerald-600">
                          ✓ 職人「{v.staffName}」に一致
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            setAssignTarget({ id: v.id, staffId: "" })
                          }
                          className="text-[11px] text-amber-700 hover:underline"
                        >
                          職人未一致 (割当)
                        </button>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(v.invoiceDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(v.amount)}
                    </TableCell>
                    <TableCell>
                      {v.status === "matched" && v.projectId ? (
                        <Link
                          href={`/projects/${v.projectId}`}
                          className="text-primary hover:underline"
                        >
                          {v.projectName}
                        </Link>
                      ) : (
                        <Badge variant="outline" className="text-amber-700">
                          未振分
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <a
                        href={v.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        {v.fileName}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {v.status === "unmatched" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setMatchTarget({ id: v.id, projectId: "" })
                            }
                            className="gap-1"
                          >
                            <Link2 className="w-3 h-3" />
                            振分
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAskDelete(v.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!matchTarget}
        onOpenChange={(o) => !o && setMatchTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>案件に紐付け</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              振分先の案件を選択してください。施工台帳に実績原価が登録されます。
            </p>
            <Select
              value={matchTarget?.projectId ?? ""}
              onValueChange={(v) =>
                setMatchTarget((t) => (t ? { ...t, projectId: v } : t))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="案件を選択" />
              </SelectTrigger>
              <SelectContent>
                {(projectsQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.unitNumber ? ` (${p.unitNumber})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchTarget(null)}>
              キャンセル
            </Button>
            <Button
              onClick={handleMatch}
              disabled={!matchTarget?.projectId || matchMut.isPending}
            >
              紐付ける
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!assignTarget}
        onOpenChange={(o) => !o && setAssignTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>職人を割当</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              請求書の取引先と職人マスタを結びつけます。次回以降の自動マッチングはOCRが取引先名から判定します。
            </p>
            <Select
              value={assignTarget?.staffId ?? ""}
              onValueChange={(v) =>
                setAssignTarget((t) => (t ? { ...t, staffId: v } : t))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="職人を選択" />
              </SelectTrigger>
              <SelectContent>
                {(staffQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.role ? ` (${s.role})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              キャンセル
            </Button>
            <Button
              onClick={async () => {
                if (!assignTarget?.staffId) return;
                try {
                  await assignMut.mutateAsync({
                    id: assignTarget.id,
                    data: { staffId: assignTarget.staffId },
                  });
                  await refresh();
                  toast({ title: "職人を割当てました" });
                  setAssignTarget(null);
                } catch (e) {
                  toast({
                    title: apiErrorMessage(e),
                    variant: "destructive",
                  });
                }
              }}
              disabled={!assignTarget?.staffId || assignMut.isPending}
            >
              割当てる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!askDelete}
        onOpenChange={(o) => !o && setAskDelete(null)}
      >
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
