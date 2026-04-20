import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendorInvoices,
  useCreateVendorInvoice,
  useDeleteVendorInvoice,
  useMatchVendorInvoice,
  useRequestUploadUrl,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Upload, Trash2, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";

const emptyForm = {
  staffId: "",
  unitNumber: "",
  amount: "0",
  invoiceDate: new Date().toISOString().slice(0, 10),
  notes: "",
  fileUrl: "",
  fileName: "",
};

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

  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [matchTarget, setMatchTarget] = useState<{
    id: string;
    projectId: string;
  } | null>(null);
  const lastObjectPathRef = useRef<string>("");

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

  const submit = async () => {
    if (!form.staffId || !form.unitNumber || !form.fileUrl) {
      toast({
        title: "職人・号室・ファイルは必須です",
        variant: "destructive",
      });
      return;
    }
    try {
      const created = await createMut.mutateAsync({
        data: {
          staffId: form.staffId,
          unitNumber: form.unitNumber,
          amount: Number(form.amount) || 0,
          invoiceDate: form.invoiceDate,
          fileUrl: form.fileUrl,
          fileName: form.fileName,
          notes: form.notes || null,
        },
      });
      await refresh(created.projectId);
      toast({
        title:
          created.status === "matched"
            ? `案件「${created.projectName}」に自動振分けしました`
            : "請求書を登録しました（号室一致なし・要手動振分け）",
      });
      setForm(emptyForm);
      setUploadOpen(false);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">職人請求書</h1>
          <p className="text-sm text-muted-foreground mt-1">
            アップロードした請求書はマンション号室で案件に自動振分けされ、施工台帳の実績原価に計上されます。
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="w-4 h-4" />
          請求書をアップロード
        </Button>
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
              請求書はまだありません。
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

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>請求書をアップロード</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>職人 *</Label>
              <Select
                value={form.staffId}
                onValueChange={(v) => setForm({ ...form, staffId: v })}
              >
                <SelectTrigger>
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vUnit">号室 *</Label>
                <Input
                  id="vUnit"
                  value={form.unitNumber}
                  onChange={(e) =>
                    setForm({ ...form, unitNumber: e.target.value })
                  }
                  placeholder="例: 305号室"
                />
              </div>
              <div>
                <Label htmlFor="vAmount">金額 (円) *</Label>
                <Input
                  id="vAmount"
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="vDate">請求日</Label>
                <Input
                  id="vDate"
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) =>
                    setForm({ ...form, invoiceDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>請求書ファイル *</Label>
              <div className="flex items-center gap-2 mt-1">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={20 * 1024 * 1024}
                  buttonClassName="inline-flex items-center gap-2 px-3 py-2 border rounded-md text-sm hover:bg-accent"
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
                    return {
                      method: "PUT",
                      url: res.uploadURL,
                      headers: { "Content-Type": contentType },
                    };
                  }}
                  onComplete={(result) => {
                    const ok = result.successful?.[0];
                    if (ok && lastObjectPathRef.current) {
                      const path = lastObjectPathRef.current;
                      const servePath = path.startsWith("/objects/")
                        ? `/api/storage${path}`
                        : path;
                      setForm((f) => ({
                        ...f,
                        fileUrl: servePath,
                        fileName: (ok.name as string) ?? f.fileName,
                      }));
                      toast({ title: "アップロード完了" });
                    }
                  }}
                >
                  <Upload className="w-4 h-4" />
                  ファイルを選択
                </ObjectUploader>
                {form.fileName && (
                  <span className="text-sm text-muted-foreground truncate">
                    {form.fileName}
                  </span>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="vNotes">備考</Label>
              <Input
                id="vNotes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={createMut.isPending}>
              登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
