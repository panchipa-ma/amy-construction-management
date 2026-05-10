import { BANK_INFO, COMPANY_INFO } from "./company-info";
import { escapeHtml, fmtCurrency, fmtDate } from "./util";

export type InvoiceLineItem = {
  description: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
};

export type InvoiceForPrint = {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  contactName?: string | null;
  subject?: string | null;
  notes?: string | null;
  items: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
};

const ITEM_ROWS = 17;
const NAVY = "hsl(220,50%,25%)";

/**
 * 「請求書」standalone HTML。`artifacts/amy/src/pages/invoice-detail.tsx`
 * の `<div class="quote-paper">` レイアウトを inline CSS で再現。
 *
 * モバイルは expo-print に渡す。Web は `<iframe>` または new tab で開いて
 * `window.print()` を呼ぶ — これで両者の出力を完全に一致させる。
 */
export function renderInvoiceHtml(inv: InvoiceForPrint): string {
  const rows: InvoiceLineItem[] = [...inv.items];
  while (rows.length < ITEM_ROWS) {
    rows.push({ description: "", unit: null, quantity: 0, unitPrice: 0, notes: null });
  }

  const itemRowsHtml = rows
    .map((it, i) => {
      const has = !!it.description?.trim();
      const amount = has ? it.quantity * it.unitPrice : 0;
      const stripe = i % 2 === 0 ? "background:#eff6ff;" : "";
      return `<tr style="${stripe}">
  <td style="border:1px solid #e2e8f0;padding:4px 8px;text-align:center;color:#64748b;width:36px;">${i + 1}</td>
  <td style="border:1px solid #e2e8f0;padding:4px 8px;">${has ? escapeHtml(it.description) : "&nbsp;"}</td>
  <td style="border:1px solid #e2e8f0;padding:4px 8px;text-align:center;font-variant-numeric:tabular-nums;width:60px;">${has ? it.quantity : ""}</td>
  <td style="border:1px solid #e2e8f0;padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums;width:100px;">${has ? fmtCurrency(it.unitPrice) : ""}</td>
  <td style="border:1px solid #e2e8f0;padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums;width:120px;">${has ? fmtCurrency(amount) : ""}</td>
</tr>`;
    })
    .join("");

  const recipient =
    inv.customerName?.trim() || inv.projectName?.trim() || "—";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>請求書 ${escapeHtml(inv.invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; }
  body { font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif; font-size: 12px; line-height: 1.45; }
  .paper { width: 210mm; min-height: 0; padding: 10mm 12mm; margin: 0 auto; background: #fff; }
  h1.title { text-align: center; font-size: 24px; font-weight: 700; letter-spacing: 0.5em; margin: 0 0 22px; padding-left: 0.5em; }
  table { border-collapse: collapse; }
  .muted { color: #64748b; }
  .small { font-size: 11px; }
  .xs { font-size: 10px; }
  .tabular { font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="paper">
  <h1 class="title">請　求　書</h1>

  <table style="width:100%;margin-bottom:16px;">
    <tr>
      <td style="vertical-align:top;width:60%;padding-right:24px;">
        <div style="font-size:18px;font-weight:700;border-bottom:1px solid #0f172a;padding-bottom:2px;display:inline-block;min-width:200px;">
          ${escapeHtml(recipient)} <span style="font-size:14px;font-weight:500;margin-left:6px;">御中</span>
        </div>
        <div style="margin-top:10px;" class="small">
          <span class="muted">ご担当：</span>${escapeHtml(inv.contactName ?? "")}${inv.contactName ? " <span>様</span>" : ""}
        </div>
        <div style="margin-top:6px;" class="small">
          <span class="muted">件名：</span><b>${escapeHtml(inv.subject ?? "")}</b>
        </div>
        <p style="margin:14px 0 0;">下記の通り、ご請求申し上げます。</p>
      </td>
      <td style="vertical-align:top;text-align:left;width:40%;">
        <table style="width:100%;" class="small">
          <tr><td class="muted" style="text-align:right;padding-right:12px;">請求No.</td><td class="tabular">${escapeHtml(inv.invoiceNumber)}</td></tr>
          <tr><td class="muted" style="text-align:right;padding-right:12px;">請求日</td><td>${fmtDate(inv.issueDate)}</td></tr>
        </table>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;">
          <div style="font-weight:700;">${escapeHtml(COMPANY_INFO.name)}</div>
          <div class="xs muted">${escapeHtml(COMPANY_INFO.postalCode)}</div>
          <div class="xs">${escapeHtml(COMPANY_INFO.address)}</div>
          <div class="xs muted">登録番号：${escapeHtml(COMPANY_INFO.registrationNumber)}</div>
          <div class="xs" style="margin-top:4px;">TEL：${escapeHtml(COMPANY_INFO.tel)}</div>
          <div class="xs">FAX：${escapeHtml(COMPANY_INFO.fax)}</div>
          <div class="xs">E-Mail：${escapeHtml(COMPANY_INFO.email)}</div>
          <div class="xs" style="margin-top:4px;">担当：${escapeHtml(COMPANY_INFO.contact)}</div>
        </div>
      </td>
    </tr>
  </table>

  <div style="display:flex;align-items:center;gap:16px;border-top:2px solid #0f172a;border-bottom:2px solid #0f172a;padding:8px 4px;margin-bottom:14px;">
    <b style="font-size:13px;">合計金額</b>
    <span class="tabular" style="font-size:20px;font-weight:700;">${fmtCurrency(inv.total)}</span>
    <span class="xs muted">（税込）</span>
    <div style="margin-left:auto;" class="small"><span class="muted">お支払期限：</span><b>${inv.dueDate ? fmtDate(inv.dueDate) : "月末日"}</b></div>
  </div>

  <table style="width:100%;margin-bottom:14px;">
    <thead>
      <tr style="background:${NAVY};color:#fff;">
        <th style="border:1px solid ${NAVY};padding:5px 8px;text-align:center;font-weight:500;width:36px;">No.</th>
        <th style="border:1px solid ${NAVY};padding:5px 8px;text-align:left;font-weight:500;">摘要</th>
        <th style="border:1px solid ${NAVY};padding:5px 8px;text-align:center;font-weight:500;width:60px;">数量</th>
        <th style="border:1px solid ${NAVY};padding:5px 8px;text-align:right;font-weight:500;width:100px;">単価</th>
        <th style="border:1px solid ${NAVY};padding:5px 8px;text-align:right;font-weight:500;width:120px;">金額</th>
      </tr>
    </thead>
    <tbody>${itemRowsHtml}</tbody>
  </table>

  <table style="width:100%;">
    <tr>
      <td style="vertical-align:top;width:60%;padding-right:24px;">
        <div class="muted small" style="font-weight:500;margin-bottom:4px;">お振込先</div>
        <div class="small" style="padding-left:8px;line-height:1.6;">
          <div>${escapeHtml(BANK_INFO.bankName)}　${escapeHtml(BANK_INFO.branchName)}</div>
          <div>${escapeHtml(BANK_INFO.accountType)}</div>
          <div>店番号：${escapeHtml(BANK_INFO.branchCode)}</div>
          <div>口座番号：${escapeHtml(BANK_INFO.accountNumber)}</div>
          <div>${escapeHtml(BANK_INFO.accountHolder)}</div>
        </div>
      </td>
      <td style="vertical-align:top;width:40%;">
        <table style="width:100%;">
          <tr style="background:${NAVY};color:#fff;">
            <td style="border:1px solid ${NAVY};padding:6px 12px;text-align:center;font-weight:500;">小計</td>
            <td style="border:1px solid ${NAVY};padding:6px 12px;text-align:right;background:#fff;color:#0f172a;" class="tabular">${fmtCurrency(inv.subtotal)}</td>
          </tr>
          <tr style="background:${NAVY};color:#fff;">
            <td style="border:1px solid ${NAVY};padding:6px 12px;text-align:center;font-weight:500;">消費税(10%)</td>
            <td style="border:1px solid ${NAVY};padding:6px 12px;text-align:right;background:#fff;color:#0f172a;" class="tabular">${fmtCurrency(inv.tax)}</td>
          </tr>
          <tr style="background:${NAVY};color:#fff;">
            <td style="border:1px solid ${NAVY};padding:6px 12px;text-align:center;font-weight:700;">合計</td>
            <td style="border:1px solid ${NAVY};padding:6px 12px;text-align:right;font-weight:700;background:#fff;color:#0f172a;" class="tabular">${fmtCurrency(inv.total)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  ${
    inv.notes
      ? `<div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:10px;">
    <div style="display:inline-block;background:#f1f5f9;padding:3px 10px;font-weight:500;margin-bottom:4px;" class="small">備考</div>
    <p class="small" style="white-space:pre-wrap;margin:0 0 0 4px;">${escapeHtml(inv.notes)}</p>
  </div>`
      : ""
  }
</div>
</body>
</html>`;
}
