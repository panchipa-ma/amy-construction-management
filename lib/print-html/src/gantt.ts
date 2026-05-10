import { escapeHtml } from "./util";

/**
 * 工程表 (gantt) PDF テンプレート。
 * Web 版 `PrintGanttSheet` (React) と完全に同一の見た目を生成する HTML を返す。
 * A4 横、月ごとに 1 ページ。
 *
 * Web は従来 React + html2canvas + jsPDF で 1 月 1 ページの画像を貼り付けていたが、
 * このテンプレートに切り替えることで Web/モバイル両方が同じ HTML を共有する。
 */

export type GanttPhase = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export type GanttProject = {
  name: string;
  customerName?: string | null;
  unitNumber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  siteSupervisor?: string | null;
  supervisorPhone?: string | null;
  companyName?: string | null;
};

export type GanttForPrint = {
  project: GanttProject;
  phases: GanttPhase[];
};

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

const DAY_W = 26;
const LABEL_W = 140;
const ROW_H = 34;
const HEADER_ROW_H = 28;
const TOP_HEADER_H = 56;
const MIN_ROWS = 12;
const MAX_MONTHS = 24;

const GRID_BORDER = "1px solid #444";
const WEEKEND_BG = "#e8e8e8";
const ARROW_RED = "#d92020";

const FONT_FAMILY =
  '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif';

function dateOnly(s: string): Date {
  return new Date(s.slice(0, 10) + "T00:00:00");
}

