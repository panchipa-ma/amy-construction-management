import type { ProjectPhase } from "@workspace/api-client-react";
import type { CSSProperties } from "react";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

function dateOnly(s: string): Date {
  return new Date(s.slice(0, 10) + "T00:00:00");
}

function fmtDot(d?: string | null): string {
  if (!d) return "";
  return d.slice(0, 10).replace(/-/g, ".");
}

export type SheetProject = {
  name: string;
  customerName?: string | null;
  unitNumber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  siteSupervisor?: string | null;
};

const DAY_W = 26;
const LABEL_W = 140;
const ROW_H = 34;
const HEADER_ROW_H = 26;

const FONT_FAMILY =
  '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif';

function cellBase(extra?: CSSProperties): CSSProperties {
  return {
    border: "1px solid #000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    boxSizing: "border-box",
    background: "#fff",
    color: "#000",
    ...extra,
  };
}

export function PrintGanttSheet({
  project,
  phases,
  year,
  month,
  minRows = 12,
}: {
  project: SheetProject;
  phases: ProjectPhase[];
  year: number;
  month: number;
  minRows?: number;
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
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
  const rowsToShow = Math.max(phasesInMonth.length, minRows);

  const gridHeaderH = HEADER_ROW_H * 2;
  const gridTotalH = gridHeaderH + rowsToShow * ROW_H;

  return (
    <div
      style={{
        width: totalWidth + 24,
        background: "#fff",
        color: "#000",
        fontFamily: FONT_FAMILY,
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      {/* ─── 上部 ヘッダ ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${LABEL_W}px 1fr 60px 110px 80px 130px`,
          width: totalWidth,
        }}
      >
        {/* 工事名 (rowspan 3) */}
        <div
          style={cellBase({
            gridRow: "span 3",
            fontSize: 14,
            padding: 6,
          })}
        >
          工事名
        </div>
        {/* 案件名 (rowspan 3) */}
        <div
          style={cellBase({
            gridRow: "span 3",
            fontSize: 16,
            fontWeight: 600,
            textDecoration: "underline",
            padding: 8,
          })}
        >
          {project.name}
        </div>
        {/* row1: 構造 / (空) / unitNumber (colspan2) */}
        <div style={cellBase({ height: HEADER_ROW_H })}>構造</div>
        <div style={cellBase({ height: HEADER_ROW_H })}></div>
        <div
          style={cellBase({
            height: HEADER_ROW_H,
            gridColumn: "span 2",
            fontSize: 13,
          })}
        >
          {project.unitNumber ?? ""}
        </div>
        {/* row2: 計画 / startDate / 作成者 (rowspan2) / supervisor (rowspan2) */}
        <div style={cellBase({ height: HEADER_ROW_H })}>計画</div>
        <div style={cellBase({ height: HEADER_ROW_H, fontSize: 13 })}>
          {fmtDot(project.startDate)}
        </div>
        <div style={cellBase({ height: HEADER_ROW_H, gridRow: "span 2" })}>
          作成者
        </div>
        <div
          style={cellBase({
            height: HEADER_ROW_H,
            gridRow: "span 2",
            fontSize: 13,
          })}
        >
          {project.siteSupervisor ?? ""}
        </div>
        {/* row3: 実施 / endDate */}
        <div style={cellBase({ height: HEADER_ROW_H })}>実施</div>
        <div style={cellBase({ height: HEADER_ROW_H, fontSize: 13 })}>
          {fmtDot(project.endDate)}
        </div>
      </div>

      {/* ─── 日付グリッド + 工事項目 ─── */}
      <div
        style={{
          position: "relative",
          width: totalWidth,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${LABEL_W}px repeat(${daysInMonth}, ${DAY_W}px)`,
            gridAutoRows: "max-content",
            width: totalWidth,
          }}
        >
          {/* 日付行: 令和n年m月 + 日数 */}
          <div style={cellBase({ height: HEADER_ROW_H, fontSize: 12 })}>
            {monthLabel}
          </div>
          {days.map((d) => {
            const dow = new Date(year, month, d).getDay();
            const wknd = dow === 0 || dow === 6;
            return (
              <div
                key={`d-${d}`}
                style={cellBase({
                  height: HEADER_ROW_H,
                  fontSize: 11,
                  background: wknd ? "#dcdcdc" : "#fff",
                })}
              >
                {d}
              </div>
            );
          })}
          {/* 曜日行: 工事項目 + 曜日 */}
          <div style={cellBase({ height: HEADER_ROW_H, fontSize: 12 })}>
            工事項目
          </div>
          {days.map((d) => {
            const dow = new Date(year, month, d).getDay();
            const wknd = dow === 0 || dow === 6;
            const color =
              dow === 0 ? "#cc0000" : dow === 6 ? "#0066cc" : "#000";
            return (
              <div
                key={`w-${d}`}
                style={cellBase({
                  height: HEADER_ROW_H,
                  fontSize: 11,
                  background: wknd ? "#dcdcdc" : "#fff",
                  color,
                })}
              >
                {DOW[dow]}
              </div>
            );
          })}
          {/* 工事項目行 */}
          {Array.from({ length: rowsToShow }).map((_, idx) => {
            const phase = phasesInMonth[idx];
            return (
              <div
                key={`row-${idx}`}
                style={{
                  display: "contents",
                }}
              >
                <div
                  style={cellBase({
                    height: ROW_H,
                    fontSize: 13,
                    padding: "0 6px",
                  })}
                >
                  {phase?.name ?? ""}
                </div>
                {days.map((d) => {
                  const dow = new Date(year, month, d).getDay();
                  const wknd = dow === 0 || dow === 6;
                  return (
                    <div
                      key={`c-${idx}-${d}`}
                      style={{
                        border: "1px dashed #888",
                        boxSizing: "border-box",
                        background: wknd ? "#ececec" : "#fff",
                        height: ROW_H,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ─── 工程アロー オーバーレイ ─── */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: totalWidth,
            height: gridTotalH,
            pointerEvents: "none",
          }}
        >
          {phasesInMonth.map((p, idx) => {
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
            const arrowSize = 5;
            const showArrowHead = pe <= monthEndDate;
            return (
              <div
                key={p.id}
                style={{
                  position: "absolute",
                  left,
                  top: top - 1,
                  width,
                  height: 2,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: 2,
                    background: "#cc0000",
                  }}
                />
                {showArrowHead && (
                  <div
                    style={{
                      position: "absolute",
                      right: -arrowSize,
                      top: -arrowSize + 1,
                      width: 0,
                      height: 0,
                      borderLeft: `${arrowSize}px solid #cc0000`,
                      borderTop: `${arrowSize}px solid transparent`,
                      borderBottom: `${arrowSize}px solid transparent`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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
  while (y < endY || (y === endY && m <= endM)) {
    result.push({ year: y, month: m });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return result;
}
