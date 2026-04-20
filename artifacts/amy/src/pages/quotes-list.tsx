import { Link } from "wouter";
import { useListQuotes } from "@workspace/api-client-react";
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
import { Plus, FileText } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";

export default function QuotesListPage() {
  const { data, isLoading } = useListQuotes();
  const rows = data ?? [];

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
                  <TableHead>見積番号</TableHead>
                  <TableHead>案件</TableHead>
                  <TableHead>発行日</TableHead>
                  <TableHead>有効期限</TableHead>
                  <TableHead className="text-right">金額 (税込)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((q) => (
                  <TableRow key={q.id}>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
