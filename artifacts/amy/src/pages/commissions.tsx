import { Fragment, useState } from "react";
import { Link } from "wouter";
import {
  useGetCommissions,
  type CommissionInvoiceLine,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Calculator, Calendar } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";

function todayMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

const KIND_LABEL: Record<CommissionInvoiceLine["kind"], string> = {
  sales: "営業歩合",
  supervisor: "監督歩合",
  other_sales_bonus: "他人売上ボーナス",
};

const KIND_COLOR: Record<CommissionInvoiceLine["kind"], string> = {
  sales: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  supervisor: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  other_sales_bonus: "bg-amber-100 text-amber-800 hover:bg-amber-100",
};

export default function CommissionsPage() {
  const [month, setMonth] = useState<string>(todayMonth());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data, isLoading } = useGetCommissions({ month });

  const totals = data?.totals;
  const people = data?.people ?? [];

  function toggle(name: string) {
    const next = new Set(expanded);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpanded(next);
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="w-6 h-6" />
            月次歩合
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            請求書の <strong>送付月</strong> を基準に、営業歩合・現場監督歩合・他人売上ボーナス
            (亘ルールなど) を担当者ごとに自動集計します。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            対象月
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ← 前月
            </Button>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || todayMonth())}
              className="w-40"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              翌月 →
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMonth(todayMonth())}
            >
              今月
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SummaryTile
                  label="営業歩合"
                  value={formatCurrency(totals?.salesCommission ?? 0)}
                  tone="blue"
                />
                <SummaryTile
                  label="現場監督歩合"
                  value={formatCurrency(totals?.supervisorCommission ?? 0)}
                  tone="emerald"
                  hint="竣工案件のみ"
                />
                <SummaryTile
                  label="他人売上ボーナス"
                  value={formatCurrency(totals?.otherSalesBonus ?? 0)}
                  tone="amber"
                  hint="例: 亘 2.5% (案件ごとに変更可)"
                />
              </div>
              {totals && (
                <p className="text-xs text-muted-foreground mt-3">
                  対象月の送付済請求書: {totals.invoiceCount}件 / 合計 ¥
                  {totals.invoiceTotal.toLocaleString()} (税込)
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">担当者別 内訳</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : people.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              対象月に送付済となった請求書がありません。
              <br />
              請求書一覧から「送付済」にすると、その日付がこの集計の基準になります。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead className="text-right">営業歩合</TableHead>
                  <TableHead className="text-right">監督歩合</TableHead>
                  <TableHead className="text-right">他人売上ボーナス</TableHead>
                  <TableHead className="text-right font-semibold">
                    合計
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => {
                  const isOpen = expanded.has(p.name);
                  return (
                    <Fragment key={p.name}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggle(p.name)}
                      >
                        <TableCell>
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {p.name}
                          {p.staffId == null && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px] py-0"
                            >
                              職人未登録
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.salesCommission > 0
                            ? formatCurrency(p.salesCommission)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.supervisorCommission > 0
                            ? formatCurrency(p.supervisorCommission)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.otherSalesBonus > 0
                            ? formatCurrency(p.otherSalesBonus)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatCurrency(p.total)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/20 p-0">
                            <div className="px-4 py-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-32">種別</TableHead>
                                    <TableHead>案件 / 請求書</TableHead>
                                    <TableHead>送付日</TableHead>
                                    <TableHead className="text-right">基礎額</TableHead>
                                    <TableHead className="text-right">率</TableHead>
                                    <TableHead className="text-right">歩合</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {p.lines.map((l, i) => (
                                    <TableRow key={`${l.invoiceId}-${l.kind}-${i}`}>
                                      <TableCell>
                                        <Badge className={KIND_COLOR[l.kind]}>
                                          {KIND_LABEL[l.kind]}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Link
                                          href={`/projects/${l.projectId}`}
                                          className="text-primary hover:underline"
                                        >
                                          {l.projectName}
                                        </Link>
                                        <div className="text-xs text-muted-foreground">
                                          {l.invoiceNumber || "—"}
                                          {l.note && (
                                            <span className="ml-2">
                                              · {l.note}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="tabular-nums text-xs">
                                        {formatDate(l.sentAt)}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {l.baseAmount != null
                                          ? formatCurrency(l.baseAmount)
                                          : "—"}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {l.rate.toFixed(1)}%
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums font-medium">
                                        {formatCurrency(l.amount)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="text-xs text-muted-foreground space-y-1 py-4">
          <p>
            <strong>計算ロジック:</strong>
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>
              <strong>営業歩合</strong> = 請求書(税込)合計 × 案件の営業歩合率。
              担当営業に計上。
            </li>
            <li>
              <strong>現場監督歩合</strong> = 規定超過粗利 × 案件の監督歩合率。
              <strong>竣工済案件のみ</strong>対象 (案件の最終請求書が当月送付の場合に1回計上)。
            </li>
            <li>
              <strong>他人売上ボーナス</strong> = 自分以外の営業が獲得した売上(税込) × 職人マスタの「他人売上ボーナス率」。
              職人ページで設定 (例: 亘 2.5%)。監督歩合分は含みません。
            </li>
            <li>
              送付月の判定は請求書の <strong>送付日</strong> です。請求一覧で「送付済」にした日付が記録され、後から個別に編集することもできます。
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "blue" | "emerald" | "amber" | "navy";
  hint?: string;
}) {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50",
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    navy: "border-slate-300 bg-slate-100",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
      {hint && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
      )}
    </div>
  );
}
