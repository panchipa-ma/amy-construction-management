import { Feather } from "@expo/vector-icons";
import {
  useListAllProjectPhases,
  useListScheduleEntries,
  useListStaffAssignments,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import {
  Badge,
  Body,
  Card,
  EmptyState,
  ErrorState,
  Loader,
  Muted,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { addDaysISO, fmtDate, todayLocalISO } from "@/lib/format";

const PROJECT_PALETTE: { bg: string; fg: string; border: string }[] = [
  { bg: "#dbeafe", fg: "#1e3a8a", border: "#93c5fd" }, // blue
  { bg: "#d1fae5", fg: "#065f46", border: "#6ee7b7" }, // emerald
  { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" }, // amber
  { bg: "#ede9fe", fg: "#5b21b6", border: "#c4b5fd" }, // purple
  { bg: "#fce7f3", fg: "#9d174d", border: "#f9a8d4" }, // pink
  { bg: "#cffafe", fg: "#155e75", border: "#67e8f9" }, // cyan
  { bg: "#ffedd5", fg: "#9a3412", border: "#fdba74" }, // orange
  { bg: "#ecfccb", fg: "#3f6212", border: "#bef264" }, // lime
];

const CELL_W = 52;
const ROW_H = 56;
const HDR_H = 44;
const STAFF_W = 132;

function toKey(s: string | Date): string {
  if (typeof s === "string") return s.slice(0, 10);
  return s.toISOString().slice(0, 10);
}

const JP_DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default function StaffAssignmentsScreen() {
  const c = useColors();
  const [tab, setTab] = useState<"matrix" | "list">("matrix");

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          flexDirection: "row",
          padding: 12,
          gap: 8,
          backgroundColor: c.background,
        }}
      >
        {(
          [
            { value: "matrix", label: "出面表 (日別)" },
            { value: "list", label: "案件一覧" },
          ] as const
        ).map((t) => {
          const active = tab === t.value;
          return (
            <Pressable
              key={t.value}
              onPress={() => setTab(t.value)}
              style={({ pressed }) => [
                {
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  backgroundColor: active ? c.primary : c.card,
                  borderWidth: 1,
                  borderColor: active ? c.primary : c.border,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Body
                style={{
                  color: active ? c.primaryForeground : c.foreground,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {t.label}
              </Body>
            </Pressable>
          );
        })}
      </View>

      {tab === "matrix" ? <MatrixView /> : <ListView />}
    </View>
  );
}

/* ============= MATRIX VIEW ============= */

function MatrixView() {
  const c = useColors();
  const router = useRouter();
  const [anchor, setAnchor] = useState<string>(todayLocalISO());
  const [days, setDays] = useState<number>(14);

  const from = anchor;
  const to = addDaysISO(anchor, days - 1);

  const dateList = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < days; i++) arr.push(addDaysISO(anchor, i));
    return arr;
  }, [anchor, days]);

  const staffQ = useListStaffAssignments({ from, to });
  const scheduleQ = useListScheduleEntries({ from, to });
  const phasesQ = useListAllProjectPhases();

  const staff = staffQ.data ?? [];
  const entries = scheduleQ.data ?? [];
  const allPhases = phasesQ.data ?? [];

  const staffPhaseSpans = useMemo(() => {
    const m = new Map<
      string,
      Array<{
        projectId: string;
        projectName: string;
        startDate: string;
        endDate: string;
      }>
    >();
    for (const p of allPhases) {
      if (!p.staffId) continue;
      if (!m.has(p.staffId)) m.set(p.staffId, []);
      m.get(p.staffId)!.push({
        projectId: p.projectId,
        projectName: p.projectName,
        startDate: toKey(p.startDate),
        endDate: toKey(p.endDate),
      });
    }
    return m;
  }, [allPhases]);

  type Cell = {
    id: string;
    projectId: string;
    projectName: string;
  };

  const grid = useMemo(() => {
    const m = new Map<string, Map<string, Cell[]>>();
    for (const e of entries) {
      const dk = toKey(e.date);
      if (!m.has(e.staffId)) m.set(e.staffId, new Map());
      const dm = m.get(e.staffId)!;
      if (!dm.has(dk)) dm.set(dk, []);
      dm.get(dk)!.push({
        id: e.id,
        projectId: e.projectId,
        projectName: e.projectName,
      });
    }
    for (const [staffId, spans] of staffPhaseSpans) {
      if (!m.has(staffId)) m.set(staffId, new Map());
      const dm = m.get(staffId)!;
      for (const d of dateList) {
        for (const span of spans) {
          if (d < span.startDate || d > span.endDate) continue;
          if (!dm.has(d)) dm.set(d, []);
          const existing = dm.get(d)!;
          if (!existing.some((x) => x.projectId === span.projectId)) {
            existing.push({
              id: `phase-${staffId}-${span.projectId}-${d}`,
              projectId: span.projectId,
              projectName: span.projectName,
            });
          }
        }
      }
    }
    return m;
  }, [entries, staffPhaseSpans, dateList]);

  const projectColor = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) ids.add(e.projectId);
    for (const p of allPhases) ids.add(p.projectId);
    const map = new Map<string, (typeof PROJECT_PALETTE)[number]>();
    Array.from(ids).forEach((id, i) =>
      map.set(id, PROJECT_PALETTE[i % PROJECT_PALETTE.length]),
    );
    return map;
  }, [entries, allPhases]);

  const projectLegend = useMemo(() => {
    const map = new Map<
      string,
      { name: string; minStart: string; maxEnd: string }
    >();
    for (const e of entries) {
      if (!map.has(e.projectId))
        map.set(e.projectId, {
          name: e.projectName,
          minStart: "9999-12-31",
          maxEnd: "0000-01-01",
        });
    }
    for (const p of allPhases) {
      const sd = toKey(p.startDate);
      const ed = toKey(p.endDate);
      if (!map.has(p.projectId))
        map.set(p.projectId, { name: p.projectName, minStart: sd, maxEnd: ed });
      else {
        const cur = map.get(p.projectId)!;
        if (sd < cur.minStart) cur.minStart = sd;
        if (ed > cur.maxEnd) cur.maxEnd = ed;
      }
    }
    return Array.from(map.entries());
  }, [entries, allPhases]);

  const staffDayCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [sid, dateMap] of grid) {
      let n = 0;
      for (const [, cellEntries] of dateMap) if (cellEntries.length > 0) n++;
      counts.set(sid, n);
    }
    return counts;
  }, [grid]);

  const jumpToProject = (projectId: string) => {
    const info = projectLegend.find(([id]) => id === projectId);
    if (info) setAnchor(info[1].minStart);
  };

  const today = todayLocalISO();

  if (staffQ.isLoading || scheduleQ.isLoading || phasesQ.isLoading)
    return <Loader />;
  if (staffQ.isError || scheduleQ.isError)
    return (
      <ErrorState
        onRetry={() => {
          staffQ.refetch();
          scheduleQ.refetch();
        }}
      />
    );

  const matrixWidth = STAFF_W + dateList.length * CELL_W;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={
            staffQ.isFetching || scheduleQ.isFetching || phasesQ.isFetching
          }
          onRefresh={() => {
            staffQ.refetch();
            scheduleQ.refetch();
            phasesQ.refetch();
          }}
        />
      }
    >
      {/* Anchor + days controls */}
      <View style={{ paddingHorizontal: 12, marginBottom: 10 }}>
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Pressable
              onPress={() => setAnchor(addDaysISO(anchor, -days))}
              style={({ pressed }) => [
                {
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                  justifyContent: "center",
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Feather name="chevron-left" size={18} color={c.foreground} />
            </Pressable>
            <Pressable
              onPress={() => setAnchor(todayLocalISO())}
              style={({ pressed }) => [
                {
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Body style={{ fontWeight: "700" }}>{fmtDate(anchor)}</Body>
              <Muted style={{ fontSize: 10 }}>タップで今日へ</Muted>
            </Pressable>
            <Pressable
              onPress={() => setAnchor(addDaysISO(anchor, days))}
              style={({ pressed }) => [
                {
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                  justifyContent: "center",
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Feather name="chevron-right" size={18} color={c.foreground} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            {[7, 14, 21, 30].map((d) => {
              const active = days === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDays(d)}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: active ? c.primary : c.card,
                      borderWidth: 1,
                      borderColor: active ? c.primary : c.border,
                      alignItems: "center",
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Body
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: active ? c.primaryForeground : c.foreground,
                    }}
                  >
                    {d}日
                  </Body>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </View>

      {/* Project legend */}
      {projectLegend.length > 0 ? (
        <View style={{ paddingHorizontal: 12, marginBottom: 10 }}>
          <Card>
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
            >
              <Muted style={{ fontSize: 11, marginRight: 4 }}>案件:</Muted>
              {projectLegend.map(([id, info]) => {
                const col = projectColor.get(id) ?? PROJECT_PALETTE[0];
                return (
                  <Pressable
                    key={id}
                    onPress={() => jumpToProject(id)}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 4,
                        backgroundColor: col.bg,
                        borderWidth: 1,
                        borderColor: col.border,
                      },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Body
                      style={{ fontSize: 11, fontWeight: "600", color: col.fg }}
                    >
                      {info.name}
                    </Body>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </View>
      ) : null}

      {/* Matrix */}
      {staff.length === 0 ? (
        <View style={{ paddingHorizontal: 12 }}>
          <EmptyState icon="users" title="職人が登録されていません" />
        </View>
      ) : (
        <View style={{ paddingHorizontal: 12 }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 8,
              overflow: "hidden",
              backgroundColor: c.card,
            }}
          >
            <View style={{ flexDirection: "row" }}>
              {/* Sticky staff column */}
              <View
                style={{
                  width: STAFF_W,
                  borderRightWidth: 1,
                  borderRightColor: c.border,
                  backgroundColor: c.card,
                }}
              >
                {/* Header cell */}
                <View
                  style={{
                    height: HDR_H,
                    paddingHorizontal: 8,
                    backgroundColor: c.primary,
                    justifyContent: "center",
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                  }}
                >
                  <Body
                    style={{
                      color: c.primaryForeground,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    職人 / 稼働
                  </Body>
                </View>
                {staff.map((s) => (
                  <View
                    key={s.staffId}
                    style={{
                      height: ROW_H,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Feather
                        name="user"
                        size={11}
                        color={c.mutedForeground}
                      />
                      <Body
                        style={{ fontSize: 12, fontWeight: "700", flex: 1 }}
                        numberOfLines={1}
                      >
                        {s.staffName}
                      </Body>
                      <Badge>{staffDayCount.get(s.staffId) ?? 0}</Badge>
                    </View>
                    <Muted style={{ fontSize: 10 }} numberOfLines={1}>
                      {s.role}
                      {s.company ? ` · ${s.company}` : ""}
                    </Muted>
                  </View>
                ))}
              </View>

              {/* Scrollable date columns */}
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View style={{ width: matrixWidth - STAFF_W }}>
                  {/* Date header row */}
                  <View
                    style={{
                      flexDirection: "row",
                      height: HDR_H,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                    }}
                  >
                    {dateList.map((d) => {
                      const dt = new Date(d + "T00:00:00");
                      const dow = dt.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const isToday = d === today;
                      return (
                        <View
                          key={d}
                          style={{
                            width: CELL_W,
                            backgroundColor: isToday
                              ? c.accent
                              : isWeekend
                                ? c.muted
                                : c.primary,
                            borderRightWidth: 1,
                            borderRightColor: c.border,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Body
                            style={{
                              fontSize: 11,
                              fontWeight: "700",
                              color:
                                isToday || !isWeekend
                                  ? c.primaryForeground
                                  : c.foreground,
                            }}
                          >
                            {dt.getMonth() + 1}/{dt.getDate()}
                          </Body>
                          <Body
                            style={{
                              fontSize: 9,
                              color:
                                isToday || !isWeekend
                                  ? c.primaryForeground
                                  : dow === 0
                                    ? c.destructive
                                    : dow === 6
                                      ? "#2563eb"
                                      : c.foreground,
                            }}
                          >
                            ({JP_DOW[dow]})
                          </Body>
                        </View>
                      );
                    })}
                  </View>
                  {/* Body rows */}
                  {staff.map((s) => (
                    <View
                      key={s.staffId}
                      style={{
                        flexDirection: "row",
                        height: ROW_H,
                        borderBottomWidth: 1,
                        borderBottomColor: c.border,
                      }}
                    >
                      {dateList.map((d) => {
                        const dt = new Date(d + "T00:00:00");
                        const isWeekend =
                          dt.getDay() === 0 || dt.getDay() === 6;
                        const cells = grid.get(s.staffId)?.get(d) ?? [];
                        return (
                          <View
                            key={d}
                            style={{
                              width: CELL_W,
                              padding: 2,
                              borderRightWidth: 1,
                              borderRightColor: c.border,
                              backgroundColor: isWeekend
                                ? "rgba(0,0,0,0.025)"
                                : "transparent",
                              gap: 2,
                            }}
                          >
                            {cells.map((cell) => {
                              const col =
                                projectColor.get(cell.projectId) ??
                                PROJECT_PALETTE[0];
                              return (
                                <Pressable
                                  key={cell.id}
                                  onPress={() =>
                                    router.push(
                                      `/projects/${cell.projectId}` as never,
                                    )
                                  }
                                  style={({ pressed }) => [
                                    {
                                      backgroundColor: col.bg,
                                      borderWidth: 1,
                                      borderColor: col.border,
                                      borderRadius: 3,
                                      paddingHorizontal: 3,
                                      paddingVertical: 1,
                                    },
                                    pressed && { opacity: 0.6 },
                                  ]}
                                >
                                  <Body
                                    style={{
                                      fontSize: 9,
                                      color: col.fg,
                                      fontWeight: "600",
                                    }}
                                    numberOfLines={2}
                                  >
                                    {cell.projectName}
                                  </Body>
                                </Pressable>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/* ============= LIST VIEW (legacy card view) ============= */

function ListView() {
  const c = useColors();
  const q = useListStaffAssignments();

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const data = (q.data ?? []).filter((s) => s.projects.length > 0);

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      data={data}
      keyExtractor={(s) => s.staffId}
      contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="clipboard"
          title="出面の予定がありません"
          subtitle="工程表で職人を割り当てると表示されます"
        />
      }
      renderItem={({ item }) => (
        <Card>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Body style={{ fontWeight: "700" }}>{item.staffName}</Body>
              <Muted style={{ marginTop: 2 }}>
                {item.role}
                {item.company ? ` · ${item.company}` : ""}
              </Muted>
            </View>
            <Badge>{item.projects.length} 件</Badge>
          </View>
          <View style={{ marginTop: 10, gap: 8 }}>
            {item.projects.map((p) => (
              <View
                key={p.projectId + p.firstDate}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: c.border,
                  paddingTop: 8,
                }}
              >
                <Body>{p.projectName}</Body>
                <Muted style={{ marginTop: 2 }}>
                  {fmtDate(p.firstDate)} 〜 {fmtDate(p.lastDate)} · {p.days}日
                </Muted>
              </View>
            ))}
          </View>
        </Card>
      )}
    />
  );
}