export function getMonthsForPhases(
  phases: { startDate: string; endDate: string }[],
): { year: number; month: number }[] {
  if (phases.length === 0) return [];
  let min = dateOnly(phases[0].startDate);
  let max = dateOnly(phases[0].endDate);
  for (const p of phases) {
    const s = dateOnly(p.startDate);
    const e = dateOnly(p.endDate);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  const result: { year: number; month: number }[] = [];
  let y = min.getFullYear();
  let m = min.getMonth();
  const endY = max.getFullYear();
  const endM = max.getMonth();
  while ((y < endY || (y === endY && m <= endM)) && result.length < MAX_MONTHS) {
    result.push({ year: y, month: m });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return result;
}

function renderSheet(
  project: GanttProject,
  phases: GanttPhase[],
  year: number,
  month: number,
  isLast: boolean,
): string {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const reiwa = year - 2018;
  const monthLabel = `令和${reiwa}年${month + 1}月`;
  const totalWidth = LABEL_W + daysInMonth * DAY_W;

  const monthStart = new Date(year, month, 1);
  const monthEndDate = new Date(year, month + 1, 0);
  const phasesInMonth = phases
    .filter((p) => {
      const s = dateOnly(p.startDate);
      const e = dateOnly(p.endDate);
      return e >= monthStart && s <= monthEndDate;
    })
    .slice()
    .sort(
      (a, b) =>
        dateOnly(a.startDate).getTime() - dateOnly(b.startDate).getTime(),
    );
  const rowsToShow = Math.max(phasesInMonth.length, MIN_ROWS);
  const gridHeaderH = HEADER_ROW_H * 2;
  const gridTotalH = gridHeaderH + rowsToShow * ROW_H;

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const dayHeaderCells = days
    .map((d) => {
      const dow = new Date(year, month, d).getDay();
      const wknd = dow === 0 || dow === 6;
      return `<div class="g-cell" style="height:${HEADER_ROW_H}px;font-size:11px;background:${wknd ? WEEKEND_BG : "#fff"}">${d}</div>`;
    })
    .join("");

  const dowCells = days
    .map((d) => {
      const dow = new Date(year, month, d).getDay();
      const wknd = dow === 0 || dow === 6;
      const color = dow === 0 ? "#cc0000" : dow === 6 ? "#0066cc" : "#000";
      return `<div class="g-cell" style="height:${HEADER_ROW_H}px;font-size:11px;background:${wknd ? WEEKEND_BG : "#fff"};color:${color}">${DOW[dow]}</div>`;
    })
    .join("");

  const rows = Array.from({ length: rowsToShow })
    .map((_, idx) => {
      const phase = phasesInMonth[idx];
      const label = `<div class="g-cell" style="height:${ROW_H}px;font-size:13px;padding:0 6px;justify-content:flex-start">${escapeHtml(phase?.name ?? "")}</div>`;
      const cells = days
        .map((d) => {
          const dow = new Date(year, month, d).getDay();
          const wknd = dow === 0 || dow === 6;
          return `<div style="border:${GRID_BORDER};box-sizing:border-box;background:${wknd ? WEEKEND_BG : "#fff"};height:${ROW_H}px"></div>`;
        })
        .join("");
      return label + cells;
    })
    .join("");

  const arrows = phasesInMonth
    .map((p, idx) => {
      const ps = dateOnly(p.startDate);
      const pe = dateOnly(p.endDate);
      const visStart = ps < monthStart ? monthStart : ps;
      const visEnd = pe > monthEndDate ? monthEndDate : pe;
      const startDay = visStart.getDate();
      const endDay = visEnd.getDate();
      const left = LABEL_W + (startDay - 1) * DAY_W + DAY_W * 0.25;
      const right = LABEL_W + (endDay - 1) * DAY_W + DAY_W * 0.75;
      const width = Math.max(10, right - left);
      const top = gridHeaderH + idx * ROW_H + ROW_H / 2;
      const lineH = 3;
      const arrowSize = 7;
      const showArrowHead = pe <= monthEndDate;
      const head = showArrowHead
        ? `<div style="position:absolute;right:-${arrowSize}px;top:${-arrowSize + lineH / 2}px;width:0;height:0;border-left:${arrowSize}px solid ${ARROW_RED};border-top:${arrowSize}px solid transparent;border-bottom:${arrowSize}px solid transparent"></div>`
        : "";
      return `<div style="position:absolute;left:${left}px;top:${top - lineH / 2}px;width:${width}px;height:${lineH}px"><div style="width:100%;height:${lineH}px;background:${ARROW_RED};border-radius:1px"></div>${head}</div>`;
    })
    .join("");

  const headerBar =
    project.companyName || project.supervisorPhone
      ? `<div style="width:${totalWidth}px;display:flex;justify-content:flex-end;align-items:baseline;gap:20px;padding:2px 4px 6px;font-size:13px">${project.companyName ? `<span style="font-weight:600">${escapeHtml(project.companyName)}</span>` : ""}${project.supervisorPhone ? `<span>TEL: ${escapeHtml(project.supervisorPhone)}</span>` : ""}</div>`
      : "";

  const breakStyle = isLast ? "" : "page-break-after:always;";

  return `<div class="gantt-sheet" style="width:${totalWidth + 24}px;background:#fff;color:#000;font-family:${FONT_FAMILY};padding:12px;box-sizing:border-box;${breakStyle}">
${headerBar}
<div style="display:grid;grid-template-columns:${LABEL_W}px 1fr 70px 140px 80px 150px;width:${totalWidth}px">
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:14px;padding:6px">工事名</div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:18px;font-weight:600;padding:8px">${escapeHtml(project.name)}</div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:13px">構造</div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:13px"></div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:13px">作成者</div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:14px">${escapeHtml(project.siteSupervisor ?? "")}</div>
</div>
<div style="position:relative;width:${totalWidth}px">
  <div style="display:grid;grid-template-columns:${LABEL_W}px repeat(${daysInMonth}, ${DAY_W}px);grid-auto-rows:max-content;width:${totalWidth}px">
    <div class="g-cell" style="height:${HEADER_ROW_H}px;font-size:12px">${monthLabel}</div>
    ${dayHeaderCells}
    <div class="g-cell" style="height:${HEADER_ROW_H}px;font-size:12px">工事項目</div>
    ${dowCells}
    ${rows}
  </div>
  <div style="position:absolute;left:0;top:0;width:${totalWidth}px;height:${gridTotalH}px;pointer-events:none">${arrows}</div>
</div>
</div>`;
}

export function renderGanttHtml(data: GanttForPrint): string {
  const months = getMonthsForPhases(data.phases);
  const sheets =
    months.length === 0
      ? `<div style="padding:40px;font-family:${FONT_FAMILY};color:#666">工程が登録されていません。</div>`
      : months
          .map((m, i) =>
            renderSheet(
              data.project,
              data.phases,
              m.year,
              m.month,
              i === months.length - 1,
            ),
          )
          .join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>工程表 ${escapeHtml(data.project.name)}</title>
<style>
  @page { size: A4 landscape; margin: 6mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: ${FONT_FAMILY}; }
  .g-cell {
    border: ${GRID_BORDER};
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    background: #fff;
    color: #000;
  }
</style>
</head>
<body>
${sheets}
</body>
</html>`;
}
