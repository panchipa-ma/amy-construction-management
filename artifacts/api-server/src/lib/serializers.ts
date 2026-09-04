export function n(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function computePlannedCost(
  contractAmount: unknown,
  standardProfitRatePercent: unknown,
  salesCommissionRatePercent: unknown,
): number {
  const contract = Math.max(0, n(contractAmount));
  const standardProfitRate = Math.min(
    100,
    Math.max(0, n(standardProfitRatePercent)),
  );
  const salesCommissionRate = Math.min(
    100,
    Math.max(0, n(salesCommissionRatePercent)),
  );
  const standardProfit = Math.round(contract * (standardProfitRate / 100));
  const salesCommission = Math.round(
    contract * (salesCommissionRate / 100),
  );
  return Math.max(0, contract - standardProfit - salesCommission);
}

export function isoDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return null;
}

export function isoDateTime(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return new Date(v).toISOString();
  return new Date().toISOString();
}

export type LineItem = {
  description: string;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
};

export function computeTotals(items: LineItem[]): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const subtotal = items.reduce(
    (sum, item) => sum + n(item.quantity) * n(item.unitPrice),
    0,
  );
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  return { subtotal, tax, total };
}
