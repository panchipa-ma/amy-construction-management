export function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 指定日が属する月の翌月末日を YYYY-MM-DD で返す。
 * 例: 2026-05-07 → 2026-06-30
 */
export function endOfNextMonthISO(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  // new Date(y, m+1, 0) = (m+1)月の0日 = m+1月の前月（=m+1）の最終日
  // ここで m は 1-12 の値なので、JS の 0-index に直すと (m-1)+2 = m+1
  const dt = new Date(y ?? 1970, (m ?? 1) + 1, 0);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "¥0";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch (e) {
    return "-";
  }
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return "0.0%";
  return `${rate.toFixed(1)}%`;
}
