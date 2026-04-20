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
};

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
  const finalCost = ledger.actualCost;
  const finalProfit = orderAmount - finalCost;
  const finalProfitRate = orderAmount > 0 ? finalProfit / orderAmount : 0;

  // 予算 column = 受注原価 (planned cost target)
  const budgetCost = orderCost;
  const budgetProfit = orderAmount - budgetCost;
  const budgetProfitRate = orderAmount > 0 ? budgetProfit / orderAmount : 0;

  // 歩合 (vs planned) — diff between actual and planned profit
  const profitDiff = finalProfit - orderProfit;

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 基本情報 */}
        <div className="border border-border overflow-hidden">
          <div className="bg-sky-100 dark:bg-sky-900/40 text-center py-1.5 font-semibold text-xs border-b border-border">
            基本情報
          </div>
          <table className="w-full border-collapse">
            <tbody className="[&_th]:bg-muted/50 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:w-28 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
              <tr>
                <th>契約番号</th>
                <td>{project.code ?? ""}</td>
                <th>主担当者</th>
                <td></td>
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

        {/* 受注 / 予算 / 締め */}
        <div className="border border-border overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-xs">
                <th className="border border-border bg-muted/50 px-2 py-1.5 w-24"></th>
                <th className="border border-border bg-sky-100 dark:bg-sky-900/40 px-2 py-1.5 text-center" colSpan={2}>
                  受注
                </th>
                <th className="border border-border bg-sky-100 dark:bg-sky-900/40 px-2 py-1.5 text-center" colSpan={2}>
                  予算
                </th>
                <th className="border border-border bg-sky-100 dark:bg-sky-900/40 px-2 py-1.5 text-center" colSpan={2}>
                  締め
                </th>
              </tr>
            </thead>
            <tbody className="text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-muted/50 [&_th]:text-left [&_th]:font-medium tabular-nums">
              <tr>
                <th>金額</th>
                <th className="!font-medium !bg-muted/50">受注金額</th>
                <td className="text-right">{formatCurrency(orderAmount)}</td>
                <th className="!font-medium !bg-muted/50">予算金額</th>
                <td className="text-right">{formatCurrency(orderAmount)}</td>
                <th className="!font-medium !bg-muted/50">利益</th>
                <td className="text-right">{formatCurrency(finalProfit)}</td>
              </tr>
              <tr>
                <th>原価</th>
                <th className="!font-medium !bg-muted/50">受注原価</th>
                <td className="text-right">{formatCurrency(orderCost)}</td>
                <th className="!font-medium !bg-muted/50">予算原価</th>
                <td className="text-right">{formatCurrency(budgetCost)}</td>
                <th className="!font-medium !bg-muted/50">歩合</th>
                <td className={`text-right ${profitDiff < 0 ? "text-destructive font-medium" : ""}`}>
                  {profitDiff >= 0 ? "+" : ""}
                  {formatCurrency(profitDiff)}
                </td>
              </tr>
              <tr>
                <th>粗利額</th>
                <th className="!font-medium !bg-muted/50">受注粗利額</th>
                <td className="text-right">{formatCurrency(orderProfit)}</td>
                <th className="!font-medium !bg-muted/50">予算粗利額</th>
                <td className="text-right">{formatCurrency(budgetProfit)}</td>
                <th className="!font-medium !bg-muted/50">最終粗利額</th>
                <td className={`text-right font-semibold ${finalProfit < 0 ? "text-destructive" : "text-emerald-700"}`}>
                  {formatCurrency(finalProfit)}
                </td>
              </tr>
              <tr>
                <th>粗利率</th>
                <th className="!font-medium !bg-muted/50">受注粗利率</th>
                <td className="text-right">{pct(orderProfit, orderAmount)}</td>
                <th className="!font-medium !bg-muted/50">予算粗利率</th>
                <td className="text-right">{pct(budgetProfit, orderAmount)}</td>
                <th className="!font-medium !bg-muted/50">最終粗利率</th>
                <td className={`text-right font-semibold ${finalProfitRate < 0 ? "text-destructive" : ""}`}>
                  {pct(finalProfit, orderAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 原価明細 */}
      <div className="border border-border overflow-hidden">
        <div className="bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 border-b border-border flex items-center justify-between">
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
                  <td className="text-right bg-amber-100/60 dark:bg-amber-900/40">
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
