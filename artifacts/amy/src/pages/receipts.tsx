import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListReceipts,
  useCreateReceipt,
  useDeleteReceipt,
  useMatchReceipt,
  useRequestUploadUrl,
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
import { CostCategoryBadge } from "@/components/cost-category-badge";

const CATEGORIES = [
  { value: "material", label: "材料費" },
  { value: "subcontract", label: "外注費" },
  { value: "labor", label: "労務費" },
  { value: "expense", label: "経費" },
  { value: "other", label: "その他" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

const emptyForm = {
  vendor: "",
  unitNumber: "",
  amount: "0",
  receiptDate: new Date().toISOString().slice(0, 10),
  category: "expense" as Category,
  notes: "",
  fileUrl: "",
  fileName: "",
};

export default function ReceiptsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const listQ = useListReceipts();
  const projectsQ = useListProjects();
  const createMut = useCreateReceipt();
  const deleteMut = useDeleteReceipt();
  const matchMut = useMatchReceipt();
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

  const submit = async () => {
    if (!form.vendor || !form.fileUrl) {
      toast({
        title: "店舗名・ファイルは必須です",
        variant: "destructive",
      });
      return;
    }
    try {
      const created = await createMut.mutateAsync({
        data: {
          vendor: form.vendor,
          unitNumber: form.unitNumber || null,
          amount: Number(form.amount) || 0,
          receiptDate: form.receiptDate,
          category: form.category,
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
            : "領収書を登録しました（要手動振分け）",
      });
      setForm(emptyForm);
      setUploadOpen(false);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
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
          <p className="text-sm text-muted-foreground mt-1">
            アップロードした領収書は号室を入力すると案件に自動振分けされ、施工台帳の実績原価に計上されます。
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="w-4 h-4" />
          領収書をアップロード
        </Button>
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
              領収書はまだありません。
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

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>領収書をアップロード</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rVendor">店舗・支払先 *</Label>
              <Input
                id="rVendor"
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                placeholder="例: コーナン 東池袋店"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>カテゴリ *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm({ ...form, category: v as Category })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rAmount">金額 (円) *</Label>
                <Input
                  id="rAmount"
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="rUnit">号室（任意・自動振分け用）</Label>
                <Input
                  id="rUnit"
                  value={form.unitNumber}
                  onChange={(e) =>
                    setForm({ ...form, unitNumber: e.target.value })
                  }
                  placeholder="例: 305号室"
                />
              </div>
              <div>
                <Label htmlFor="rDate">領収日</Label>
                <Input
                  id="rDate"
                  type="date"
                  value={form.receiptDate}
                  onChange={(e) =>
                    setForm({ ...form, receiptDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>領収書ファイル *</Label>
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
                        name: (file.name as string) ?? "receipt.jpg",
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
              <Label htmlFor="rNotes">備考</Label>
              <Input
                id="rNotes"
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
