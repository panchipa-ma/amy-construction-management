import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendorInvoices,
  useCreateVendorInvoice,
  useDeleteVendorInvoice,
  useMatchVendorInvoice,
  useRequestUploadUrl,
  useExtractOcr,
  useListStaff,
  useListProjects,
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
  const staffQ = useListStaff();
  const projectsQ = useListProjects();
  const createMut = useCreateVendorInvoice();
  const deleteMut = useDeleteVendorInvoice();
  const matchMut = useMatchVendorInvoice();
  const requestUrlMut = useRequestUploadUrl();
  const ocrMut = useExtractOcr();

  const [staffId, setStaffId] = useState<string>("");
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [matchTarget, setMatchTarget] = useState<{
    id: string;
    projectId: string;
  } | null>(null);
  const [processing, setProcessing] = useState(0);
  const lastObjectPathRef = useRef<string>("");
  const lastContentTypeRef = useRef<string>("");
  const lastStaffIdRef = useRef<string>("");

  const refresh = async (projectId?: string | null) => {
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
  };

  const handleProcessFile = async (fileName: string) => {
    const objectPath = lastObjectPathRef.current;
    const contentType = lastContentTypeRef.current;
    const sId = lastStaffIdRef.current;
    if (!objectPath || !sId) return;

    const servePath = objectPath.startsWith("/objects/")
      ? `/api/storage${objectPath}`
      : objectPath;

    setProcessing((n) => n + 1);
    try {
      let extracted: Awaited<ReturnType<typeof ocrMut.mutateAsync>> | null = null;
      try {
        extracted = await ocrMut.mutateAsync({
          data: { objectPath, contentType, kind: "vendor_invoice" },
        });
      } catch (err) {
        toast({
          title: "自動読み取りに失敗しました。手動編集してください",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      }

      // unitNumber is required by the schema; if OCR didn't find one, leave a placeholder
      // and mark for manual matching.
      const unitNumber = extracted?.unitNumber?.trim() || "未抽出";

      const created = await createMut.mutateAsync({
        data: {
          staffId: sId,
          unitNumber,
          amount: extracted?.amount ?? 0,
          invoiceDate:
            extracted?.date ?? new Date().toISOString().slice(0, 10),
          fileUrl: servePath,
          fileName,
          notes: extracted?.notes ?? null,
        },
      });
      await refresh(created.projectId);

      const summary = extracted
        ? `${formatCurrency(extracted.amount)} / ${extracted.date}${
            extracted.unitNumber ? ` / ${extracted.unitNumber}` : ""
          }`
        : "ファイルを登録しました";
      toast({
        title:
          created.status === "matched"
            ? `案件「${created.projectName}」に振分けました`
            : "請求書を登録しました（号室一致なし・要手動振分け）",
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
    const target = (listQ.data ?? []).find((v) => v.id === askDelete);
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">職人請求書</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            職人を選んでアップロードするだけで、金額・日付・号室を自動読み取りし振分けます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="職人を選択" />
            </SelectTrigger>
            <SelectContent>
              {(staffQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              if (!staffId) {
                toast({
                  title: "先に職人を選択してください",
                  variant: "destructive",
                });
                throw new Error("staff not selected");
              }
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
              lastStaffIdRef.current = staffId;
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
                  (ok.name as string) ?? "invoice",
                );
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
              請求書はまだありません。職人を選んでファイルをアップロードしてください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>アップロード日</TableHead>
                  <TableHead>職人</TableHead>
                  <TableHead>号室</TableHead>
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
                    <TableCell>{v.staffName}</TableCell>
                    <TableCell>{v.unitNumber}</TableCell>
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
