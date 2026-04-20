import { useState } from "react";
import { Link } from "wouter";
import {
  useListProjects,
  useGetProjectLedger,
  getGetProjectLedgerQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Button } from "@/components/ui/button";
import { CostCategoryBadge } from "@/components/cost-category-badge";
import { LedgerSummary } from "@/components/ledger-summary";
import { LedgerSpreadsheet } from "@/components/ledger-spreadsheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { ExternalLink } from "lucide-react";

export default function LedgerPage() {
  const projectsQ = useListProjects();
  const [projectId, setProjectId] = useState<string>("");
  const ledgerQ = useGetProjectLedger(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetProjectLedgerQueryKey(projectId),
    },
  });
  const ledger = ledgerQ.data;
  const projects = projectsQ.data ?? [];
  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">施工台帳</h1>
          <p className="text-sm text-muted-foreground mt-1">
            案件を選択して計画原価と実績原価、粗利を確認します。
          </p>
        </div>
        {selectedProject && (
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/projects/${selectedProject.id}`}>
              <ExternalLink className="w-4 h-4" />
              案件詳細を開く
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">案件を選択</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="max-w-xl">
              <SelectValue placeholder="案件を選択してください" />
            </SelectTrigger>
            <SelectContent>
              {projects.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground">
                  案件がまだありません
                </div>
              ) : (
                projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.unitNumber ? ` (${p.unitNumber})` : ""}
                    {p.code ? ` — ${p.code}` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!projectId ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {projectsQ.isLoading
              ? "読み込み中..."
              : "上のリストから案件を選択してください。"}
          </CardContent>
        </Card>
      ) : ledgerQ.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : ledgerQ.isError || !ledger ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-destructive">
            施工台帳の読み込みに失敗しました。
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs defaultValue="sheet" className="w-full">
            <TabsList>
              <TabsTrigger value="sheet">台帳形式</TabsTrigger>
              <TabsTrigger value="summary">サマリー</TabsTrigger>
            </TabsList>
            <TabsContent value="sheet" className="mt-3">
              {selectedProject && (
                <LedgerSpreadsheet ledger={ledger} project={selectedProject} />
              )}
            </TabsContent>
            <TabsContent value="summary" className="mt-3 space-y-6">
              <LedgerSummary ledger={ledger} />
              <Card>
            <CardHeader>
              <CardTitle className="text-base">原価明細</CardTitle>
              <CardDescription>
                編集・追加は案件詳細ページから行ってください。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ledger.entries.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  原価がまだ登録されていません。
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日付</TableHead>
                      <TableHead>カテゴリ</TableHead>
                      <TableHead>摘要</TableHead>
                      <TableHead>仕入先</TableHead>
                      <TableHead className="text-right">計画</TableHead>
                      <TableHead className="text-right">実績</TableHead>
                      <TableHead className="text-right">差異</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.entries.map((e) => {
                      const diff = e.actualAmount - e.plannedAmount;
                      const overrun = diff > 0;
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(e.entryDate)}
                          </TableCell>
                          <TableCell>
                            <CostCategoryBadge category={e.category} />
                          </TableCell>
                          <TableCell className="font-medium">
                            {e.description}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {e.vendor ?? "-"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(e.plannedAmount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(e.actualAmount)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${overrun ? "text-destructive font-medium" : "text-emerald-700"}`}
                          >
                            {overrun ? "+" : ""}
                            {formatCurrency(diff)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
