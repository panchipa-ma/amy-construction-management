import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useListQuotes,
  useDeleteProject,
  getListProjectsQueryKey,
  ProjectStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProjectStatusBadge } from "@/components/status-badge";
import { PROJECT_STATUS_OPTIONS } from "@/components/project-status-select";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, FolderKanban, Trash2, Copy, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { apiErrorMessage } from "@/lib/api-error";

// On the regular 案件一覧, 竣工 projects are intentionally hidden — they live
// only on the dedicated 竣工 sidebar view (?status=completed).
const ACTIVE_STATUS_OPTIONS = PROJECT_STATUS_OPTIONS.filter(
  (o) => o.value !== "completed",
);

export default function ProjectsListPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const search = useSearch();
  const urlStatus = new URLSearchParams(search).get("status");
  const isCompletedView = urlStatus === "completed";
  const initialStatus = (() => {
    if (isCompletedView) return "completed";
    return urlStatus && ACTIVE_STATUS_OPTIONS.some((o) => o.value === urlStatus)
      ? urlStatus
      : "active";
  })();
  const [status, setStatus] = useState<string>(initialStatus);
  useEffect(() => {
    const s = new URLSearchParams(search).get("status");
    if (s === "completed") {
      setStatus("completed");
    } else {
      setStatus(
        s && ACTIVE_STATUS_OPTIONS.some((o) => o.value === s) ? s : "active",
      );
    }
  }, [search]);
  const params =
    status === "active" ? undefined : { status: status as ProjectStatus };
  const { data, isLoading } = useListProjects(params);
  const deleteMut = useDeleteProject();
  // When showing "進行中" (active), explicitly drop completed in case the
  // server returns them with no filter.
  const rows = (data ?? []).filter((p) =>
    status === "active" ? p.status !== "completed" : true,
  );

  const [askDelete, setAskDelete] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [reuseFor, setReuseFor] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [, navigate] = useLocation();

  const handleDelete = async () => {
    if (!askDelete) return;
    try {
      await deleteMut.mutateAsync({ id: askDelete.id });
      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "案件を削除しました" });
      setAskDelete(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isCompletedView ? "竣工案件" : "案件一覧"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCompletedView
              ? "ステータスが竣工になった案件はこちらに自動で移動します。"
              : "進行中の案件を管理します（竣工はサイドバー「竣工」へ自動移動）。"}
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            案件を作成
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            {isCompletedView ? "竣工案件" : "案件"}
          </CardTitle>
          {!isCompletedView && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">進行中（竣工除く）</SelectItem>
                {ACTIVE_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <FolderKanban className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">案件がありません</div>
                <div className="text-sm text-muted-foreground mt-1">
                  最初の案件を登録して施工管理を始めましょう。
                </div>
              </div>
              <Link href="/projects/new">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  案件を作成
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案件名</TableHead>
                  <TableHead>顧客</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>工期</TableHead>
                  <TableHead className="text-right">契約金額</TableHead>
                  <TableHead className="text-right">実績原価</TableHead>
                  <TableHead className="text-right">粗利</TableHead>
                  {isCompletedView && <TableHead className="w-32"></TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const profit = p.contractAmount - p.actualCost;
                  const overrun = p.actualCost > p.plannedCost;
                  return (
                    <TableRow key={p.id} className="cursor-pointer">
                      <TableCell>
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.code && (
                          <div className="text-xs text-muted-foreground">
                            {p.code}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{p.customerName}</TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(p.startDate)} - {formatDate(p.endDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(p.contractAmount)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${overrun ? "text-destructive font-medium" : ""}`}
                      >
                        {formatCurrency(p.actualCost)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${profit < 0 ? "text-destructive font-medium" : "text-emerald-700"}`}
                      >
                        {formatCurrency(profit)}
                      </TableCell>
                      {isCompletedView && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReuseFor({ id: p.id, name: p.name });
                            }}
                            className="gap-1.5 h-7 px-2 text-xs"
                            title="この案件の見積書を複製して新規作成"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            見積を流用
                          </Button>
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAskDelete({ id: p.id, name: p.name });
                          }}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-project-${p.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!askDelete}
        onOpenChange={(o) => !o && setAskDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>案件を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{askDelete?.name}」を削除します。関連する見積書・請求書・施工台帳の原価エントリ・工程・進捗記録もすべて削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!reuseFor}
        onOpenChange={(o) => !o && setReuseFor(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>見積書を流用して新規作成</DialogTitle>
            <DialogDescription>
              「{reuseFor?.name}」の見積書を選択してください。内容を引き継いで新しい見積書を作成します（案件・見積No・見積日は選び直し）。
            </DialogDescription>
          </DialogHeader>
          {reuseFor && (
            <ReuseQuotePicker
              projectId={reuseFor.id}
              onPick={(quoteId) => {
                setReuseFor(null);
                navigate(`/quotes/new?fromQuoteId=${quoteId}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReuseQuotePicker({
  projectId,
  onPick,
}: {
  projectId: string;
  onPick: (quoteId: string) => void;
}) {
  const { data, isLoading } = useListQuotes({ projectId });
  if (isLoading) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        読み込み中...
      </div>
    );
  }
  const quotes = data ?? [];
  if (quotes.length === 0) {
    return (
      <div className="py-6 flex flex-col items-center text-center gap-2 text-sm text-muted-foreground">
        <FileText className="w-8 h-8 opacity-40" />
        この案件には見積書がありません。
      </div>
    );
  }
  return (
    <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
      {quotes.map((q) => {
        const subtotal = (q.items ?? []).reduce(
          (s, it) => s + (it.quantity || 0) * (it.unitPrice || 0),
          0,
        );
        const total = subtotal + Math.floor(subtotal * 0.1);
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onPick(q.id)}
            className="w-full text-left px-3 py-2.5 rounded-md border hover:bg-accent hover:border-accent-foreground/20 transition-colors flex items-start gap-3"
          >
            <FileText className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {q.subject || q.quoteNumber}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                <span>{q.quoteNumber}</span>
                <span>{formatDate(q.issueDate)}</span>
                <span className="tabular-nums">
                  {formatCurrency(total)}（税込）
                </span>
              </div>
            </div>
            <Copy className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          </button>
        );
      })}
    </div>
  );
}
