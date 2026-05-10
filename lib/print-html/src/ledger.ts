import { COMPANY_INFO } from "./company-info";
import { escapeHtml, fmtCurrency, fmtJpDate } from "./util";

/**
 * 施工台帳 (construction ledger) PDF テンプレート。
 * 計画 vs 実績原価、粗利、営業/監督歩合を含む 1 案件の財務サマリ + 原価明細。
 * Web (`LedgerSpreadsheet`) と同じ計算式・列構成で出力。
 */

export type LedgerEntryForPrint = {
  category: string;
  description: string;
  vendor?: string | null;
  plannedAmount: number;
  actualAmount: number;
  entryDate: string;
};

export type LedgerProjectForPrint = {
  code?: string | null;
  name: string;
  customerName?: string | null;
  unitNumber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  salesRep?: string | null;
  siteSupervisor?: string | null;
  salesCommissionRate?: number | null;
  standardProfitRate?: number | null;
  supervisorCommissionRate?: number | null;
};

export type LedgerForPrint = {
  project: LedgerProjectForPrint;
  contractAmount: number;
  plannedCost: number;
  actualCost: number;
  entries: LedgerEntryForPrint[];
};

const FONT_FAMILY =
  '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif';

const CAT_KEYS = ["material", "subcontract", "labor", "expense", "other"] as const;
type Cat = (typeof CAT_KEYS)[number];
const CAT_LABEL: Record<Cat, string> = {
  material: "材料費",
  subcontract: "外注費",
  labor: "労務費",
  expense: "経費",
  other: "その他",
};

const DEFAULT_STANDARD_PROFIT_RATE = 20; // %
const DEFAULT_SUPERVISOR_COMMISSION_RATE = 30; // %
const DEFAULT_SALES_COMMISSION_RATE = 5; // %

