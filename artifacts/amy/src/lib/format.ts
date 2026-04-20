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
