import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendorQuotes,
  useDeleteVendorQuote,
  useMatchVendorQuote,
  useListProjects,
  useListExternalAssignedProjects,
  getListVendorQuotesQueryKey,
  getListVendorInvoicesQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  getListExternalAssignedProjectsQueryKey,
} from "@workspace/api-client-react";
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
  DialogDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Link2, FilePlus, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { BulkDeleteBar, runBulkDelete } from "@/components/bulk-delete-bar";
import { useRole } from "../lib/role";

export default function VendorQuotesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { role } = useRole();
  const isInternal = role === "internal";
  const listQ = useListVendorQuotes();
  const projectsQ = useListProjects(undefined, {
    query: {
      enabled: isInternal,
      queryKey: getListProjectsQueryKey(),
    },
  });
  const externalProjectsQ = useListExternalAssignedProjects({
    query: {
      enabled: role === "external",
      queryKey: getListExternalAssignedProjectsQueryKey(),
    },
  });
  const projects =
    role === "internal"
      ? (projectsQ.data ?? [])
      : (externalProjectsQ.data ?? []);
  const deleteMut = useDeleteVendorQuote();
  const matchMut = useMatchVendorQuote();

  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [matchTarget, setMatchTarget] = useState<{
    id: string;
    projectId: string;
  } | null>(null);
  const [askConvert, setAskConvert] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const listRows = listQ.data ?? [];
  const sel = useBulkSelection(listRows.map((v) => v.id));

  const handleBulkDelete = async () => {
    const ids = sel.selectedIds;
    const idSet = new Set<string>(ids);
    const projectIds = listRows
      .filter((v) => idSet.has(v.id))
      .map((v) => v.projectId);
    const { ok, failed } = await runBulkDelete(ids, (id) =>
      deleteMut.mutateAsync({ id }),
    );
    await refresh(projectIds);
    sel.clear();
    if (failed.length === 0) {
      toast({ title: `${ok}件の見積書を削除しました` });
    } else {
      toast({
        title: `${ok}件削除、${failed.length}件失敗`,
        description: apiErrorMessage(failed[0].error),
        variant: "destructive",
      });
    }
  };

  const refresh = async (projectIds?: (string | null | undefined)[]) => {
    await queryClient.invalidateQueries({
      queryKey: getListVendorQuotesQueryKey(),
    });
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
    if (!isInternal) return;
    if (!matchTarget) return;
    try {
      const updated = await matchMut.mutateAsync({
        id: matchTarget.id,
        data: { projectId: matchTarget.projectId },
      });
      await refresh([updated.projectId]);
      toast({ title: "案件に紐付けました（想定原価として施工台帳に反映）" });
      setMatchTarget(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">職人見積書</h1>
          <p className="text-sm text-muted-foreground mt-1">
            職人からの見積書を作成・保管します。施工台帳には<span className="font-medium text-foreground">想定原価</span>として自動反映されます（実績ではありません）。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/vendor-quotes/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
            data-testid="link-new-vendor-quote"
          >
            <FilePlus className="w-4 h-4" />
            見積書を作成
          </Link>
        </div>
      </div>

      <BulkDeleteBar
        count={sel.count}
        onClear={sel.clear}
        onDelete={handleBulkDelete}
        itemLabel="見積書"
        isPending={deleteMut.isPending}
        description="関連する施工台帳の想定原価も削除されます。この操作は取り消せません。"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">見積書一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (listQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              見積書はまだありません。右上のボタンから作成してください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={sel.headerCheckedState}
                      onCheckedChange={() => sel.toggleAll()}
                      aria-label="全選択"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>作成日</TableHead>
                  <TableHead>取引先</TableHead>
                  <TableHead>見積日</TableHead>
                  <TableHead>有効期限</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>振分先案件</TableHead>
                  <TableHead>ファイル</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQ.data ?? []).map((v) => (
                  <TableRow key={v.id} data-testid={`row-vendor-quote-${v.id}`} data-state={sel.isSelected(v.id) ? "selected" : undefined}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={sel.isSelected(v.id)}
                        onCheckedChange={() => sel.toggle(v.id)}
                        aria-label={`${v.vendorName || v.fileName || v.id}を選択`}
                        data-testid={`checkbox-row-${v.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(v.uploadedAt.slice(0, 10))}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {v.vendorName || v.staffName || "(不明)"}
                      </div>
                      {v.staffName && (
                        <div className="text-[11px] text-emerald-600">
                          ✓ 職人「{v.staffName}」
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(v.quoteDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.validUntil ? formatDate(v.validUntil) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(v.amount)}
                    </TableCell>
                    <TableCell>
                      {v.status === "matched" &&
                      v.projectId &&
                      projects.find((p) => p.id === v.projectId) ? (
                        isInternal ? (
                          <Link
                            href={`/projects/${v.projectId}`}
                            className="text-primary hover:underline"
                          >
                            {projects.find((p) => p.id === v.projectId)?.name}
                          </Link>
                        ) : (
                          <span>
                            {projects.find((p) => p.id === v.projectId)?.name}
                          </span>
                        )
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
                        {isInternal && v.status === "unmatched" && (
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
                          variant="outline"
                          onClick={() =>
                            setAskConvert({
                              id: v.id,
                              label:
                                v.vendorName ||
                                v.staffName ||
                                v.fileName ||
                                "(無題)",
                            })
                          }
                          className="gap-1"
                          data-testid={`button-convert-${v.id}`}
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          請求書に変換
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAskDelete(v.id)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-${v.id}`}
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

      {isInternal && (
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
              振分先の案件を選択してください。施工台帳に<span className="font-medium">想定原価</span>として登録されます。
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
                {projects.map((p) => (
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
      )}

      <Dialog
        open={!!askConvert}
        onOpenChange={(o) => !o && setAskConvert(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>職人見積書を請求書に変換</DialogTitle>
            <DialogDescription>
              「{askConvert?.label}」の内容を引き継いで職人請求書を作成します。次の画面で請求日・支払期限・宛名・明細などを最終確認してから保存してください。保存と同時にこの見積書は職人見積書一覧から削除され、職人請求書一覧へ移行します。御見積書のPDFファイルは新しい請求書の行に「引き継ぎPDF」として添付されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAskConvert(null)}>
              キャンセル
            </Button>
            <Button
              onClick={() => {
                if (!askConvert) return;
                const id = askConvert.id;
                setAskConvert(null);
                navigate(`/vendor-invoices/new?fromVendorQuoteId=${id}`);
              }}
              data-testid="button-confirm-convert"
            >
              請求書を作成する画面へ
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
            <AlertDialogTitle>見積書を削除しますか?</AlertDialogTitle>
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
