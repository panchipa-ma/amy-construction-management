import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetQuote,
  useDeleteQuote,
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";

export default function QuoteDetailPage() {
  const [, params] = useRoute("/quotes/:id");
  const id = params?.id ?? "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: quote, isLoading } = useGetQuote(id, {
    query: { enabled: !!id, queryKey: getGetQuoteQueryKey(id) },
  });
  const deleteMut = useDeleteQuote();
  const [askDelete, setAskDelete] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      await invalidateDashboard(queryClient);
      toast({ title: "見積書を削除しました" });
      setLocation("/quotes");
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  if (isLoading || !quote) {
    return <Skeleton className="h-96 w-full max-w-3xl" />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/quotes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        見積書一覧に戻る
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">見積書 {quote.quoteNumber}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {quote.projectName}
          </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">発行日</dt>
              <dd>{formatDate(quote.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">有効期限</dt>
              <dd>{formatDate(quote.validUntil)}</dd>
            </div>
            {quote.notes && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">備考</dt>
                <dd className="whitespace-pre-wrap">{quote.notes}</dd>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.description}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="ml-auto w-72 space-y-2 pt-4 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">小計</span>
              <span className="tabular-nums">
                {formatCurrency(quote.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">消費税 (10%)</span>
              <span className="tabular-nums">{formatCurrency(quote.tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t">
              <span>合計</span>
              <span className="tabular-nums">{formatCurrency(quote.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
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
