import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  EditableText,
  EditableNumber,
  EditableDate,
  focusNextEditableInput,
} from "@/components/editable-cell";
import {
  PROJECT_STATUS_OPTIONS,
} from "@/components/project-status-select";
import { ProjectStatus } from "@workspace/api-client-react";

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
  status?: string;
  customerId?: string;
  customerName?: string | null;
  siteAddress?: string | null;
  unitNumber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  contractAmount?: number;
  salesCommissionRate?: number | null;
  standardProfitRate?: number | null;
  supervisorCommissionRate?: number | null;
  otherSalesBonusRecipient?: string | null;
  otherSalesBonusRate?: number | null;
  salesRep?: string | null;
  siteSupervisor?: string | null;
  ledgerCompletedAt?: string | null;
};

type CustomerOption = { id: string; name: string };

export type CostEntryPatch = Partial<{
  category: Cat;
  description: string;
  vendor: string | null;
  plannedAmount: number;
  actualAmount: number;
  entryDate: string;
  notes: string | null;
}>;

export type ProjectPatch = Partial<{
  code: string | null;
  name: string;
  status: ProjectStatus;
  customerId: string;
  siteAddress: string | null;
  unitNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  contractAmount: number;
  salesCommissionRate: number | null;
  standardProfitRate: number | null;
  supervisorCommissionRate: number | null;
  otherSalesBonusRecipient: string | null;
  otherSalesBonusRate: number | null;
  salesRep: string | null;
  siteSupervisor: string | null;
  notes: string | null;
  ledgerCompletedAt: string | null;
}>;

export type CreateCostEntryDraft = {
  category: Cat;
  description: string;
  vendor: string | null;
  plannedAmount: number;
  actualAmount: number;
  entryDate: string;
};

const DEFAULT_STANDARD_PROFIT_RATE = 0.20;
const DEFAULT_SUPERVISOR_COMMISSION_RATE = 0.30;

function pct(num: number, den: number): string {
  if (den === 0) return "-";
  return `${((num / den) * 100).toFixed(1)}%`;
}

