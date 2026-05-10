import { COMPANY_INFO, QUOTE_TERMS } from "./company-info";
import { escapeHtml, fmtCurrency, fmtJpDate } from "./util";

export type QuoteLineItem = {
  description: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
};

export type QuoteForPrint = {
  quoteNumber: string;
  issueDate: string;
  validUntil?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  contactName?: string | null;
  subject?: string | null;
  notes?: string | null;
  items: QuoteLineItem[];
  subtotal: number;
  tax: number;
  total: number;
};

const MIN_ROWS = 32;
const PRIMARY = "hsl(220,50%,25%)";

/**
 * 「御見積書」standalone HTML。`artifacts/amy/src/pages/quote-detail.tsx`
 * の view モード (.quote-paper) を inline CSS で再現。
 */
export function renderQuoteHtml(q: QuoteForPrint): string {
  const items = [...q.items];
  while (items.length < MIN_ROWS) {
    items.push({ description: "", unit: null, quantity: 0, unitPrice: 0, notes: null });
  }

  const customerName = q.customerName?.trim() || "—";
  const subjectName = q.subject?.trim() || q.projectName?.trim() || "";

  const itemRowsHtml = items
    .map((it, i) => {
      const has = !!it.description?.trim();
      const amount = has ? it.quantity * it.unitPrice : 0;
      return `<tr style="border-top:1px solid rgba(15,23,42,0.3);min-height:18px;">
  <td style="padding:1px 4px;text-align:center;color:#64748b;border-right:1px solid rgba(15,23,42,0.3);font-variant-numeric:tabular-nums;font-size:10px;">${i + 1}</td>
  <td style="padding:1px 6px;border-right:1px solid rgba(15,23,42,0.3);">${has ? escapeHtml(it.description) : "&nbsp;"}</td>
  <td style="padding:1px 4px;text-align:center;border-right:1px solid rgba(15,23,42,0.3);font-size:10px;">${has ? escapeHtml(it.unit ?? "") : ""}</td>
  <td style="padding:1px 4px;text-align:right;border-right:1px solid rgba(15,23,42,0.3);font-variant-numeric:tabular-nums;">${has ? it.quantity : ""}</td>
  <td style="padding:1px 6px;text-align:right;border-right:1px solid rgba(15,23,42,0.3);font-variant-numeric:tabular-nums;">${has ? fmtCurrency(it.unitPrice) : ""}</td>
  <td style="padding:1px 6px;text-align:right;border-right:1px solid rgba(15,23,42,0.3);font-variant-numeric:tabular-nums;font-weight:500;">${has ? fmtCurrency(amount) : ""}</td>
  <td style="padding:1px 6px;font-size:10px;color:#64748b;">${has ? escapeHtml(it.notes ?? "") : ""}</td>
</tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>御見積書 ${escapeHtml(q.quoteNumber)}</title>
<style>
  @page { size: A4; margin: 6mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; }
  body { font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif; font-size: 12px; line-height: 1.4; }
  .paper { width: 210mm; padding: 6mm 10mm; margin: 0 auto; background: #fff; }
  h1.title { text-align: center; font-size: 24px; font-weight: 600; letter-spacing: 0.5em; margin: 0 0 8px; padding-left: 0.5em; }
  table { border-collapse: collapse; }
  .muted { color: #64748b; }
</style>
</head>
<body>
<div class="paper">
  <h1 class="title">御&nbsp;&nbsp;見&nbsp;&nbsp;積&nbsp;&nbsp;書</h1>

  <table style="width:100%;margin-bottom:8px;">
    <tr>
      <td style="vertical-align:bottom;width:60%;padding-right:24px;">
        <div style="border-bottom:2px solid #0f172a;padding-bottom:2px;display:flex;align-items:flex-end;gap:8px;">
          <span style="font-size:18px;flex:1;">${escapeHtml(customerName)}</span>
          <span style="font-size:14px;padding-bottom:2px;">御中</span>
        </div>
        <div style="margin-top:6px;font-size:11px;display:flex;align-items:center;gap:8px;">
          <span class="muted" style="width:48px;">ご担当</span>
          <span style="flex:1;border-bottom:1px solid #e2e8f0;">${escapeHtml(q.contactName ?? "&nbsp;")}</span>
          ${q.contactName ? '<span style="font-size:11px;">様</span>' : ""}
        </div>
      </td>
      <td style="vertical-align:top;width:40%;">
        <table style="width:100%;border:1px solid #0f172a;font-size:11px;">
          <tr style="border-bottom:1px solid #0f172a;">
            <td style="background:#f1f5f9;border-right:1px solid #0f172a;padding:2px 8px;width:70px;">見積No.</td>
            <td style="padding:2px 8px;text-align:right;font-variant-numeric:tabular-nums;">${escapeHtml(q.quoteNumber)}</td>
          </tr>
          <tr style="border-bottom:1px solid #0f172a;">
            <td style="background:#f1f5f9;border-right:1px solid #0f172a;padding:2px 8px;">見積日</td>
            <td style="padding:2px 8px;text-align:right;">${fmtJpDate(q.issueDate)}</td>
          </tr>
          <tr>
            <td style="background:#f1f5f9;border-right:1px solid #0f172a;padding:2px 8px;">有効期限</td>
            <td style="padding:2px 8px;text-align:right;">${q.validUntil ? fmtJpDate(q.validUntil) : escapeHtml(QUOTE_TERMS.validity)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <table style="width:100%;margin-bottom:8px;">
    <tr>
      <td style="vertical-align:top;width:60%;padding-right:24px;">
        <div style="border-left:4px solid ${PRIMARY};padding-left:8px;">
          <div style="font-size:9px;letter-spacing:0.3em;color:#64748b;">件名</div>
          <div style="font-size:13px;font-weight:600;line-height:1.2;">${escapeHtml(subjectName) || "—"}</div>
        </div>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">下記のとおり、御見積もり申し上げます。</p>
      </td>
      <td style="vertical-align:top;width:40%;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:4px 12px;font-size:10px;line-height:1.4;">
          <div style="font-size:12px;font-weight:600;">${escapeHtml(COMPANY_INFO.name)}</div>
          <div class="muted">${escapeHtml(COMPANY_INFO.postalCode)} ${escapeHtml(COMPANY_INFO.address)}</div>
          <div><span class="muted">TEL</span> ${escapeHtml(COMPANY_INFO.tel)}　<span class="muted">FAX</span> ${escapeHtml(COMPANY_INFO.fax)}</div>
          <div><span class="muted">E</span> ${escapeHtml(COMPANY_INFO.email)}</div>
          <div><span class="muted">担当</span> ${escapeHtml(COMPANY_INFO.contact)}</div>
        </div>
      </td>
    </tr>
  </table>

  <div style="display:flex;align-items:stretch;border:2px solid ${PRIMARY};margin-bottom:6px;background:rgba(220,235,255,0.1);">
    <div style="width:120px;padding:4px 12px;background:${PRIMARY};color:#fff;font-weight:600;border-right:2px solid ${PRIMARY};display:flex;align-items:center;justify-content:center;font-size:11px;letter-spacing:0.2em;">合 計 金 額</div>
    <div style="flex:1;padding:4px 16px;display:flex;align-items:baseline;justify-content:flex-end;gap:6px;">
      <span class="muted" style="font-size:11px;">¥</span>
      <span style="font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1;">${q.total.toLocaleString("ja-JP")}</span>
      <span style="font-size:10px;color:#64748b;">（税込）</span>
    </div>
  </div>

  <table style="width:100%;border:2px solid #0f172a;margin-bottom:4px;">
    <thead>
      <tr style="background:${PRIMARY};color:#fff;font-size:10px;font-weight:600;letter-spacing:0.05em;">
        <th style="padding:2px 4px;text-align:center;border-right:1px solid rgba(255,255,255,0.2);width:26px;">No.</th>
        <th style="padding:2px 6px;text-align:left;border-right:1px solid rgba(255,255,255,0.2);">工事項目・摘要</th>
        <th style="padding:2px 4px;text-align:center;border-right:1px solid rgba(255,255,255,0.2);width:44px;">単位</th>
        <th style="padding:2px 4px;text-align:right;border-right:1px solid rgba(255,255,255,0.2);width:52px;">数量</th>
        <th style="padding:2px 6px;text-align:right;border-right:1px solid rgba(255,255,255,0.2);width:80px;">単価</th>
        <th style="padding:2px 6px;text-align:right;border-right:1px solid rgba(255,255,255,0.2);width:96px;">金額</th>
        <th style="padding:2px 6px;text-align:left;">備考</th>
      </tr>
    </thead>
    <tbody>${itemRowsHtml}</tbody>
  </table>

  <table style="width:100%;margin-top:6px;">
    <tr>
      <td style="vertical-align:top;width:60%;padding-right:24px;font-size:10px;">
        <div class="muted" style="font-weight:500;margin-bottom:2px;">納期 / 支払 / 有効期限</div>
        <div style="padding-left:6px;line-height:1.6;">
          <div><span class="muted" style="display:inline-block;width:48px;">納期</span>${escapeHtml(QUOTE_TERMS.delivery)}</div>
          <div><span class="muted" style="display:inline-block;width:48px;">支払</span>${escapeHtml(QUOTE_TERMS.payment)}</div>
          <div><span class="muted" style="display:inline-block;width:48px;">有効期限</span>${q.validUntil ? fmtJpDate(q.validUntil) : escapeHtml(QUOTE_TERMS.validity)}</div>
        </div>
      </td>
      <td style="vertical-align:top;width:40%;">
        <table style="width:100%;font-size:11px;">
          <tr><td style="padding:2px 12px;text-align:right;" class="muted">小計</td><td style="padding:2px 12px;text-align:right;font-variant-numeric:tabular-nums;">${fmtCurrency(q.subtotal)}</td></tr>
          <tr><td style="padding:2px 12px;text-align:right;" class="muted">消費税 (10%)</td><td style="padding:2px 12px;text-align:right;font-variant-numeric:tabular-nums;">${fmtCurrency(q.tax)}</td></tr>
          <tr><td style="padding:4px 12px;text-align:right;font-weight:700;border-top:1px solid #0f172a;">合計</td><td style="padding:4px 12px;text-align:right;font-weight:700;border-top:1px solid #0f172a;font-variant-numeric:tabular-nums;">${fmtCurrency(q.total)}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  ${
    q.notes
      ? `<div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:8px;">
    <div style="display:inline-block;background:#f1f5f9;padding:2px 8px;font-weight:500;font-size:10px;margin-bottom:4px;">備考</div>
    <p style="font-size:10px;white-space:pre-wrap;margin:0 0 0 4px;">${escapeHtml(q.notes)}</p>
  </div>`
      : ""
  }
</div>
</body>
</html>`;
}
