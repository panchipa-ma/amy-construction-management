import { useRoute, Link, useLocation } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvoice,
  useDeleteInvoice,
  useUpdateInvoice,
  getGetInvoiceQueryKey,
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
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";

export default function InvoiceDetailPage() {
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id ?? "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: inv, isLoading } = useGetInvoice(id, {
    query: { enabled: !!id, queryKey: getGetInvoiceQueryKey(id) },
  });
  const deleteMut = useDeleteInvoice();
  const updateMut = useUpdateInvoice();
  const [askDelete, setAskDelete] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync({ id });
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "請求書を削除しました" });
      setLocation("/invoices");
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const togglePaid = async () => {
    if (!inv) return;
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
        queryKey: getGetInvoiceQueryKey(id),
      });
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await invalidateDashboard(queryClient);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  if (isLoading || !inv) {
    return <Skeleton className="h-96 w-full max-w-3xl" />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        請求書一覧に戻る
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">請求書 {inv.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {inv.projectName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={inv.paid} onCheckedChange={togglePaid} />
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
          <Button
            variant="outline"
            onClick={() => setAskDelete(true)}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            削除
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">発行日</dt>
              <dd>{formatDate(inv.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">支払期限</dt>
              <dd>{formatDate(inv.dueDate)}</dd>
            </div>
            {inv.notes && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">備考</dt>
                <dd className="whitespace-pre-wrap">{inv.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">明細</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>摘要</TableHead>
                <TableHead className="w-16">単位</TableHead>
                <TableHead className="text-right w-20">数量</TableHead>
                <TableHead className="text-right w-28">単価</TableHead>
                <TableHead className="text-right w-32">金額</TableHead>
                <TableHead>備考</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-pre-wrap">
                    {item.description}
                  </TableCell>
                  <TableCell>{item.unit ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {item.notes ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="ml-auto w-72 space-y-2 pt-4 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">小計</span>
              <span className="tabular-nums">
                {formatCurrency(inv.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">消費税 (10%)</span>
              <span className="tabular-nums">{formatCurrency(inv.tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>合計</span>
              <span className="tabular-nums">{formatCurrency(inv.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
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
