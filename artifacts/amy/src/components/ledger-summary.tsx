import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
} from "lucide-react";

const COST_CATEGORY_LABEL: Record<string, string> = {
  material: "材料費",
  subcontract: "外注費",
  labor: "労務費",
  expense: "経費",
  other: "その他",
};

type Ledger = {
  contractAmount: number;
  plannedCost: number;
  actualCost: number;
  grossProfit: number;
  grossProfitRate?: number | null;
  byCategory: { category: string; plannedAmount: number; actualAmount: number }[];
};

export function LedgerSummary({ ledger }: { ledger: Ledger }) {
  const remaining = ledger.plannedCost - ledger.actualCost;
  const consumeRate =
    ledger.plannedCost > 0
      ? (ledger.actualCost / ledger.plannedCost) * 100
      : 0;
  const overrun = ledger.actualCost > ledger.plannedCost;
  const overrunAmount = ledger.actualCost - ledger.plannedCost;
  const profitable = ledger.grossProfit >= 0;

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className={`border-l-4 ${profitable ? "border-l-emerald-600" : "border-l-destructive"}`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs flex items-center gap-1.5">
                {profitable ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                粗利
              </CardDescription>
              <Badge
                variant="outline"
                className={
                  profitable
                    ? "text-emerald-700 border-emerald-300"
                    : "text-destructive border-destructive/50"
                }
              >
                {formatPercent(ledger.grossProfitRate)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold tabular-nums ${profitable ? "text-emerald-700" : "text-destructive"}`}
            >
              {formatCurrency(ledger.grossProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              契約金額 − 実績原価
            </p>
          </CardContent>
        </Card>

        <Card
          className={`border-l-4 ${remaining < 0 ? "border-l-destructive" : "border-l-primary"}`}
        >
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              残予算（契約金額に対する）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold tabular-nums ${remaining < 0 ? "text-destructive" : ""}`}
            >
              {formatCurrency(remaining)}
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>消化率</span>
                <span className="tabular-nums">
                  {consumeRate.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={Math.min(consumeRate, 100)}
                className={consumeRate > 100 ? "bg-destructive/20" : ""}
              />
            </div>
          </CardContent>
        </Card>

        <Card
          className={`border-l-4 ${overrun ? "border-l-amber-500" : "border-l-emerald-600"}`}
        >
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              {overrun && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
              計画 vs 実績
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tabular-nums">
                {formatCurrency(ledger.actualCost)}
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">
                / {formatCurrency(ledger.plannedCost)}
              </div>
            </div>
            <p
              className={`text-xs mt-1 ${overrun ? "text-amber-700 font-medium" : "text-emerald-700"}`}
            >
              {overrun
                ? `予算オーバー +${formatCurrency(overrunAmount)}`
                : `予算内 ${formatCurrency(-overrunAmount)} 余裕`}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              契約金額: {formatCurrency(ledger.contractAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">カテゴリ別 予算消化状況</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ledger.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              カテゴリの計上がまだありません。
            </p>
          ) : (
            ledger.byCategory.map((c) => {
              const rate =
                c.plannedAmount > 0
                  ? (c.actualAmount / c.plannedAmount) * 100
                  : c.actualAmount > 0
                    ? 100
                    : 0;
              const over = c.actualAmount > c.plannedAmount;
              return (
                <div key={c.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {COST_CATEGORY_LABEL[c.category] ?? c.category}
                      </span>
                      {over && (
                        <Badge
                          variant="outline"
                          className="text-amber-700 border-amber-300 text-xs"
                        >
                          予算超過
                        </Badge>
                      )}
                    </div>
                    <div className="tabular-nums text-muted-foreground">
                      <span
                        className={`font-medium ${over ? "text-amber-700" : "text-foreground"}`}
                      >
                        {formatCurrency(c.actualAmount)}
                      </span>
                      <span className="mx-1">/</span>
                      <span>{formatCurrency(c.plannedAmount)}</span>
                      <span className="ml-2 text-xs">
                        ({rate.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <Progress
                      value={Math.min(rate, 100)}
                      className={over ? "bg-amber-100" : ""}
                    />
                    {over && rate > 100 && (
                      <div
                        className="absolute top-0 right-0 h-full bg-amber-500/40 rounded-r-full"
                        style={{
                          width: `${Math.min(((rate - 100) / 100) * 100, 30)}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
