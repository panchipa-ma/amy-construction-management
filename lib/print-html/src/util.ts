export function escapeHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtCurrency(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

/** ISO date → "令和X年M月D日" 形式 (web の `formatDate` と揃える)。 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}年${m}月${day}日`;
}

/** 「令和X.M.D」短縮形 (web `formatJpDate`)。 */
export function fmtJpDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const era = d.getFullYear() >= 2019 ? `R${d.getFullYear() - 2018}` : `${d.getFullYear()}`;
  return `${era}.${d.getMonth() + 1}.${d.getDate()}`;
}
