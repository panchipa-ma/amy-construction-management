import { formatCurrency, formatDate } from "@/lib/format";

const CAT_KEYS = ["material", "subcontract", "labor", "expense", "other"] as const;
type Cat = (typeof CAT_KEYS)[number];
const CAT_LABEL: Record<Cat, string> = {
  material: "材料費",
  subcontract: "外注費",
  labor: "労務費",
  expense: "経費",
  other: "その他",
};

type LedgerEntry = {
  id: string;
  category: string;
  description: string;
  vendor?: string | null;
  plannedAmount: number;
  actualAmount: number;
  entryDate: string;
};

type Ledger = {
  contractAmount: number;
  plannedCost: number;
  actualCost: number;
  grossProfit: number;
  grossProfitRate?: number | null;
  byCategory: { category: string; plannedAmount: number; actualAmount: number }[];
  entries: LedgerEntry[];
};

type Project = {
  code?: string | null;
  name: string;
  customerName?: string | null;
  siteAddress?: string | null;
  unitNumber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  salesCommissionRate?: number | null;
  salesRep?: string | null;
  siteSupervisor?: string | null;
};

const STANDARD_PROFIT_RATE = 0.20; // 規定利率 20%
const SUPERVISOR_COMMISSION_RATE = 0.30; // 監督歩合 30%

function pct(num: number, den: number): string {
  if (den === 0) return "-";
  return `${((num / den) * 100).toFixed(1)}%`;
}

