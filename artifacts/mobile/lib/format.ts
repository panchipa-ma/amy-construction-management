export function yen(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "¥0";
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return fmtDate(s) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  estimating: "見積中",
  contracted: "契約済",
  in_progress: "施工中",
  completed: "竣工",
  archived: "アーカイブ",
};

export const COST_CATEGORY_LABEL: Record<string, string> = {
  material: "材料",
  subcontract: "外注",
  labor: "人工",
  expense: "経費",
  other: "その他",
};

export const PHASE_STATUS_LABEL: Record<string, string> = {
  planned: "予定",
  in_progress: "進行中",
  done: "完了",
};

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits) + "%";
}