export function LedgerSpreadsheet({
  ledger,
  project,
  customers,
  onProjectUpdate,
  onCostEntryUpdate,
  onCostEntryCreate,
  onCostEntryDelete,
}: {
  ledger: Ledger;
  project: Project;
  customers?: CustomerOption[];
  onProjectUpdate?: (patch: ProjectPatch) => void | Promise<void>;
  onCostEntryUpdate?: (id: string, patch: CostEntryPatch) => void | Promise<void>;
  onCostEntryCreate?: (draft: CreateCostEntryDraft) => void | Promise<void>;
  onCostEntryDelete?: (id: string) => void | Promise<void>;
}) {
  const editable = !!onProjectUpdate;

  const orderAmount = ledger.contractAmount;
  const orderCost = ledger.plannedCost;

  const actualCost = ledger.actualCost;
  const grossProfit = orderAmount - actualCost;

  const salesCommissionRate = (project.salesCommissionRate ?? 5) / 100;
  const salesCommission = Math.round(orderAmount * salesCommissionRate);
  const orderProfit = orderAmount - orderCost - salesCommission;

  const standardProfitRate =
    project.standardProfitRate != null
      ? project.standardProfitRate / 100
      : DEFAULT_STANDARD_PROFIT_RATE;
  const standardProfit = Math.round(orderAmount * standardProfitRate);
  const profitAfterSales = grossProfit - salesCommission;
  const excessProfit = Math.max(0, profitAfterSales - standardProfit);
  const supervisorCommissionRate =
    project.supervisorCommissionRate != null
      ? project.supervisorCommissionRate / 100
      : DEFAULT_SUPERVISOR_COMMISSION_RATE;
  const supervisorCommission = Math.round(
    excessProfit * supervisorCommissionRate,
  );

  const finalProfit = grossProfit - salesCommission - supervisorCommission;

  // 営業歩合控除後にも規定粗利率を確保できる原価上限。
  const budgetCost = orderCost;
  const budgetProfit = orderAmount - budgetCost - salesCommission;

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
    <div className="w-full min-w-0 space-y-4 text-sm">
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
                <td>
                  {editable ? (
                    <EditableText
                      value={project.code ?? ""}
                      onSave={(v) => onProjectUpdate!({ code: v || null })}
                    />
                  ) : (
                    project.code ?? ""
                  )}
                </td>
                <th>規定利率</th>
                <td className="tabular-nums">
                  {editable ? (
                    <div className="flex items-center justify-end gap-1">
                      <EditableNumber
                        value={project.standardProfitRate ?? 20}
                        onSave={(v) =>
                          onProjectUpdate!({ standardProfitRate: v })
                        }
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                  ) : (
                    `${(project.standardProfitRate ?? 20).toFixed(1)}%`
                  )}
                </td>
              </tr>
              <tr>
                <th>担当営業</th>
                <td>
                  {editable ? (
                    <EditableText
                      value={project.salesRep ?? ""}
                      onSave={(v) =>
                        onProjectUpdate!({ salesRep: v || null })
                      }
                    />
                  ) : (
                    project.salesRep ?? ""
                  )}
                </td>
                <th>営業歩合率</th>
                <td className="tabular-nums">
                  {editable ? (
                    <div className="flex items-center justify-end gap-1">
                      <EditableNumber
                        value={project.salesCommissionRate ?? 5}
                        onSave={(v) =>
                          onProjectUpdate!({ salesCommissionRate: v })
                        }
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                  ) : (
                    `${(project.salesCommissionRate ?? 5).toFixed(1)}%`
                  )}
                </td>
              </tr>
              <tr>
                <th>担当現場監督</th>
                <td>
                  {editable ? (
                    <EditableText
                      value={project.siteSupervisor ?? ""}
                      onSave={(v) =>
                        onProjectUpdate!({ siteSupervisor: v || null })
                      }
                    />
                  ) : (
                    project.siteSupervisor ?? ""
                  )}
                </td>
                <th>監督歩合率</th>
                <td className="tabular-nums">
                  {editable ? (
                    <div className="flex items-center justify-end gap-1">
                      <EditableNumber
                        value={project.supervisorCommissionRate ?? 30}
                        onSave={(v) =>
                          onProjectUpdate!({ supervisorCommissionRate: v })
                        }
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                  ) : (
                    `${(project.supervisorCommissionRate ?? 30).toFixed(1)}%`
                  )}
                </td>
              </tr>
              <tr>
                <th>マネジメント報酬</th>
                <td colSpan={3}>
                  {editable ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">受取人:</span>
                      <EditableText
                        value={project.otherSalesBonusRecipient ?? ""}
                        onSave={(v) =>
                          onProjectUpdate!({
                            otherSalesBonusRecipient: v || null,
                          })
                        }
                        placeholder="例: 亘 (空欄でボーナスなし)"
                        inputClassName="max-w-32"
                      />
                      <span className="text-xs text-muted-foreground ml-2">率:</span>
                      <EditableNumber
                        value={project.otherSalesBonusRate ?? 0}
                        onSave={(v) =>
                          onProjectUpdate!({
                            otherSalesBonusRate: v > 0 ? v : null,
                          })
                        }
                      />
                      <span className="text-muted-foreground">%</span>
                      <span className="text-xs text-muted-foreground">
                        (営業歩合から差し引かれます)
                      </span>
                    </div>
                  ) : project.otherSalesBonusRecipient && project.otherSalesBonusRate ? (
                    `${project.otherSalesBonusRecipient} へ ${project.otherSalesBonusRate.toFixed(1)}%`
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
              <tr>
                <th>案件名</th>
                <td colSpan={3}>
                  {editable ? (
                    <div className="flex gap-2">
                      <EditableText
                        required
                        value={project.name}
                        onSave={(v) =>
                          v && onProjectUpdate!({ name: v })
                        }
                      />
                      <span className="text-muted-foreground shrink-0">
                        部屋:
                      </span>
                      <EditableText
                        value={project.unitNumber ?? ""}
                        onSave={(v) =>
                          onProjectUpdate!({ unitNumber: v || null })
                        }
                        inputClassName="max-w-32"
                      />
                    </div>
                  ) : (
                    <>
                      {project.name}
                      {project.unitNumber ? `　${project.unitNumber}` : ""}
                    </>
                  )}
                </td>
              </tr>
              <tr>
                <th>顧客名</th>
                <td colSpan={3}>
                  {editable && customers && customers.length > 0 ? (
                    <Select
                      value={project.customerId ?? ""}
                      onValueChange={(v) =>
                        onProjectUpdate!({ customerId: v })
                      }
                    >
                      <SelectTrigger className="h-7 w-full text-xs border-0 shadow-none focus:ring-1 px-1">
                        <SelectValue placeholder="顧客を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    (project.customerName ?? "")
                  )}
                </td>
              </tr>
              <tr>
                <th>ステータス</th>
                <td colSpan={3}>
                  {editable ? (
                    <Select
                      value={project.status ?? ""}
                      onValueChange={(v) =>
                        onProjectUpdate!({ status: v as ProjectStatus })
                      }
                    >
                      <SelectTrigger className="h-7 w-48 text-xs border-0 shadow-none focus:ring-1 px-1">
                        <SelectValue placeholder="ステータス" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    (PROJECT_STATUS_OPTIONS.find(
                      (o) => o.value === project.status,
                    )?.label ?? project.status ?? "")
                  )}
                </td>
              </tr>
              <tr>
                <th>工事場所</th>
                <td colSpan={3}>
                  {editable ? (
                    <EditableText
                      value={project.siteAddress ?? ""}
                      onSave={(v) =>
                        onProjectUpdate!({ siteAddress: v || null })
                      }
                    />
                  ) : (
                    project.siteAddress ?? ""
                  )}
                </td>
              </tr>
              <tr>
                <th>着工日</th>
                <td>
                  {editable ? (
                    <EditableDate
                      value={project.startDate ?? ""}
                      onSave={(v) =>
                        onProjectUpdate!({ startDate: v || null })
                      }
                    />
                  ) : project.startDate ? (
                    formatDate(project.startDate)
                  ) : (
                    ""
                  )}
                </td>
                <th>引渡日</th>
                <td>
                  {editable ? (
                    <EditableDate
                      value={project.endDate ?? ""}
                      onSave={(v) =>
                        onProjectUpdate!({ endDate: v || null })
                      }
                    />
                  ) : project.endDate ? (
                    formatDate(project.endDate)
                  ) : (
                    ""
                  )}
                </td>
              </tr>
              <tr>
                <th>備考</th>
                <td colSpan={3} className="min-h-[2.5rem] align-top">
                  {editable ? (
                    <EditableText
                      multiline
                      value={project.notes ?? ""}
                      onSave={(v) =>
                        onProjectUpdate!({ notes: v || null })
                      }
                    />
                  ) : (
                    <div className="whitespace-pre-wrap min-h-[2.5rem]">
                      {project.notes ?? ""}
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 受注 / 予算 / 締め */}
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
                <th
                  className="border border-border bg-primary text-primary-foreground px-2 py-1.5 text-center font-semibold"
                  title="売上 − 営業歩合 − 規定粗利額 = 原価の上限"
                >
                  予算組み
                </th>
                <th className="border border-border bg-accent text-accent-foreground px-2 py-1.5 text-center font-semibold">
                  締め (実績)
                </th>
              </tr>
            </thead>
            <tbody className="text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-muted/50 [&_th]:text-left [&_th]:font-medium tabular-nums whitespace-nowrap">
              <tr>
                <th>売上</th>
                <td className="text-right">
                  {editable ? (
                    <EditableNumber
                      value={orderAmount}
                      onSave={(v) =>
                        onProjectUpdate!({ contractAmount: v })
                      }
                    />
                  ) : (
                    formatCurrency(orderAmount)
                  )}
                </td>
                <td className="text-right">{formatCurrency(orderAmount)}</td>
                <td className="text-right font-medium">
                  {formatCurrency(orderAmount)}
                </td>
              </tr>
              <tr>
                <th>原価</th>
                <td className="text-right">{formatCurrency(orderCost)}</td>
                <td
                  className="text-right text-muted-foreground"
                  title="協力会社・経費の上限目安"
                >
                  ≤ {formatCurrency(budgetCost)}
                </td>
                <td className="text-right font-medium">
                  {formatCurrency(actualCost)}
                </td>
              </tr>
              <tr>
                <th>粗利</th>
                <td className="text-right">{formatCurrency(orderProfit)}</td>
                <td className="text-right text-muted-foreground">
                  ≥ {formatCurrency(budgetProfit)}
                </td>
                <td
                  className={`text-right font-semibold ${grossProfit < 0 ? "text-destructive" : "text-accent"}`}
                >
                  {formatCurrency(grossProfit)}
                </td>
              </tr>
              <tr>
                <th>粗利率</th>
                <td className="text-right">{pct(orderProfit, orderAmount)}</td>
                <td className="text-right text-muted-foreground">
                  ≥ {pct(budgetProfit, orderAmount)}
                </td>
                <td
                  className={`text-right font-semibold ${grossProfit < 0 ? "text-destructive" : "text-accent"}`}
                >
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
          歩合・最終利益 (規定利率 {(standardProfitRate * 100).toFixed(1)}% / 監督歩合 {(supervisorCommissionRate * 100).toFixed(1)}%)
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
                <td className="text-right text-destructive">
                  −{formatCurrency(actualCost)}
                </td>
                <td className="text-right text-muted-foreground">
                  {pct(actualCost, orderAmount)}
                </td>
                <td className="text-muted-foreground">原価明細 実績合計</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="font-semibold">粗利</td>
                <td
                  className={`text-right font-semibold ${grossProfit < 0 ? "text-destructive" : ""}`}
                >
                  {formatCurrency(grossProfit)}
                </td>
                <td className="text-right">{pct(grossProfit, orderAmount)}</td>
                <td className="text-muted-foreground">売上 − 実原価</td>
              </tr>
              <tr>
                <td className="font-medium">
                  営業歩合 ({(salesCommissionRate * 100).toFixed(1)}%)
                </td>
                <td className="text-right text-destructive">
                  −{formatCurrency(salesCommission)}
                </td>
                <td className="text-right text-muted-foreground">
                  {(salesCommissionRate * 100).toFixed(1)}%
                </td>
                <td className="text-muted-foreground">
                  売上 × 営業歩合率 ({project.salesRep ?? "担当営業"})
                </td>
              </tr>
              <tr className="bg-muted/30">
                <td className="font-medium">営業歩合控除後 粗利</td>
                <td
                  className={`text-right ${profitAfterSales < 0 ? "text-destructive" : ""}`}
                >
                  {formatCurrency(profitAfterSales)}
                </td>
                <td className="text-right">
                  {pct(profitAfterSales, orderAmount)}
                </td>
                <td className="text-muted-foreground">粗利 − 営業歩合</td>
              </tr>
              <tr>
                <td className="font-medium">
                  規定粗利額 ({(standardProfitRate * 100).toFixed(1)}%)
                </td>
                <td className="text-right text-muted-foreground">
                  {formatCurrency(standardProfit)}
                </td>
                <td className="text-right text-muted-foreground">
                  {(standardProfitRate * 100).toFixed(1)}%
                </td>
                <td className="text-muted-foreground">
                  売上 × 規定利率 (顧客マスタの規定値)
                </td>
              </tr>
              <tr>
                <td className="font-medium">規定超過粗利</td>
                <td
                  className={`text-right ${excessProfit > 0 ? "text-emerald-700 font-medium" : "text-muted-foreground"}`}
                >
                  {formatCurrency(excessProfit)}
                </td>
                <td className="text-right text-muted-foreground">
                  {pct(excessProfit, orderAmount)}
                </td>
                <td className="text-muted-foreground">
                  max(0, 営業歩合控除後粗利 − 規定粗利額)
                </td>
              </tr>
              <tr>
                <td className="font-medium">
                  監督歩合 ({(supervisorCommissionRate * 100).toFixed(1)}%)
                </td>
                <td className="text-right text-destructive">
                  −{formatCurrency(supervisorCommission)}
                </td>
                <td className="text-right text-muted-foreground">
                  {pct(supervisorCommission, orderAmount)}
                </td>
                <td className="text-muted-foreground">
                  規定超過粗利 × {(supervisorCommissionRate * 100).toFixed(1)}% ({project.siteSupervisor ?? "担当監督"})
                </td>
              </tr>
              <tr className="bg-accent/10">
                <td className="font-bold">最終会社利益</td>
                <td
                  className={`text-right font-bold ${finalProfit < 0 ? "text-destructive" : "text-accent"}`}
                >
                  {formatCurrency(finalProfit)}
                </td>
                <td
                  className={`text-right font-bold ${finalProfit < 0 ? "text-destructive" : ""}`}
                >
                  {pct(finalProfit, orderAmount)}
                </td>
                <td className="text-muted-foreground">
                  粗利 − 営業歩合 − 監督歩合
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 原価明細 */}
      <CostDetailTable
        entries={ledger.entries}
        totalsByCat={totalsByCat}
        grandTotal={grandTotal}
        editable={editable}
        onCostEntryUpdate={onCostEntryUpdate}
        onCostEntryCreate={onCostEntryCreate}
        onCostEntryDelete={onCostEntryDelete}
      />
    </div>
  );
}

