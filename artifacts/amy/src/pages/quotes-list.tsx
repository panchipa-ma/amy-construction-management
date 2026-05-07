import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuotes,
  useDeleteQuote,
  useConvertQuoteToInvoice,
  useUpdateProject,
  getListQuotesQueryKey,
  getListProjectsQueryKey,
  getListInvoicesQueryKey,
  ProjectStatus,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, FileText, Trash2, FileOutput } from "lucide-react";
import { formatCurrency, formatDate, endOfNextMonthISO } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { apiErrorMessage } from "@/lib/api-error";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { BulkDeleteBar, runBulkDelete } from "@/components/bulk-delete-bar";

export default function QuotesListPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data, isLoading } = useListQuotes();
  const deleteMut = useDeleteQuote();
  const convertMut = useConvertQuoteToInvoice();
  const updateProjectMut = useUpdateProject();
  const rows = data ?? [];
  const sel = useBulkSelection(rows.map((q) => q.id));

  const [askDelete, setAskDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [convertFor, setConvertFor] = useState<{
    id: string;
    quoteNumber: string;
  } | null>(null);
  const [convertForm, setConvertForm] = useState({
    invoiceNumber: "",
    issueDate: today,
    dueDate: endOfNextMonthISO(today),
  });

  const openConvert = (q: { id: string; quoteNumber: string }) => {
    setConvertForm({
      invoiceNumber: q.quoteNumber.replace(/^Q/i, "INV"),
      issueDate: today,
      dueDate: endOfNextMonthISO(today),
    });
    setConvertFor(q);
  };

  const handleConvert = async () => {
    if (!convertFor) return;
    if (!convertForm.invoiceNumber) {
      toast({ title: "請求書番号は必須です", variant: "destructive" });
      return;
    }
    try {
      await convertMut.mutateAsync({
        id: convertFor.id,
        data: {
          invoiceNumber: convertForm.invoiceNumber,
          issueDate: convertForm.issueDate,
          dueDate: convertForm.dueDate || null,
        },
      });
      // バックエンド側で案件の竣工化・元見積書の削除まで一括で実施されている。
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: getListQuotesQueryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "見積書を請求書へ移行しました" });
      setConvertFor(null);
      setLocation("/invoices");
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    const ids = sel.selectedIds;
    const { ok, failed } = await runBulkDelete(ids, (id) =>
      deleteMut.mutateAsync({ id }),
    );
    await queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    await invalidateDashboard(queryClient);
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

  const handleDelete = async () => {
    if (!askDelete) return;
    try {
      await deleteMut.mutateAsync({ id: askDelete.id });
      await queryClient.invalidateQueries({
        queryKey: getListQuotesQueryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "見積書を削除しました" });
      setAskDelete(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">見積書</h1>
          <p className="text-sm text-muted-foreground mt-1">
            すべての見積書を管理します。
          </p>
        </div>
        <Link href="/quotes/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            新規見積
          </Button>
        </Link>
      </div>

      <BulkDeleteBar
        count={sel.count}
        onClear={sel.clear}
        onDelete={handleBulkDelete}
        itemLabel="見積書"
        isPending={deleteMut.isPending}
        description="関連する案件の契約金額が再計算されます。この操作は取り消せません。"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">見積書一覧</CardTitle>
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
                <FileText className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="font-medium">見積書がありません</div>
              <Link href="/quotes/new">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  最初の見積を作成
                </Button>
              </Link>
            </div>
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
                  <TableHead>見積番号</TableHead>
                  <TableHead>案件</TableHead>
                  <TableHead>発行日</TableHead>
                  <TableHead>有効期限</TableHead>
                  <TableHead className="text-right">金額 (税込)</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((q) => (
                  <TableRow key={q.id} data-state={sel.isSelected(q.id) ? "selected" : undefined}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={sel.isSelected(q.id)}
                        onCheckedChange={() => sel.toggle(q.id)}
                        aria-label={`${q.quoteNumber}を選択`}
                        data-testid={`checkbox-row-${q.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/quotes/${q.id}`}
                        className="font-medium hover:underline"
                      >
                        {q.quoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{q.projectName ?? "-"}</TableCell>
                    <TableCell>{formatDate(q.issueDate)}</TableCell>
                    <TableCell>{formatDate(q.validUntil)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(q.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openConvert({ id: q.id, quoteNumber: q.quoteNumber })
                          }
                          className="gap-1.5 h-7 px-2 text-xs"
                          data-testid={`button-convert-quote-${q.id}`}
                        >
                          <FileOutput className="w-3.5 h-3.5" />
                          請求書に変換
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setAskDelete({ id: q.id, label: q.quoteNumber })
                          }
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-quote-${q.id}`}
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
        open={!!convertFor}
        onOpenChange={(o) => !o && setConvertFor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>請求書に変換</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              「{convertFor?.quoteNumber}」の明細をコピーして新しい請求書を作成します。
            </p>
            <div>
              <Label htmlFor="invoiceNumber">請求書番号 *</Label>
              <Input
                id="invoiceNumber"
                value={convertForm.invoiceNumber}
                onChange={(e) =>
                  setConvertForm({
                    ...convertForm,
                    invoiceNumber: e.target.value,
                  })
                }
                placeholder="例: INV-2026-001"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cIssueDate">発行日</Label>
                <Input
                  id="cIssueDate"
                  type="date"
                  value={convertForm.issueDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setConvertForm({
                      ...convertForm,
                      issueDate: next,
                      // 発行日が変わったら支払期日も自動で翌月末に追従させる
                      dueDate: next ? endOfNextMonthISO(next) : convertForm.dueDate,
                    });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="cDueDate">支払期日</Label>
                <Input
                  id="cDueDate"
                  type="date"
                  value={convertForm.dueDate}
                  onChange={(e) =>
                    setConvertForm({
                      ...convertForm,
                      dueDate: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertFor(null)}>
              キャンセル
            </Button>
            <Button onClick={handleConvert} disabled={convertMut.isPending}>
              請求書を作成
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
            <AlertDialogTitle>見積書を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{askDelete?.label}」を削除します。削除すると、案件の売上（契約金額）が他の最新見積書を元に再計算されます（見積書がなくなった場合は0円になります）。この操作は取り消せません。
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
