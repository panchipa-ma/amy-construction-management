import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useGetCostPipeline,
  ProjectStatus,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { ProjectStatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const STATUS_LABEL: Record<string, string> = {
  estimating: "見積中",
  contracted: "受注",
  in_progress: "施工中",
  completed: "竣工",
  archived: "完了",
};

function KpiCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-destructive"
        : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tabular-nums ${valueClass}`}>
          {value}
        </div>
        {hint && (
          <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const summaryQ = useGetDashboardSummary();
  const activityQ = useGetRecentActivity();
  const pipelineQ = useGetCostPipeline();

  const summary = summaryQ.data;
  const activity = activityQ.data ?? [];
  const pipeline = pipelineQ.data ?? [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-muted-foreground mt-1">
          進行中案件の状況と原価をひと目で確認できます。
        </p>
      </div>

      {summaryQ.isLoading || !summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              title="進行中案件"
              value={`${summary.activeProjects} 件`}
              hint={`今月竣工 ${summary.completedThisMonth} 件`}
            />
            <KpiCard
              title="契約金額 (進行中)"
              value={formatCurrency(summary.contractValueActive)}
            />
            <KpiCard
              title="計画 / 実績原価"
              value={formatCurrency(summary.actualCostActive)}
              hint={`計画 ${formatCurrency(summary.plannedCostActive)}`}
              tone={
                summary.actualCostActive > summary.plannedCostActive
                  ? "negative"
                  : "default"
              }
            />
            <KpiCard
              title="粗利 (進行中)"
              value={formatCurrency(summary.grossProfitActive)}
              tone={summary.grossProfitActive >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">未入金請求</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-amber-700">
                  {formatCurrency(summary.unpaidInvoiceTotal)}
                </div>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">ステータス別件数</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart
                    data={summary.statusBreakdown.map((s) => ({
                      status: STATUS_LABEL[s.status] ?? s.status,
                      count: s.count,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">原価パイプライン (進行中案件)</CardTitle>
          <CardDescription>計画原価と実績原価の比較</CardDescription>
        </CardHeader>
        <CardContent>
          {pipelineQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : pipeline.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              進行中の案件はありません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案件</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">契約金額</TableHead>
                  <TableHead className="text-right">計画原価</TableHead>
                  <TableHead className="text-right">実績原価</TableHead>
                  <TableHead className="text-right">粗利</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipeline.map((p) => {
                  const profit = p.contractAmount - p.actualCost;
                  const overrun = p.actualCost > p.plannedCost;
                  return (
                    <TableRow key={p.projectId}>
                      <TableCell>
                        <Link
                          href={`/projects/${p.projectId}`}
                          className="font-medium hover:underline"
                        >
                          {p.projectName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={p.status as ProjectStatus} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(p.contractAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(p.plannedCost)}
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近のアクティビティ</CardTitle>
        </CardHeader>
        <CardContent>
          {activityQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : activity.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              アクティビティはまだありません
            </div>
          ) : (
            <ul className="divide-y">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.projectName && (
                        <Link
                          href={`/projects/${a.projectId}`}
                          className="hover:underline"
                        >
                          {a.projectName}
                        </Link>
                      )}
                      {a.subtitle && <span> · {a.subtitle}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(a.timestamp)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