export function LedgerSpreadsheet({
  ledger,
  project,
}: {
  ledger: Ledger;
  project: Project;
}) {
  // 受注 (planned) values
  const orderAmount = ledger.contractAmount;
  const orderCost = ledger.plannedCost;
  const orderProfit = orderAmount - orderCost;
  const orderProfitRate = orderAmount > 0 ? orderProfit / orderAmount : 0;

  // 締め (actual) values
  const actualCost = ledger.actualCost;
  const grossProfit = orderAmount - actualCost; // 粗利 (歩合控除前)

  // 営業歩合 = 売上 × 営業歩合率
  const salesCommissionRate = (project.salesCommissionRate ?? 5) / 100;
  const salesCommission = Math.round(orderAmount * salesCommissionRate);

  // 規定粗利額 = 売上 × 20% (規定利率)
  const standardProfit = Math.round(orderAmount * STANDARD_PROFIT_RATE);

  // 営業歩合控除後粗利
  const profitAfterSales = grossProfit - salesCommission;

  // 規定超過粗利 (営業歩合を引いた後で規定利率を超えた分)
  const excessProfit = Math.max(0, profitAfterSales - standardProfit);

  // 監督歩合 = 超過粗利 × 30%
  const supervisorCommission = Math.round(excessProfit * SUPERVISOR_COMMISSION_RATE);

  // 最終会社利益
  const finalProfit = grossProfit - salesCommission - supervisorCommission;
  const finalProfitRate = orderAmount > 0 ? finalProfit / orderAmount : 0;

  // 予算 column = 受注原価 (planned cost target)
  const budgetCost = orderCost;
  const budgetProfit = orderAmount - budgetCost;

  // build category column totals
  const totalsByCat: Record<Cat, number> = {
    material: 0,
    subcontract: 0,
    labor: 0,
    expense: 0,
    other: 0,
  };
  for (const e of ledger.entries) {
    const k = (CAT_KEYS as readonly string[]).includes(e.category)
      ? (e.category as Cat)
      : "other";
    totalsByCat[k] += e.actualAmount;
  }
  const grandTotal = Object.values(totalsByCat).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4 text-sm">
      {/* TOP ROW: 基本情報 (left) + 受注/予算/締め (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* 基本情報 */}
        <div className="border border-border overflow-hidden rounded-sm">
          <div className="bg-primary text-primary-foreground text-center py-1.5 font-semibold text-xs border-b border-border">
            基本情報
          </div>
          <table className="w-full border-collapse">
            <tbody className="[&_th]:bg-muted/50 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:w-28 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
              <tr>
                <th>契約番号</th>
                <td>{project.code ?? ""}</td>
                <th>担当現場監督</th>
                <td>{project.siteSupervisor ?? ""}</td>
              </tr>
              <tr>
                <th>担当営業</th>
                <td>{project.salesRep ?? ""}</td>
                <th>営業歩合率</th>
                <td className="tabular-nums">{(project.salesCommissionRate ?? 5).toFixed(1)}%</td>
              </tr>
              <tr>
                <th>案件名</th>
                <td colSpan={3}>
                  {project.name}
                  {project.unitNumber ? `　${project.unitNumber}` : ""}
                </td>
              </tr>
              <tr>
                <th>顧客名</th>
                <td colSpan={3}>{project.customerName ?? ""}</td>
              </tr>
              <tr>
                <th>工事場所</th>
                <td colSpan={3}>{project.siteAddress ?? ""}</td>
              </tr>
              <tr>
                <th>着工日</th>
                <td>
                  {project.startDate ? formatDate(project.startDate) : ""}
                </td>
                <th>引渡日</th>
                <td>{project.endDate ? formatDate(project.endDate) : ""}</td>
              </tr>
              <tr>
                <th>備考</th>
                <td colSpan={3} className="min-h-[2.5rem] align-top">
                  <div className="whitespace-pre-wrap min-h-[2.5rem]">
                    {project.notes ?? ""}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 受注 / 予算 / 締め — 3 columns × 4 rows, compact */}
        <div className="border border-border overflow-hidden rounded-sm">
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-[68px]" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="text-xs">
                <th className="border border-border bg-muted/50 px-1.5 py-1.5"></th>
                <th className="border border-border bg-primary text-primary-foreground px-2 py-1.5 text-center font-semibold">
                  受注 (計画)
                </th>
                <th className="border border-border bg-primary text-primary-foreground px-2 py-1.5 text-center font-semibold">
                  予算
                </th>
                <th className="border border-border bg-accent text-accent-foreground px-2 py-1.5 text-center font-semibold">
                  締め (実績)
                </th>
              </tr>
            </thead>
            <tbody className="text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-muted/50 [&_th]:text-left [&_th]:font-medium tabular-nums whitespace-nowrap">
              <tr>
                <th>売上</th>
                <td className="text-right">{formatCurrency(orderAmount)}</td>
                <td className="text-right">{formatCurrency(orderAmount)}</td>
                <td className="text-right font-medium">{formatCurrency(orderAmount)}</td>
              </tr>
              <tr>
                <th>原価</th>
                <td className="text-right">{formatCurrency(orderCost)}</td>
                <td className="text-right">{formatCurrency(budgetCost)}</td>
                <td className="text-right font-medium">{formatCurrency(actualCost)}</td>
              </tr>
              <tr>
                <th>粗利</th>
                <td className="text-right">{formatCurrency(orderProfit)}</td>
                <td className="text-right">{formatCurrency(budgetProfit)}</td>
                <td className={`text-right font-semibold ${grossProfit < 0 ? "text-destructive" : "text-accent"}`}>
                  {formatCurrency(grossProfit)}
                </td>
              </tr>
              <tr>
                <th>粗利率</th>
                <td className="text-right">{pct(orderProfit, orderAmount)}</td>
                <td className="text-right">{pct(budgetProfit, orderAmount)}</td>
                <td className={`text-right font-semibold ${grossProfit < 0 ? "text-destructive" : "text-accent"}`}>
                  {pct(grossProfit, orderAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 月次サマリー */}
      {ledger.entries.length > 0 && (
        <div className="border border-border overflow-hidden rounded-sm">
          <div className="bg-primary text-primary-foreground text-center py-1.5 font-semibold text-xs border-b border-border">
            月次サマリー (進捗ベースで売上を案分)
          </div>
          <div className="overflow-x-auto">
            <MonthlyBreakdown ledger={ledger} />
          </div>
        </div>
      )}

      {/* 歩合・最終利益 */}
      <div className="border border-border overflow-hidden rounded-sm">
        <div className="bg-accent text-accent-foreground text-center py-1.5 font-semibold text-xs border-b border-border">
          歩合・最終利益 (規定利率 20% / 監督歩合 30%)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead className="bg-muted/50">
              <tr className="[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-medium">
                <th className="text-left">項目</th>
                <th className="text-right w-32">金額</th>
                <th className="text-right w-20">率</th>
                <th className="text-left">計算式</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
              <tr>
                <td className="font-medium">売上</td>
                <td className="text-right">{formatCurrency(orderAmount)}</td>
                <td className="text-right text-muted-foreground">100.0%</td>
                <td className="text-muted-foreground">受注金額</td>
              </tr>
              <tr>
                <td className="font-medium">実原価</td>
                <td className="text-right text-destructive">−{formatCurrency(actualCost)}</td>
                <td className="text-right text-muted-foreground">{pct(actualCost, orderAmount)}</td>
                <td className="text-muted-foreground">原価明細 実績合計</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="font-semibold">粗利</td>
                <td className={`text-right font-semibold ${grossProfit < 0 ? "text-destructive" : ""}`}>
                  {formatCurrency(grossProfit)}
                </td>
                <td className="text-right">{pct(grossProfit, orderAmount)}</td>
                <td className="text-muted-foreground">売上 − 実原価</td>
              </tr>
              <tr>
                <td className="font-medium">営業歩合 ({(salesCommissionRate * 100).toFixed(1)}%)</td>
                <td className="text-right text-destructive">−{formatCurrency(salesCommission)}</td>
                <td className="text-right text-muted-foreground">{(salesCommissionRate * 100).toFixed(1)}%</td>
                <td className="text-muted-foreground">売上 × 営業歩合率 ({project.salesRep ?? "担当営業"})</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="font-medium">営業歩合控除後 粗利</td>
                <td className={`text-right ${profitAfterSales < 0 ? "text-destructive" : ""}`}>
                  {formatCurrency(profitAfterSales)}
                </td>
                <td className="text-right">{pct(profitAfterSales, orderAmount)}</td>
                <td className="text-muted-foreground">粗利 − 営業歩合</td>
              </tr>
              <tr>
                <td className="font-medium">規定粗利額 (20%)</td>
                <td className="text-right text-muted-foreground">{formatCurrency(standardProfit)}</td>
                <td className="text-right text-muted-foreground">20.0%</td>
                <td className="text-muted-foreground">売上 × 規定利率</td>
              </tr>
              <tr>
                <td className="font-medium">規定超過粗利</td>
                <td className={`text-right ${excessProfit > 0 ? "text-emerald-700 font-medium" : "text-muted-foreground"}`}>
                  {formatCurrency(excessProfit)}
                </td>
                <td className="text-right text-muted-foreground">{pct(excessProfit, orderAmount)}</td>
                <td className="text-muted-foreground">max(0, 営業歩合控除後粗利 − 規定粗利額)</td>
              </tr>
              <tr>
                <td className="font-medium">監督歩合 (30%)</td>
                <td className="text-right text-destructive">−{formatCurrency(supervisorCommission)}</td>
                <td className="text-right text-muted-foreground">{pct(supervisorCommission, orderAmount)}</td>
                <td className="text-muted-foreground">規定超過粗利 × 30% ({project.siteSupervisor ?? "担当監督"})</td>
              </tr>
              <tr className="bg-accent/10">
                <td className="font-bold">最終会社利益</td>
                <td className={`text-right font-bold ${finalProfit < 0 ? "text-destructive" : "text-accent"}`}>
                  {formatCurrency(finalProfit)}
                </td>
                <td className={`text-right font-bold ${finalProfit < 0 ? "text-destructive" : ""}`}>
                  {pct(finalProfit, orderAmount)}
                </td>
                <td className="text-muted-foreground">粗利 − 営業歩合 − 監督歩合</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 原価明細 */}
      <div className="border border-border overflow-hidden rounded-sm">
        <div className="bg-secondary text-secondary-foreground px-3 py-1.5 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-semibold">原価明細</span>
          <div className="flex gap-4 text-xs tabular-nums">
            {CAT_KEYS.map((k) => (
              <div key={k} className="flex gap-1.5">
                <span className="text-muted-foreground">{CAT_LABEL[k]}:</span>
                <span className="font-medium">{formatCurrency(totalsByCat[k])}</span>
              </div>
            ))}
            <div className="flex gap-1.5">
              <span className="text-muted-foreground">合計:</span>
              <span className="font-bold">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead className="bg-muted/50">
              <tr className="[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-medium">
                <th className="w-10">No</th>
                <th className="w-20">日付</th>
                <th className="w-32 text-left">業者名</th>
                <th className="text-left">内容</th>
                <th className="w-24 text-right">材料費</th>
                <th className="w-24 text-right">外注費</th>
                <th className="w-24 text-right">労務費</th>
                <th className="w-24 text-right">経費</th>
                <th className="w-24 text-right">その他</th>
                <th className="w-24 text-right">合計</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
              {ledger.entries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-muted-foreground py-6">
                    原価がまだ登録されていません。
                  </td>
                </tr>
              ) : (
                ledger.entries.map((e, i) => {
                  const k = (CAT_KEYS as readonly string[]).includes(e.category)
                    ? (e.category as Cat)
                    : "other";
                  const amt = e.actualAmount;
                  const cell = (key: Cat) =>
                    k === key && amt !== 0 ? formatCurrency(amt) : "";
                  return (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="text-center text-muted-foreground">{i + 1}</td>
                      <td className="whitespace-nowrap">{formatDate(e.entryDate)}</td>
                      <td>{e.vendor ?? ""}</td>
                      <td>{e.description}</td>
                      <td className="text-right">{cell("material")}</td>
                      <td className="text-right">{cell("subcontract")}</td>
                      <td className="text-right">{cell("labor")}</td>
                      <td className="text-right">{cell("expense")}</td>
                      <td className="text-right">{cell("other")}</td>
                      <td className="text-right font-medium bg-amber-50/50 dark:bg-amber-950/20">
                        {formatCurrency(amt)}
                      </td>
                    </tr>
                  );
                })
              )}
              {/* totals row */}
              {ledger.entries.length > 0 && (
                <tr className="bg-muted/40 font-semibold">
                  <td colSpan={4} className="text-right">合計</td>
                  <td className="text-right">{formatCurrency(totalsByCat.material)}</td>
                  <td className="text-right">{formatCurrency(totalsByCat.subcontract)}</td>
                  <td className="text-right">{formatCurrency(totalsByCat.labor)}</td>
                  <td className="text-right">{formatCurrency(totalsByCat.expense)}</td>
                  <td className="text-right">{formatCurrency(totalsByCat.other)}</td>
                  <td className="text-right bg-accent/15 text-accent">
                    {formatCurrency(grandTotal)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MonthlyBreakdown({ ledger }: { ledger: Ledger }) {
  // Group entries by YYYY-MM, aggregate actual cost.
  const buckets = new Map<string, number>();
  for (const e of ledger.entries) {
    const ym = (e.entryDate ?? "").slice(0, 7); // YYYY-MM
    if (!ym) continue;
    buckets.set(ym, (buckets.get(ym) ?? 0) + (e.actualAmount ?? 0));
  }
  const months = Array.from(buckets.keys()).sort();
  if (months.length === 0) return null;

  const totalActualCost = ledger.actualCost || months.reduce((a, m) => a + (buckets.get(m) ?? 0), 0);
  // Use planned cost as denominator for revenue allocation; fallback to actual total.
  const denomCost = ledger.plannedCost > 0 ? ledger.plannedCost : totalActualCost;

  let cumCost = 0;
  let cumRevenue = 0;
  const rows = months.map((m) => {
    const cost = buckets.get(m) ?? 0;
    cumCost += cost;
    const ratio = denomCost > 0 ? cost / denomCost : 0;
    const revenue = Math.round(ledger.contractAmount * ratio);
    cumRevenue += revenue;
    const profit = revenue - cost;
    return { m, cost, revenue, profit, cumCost, cumRevenue };
  });
  const sumCost = rows.reduce((a, r) => a + r.cost, 0);
  const sumRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const sumProfit = sumRevenue - sumCost;

  return (
    <table className="w-full border-collapse text-xs tabular-nums whitespace-nowrap">
      <thead className="bg-muted/50">
        <tr className="[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-medium">
          <th className="text-left w-24">月</th>
          <th className="text-right">当月売上 (案分)</th>
          <th className="text-right">当月原価</th>
          <th className="text-right">当月粗利</th>
          <th className="text-right">粗利率</th>
          <th className="text-right">累計売上</th>
          <th className="text-right">累計原価</th>
        </tr>
      </thead>
      <tbody className="[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
        {rows.map((r) => (
          <tr key={r.m} className="hover:bg-muted/30">
            <td className="font-medium">
              {r.m.replace("-", "年")}月
            </td>
            <td className="text-right">{formatCurrency(r.revenue)}</td>
            <td className="text-right text-destructive">−{formatCurrency(r.cost)}</td>
            <td className={`text-right font-medium ${r.profit < 0 ? "text-destructive" : "text-accent"}`}>
              {formatCurrency(r.profit)}
            </td>
            <td className="text-right text-muted-foreground">
              {r.revenue > 0 ? `${((r.profit / r.revenue) * 100).toFixed(1)}%` : "-"}
            </td>
            <td className="text-right text-muted-foreground">{formatCurrency(r.cumRevenue)}</td>
            <td className="text-right text-muted-foreground">{formatCurrency(r.cumCost)}</td>
          </tr>
        ))}
        <tr className="bg-accent/10 font-semibold">
          <td>合計</td>
          <td className="text-right">{formatCurrency(sumRevenue)}</td>
          <td className="text-right text-destructive">−{formatCurrency(sumCost)}</td>
          <td className={`text-right ${sumProfit < 0 ? "text-destructive" : "text-accent"}`}>
            {formatCurrency(sumProfit)}
          </td>
          <td className="text-right">
            {sumRevenue > 0 ? `${((sumProfit / sumRevenue) * 100).toFixed(1)}%` : "-"}
          </td>
          <td className="text-right">{formatCurrency(sumRevenue)}</td>
          <td className="text-right">{formatCurrency(sumCost)}</td>
        </tr>
      </tbody>
    </table>
  );
}
