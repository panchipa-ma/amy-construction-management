import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetQuote,
  useDeleteQuote,
  useConvertQuoteToInvoice,
  useImportQuoteToLedger,
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  getListInvoicesQueryKey,
  getGetProjectQueryKey,
  getGetProjectLedgerQueryKey,
  CostCategory,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ArrowLeft, Trash2, FileText, BookOpen } from "lucide-react";
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
  const convertMut = useConvertQuoteToInvoice();
  const importMut = useImportQuoteToLedger();
  const [askDelete, setAskDelete] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [convertForm, setConvertForm] = useState({
    invoiceNumber: "",
    issueDate: today,
    dueDate: "",
  });
  const [importForm, setImportForm] = useState({
    category: CostCategory.material as CostCategory,
    entryDate: today,
    replaceExisting: false,
  });

  const handleConvert = async () => {
    if (!convertForm.invoiceNumber) {
      toast({ title: "請求書番号は必須です", variant: "destructive" });
      return;
    }
    try {
      const inv = await convertMut.mutateAsync({
        id,
        data: {
          invoiceNumber: convertForm.invoiceNumber,
          issueDate: convertForm.issueDate,
          dueDate: convertForm.dueDate || null,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListInvoicesQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "請求書を作成しました" });
      setConvertOpen(false);
      setLocation(`/invoices/${inv.id}`);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (!quote) return;
    try {
      await importMut.mutateAsync({
        id,
        data: {
          category: importForm.category,
          entryDate: importForm.entryDate,
          replaceExisting: importForm.replaceExisting,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectLedgerQueryKey(quote.projectId),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(quote.projectId),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "施工台帳に取込みました" });
      setImportOpen(false);
      setLocation(`/projects/${quote.projectId}`);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setConvertForm({
                invoiceNumber: quote.quoteNumber.replace(/^Q/i, "INV"),
                issueDate: today,
                dueDate: "",
              });
              setConvertOpen(true);
            }}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            請求書に変換
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="gap-2"
          >
            <BookOpen className="w-4 h-4" />
            施工台帳に取込
          </Button>
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

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>請求書に変換</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              この見積書の明細をコピーして新しい請求書を作成します。
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
                  onChange={(e) =>
                    setConvertForm({
                      ...convertForm,
                      issueDate: e.target.value,
                    })
                  }
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
            <Button variant="outline" onClick={() => setConvertOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleConvert} disabled={convertMut.isPending}>
              請求書を作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>施工台帳に取込</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              見積明細の各行を予算原価として施工台帳 (案件「{quote.projectName}
              」) に登録します。
            </p>
            <div>
              <Label>原価カテゴリ</Label>
              <Select
                value={importForm.category}
                onValueChange={(v) =>
                  setImportForm({ ...importForm, category: v as CostCategory })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CostCategory.material}>材料費</SelectItem>
                  <SelectItem value={CostCategory.subcontract}>
                    外注費
                  </SelectItem>
                  <SelectItem value={CostCategory.labor}>労務費</SelectItem>
                  <SelectItem value={CostCategory.expense}>経費</SelectItem>
                  <SelectItem value={CostCategory.other}>その他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="iEntryDate">計上日</Label>
              <Input
                id="iEntryDate"
                type="date"
                value={importForm.entryDate}
                onChange={(e) =>
                  setImportForm({ ...importForm, entryDate: e.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={importForm.replaceExisting}
                onCheckedChange={(v) =>
                  setImportForm({
                    ...importForm,
                    replaceExisting: v === true,
                  })
                }
              />
              既存の原価明細を全て削除してから取込む
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleImport} disabled={importMut.isPending}>
              取込実行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