function CostDetailTable({
  entries,
  totalsByCat,
  grandTotal,
  editable,
  onCostEntryUpdate,
  onCostEntryCreate,
  onCostEntryDelete,
}: {
  entries: LedgerEntry[];
  totalsByCat: Record<Cat, number>;
  grandTotal: number;
  editable: boolean;
  onCostEntryUpdate?: (id: string, patch: CostEntryPatch) => void | Promise<void>;
  onCostEntryCreate?: (draft: CreateCostEntryDraft) => void | Promise<void>;
  onCostEntryDelete?: (id: string) => void | Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const handleAddRow = async () => {
    if (!onCostEntryCreate || creating) return;
    setCreating(true);
    try {
      await onCostEntryCreate({
        category: "material",
        description: "",
        vendor: null,
        plannedAmount: 0,
        actualAmount: 0,
        entryDate: new Date().toISOString().slice(0, 10),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="border border-border overflow-hidden rounded-sm">
      <div className="bg-secondary text-secondary-foreground px-3 py-1.5 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold">原価明細</span>
        <div className="flex gap-4 text-xs tabular-nums">
          {CAT_KEYS.map((k) => (
            <div key={k} className="flex gap-1.5">
              <span className="text-muted-foreground">{CAT_LABEL[k]}:</span>
              <span className="font-medium">
                {formatCurrency(totalsByCat[k])}
              </span>
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
              <th className="w-28">日付</th>
              <th className="w-32 text-left">業者名</th>
              <th className="text-left">内容</th>
              <th className="w-24 text-right">材料費</th>
              <th className="w-24 text-right">外注費</th>
              <th className="w-24 text-right">労務費</th>
              <th className="w-24 text-right">経費</th>
              <th className="w-24 text-right">その他</th>
              <th className="w-24 text-right">合計</th>
              {editable && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody className="[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
            {entries.length === 0 && !editable ? (
              <tr>
                <td colSpan={10} className="text-center text-muted-foreground py-6">
                  原価がまだ登録されていません。
                </td>
              </tr>
            ) : (
              entries.map((e, i) => (
                <CostEntryRow
                  key={e.id}
                  entry={e}
                  index={i}
                  editable={editable}
                  onUpdate={onCostEntryUpdate}
                  onDelete={onCostEntryDelete}
                />
              ))
            )}
            {/* totals row */}
            {entries.length > 0 && (
              <tr className="bg-muted/40 font-semibold">
                <td colSpan={4} className="text-right">
                  合計
                </td>
                <td className="text-right">{formatCurrency(totalsByCat.material)}</td>
                <td className="text-right">
                  {formatCurrency(totalsByCat.subcontract)}
                </td>
                <td className="text-right">{formatCurrency(totalsByCat.labor)}</td>
                <td className="text-right">{formatCurrency(totalsByCat.expense)}</td>
                <td className="text-right">{formatCurrency(totalsByCat.other)}</td>
                <td className="text-right bg-accent/15 text-accent">
                  {formatCurrency(grandTotal)}
                </td>
                {editable && <td></td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="border-t border-border px-3 py-2 flex justify-end bg-muted/20">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddRow}
            disabled={creating}
            className="gap-1.5 h-7 text-xs"
            data-testid="button-add-cost-row"
          >
            <Plus className="w-3.5 h-3.5" />
            行を追加
          </Button>
        </div>
      )}
    </div>
  );
}

function CostEntryRow({
  entry,
  index,
  editable,
  onUpdate,
  onDelete,
}: {
  entry: LedgerEntry;
  index: number;
  editable: boolean;
  onUpdate?: (id: string, patch: CostEntryPatch) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}) {
  const k = (CAT_KEYS as readonly string[]).includes(entry.category)
    ? (entry.category as Cat)
    : "other";
  const amt = entry.actualAmount;

  if (!editable) {
    const cell = (key: Cat) =>
      k === key && amt !== 0 ? formatCurrency(amt) : "";
    return (
      <tr className="hover:bg-muted/30">
        <td className="text-center text-muted-foreground">{index + 1}</td>
        <td className="whitespace-nowrap">{formatDate(entry.entryDate)}</td>
        <td>{entry.vendor ?? ""}</td>
        <td>{entry.description}</td>
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
  }

  return (
    <tr className="hover:bg-muted/30 group" data-testid={`row-cost-entry-${entry.id}`}>
      <td className="text-center text-muted-foreground">{index + 1}</td>
      <td className="whitespace-nowrap p-0">
        <EditableDate
          value={entry.entryDate}
          onSave={(v) => onUpdate?.(entry.id, { entryDate: v })}
          inputClassName="px-2 py-1.5"
          required
        />
      </td>
      <td className="p-0">
        <EditableText
          value={entry.vendor ?? ""}
          onSave={(v) =>
            onUpdate?.(entry.id, { vendor: v || null })
          }
          inputClassName="px-2 py-1.5"
        />
      </td>
      <td className="p-0">
        <EditableText
          required
          value={entry.description}
          onSave={(v) =>
            v && onUpdate?.(entry.id, { description: v })
          }
          inputClassName="px-2 py-1.5"
        />
      </td>
      {CAT_KEYS.map((key) => {
        const isActive = key === k;
        return (
          <td key={key} className="text-right p-0">
            <CategoryAmountCell
              isActive={isActive}
              category={key}
              amount={isActive ? amt : 0}
              onSave={(v) => {
                if (isActive) {
                  onUpdate?.(entry.id, {
                    actualAmount: v,
                    plannedAmount: v,
                  });
                } else if (v > 0) {
                  // 別の費目に金額を入力 → その費目に切替 + 金額更新
                  onUpdate?.(entry.id, {
                    category: key,
                    actualAmount: v,
                    plannedAmount: v,
                  });
                }
              }}
            />
          </td>
        );
      })}
      <td className="text-right font-medium bg-amber-50/50 dark:bg-amber-950/20">
        {formatCurrency(amt)}
      </td>
      <td className="p-0 text-center">
        <button
          type="button"
          onClick={() => onDelete?.(entry.id)}
          className="opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded p-1 transition-opacity"
          aria-label="削除"
          data-testid={`button-delete-cost-${entry.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

// 原価明細の費目セル: 常時 input。
// 別費目セルに金額を入れた場合は、保存ロジック側で category を切り替える。
function CategoryAmountCell({
  isActive,
  category,
  amount,
  onSave,
}: {
  isActive: boolean;
  category: Cat;
  amount: number;
  onSave: (next: number) => void;
}) {
  const display = isActive && amount !== 0 ? String(amount) : "";
  const [v, setV] = useState(display);
  const lastSavedRef = useRef(amount);
  const cancelRef = useRef(false);
  useEffect(() => {
    lastSavedRef.current = amount;
    setV(isActive && amount !== 0 ? String(amount) : "");
  }, [amount, isActive]);

  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setV(isActive && lastSavedRef.current !== 0 ? String(lastSavedRef.current) : "");
      return;
    }
    const n = v === "" ? 0 : Number(v);
    if (!Number.isFinite(n)) {
      setV(isActive && lastSavedRef.current !== 0 ? String(lastSavedRef.current) : "");
      return;
    }
    if (isActive) {
      if (n !== lastSavedRef.current) onSave(n);
    } else {
      if (n > 0) onSave(n);
      else setV("");
    }
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      step="1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const el = e.currentTarget;
          if (!focusNextEditableInput(el)) el.blur();
        }
        if (e.key === "Escape") {
          cancelRef.current = true;
          e.currentTarget.blur();
        }
      }}
      aria-label={CAT_LABEL[category]}
      className={cn(
        "w-full bg-transparent border-0 outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded-sm px-2 py-1.5 text-right tabular-nums",
        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        !isActive && "text-muted-foreground/40 hover:text-muted-foreground",
      )}
    />
  );
}

function MonthlyBreakdown({ ledger }: { ledger: Ledger }) {
  const buckets = new Map<string, number>();
  for (const e of ledger.entries) {
    const ym = (e.entryDate ?? "").slice(0, 7);
    if (!ym) continue;
    buckets.set(ym, (buckets.get(ym) ?? 0) + (e.actualAmount ?? 0));
  }
  const months = Array.from(buckets.keys()).sort();
  if (months.length === 0) return null;

  const totalActualCost =
    ledger.actualCost || months.reduce((a, m) => a + (buckets.get(m) ?? 0), 0);
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
            <td className="font-medium">{r.m.replace("-", "年")}月</td>
            <td className="text-right">{formatCurrency(r.revenue)}</td>
            <td className="text-right text-destructive">
              −{formatCurrency(r.cost)}
            </td>
            <td
              className={`text-right font-medium ${r.profit < 0 ? "text-destructive" : "text-accent"}`}
            >
              {formatCurrency(r.profit)}
            </td>
            <td className="text-right text-muted-foreground">
              {r.revenue > 0 ? `${((r.profit / r.revenue) * 100).toFixed(1)}%` : "-"}
            </td>
            <td className="text-right text-muted-foreground">
              {formatCurrency(r.cumRevenue)}
            </td>
            <td className="text-right text-muted-foreground">
              {formatCurrency(r.cumCost)}
            </td>
          </tr>
        ))}
        <tr className="bg-accent/10 font-semibold">
          <td>合計</td>
          <td className="text-right">{formatCurrency(sumRevenue)}</td>
          <td className="text-right text-destructive">
            −{formatCurrency(sumCost)}
          </td>
          <td
            className={`text-right ${sumProfit < 0 ? "text-destructive" : "text-accent"}`}
          >
            {formatCurrency(sumProfit)}
          </td>
          <td className="text-right">
            {sumRevenue > 0
              ? `${((sumProfit / sumRevenue) * 100).toFixed(1)}%`
              : "-"}
          </td>
          <td className="text-right">{formatCurrency(sumRevenue)}</td>
          <td className="text-right">{formatCurrency(sumCost)}</td>
        </tr>
      </tbody>
    </table>
  );
}
