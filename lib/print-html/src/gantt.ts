import { escapeHtml } from "./util";
import { isProjectHoliday, japaneseHolidayName } from "./calendar";

/**
 * 工程表 (gantt) PDF テンプレート。
 * Web 版 `PrintGanttSheet` (React) と完全に同一の見た目を生成する HTML を返す。
 * A4/A3 横、案件の全工程期間を 1 ページ。
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
  saturdayWork?: boolean | null;
};

export type GanttForPrint = {
  project: GanttProject;
  phases: GanttPhase[];
};

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

// A4 landscape printable width with the page margin and the sheet padding
// already reserved. Keeping a small safety margin avoids Chromium clipping
// the rightmost columns depending on its print scale.
const A4_CONTENT_W = 1000;
const A3_CONTENT_W = 1414;
const MAX_DAY_W = 26;
const MIN_DAY_W = 8;
const MONTH_LABEL_FONT_SIZE = 10;
const MONTH_LABEL_PADDING_W = 6;
const LABEL_W = 190;
const ROW_H = 40;
const HEADER_ROW_H = 28;
const TOP_HEADER_H = 56;
const MIN_ROWS = 12;
const MAX_MONTHS = 24;

const GRID_BORDER = "1px solid #334155";
const WEEKEND_BG = "#ef4444";
const BAR_COLOR = "#dbeafe";
const BAR_BORDER = "#64748b";

const FONT_FAMILY =
  '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif';

function dateOnly(s: string): Date {
  return new Date(s.slice(0, 10) + "T00:00:00");
}

function holidayFillMarkup(isHoliday: boolean): string {
  if (!isHoliday) return "";
  // SVG is a foreground graphic rather than a CSS background, so Chromium
  // still prints it when "Background graphics" is disabled.
  return `<svg class="holiday-fill" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" fill="${WEEKEND_BG}"></rect></svg>`;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function getPhaseRange(phases: GanttPhase[]): { start: Date; end: Date } | null {
  if (phases.length === 0) return null;
  let start = dateOnly(phases[0].startDate);
  let end = dateOnly(phases[0].endDate);
  for (const phase of phases) {
    const phaseStart = dateOnly(phase.startDate);
    const phaseEnd = dateOnly(phase.endDate);
    if (phaseStart < start) start = phaseStart;
    if (phaseEnd > end) end = phaseEnd;
  }
  return { start, end };
}

function formatPeriodDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getMonthSegments(
  rangeStart: Date,
  rangeEnd: Date,
): { startOffset: number; days: number; label: string }[] {
  const segments: { startOffset: number; days: number; label: string }[] = [];
  let cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const segmentEnd = monthEnd < rangeEnd ? monthEnd : rangeEnd;
    const segmentDays = diffDays(cursor, segmentEnd) + 1;
    segments.push({
      startOffset: diffDays(rangeStart, cursor),
      days: segmentDays,
      label: `${cursor.getMonth() + 1}月`,
    });
    cursor = new Date(segmentEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return segments;
}

function monthLabelMinWidth(label: string): number {
  return label.length * MONTH_LABEL_FONT_SIZE + MONTH_LABEL_PADDING_W;
}

function getDayWidthsForPaper(
  dayCount: number,
  monthSegments: { startOffset: number; days: number; label: string }[],
  pageContentWidth: number,
): number[] | null {
  const availableWidth = pageContentWidth - LABEL_W;
  const baseWidth = Math.min(MAX_DAY_W, availableWidth / Math.max(dayCount, 1));
  const dayWidths = Array.from({ length: dayCount }, () => baseWidth);
  const protectedDays = new Set<number>();

  // Reserve enough width for short month segments (for example, a one-day
  // "7月" segment) before shrinking the ordinary date cells.
  for (const segment of monthSegments) {
    const segmentWidth = segment.days * baseWidth;
    const minimumWidth = monthLabelMinWidth(segment.label);
    if (segmentWidth < minimumWidth) {
      dayWidths[segment.startOffset] += minimumWidth - segmentWidth;
      protectedDays.add(segment.startOffset);
    }
  }

  const currentTotal = dayWidths.reduce((sum, width) => sum + width, 0);
  if (currentTotal <= availableWidth + 0.01) return dayWidths;

  const flexibleIndexes = dayWidths
    .map((_, index) => index)
    .filter((index) => !protectedDays.has(index));
  if (flexibleIndexes.length === 0) return null;

  const protectedWidth = dayWidths.reduce(
    (sum, width, index) => sum + (protectedDays.has(index) ? width : 0),
    0,
  );
  const flexibleWidth = (availableWidth - protectedWidth) / flexibleIndexes.length;
  if (flexibleWidth < MIN_DAY_W) return null;
  for (const index of flexibleIndexes) dayWidths[index] = flexibleWidth;
  return dayWidths;
}

function getCalendarLayout(
  dayCount: number,
  monthSegments: { startOffset: number; days: number; label: string }[],
): {
  paper: "A4" | "A3";
  dayWidths: number[];
  dayFontSize: number;
  totalWidth: number;
} {
  for (const option of [
    { paper: "A4" as const, contentWidth: A4_CONTENT_W },
    { paper: "A3" as const, contentWidth: A3_CONTENT_W },
  ]) {
    const dayWidths = getDayWidthsForPaper(
      dayCount,
      monthSegments,
      option.contentWidth,
    );
    if (!dayWidths) continue;
    const totalWidth = LABEL_W + dayWidths.reduce((sum, width) => sum + width, 0);
    const narrowestDay = Math.min(...dayWidths);
    return {
      paper: option.paper,
      dayWidths,
      dayFontSize: Math.max(5.5, Math.min(11, narrowestDay * 0.55)),
      totalWidth,
    };
  }

  // Extremely long periods still get an A3 document rather than overflowing
  // the browser viewport. The date text remains at the safe minimum size.
  const dayWidths = Array.from({ length: dayCount }, () => MIN_DAY_W);
  return {
    paper: "A3",
    dayWidths,
    dayFontSize: 5.5,
    totalWidth: LABEL_W + dayWidths.reduce((sum, width) => sum + width, 0),
  };
}

function getWorkingSegments(
  start: Date,
  end: Date,
  project: GanttProject,
  rangeStart: Date,
  rangeEnd: Date,
): { startOffset: number; endOffset: number }[] {
  const visibleStart = start < rangeStart ? rangeStart : start;
  const visibleEnd = end > rangeEnd ? rangeEnd : end;
  if (visibleStart > visibleEnd) return [];

  const segments: { startOffset: number; endOffset: number }[] = [];
  let segmentStart: Date | null = null;
  const cursor = new Date(visibleStart);
  while (cursor <= visibleEnd) {
    const isHoliday = isProjectHoliday(cursor, project.saturdayWork ?? true);
    if (!isHoliday && !segmentStart) {
      segmentStart = new Date(cursor);
    }
    if ((isHoliday || cursor.getTime() === visibleEnd.getTime()) && segmentStart) {
      const segmentEnd = new Date(cursor);
      if (isHoliday) segmentEnd.setDate(segmentEnd.getDate() - 1);
      segments.push({
        startOffset: diffDays(rangeStart, segmentStart),
        endOffset: diffDays(rangeStart, segmentEnd),
      });
      segmentStart = null;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return segments;
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
  rangeStart: Date,
  rangeEnd: Date,
): string {
  const dayCount = diffDays(rangeStart, rangeEnd) + 1;
  const periodLabel = `${rangeStart.getFullYear()}/${formatPeriodDate(rangeStart)}〜${rangeEnd.getFullYear()}/${formatPeriodDate(rangeEnd)}`;
  const monthSegments = getMonthSegments(rangeStart, rangeEnd);
  const { paper, dayWidths, dayFontSize, totalWidth } = getCalendarLayout(
    dayCount,
    monthSegments,
  );
  const dayOffsets = [0];
  for (const width of dayWidths) {
    dayOffsets.push(dayOffsets[dayOffsets.length - 1] + width);
  }
  const rowsToShow = Math.max(phases.length, MIN_ROWS);
  const gridHeaderH = HEADER_ROW_H * 3;
  const gridTotalH = gridHeaderH + rowsToShow * ROW_H;

  const days = Array.from({ length: dayCount }, (_, i) => {
    const date = new Date(rangeStart);
    date.setDate(date.getDate() + i);
    return date;
  });

  const monthHeaderCells = monthSegments
    .map(
      (segment) => {
        const segmentWidth =
          dayOffsets[segment.startOffset + segment.days] -
          dayOffsets[segment.startOffset];
        const fontSize =
          segmentWidth <= monthLabelMinWidth(segment.label) * 1.35
            ? MONTH_LABEL_FONT_SIZE
            : 12;
        return `<div class="g-cell" style="grid-column:span ${segment.days};height:${HEADER_ROW_H}px;font-size:${fontSize}px;font-weight:600;background:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.4px">${segment.label}</div>`;
      },
    )
    .join("");

  const dayHeaderCells = days
    .map((date) => {
      const holiday = isProjectHoliday(date, project.saturdayWork ?? true);
      return `<div class="g-cell${holiday ? " holiday-cell" : ""}" style="height:${HEADER_ROW_H}px;font-size:${dayFontSize}px;background:${holiday ? WEEKEND_BG : "#fff"};color:#000;position:relative" title="${escapeHtml(japaneseHolidayName(date) ?? "")}">${holidayFillMarkup(holiday)}<span class="cell-content">${date.getDate()}</span></div>`;
    })
    .join("");

  const dowCells = days
    .map((date) => {
      const dow = date.getDay();
      const holiday = isProjectHoliday(date, project.saturdayWork ?? true);
      const color = "#000";
      return `<div class="g-cell${holiday ? " holiday-cell" : ""}" style="height:${HEADER_ROW_H}px;font-size:${dayFontSize}px;background:${holiday ? WEEKEND_BG : "#fff"};color:${color};position:relative" title="${escapeHtml(japaneseHolidayName(date) ?? "")}">${holidayFillMarkup(holiday)}<span class="cell-content">${DOW[dow]}</span></div>`;
    })
    .join("");

  const rows = Array.from({ length: rowsToShow })
    .map((_, idx) => {
      const phase = phases[idx];
      const label = `<div class="g-cell" style="height:${ROW_H}px;font-size:12px;padding:4px 6px;justify-content:flex-start;text-align:left;line-height:1.25;overflow-wrap:anywhere">${escapeHtml(phase?.name ?? "")}</div>`;
      const cells = days
        .map((date) => {
          const holiday = isProjectHoliday(date, project.saturdayWork ?? true);
          return `<div class="g-cell${holiday ? " holiday-cell" : ""}" style="height:${ROW_H}px;background:${holiday ? WEEKEND_BG : "#fff"};position:relative">${holidayFillMarkup(holiday)}</div>`;
        })
        .join("");
      return label + cells;
    })
    .join("");

  const bars = phases
    .map((p, idx) => {
      const ps = dateOnly(p.startDate);
      const pe = dateOnly(p.endDate);
      const segments = getWorkingSegments(ps, pe, project, rangeStart, rangeEnd);
      if (segments.length === 0) return "";
      return segments
        .map((segment) => {
          const left = LABEL_W + dayOffsets[segment.startOffset] + 2;
          const right = LABEL_W + dayOffsets[segment.endOffset + 1] - 2;
          const width = Math.max(8, right - left);
          const barHeight = 24;
          const top = gridHeaderH + idx * ROW_H + (ROW_H - barHeight) / 2;
          return `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${barHeight}px;background:${BAR_COLOR};border:1px solid ${BAR_BORDER};border-radius:5px;box-sizing:border-box"></div>`;
        })
        .join("");
    })
    .join("");

  const headerBar =
    project.companyName || project.supervisorPhone
      ? `<div style="width:${totalWidth}px;display:flex;justify-content:flex-end;align-items:baseline;gap:20px;padding:2px 4px 6px;font-size:13px">${project.companyName ? `<span style="font-weight:600">${escapeHtml(project.companyName)}</span>` : ""}${project.siteSupervisor ? `<span>現場担当者：${escapeHtml(project.siteSupervisor)}</span>${project.supervisorPhone ? `<span>現場担当者電話番号：${escapeHtml(project.supervisorPhone)}</span>` : ""}` : project.supervisorPhone ? `<span>${escapeHtml(project.supervisorPhone)}</span>` : ""}</div>`
      : "";

  return `<div class="gantt-sheet" style="width:${totalWidth + 24}px;margin:0 auto;background:#fff;color:#000;font-family:${FONT_FAMILY};padding:12px;box-sizing:border-box;page-break-after:auto">
${headerBar}
<div style="display:grid;grid-template-columns:${LABEL_W}px 1fr 70px 140px 80px 150px;width:${totalWidth}px">
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:14px;padding:6px">工事名</div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:18px;font-weight:600;padding:6px 8px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;line-height:1.2"><span>${escapeHtml(project.name)}</span><span style="font-size:11px;font-weight:400;margin-top:5px">工期：${periodLabel}</span></div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:13px">構造</div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:13px"></div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:13px">作成者</div>
  <div class="g-cell" style="height:${TOP_HEADER_H}px;font-size:14px">${escapeHtml(project.siteSupervisor ?? "")}</div>
</div>
<div style="position:relative;width:${totalWidth}px">
   <div style="display:grid;grid-template-columns:${LABEL_W}px ${dayWidths.map((width) => `${width}px`).join(" ")};grid-auto-rows:max-content;width:${totalWidth}px">
    <div class="g-cell" style="height:${HEADER_ROW_H}px;font-size:12px;font-weight:600">月</div>
    ${monthHeaderCells}
    <div class="g-cell" style="height:${HEADER_ROW_H}px;font-size:12px;font-weight:600">日</div>
    ${dayHeaderCells}
    <div class="g-cell" style="height:${HEADER_ROW_H}px;font-size:12px;font-weight:600">曜日</div>
    ${dowCells}
    ${rows}
  </div>
  <div style="position:absolute;left:0;top:0;width:${totalWidth}px;height:${gridTotalH}px;pointer-events:none">${bars}</div>
</div>
</div>`;
}

export function renderGanttHtml(data: GanttForPrint): string {
  const range = getPhaseRange(data.phases);
  const paper = range
    ? getCalendarLayout(
        diffDays(range.start, range.end) + 1,
        getMonthSegments(range.start, range.end),
      ).paper
    : "A4";
  const sheets =
    !range
      ? `<div style="padding:40px;font-family:${FONT_FAMILY};color:#666">工程が登録されていません。</div>`
      : renderSheet(data.project, data.phases, range.start, range.end);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>工程表 ${escapeHtml(data.project.name)}</title>
<style>
  @page { size: ${paper} landscape; margin: 6mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: ${FONT_FAMILY}; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .g-cell {
    border: ${GRID_BORDER};
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    background: #fff;
    color: #000;
    overflow: hidden;
  }
  .holiday-cell {
    border-color: #e11d48;
  }
  .holiday-fill {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    pointer-events: none;
  }
  .cell-content {
    position: relative;
    z-index: 1;
  }
</style>
</head>
<body>
${sheets}
</body>
</html>`;
}
