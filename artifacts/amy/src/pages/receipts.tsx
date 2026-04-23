import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListReceipts,
  useCreateReceipt,
  useDeleteReceipt,
  useMatchReceipt,
  useRequestUploadUrl,
  useExtractOcr,
  useListProjects,
  getListReceiptsQueryKey,
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
import { CostCategoryBadge } from "@/components/cost-category-badge";

export default function ReceiptsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const listQ = useListReceipts();
  const projectsQ = useListProjects();
  const createMut = useCreateReceipt();
  const deleteMut = useDeleteReceipt();
  const matchMut = useMatchReceipt();
  const requestUrlMut = useRequestUploadUrl();
  const ocrMut = useExtractOcr();

  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [matchTarget, setMatchTarget] = useState<{
    id: string;
    projectId: string;
  } | null>(null);
  const [processing, setProcessing] = useState(0);
  const lastObjectPathRef = useRef<string>("");
  const lastContentTypeRef = useRef<string>("");

  const refresh = async (projectId?: string | null) => {
    await queryClient.invalidateQueries({
      queryKey: getListReceiptsQueryKey(),
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
      // Run OCR
      let extracted: Awaited<ReturnType<typeof ocrMut.mutateAsync>> | null = null;
      try {
        extracted = await ocrMut.mutateAsync({
          data: { objectPath, contentType, kind: "receipt" },
        });
      } catch (err) {
        // OCR failed: still create with minimal info so file isn't lost
        toast({
          title: "自動読み取りに失敗しました。手動編集してください",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      }

      const created = await createMut.mutateAsync({
        data: {
          vendor: extracted?.vendor || fileName,
          unitNumber: extracted?.unitNumber ?? null,
          amount: extracted?.amount ?? 0,
          receiptDate: extracted?.date ?? new Date().toISOString().slice(0, 10),
          category: "expense",
          fileUrl: servePath,
          fileName,
          notes: extracted?.notes ?? null,
        },
      });
      await refresh(created.projectId);

      const summary = extracted
        ? `${extracted.vendor || "(店舗不明)"} / ${formatCurrency(extracted.amount)} / ${extracted.date}`
        : "ファイルを登録しました";
      toast({
        title:
          created.status === "matched"
            ? `案件「${created.projectName}」に振分けました`
            : "領収書を登録しました（要手動振分け）",
        description: summary,
      });
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    } finally {
      setProcessing((n) => n - 1);
    }
  };

  const handleDelete = async () => {
    if (!askDelete) return;
    const target = (listQ.data ?? []).find((r) => r.id === askDelete);
    try {
      await deleteMut.mutateAsync({ id: askDelete });
      await refresh(target?.projectId ?? null);
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
      await refresh(updated.projectId);
      toast({ title: "案件に紐付けました" });
      setMatchTarget(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">領収書</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            アップロードするだけで店舗・金額・日付・号室を自動読み取りし、案件に振分けます。
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                  name: (file.name as string) ?? "receipt.jpg",
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
                void handleProcessFile(
                  (ok.name as string) ?? "receipt",
                );
              }
            }}
          >
            <Upload className="w-4 h-4" />
            領収書をアップロード
          </ObjectUploader>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">領収書一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (listQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              領収書はまだありません。右上のボタンからファイルを選んでください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>アップロード日</TableHead>
                  <TableHead>店舗・支払先</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>号室</TableHead>
                  <TableHead>領収日</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>振分先案件</TableHead>
                  <TableHead>ファイル</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQ.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(r.uploadedAt.slice(0, 10))}
                    </TableCell>
                    <TableCell className="font-medium">{r.vendor}</TableCell>
                    <TableCell>
                      <CostCategoryBadge category={r.category} />
                    </TableCell>
                    <TableCell>{r.unitNumber ?? "—"}</TableCell>
                    <TableCell>{formatDate(r.receiptDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(r.amount)}
                    </TableCell>
                    <TableCell>
                      {r.status === "matched" && r.projectId ? (
                        <Link
                          href={`/projects/${r.projectId}`}
                          className="text-primary hover:underline"
                        >
                          {r.projectName}
                        </Link>
                      ) : (
                        <Badge variant="outline" className="text-amber-700">
                          未振分
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <a
                        href={r.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        {r.fileName}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {r.status === "unmatched" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setMatchTarget({ id: r.id, projectId: "" })
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
                          onClick={() => setAskDelete(r.id)}
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

      <AlertDialog
        open={!!askDelete}
        onOpenChange={(o) => !o && setAskDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>領収書を削除しますか?</AlertDialogTitle>
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
