import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import {
  useListInvoices,
  useUpdateInvoice,
  useDeleteInvoice,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Receipt, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { apiErrorMessage } from "@/lib/api-error";

// 入金済の請求書はサイドバーの「請求済」欄にしか表示しない。
// 通常の「請求」一覧は未入金のみ。
type PaidFilter = "paid" | "unpaid";

export default function InvoicesListPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const search = useSearch();
  const isPaidView =
    new URLSearchParams(search).get("paid") === "true";
  const initialFilter: PaidFilter = isPaidView ? "paid" : "unpaid";
  const [paidFilter, setPaidFilter] = useState<PaidFilter>(initialFilter);
  useEffect(() => {
    const v = new URLSearchParams(search).get("paid");
    setPaidFilter(v === "true" ? "paid" : "unpaid");
  }, [search]);

  const { data, isLoading } = useListInvoices();
  const updateMut = useUpdateInvoice();
  const deleteMut = useDeleteInvoice();
  const rows = useMemo(() => {
    const list = data ?? [];
    return paidFilter === "paid"
      ? list.filter((i) => i.paid)
      : list.filter((i) => !i.paid);
  }, [data, paidFilter]);

  const [askDelete, setAskDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const togglePaid = async (
    id: string,
    inv: NonNullable<typeof data>[number],
  ) => {
    try {
      await updateMut.mutateAsync({
        id,
        data: {
          projectId: inv.projectId,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate ?? null,
          notes: inv.notes ?? null,
          paid: !inv.paid,
          items: inv.items,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await invalidateDashboard(queryClient);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!askDelete) return;
    try {
      await deleteMut.mutateAsync({ id: askDelete.id });
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "請求書を削除しました" });
      setAskDelete(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isPaidView ? "請求済（入金済）" : "請求書"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isPaidView
              ? "入金済になった請求書はこちらに自動で移動します。"
              : "未入金の請求書を管理します（入金済はサイドバー「請求済」へ自動移動）。"}
          </p>
        </div>
        <Link href="/invoices/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            新規請求
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isPaidView ? "入金済の請求書" : "未入金の請求書"}
          </CardTitle>
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
                <Receipt className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="font-medium">請求書がありません</div>
              <Link href="/invoices/new">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  最初の請求を作成
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>請求番号</TableHead>
                  <TableHead>案件</TableHead>
                  <TableHead>発行日</TableHead>
                  <TableHead>支払期限</TableHead>
                  <TableHead className="text-right">金額 (税込)</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-medium hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{inv.projectName ?? "-"}</TableCell>
                    <TableCell>{formatDate(inv.issueDate)}</TableCell>
                    <TableCell>{formatDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(inv.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={inv.paid}
                          onCheckedChange={() => togglePaid(inv.id, inv)}
                        />
                        <Badge
                          variant="outline"
                          className={
                            inv.paid
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-amber-100 text-amber-800 border-amber-200"
                          }
                        >
                          {inv.paid ? "入金済" : "未入金"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setAskDelete({ id: inv.id, label: inv.invoiceNumber })
                        }
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-invoice-${inv.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
            <AlertDialogTitle>請求書を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{askDelete?.label}」を削除します。この操作は取り消せません。
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
