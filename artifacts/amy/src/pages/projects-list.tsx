import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
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
import { ProjectStatusBadge } from "@/components/status-badge";
import { PROJECT_STATUS_OPTIONS } from "@/components/project-status-select";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, FolderKanban, Trash2 } from "lucide-react";
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
    </div>
  );
}
