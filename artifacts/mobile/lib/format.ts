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
  contracted: "受注",
  in_progress: "施工中",
  completed: "竣工",
  archived: "完了",
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
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  // (mo+1) 月の 0 日 = (mo+1) 月の前月（=mo）の最終日 → 翌月末は (mo+1) を JS の (mo) として渡す
  // JS: new Date(y, monthIndex, 0) で前月末。翌月末が欲しいので monthIndex = mo + 1
  const dt = new Date(y, mo + 1, 0);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function addDaysISO(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export function diffDaysISO(a: string, b: string): number {
  const am = /^(\d{4})-(\d{2})-(\d{2})/.exec(a);
  const bm = /^(\d{4})-(\d{2})-(\d{2})/.exec(b);
  if (!am || !bm) return 0;
  const da = new Date(Number(am[1]), Number(am[2]) - 1, Number(am[3]));
  const db = new Date(Number(bm[1]), Number(bm[2]) - 1, Number(bm[3]));
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}