function pctStr(num: number, den: number): string {
  if (den === 0) return "-";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function row(label: string, value: string, valueColor = "#000"): string {
  return `<tr>
    <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;font-size:11px;border:1px solid #ccc;width:42%">${escapeHtml(label)}</th>
    <td style="padding:6px 8px;text-align:right;border:1px solid #ccc;font-variant-numeric:tabular-nums;color:${valueColor}">${value}</td>
  </tr>`;
}

export function renderLedgerHtml(data: LedgerForPrint): string {
  const { project, contractAmount, actualCost, entries } = data;

  const orderAmount = contractAmount;
  const grossProfit = orderAmount - actualCost;
  const grossProfitRate = orderAmount > 0 ? (grossProfit / orderAmount) * 100 : 0;

  const salesCommissionRate =
    (project.salesCommissionRate ?? DEFAULT_SALES_COMMISSION_RATE) / 100;
  const salesCommission = Math.round(orderAmount * salesCommissionRate);

  const standardProfitRate =
    (project.standardProfitRate ?? DEFAULT_STANDARD_PROFIT_RATE) / 100;
  const standardProfit = Math.round(orderAmount * standardProfitRate);

  const profitAfterSales = grossProfit - salesCommission;
  const excessProfit = Math.max(0, profitAfterSales - standardProfit);

  const supervisorCommissionRate =
    (project.supervisorCommissionRate ?? DEFAULT_SUPERVISOR_COMMISSION_RATE) /
    100;
  const supervisorCommission = Math.round(excessProfit * supervisorCommissionRate);
  const finalProfit = grossProfit - salesCommission - supervisorCommission;

  const totalsByCat: Record<Cat, number> = {
    material: 0,
    subcontract: 0,
    labor: 0,
    expense: 0,
    other: 0,
  };
  for (const e of entries) {
    const k = (CAT_KEYS as readonly string[]).includes(e.category)
      ? (e.category as Cat)
      : "other";
    totalsByCat[k] += e.actualAmount;
  }
  const grandTotal = Object.values(totalsByCat).reduce((a, b) => a + b, 0);

  // ── 基本情報 ──
  const baseTable = `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <tbody>
      <tr>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc;width:18%">契約番号</th>
        <td style="padding:6px 8px;border:1px solid #ccc;width:32%">${escapeHtml(project.code ?? "")}</td>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc;width:18%">規定利率</th>
        <td style="padding:6px 8px;text-align:right;border:1px solid #ccc;font-variant-numeric:tabular-nums">${(project.standardProfitRate ?? DEFAULT_STANDARD_PROFIT_RATE).toFixed(1)}%</td>
      </tr>
      <tr>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc">担当営業</th>
        <td style="padding:6px 8px;border:1px solid #ccc">${escapeHtml(project.salesRep ?? "")}</td>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc">営業歩合率</th>
        <td style="padding:6px 8px;text-align:right;border:1px solid #ccc;font-variant-numeric:tabular-nums">${(project.salesCommissionRate ?? DEFAULT_SALES_COMMISSION_RATE).toFixed(1)}%</td>
      </tr>
      <tr>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc">担当現場監督</th>
        <td style="padding:6px 8px;border:1px solid #ccc">${escapeHtml(project.siteSupervisor ?? "")}</td>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc">監督歩合率</th>
        <td style="padding:6px 8px;text-align:right;border:1px solid #ccc;font-variant-numeric:tabular-nums">${(project.supervisorCommissionRate ?? DEFAULT_SUPERVISOR_COMMISSION_RATE).toFixed(1)}%</td>
      </tr>
      <tr>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc">案件名</th>
        <td colspan="3" style="padding:6px 8px;border:1px solid #ccc">${escapeHtml(project.name)}${project.unitNumber ? `　${escapeHtml(project.unitNumber)}` : ""}</td>
      </tr>
      <tr>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc">顧客</th>
        <td colspan="3" style="padding:6px 8px;border:1px solid #ccc">${escapeHtml(project.customerName ?? "")}</td>
      </tr>
      <tr>
        <th style="background:#f5f5f5;padding:6px 8px;text-align:left;font-weight:500;border:1px solid #ccc">工期</th>
        <td colspan="3" style="padding:6px 8px;border:1px solid #ccc">${fmtJpDate(project.startDate)} 〜 ${fmtJpDate(project.endDate)}</td>
      </tr>
    </tbody>
  </table>`;

  // ── 利益サマリ ──
  const summaryTable = `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <tbody>
      ${row("受注金額 (税込)", fmtCurrency(orderAmount))}
      ${row("実原価", `−${fmtCurrency(actualCost)}`, "#b91c1c")}
      <tr style="background:#f8f8f8">
        <th style="padding:6px 8px;text-align:left;font-weight:600;font-size:11px;border:1px solid #ccc">粗利 (${pctStr(grossProfit, orderAmount)})</th>
        <td style="padding:6px 8px;text-align:right;border:1px solid #ccc;font-variant-numeric:tabular-nums;font-weight:600;color:${grossProfit < 0 ? "#b91c1c" : "#000"}">${fmtCurrency(grossProfit)}</td>
      </tr>
      ${row(`営業歩合 (${(salesCommissionRate * 100).toFixed(1)}%)`, `−${fmtCurrency(salesCommission)}`, "#b91c1c")}
      ${row("営業歩合控除後 粗利", fmtCurrency(profitAfterSales))}
      ${row(`規定粗利額 (${(standardProfitRate * 100).toFixed(1)}%)`, fmtCurrency(standardProfit), "#666")}
      ${row("規定超過粗利", fmtCurrency(excessProfit), excessProfit > 0 ? "#047857" : "#666")}
      ${row(`監督歩合 (${(supervisorCommissionRate * 100).toFixed(1)}%)`, `−${fmtCurrency(supervisorCommission)}`, "#b91c1c")}
      <tr style="background:#fef3c7">
        <th style="padding:6px 8px;text-align:left;font-weight:700;font-size:12px;border:1px solid #ccc">最終会社利益 (${pctStr(finalProfit, orderAmount)})</th>
        <td style="padding:6px 8px;text-align:right;border:1px solid #ccc;font-variant-numeric:tabular-nums;font-weight:700;font-size:12px;color:${finalProfit < 0 ? "#b91c1c" : "#000"}">${fmtCurrency(finalProfit)}</td>
      </tr>
    </tbody>
  </table>`;

  // ── 原価明細 ──
  const entryRows = entries
    .map((e, i) => {
      const k = (CAT_KEYS as readonly string[]).includes(e.category)
        ? (e.category as Cat)
        : "other";
      const cellAt = (target: Cat): string =>
        k === target
          ? fmtCurrency(e.actualAmount)
          : `<span style="color:#bbb">—</span>`;
      return `<tr>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-variant-numeric:tabular-nums">${i + 1}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:center">${fmtJpDate(e.entryDate)}</td>
        <td style="padding:4px 6px;border:1px solid #ccc">${escapeHtml(e.vendor ?? "")}</td>
        <td style="padding:4px 6px;border:1px solid #ccc">${escapeHtml(e.description)}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:right;font-variant-numeric:tabular-nums">${cellAt("material")}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:right;font-variant-numeric:tabular-nums">${cellAt("subcontract")}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:right;font-variant-numeric:tabular-nums">${cellAt("labor")}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:right;font-variant-numeric:tabular-nums">${cellAt("expense")}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:right;font-variant-numeric:tabular-nums">${cellAt("other")}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fmtCurrency(e.actualAmount)}</td>
      </tr>`;
    })
    .join("");

  const detailTable = `<table style="width:100%;border-collapse:collapse;font-size:10px">
    <thead>
      <tr style="background:#e5e7eb">
        <th style="padding:6px 4px;border:1px solid #999;width:30px">No</th>
        <th style="padding:6px 4px;border:1px solid #999;width:78px">日付</th>
        <th style="padding:6px 4px;border:1px solid #999;width:120px">業者名</th>
        <th style="padding:6px 4px;border:1px solid #999;text-align:left">内容</th>
        <th style="padding:6px 4px;border:1px solid #999;width:74px">材料費</th>
        <th style="padding:6px 4px;border:1px solid #999;width:74px">外注費</th>
        <th style="padding:6px 4px;border:1px solid #999;width:74px">労務費</th>
        <th style="padding:6px 4px;border:1px solid #999;width:74px">経費</th>
        <th style="padding:6px 4px;border:1px solid #999;width:74px">その他</th>
        <th style="padding:6px 4px;border:1px solid #999;width:80px">合計</th>
      </tr>
    </thead>
    <tbody>
      ${entryRows || `<tr><td colspan="10" style="padding:24px;text-align:center;color:#999;border:1px solid #ccc">原価がまだ登録されていません。</td></tr>`}
      <tr style="background:#f3f4f6;font-weight:700">
        <td colspan="4" style="padding:6px;text-align:right;border:1px solid #999">合計</td>
        <td style="padding:6px;text-align:right;border:1px solid #999;font-variant-numeric:tabular-nums">${fmtCurrency(totalsByCat.material)}</td>
        <td style="padding:6px;text-align:right;border:1px solid #999;font-variant-numeric:tabular-nums">${fmtCurrency(totalsByCat.subcontract)}</td>
        <td style="padding:6px;text-align:right;border:1px solid #999;font-variant-numeric:tabular-nums">${fmtCurrency(totalsByCat.labor)}</td>
        <td style="padding:6px;text-align:right;border:1px solid #999;font-variant-numeric:tabular-nums">${fmtCurrency(totalsByCat.expense)}</td>
        <td style="padding:6px;text-align:right;border:1px solid #999;font-variant-numeric:tabular-nums">${fmtCurrency(totalsByCat.other)}</td>
        <td style="padding:6px;text-align:right;border:1px solid #999;font-variant-numeric:tabular-nums">${fmtCurrency(grandTotal)}</td>
      </tr>
    </tbody>
  </table>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>施工台帳 ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: ${FONT_FAMILY}; }
  h1 { font-size: 18px; margin: 0 0 4px; letter-spacing: 0.05em; }
  .section-title {
    background: hsl(220, 50%, 25%);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    padding: 5px 10px;
    margin-top: 14px;
  }
  .header-row { display: flex; justify-content: space-between; align-items: flex-end; }
  .meta { font-size: 11px; color: #444; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
</style>
</head>
<body>
<div class="header-row">
  <div>
    <h1>施工台帳</h1>
    <div class="meta">${escapeHtml(project.name)}${project.unitNumber ? ` ・ ${escapeHtml(project.unitNumber)}` : ""}</div>
  </div>
  <div class="meta" style="text-align:right">
    <div style="font-weight:600;font-size:12px">${escapeHtml(COMPANY_INFO.name)}</div>
    <div>TEL: ${escapeHtml(COMPANY_INFO.tel)}</div>
  </div>
</div>

<div class="section-title">基本情報</div>
${baseTable}

<div class="section-title">利益サマリ</div>
${summaryTable}

<div class="section-title">原価明細</div>
${detailTable}
</body>
</html>`;
}
