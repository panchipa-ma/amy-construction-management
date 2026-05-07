import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useGetCostPipeline,
  useListInvoices,
  ProjectStatus,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";
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
import { useMemo } from "react";
import { ExternalLink } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  estimating: "見積中",
  in_progress: "施工中",
  completed: "竣工",
  billed: "請求済",
  paid: "入金済",
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
        <div
          className={`text-lg lg:text-xl xl:text-2xl font-bold tabular-nums break-all leading-tight ${valueClass}`}
        >
          {value}
        </div>
        {hint && (
          <div className="text-xs text-muted-foreground mt-1 truncate">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const summaryQ = useGetDashboardSummary();
  const activityQ = useGetRecentActivity();
  const pipelineQ = useGetCostPipeline();
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  // Lazy fetch only when the dialog is opened.
  const invoicesQ = useListInvoices(undefined, {
    query: {
      enabled: openMonth !== null,
      queryKey: ["/api/invoices"],
    },
  });
  const monthInvoices = useMemo(() => {
    if (!openMonth || !invoicesQ.data) return [];
    return invoicesQ.data
      .filter(
        (inv) =>
          typeof inv.dueDate === "string" &&
          inv.dueDate.slice(0, 7) === openMonth,
      )
      .sort((a, b) =>
        (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
        a.invoiceNumber.localeCompare(b.invoiceNumber),
      );
  }, [openMonth, invoicesQ.data]);
  const monthLabel = openMonth
    ? `${openMonth.slice(0, 4)}年${Number(openMonth.slice(5, 7))}月`
    : "";
  const monthSummary = useMemo(() => {
    let total = 0;
    let paid = 0;
    let unpaid = 0;
    for (const inv of monthInvoices) {
      total += inv.total;
      if (inv.paid) paid += inv.total;
      else unpaid += inv.total;
    }
    return { total, paid, unpaid };
  }, [monthInvoices]);

  const summary = summaryQ.data;
  const activity = activityQ.data ?? [];
  const pipeline = pipelineQ.data ?? [];

  // Build a continuous 12-month window (current month +/- range) so empty
  // months still show as 0 — easier to read trends.
  const monthlyChart = useMemo(() => {
    const raw = summary?.monthlyInvoiceTotals ?? [];
    if (raw.length === 0) return [];
    const byMonth = new Map(raw.map((m) => [m.month, m]));
    // Range: from min(earliest, 5 months before today) to max(latest, 1 month after today)
    const today = new Date();
    const ymToday = today.getFullYear() * 12 + today.getMonth();
    const ymsRaw = raw.map((m) => {
      const [y, mo] = m.month.split("-").map(Number);
      return y * 12 + (mo - 1);
    });
    const ymMin = Math.min(ymToday - 5, ...ymsRaw);
    const ymMax = Math.max(ymToday + 1, ...ymsRaw);
    const result: {
      month: string;
      label: string;
      paidTotal: number;
      unpaidTotal: number;
      total: number;
      count: number;
      isCurrent: boolean;
    }[] = [];
    for (let ym = ymMin; ym <= ymMax; ym += 1) {
      const y = Math.floor(ym / 12);
      const m = (ym % 12) + 1;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const r = byMonth.get(key);
      result.push({
        month: key,
        label: `${y}/${String(m).padStart(2, "0")}`,
        paidTotal: r?.paidTotal ?? 0,
        unpaidTotal: r?.unpaidTotal ?? 0,
        total: r?.total ?? 0,
        count: r?.count ?? 0,
        isCurrent: ym === ymToday,
      });
    }
    return result;
  }, [summary?.monthlyInvoiceTotals]);

  const monthlyTotalAll = (summary?.monthlyInvoiceTotals ?? []).reduce(
    (s, m) => s + m.total,
    0,
  );

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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
          <CardTitle className="text-base">月別 請求金額 (支払期限ベース)</CardTitle>
          <CardDescription>
            請求書一覧の「金額 (税込)」を、各請求書の支払期限が属する月に集計しています。
            {summary?.invoicesWithoutDueDate?.count ? (
              <span className="text-amber-700">
                {" "}
                ※支払期限未設定 {summary.invoicesWithoutDueDate.count} 件 (
                {formatCurrency(summary.invoicesWithoutDueDate.total)}) は集計対象外です。
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summaryQ.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : monthlyChart.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              支払期限が設定された請求書がまだありません
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-2 tabular-nums">
                合計請求額 (集計分):{" "}
                <span className="font-semibold text-foreground">
                  {formatCurrency(monthlyTotalAll)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                月をクリックすると、その月の請求書一覧が表示されます。
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={monthlyChart}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) =>
                      v >= 10000 ? `${Math.round(v / 10000)}万` : String(v)
                    }
                    width={56}
                  />
                  <Tooltip
                    cursor={false}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "paidTotal"
                        ? "入金済"
                        : name === "unpaidTotal"
                          ? "未入金"
                          : name,
                    ]}
                    labelFormatter={(label: string) => `${label} 月 (クリックで詳細)`}
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === "paidTotal"
                        ? "入金済"
                        : value === "unpaidTotal"
                          ? "未入金"
                          : value
                    }
                  />
                  <Bar
                    dataKey="paidTotal"
                    stackId="amt"
                    fill="hsl(var(--chart-2, 142 71% 45%))"
                    radius={[0, 0, 0, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(d) => {
                      const p = (d as unknown as { payload?: { month?: string; count?: number } })?.payload;
                      if (p?.month && (p.count ?? 0) > 0) setOpenMonth(p.month);
                    }}
                  />
                  <Bar
                    dataKey="unpaidTotal"
                    stackId="amt"
                    fill="hsl(var(--chart-4, 38 92% 50%))"
                    radius={[4, 4, 0, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(d) => {
                      const p = (d as unknown as { payload?: { month?: string; count?: number } })?.payload;
                      if (p?.month && (p.count ?? 0) > 0) setOpenMonth(p.month);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>月</TableHead>
                      <TableHead className="text-right">件数</TableHead>
                      <TableHead className="text-right">入金済</TableHead>
                      <TableHead className="text-right">未入金</TableHead>
                      <TableHead className="text-right">合計</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyChart
                      .filter((m) => m.count > 0)
                      .map((m) => (
                        <TableRow
                          key={m.month}
                          className={`cursor-pointer hover:bg-muted ${m.isCurrent ? "bg-muted/50" : ""}`}
                          onClick={() => setOpenMonth(m.month)}
                        >
                          <TableCell className="font-medium">
                            <span className="hover:underline">{m.label}</span>
                            {m.isCurrent ? (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                (今月)
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.count}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700">
                            {formatCurrency(m.paidTotal)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-amber-700">
                            {formatCurrency(m.unpaidTotal)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatCurrency(m.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                      {a.actorName && <span> · {a.actorName}</span>}
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

      <Dialog open={openMonth !== null} onOpenChange={(o) => !o && setOpenMonth(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{monthLabel}に支払期限の請求書</DialogTitle>
            <DialogDescription>
              支払期限がこの月に設定されている請求書の一覧です。
            </DialogDescription>
          </DialogHeader>
          {invoicesQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : monthInvoices.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              この月の請求書はありません
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded border p-2">
                  <div className="text-muted-foreground">件数</div>
                  <div className="text-base font-semibold tabular-nums">
                    {monthInvoices.length} 件
                  </div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-muted-foreground">入金済</div>
                  <div className="text-base font-semibold tabular-nums text-emerald-700">
                    {formatCurrency(monthSummary.paid)}
                  </div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-muted-foreground">未入金</div>
                  <div className="text-base font-semibold tabular-nums text-amber-700">
                    {formatCurrency(monthSummary.unpaid)}
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>請求番号</TableHead>
                    <TableHead>案件</TableHead>
                    <TableHead>支払期限</TableHead>
                    <TableHead className="text-right">金額 (税込)</TableHead>
                    <TableHead>状態</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-medium hover:underline"
                          onClick={() => setOpenMonth(null)}
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="truncate max-w-[200px]">
                        {inv.projectName ?? "-"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(inv.dueDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(inv.total)}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setOpenMonth(null)}
                          title="開く"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                <span>
                  合計:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatCurrency(monthSummary.total)}
                  </span>
                </span>
                <Link
                  href="/invoices"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => setOpenMonth(null)}
                >
                  請求書一覧へ
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
