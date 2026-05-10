import { Feather } from "@expo/vector-icons";
import {
  type ProjectPhase,
  useListAllProjectPhases,
  useListProjects,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { PhaseSheet } from "@/components/project-modals";
import { Body, Card, EmptyState, ErrorState, Loader, Muted } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { PHASE_STATUS_LABEL } from "@/lib/format";

const DAY_PX = 22;
const ROW_H = 50;
const HEADER_H = 44;
const LEFT_W = 132;

function dateOnly(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s.slice(0, 10) + "T00:00:00");
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

type Phase = {
  id: string;
  phaseId?: string;
  projectId: string;
  name?: string;
  phaseName?: string;
  startDate: string;
  endDate: string;
  status: "planned" | "in_progress" | "done";
  staffId?: string | null;
  staffName?: string | null;
};

function statusColor(status: string, c: ReturnType<typeof useColors>): string {
  if (status === "done") return c.success;
  if (status === "in_progress") return c.primary;
  return "#94a3b8"; // slate-400 (planned)
}

function ProjectGanttCard({
  projectId,
  projectName,
  customerName,
  unitNumber,
  phases,
  defaultOpen,
  onOpenProject,
  onAddPhase,
  onEditPhase,
}: {
  projectId: string;
  projectName: string;
  customerName?: string | null;
  unitNumber?: string | null;
  phases: Phase[];
  defaultOpen: boolean;
  onOpenProject: () => void;
  onAddPhase: (projectId: string) => void;
  onEditPhase: (phase: Phase) => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(defaultOpen);

  const { rangeMin, totalDays, dayMarkers, todayOffset } = useMemo(() => {
    if (phases.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        rangeMin: today,
        totalDays: 30,
        dayMarkers: [] as { date: Date; isMonthStart: boolean }[],
        todayOffset: null as number | null,
      };
    }
    let min = dateOnly(phases[0].startDate);
    let max = dateOnly(phases[0].endDate);
    for (const p of phases) {
      const s = dateOnly(p.startDate);
      const e = dateOnly(p.endDate);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    min = addDays(min, -2);
    max = addDays(max, 2);
    const td = Math.max(1, diffDays(min, max));
    const arr: { date: Date; isMonthStart: boolean }[] = [];
    for (let i = 0; i <= td; i++) {
      const d = addDays(min, i);
      arr.push({ date: d, isMonthStart: d.getDate() === 1 || i === 0 });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const off =
      today >= min && today <= max ? diffDays(min, today) * DAY_PX : null;
    return { rangeMin: min, totalDays: td, dayMarkers: arr, todayOffset: off };
  }, [phases]);

  const timelineWidth = (totalDays + 1) * DAY_PX;

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={({ pressed }) => [
            { flex: 1, padding: 14, flexDirection: "row", alignItems: "center" },
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Body style={{ fontWeight: "700" }}>{projectName}</Body>
            <Muted style={{ marginTop: 2 }}>
              {customerName ?? ""}
              {unitNumber ? ` · ${unitNumber}` : ""}
            </Muted>
            <Muted style={{ marginTop: 2 }}>工程 {phases.length} 件</Muted>
          </View>
          <Feather
            name={open ? "chevron-up" : "chevron-down"}
            size={20}
            color={c.mutedForeground}
          />
        </Pressable>
        <Pressable
          onPress={() => onAddPhase(projectId)}
          hitSlop={8}
          style={({ pressed }) => [
            {
              marginRight: 12,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: c.primary,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="plus" size={12} color={c.primaryForeground} />
          <Body
            style={{ color: c.primaryForeground, fontSize: 11, fontWeight: "700" }}
          >
            工程
          </Body>
        </Pressable>
      </View>

      {open && phases.length === 0 ? (
        <View style={{ padding: 14, paddingTop: 0 }}>
          <Muted>工程が登録されていません</Muted>
        </View>
      ) : null}

      {open && phases.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: c.border,
          }}
        >
          {/* Sticky left column */}
          <View
            style={{
              width: LEFT_W,
              borderRightWidth: 1,
              borderRightColor: c.border,
              backgroundColor: c.card,
            }}
          >
            <View
              style={{
                height: HEADER_H,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                paddingHorizontal: 8,
                justifyContent: "flex-end",
                paddingBottom: 6,
                backgroundColor: c.muted,
              }}
            >
              <Muted style={{ fontSize: 11, fontWeight: "600" }}>工程</Muted>
            </View>
            {phases.map((p) => {
              const days =
                diffDays(dateOnly(p.startDate), dateOnly(p.endDate)) + 1;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onEditPhase(p)}
                  style={({ pressed }) => [
                    {
                      height: ROW_H,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                      paddingHorizontal: 8,
                      justifyContent: "center",
                    },
                    pressed && { backgroundColor: c.muted },
                  ]}
                >
                  <Body
                    numberOfLines={1}
                    style={{ fontSize: 12, fontWeight: "600" }}
                  >
                    {p.name ?? p.phaseName}
                  </Body>
                  <Muted style={{ fontSize: 10 }} numberOfLines={1}>
                    {p.staffName ? `${p.staffName} · ` : ""}
                    {days}日
                  </Muted>
                </Pressable>
              );
            })}
          </View>

          {/* Scrollable timeline */}
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={{ width: timelineWidth }}>
              {/* Date header */}
              <View
                style={{
                  height: HEADER_H,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                  backgroundColor: c.muted,
                  position: "relative",
                }}
              >
                {dayMarkers.map((m, i) => {
                  const left = i * DAY_PX;
                  const dow = m.date.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <View
                      key={i}
                      style={{
                        position: "absolute",
                        left,
                        top: 0,
                        bottom: 0,
                        width: DAY_PX,
                        borderLeftWidth: 1,
                        borderLeftColor: m.isMonthStart
                          ? c.foreground
                          : c.border,
                        backgroundColor: isWeekend ? c.muted : "transparent",
                      }}
                    >
                      {m.isMonthStart ? (
                        <Body
                          style={{
                            fontSize: 9,
                            fontWeight: "700",
                            color: c.foreground,
                            paddingTop: 2,
                            paddingLeft: 2,
                          }}
                        >
                          {m.date.getMonth() + 1}月
                        </Body>
                      ) : null}
                      <Body
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 2,
                          fontSize: 9,
                          textAlign: "center",
                          color:
                            dow === 0
                              ? c.destructive
                              : dow === 6
                                ? "#2563eb"
                                : c.mutedForeground,
                        }}
                      >
                        {m.date.getDate()}
                      </Body>
                    </View>
                  );
                })}
              </View>

              {/* Phase rows */}
              {phases.map((p) => {
                const s = dateOnly(p.startDate);
                const e = dateOnly(p.endDate);
                const left = diffDays(rangeMin, s) * DAY_PX;
                const width = Math.max(
                  (diffDays(s, e) + 1) * DAY_PX,
                  DAY_PX,
                );
                const barColor = statusColor(p.status, c);
                return (
                  <View
                    key={p.id}
                    style={{
                      height: ROW_H,
                      borderBottomWidth: 1,
                      borderBottomColor: c.border,
                      position: "relative",
                    }}
                  >
                    {/* day stripes */}
                    {dayMarkers.map((m, i) => {
                      const dow = m.date.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <View
                          key={i}
                          style={{
                            position: "absolute",
                            left: i * DAY_PX,
                            top: 0,
                            bottom: 0,
                            width: DAY_PX,
                            borderLeftWidth: 1,
                            borderLeftColor: m.isMonthStart
                              ? c.border
                              : "#eef0f4",
                            backgroundColor: isWeekend
                              ? "rgba(0,0,0,0.025)"
                              : "transparent",
                          }}
                        />
                      );
                    })}
                    {/* today line */}
                    {todayOffset != null ? (
                      <View
                        style={{
                          position: "absolute",
                          left: todayOffset,
                          top: 0,
                          bottom: 0,
                          width: 1.5,
                          backgroundColor: c.destructive,
                          opacity: 0.6,
                        }}
                      />
                    ) : null}
                    {/* the bar */}
                    <View
                      style={{
                        position: "absolute",
                        left,
                        top: ROW_H / 2 - 11,
                        width,
                        height: 22,
                        borderRadius: 4,
                        backgroundColor: barColor,
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 6,
                        shadowColor: "#000",
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: 1,
                      }}
                    >
                      {width > 36 ? (
                        <Body
                          numberOfLines={1}
                          style={{
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: "700",
                          }}
                        >
                          {p.name ?? p.phaseName}
                        </Body>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {open ? (
        <View style={{ padding: 12, paddingTop: 10 }}>
          <Pressable
            onPress={onOpenProject}
            style={({ pressed }) => [
              {
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: c.border,
                alignItems: "center",
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Body style={{ color: c.primary, fontWeight: "600" }}>
              案件詳細を開く
            </Body>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
            {(["planned", "in_progress", "done"] as const).map((s) => (
              <View
                key={s}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: statusColor(s, c),
                  }}
                />
                <Muted style={{ fontSize: 11 }}>{PHASE_STATUS_LABEL[s]}</Muted>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export default function GanttScreenGuarded() {
  return (
    <InternalOnly>
      <GanttScreen />
    </InternalOnly>
  );
}

function GanttScreen() {
  const c = useColors();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [phaseModal, setPhaseModal] = useState<
    { projectId: string; editing: ProjectPhase | null } | null
  >(null);

  const projectsQ = useListProjects();
  const phasesQ = useListAllProjectPhases();

  const data = useMemo(() => {
    const projects = projectsQ.data ?? [];
    const phases = phasesQ.data ?? [];
    const visible = projects.filter(
      (p) => p.status === "in_progress" || p.status === "contracted",
    );
    const s = search.trim().toLowerCase();
    const list = visible.filter(
      (p) =>
        !s ||
        p.name.toLowerCase().includes(s) ||
        (p.customerName ?? "").toLowerCase().includes(s),
    );
    const byProject = new Map<string, Phase[]>();
    for (const ph of phases) {
      const arr = byProject.get(ph.projectId) ?? [];
      arr.push({
        id: ph.phaseId,
        phaseId: ph.phaseId,
        projectId: ph.projectId,
        name: ph.phaseName,
        phaseName: ph.phaseName,
        startDate: ph.startDate,
        endDate: ph.endDate,
        status: ph.status,
        staffId: ph.staffId,
        staffName: ph.staffName,
      });
      byProject.set(ph.projectId, arr);
    }
    return list.map((p) => ({
      project: p,
      phases: (byProject.get(p.id) ?? []).sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      ),
    }));
  }, [projectsQ.data, phasesQ.data, search]);

  if (projectsQ.isLoading || phasesQ.isLoading) return <Loader />;
  if (projectsQ.isError || phasesQ.isError)
    return (
      <ErrorState
        onRetry={() => {
          projectsQ.refetch();
          phasesQ.refetch();
        }}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.card,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 12,
          }}
        >
          <Feather name="search" size={16} color={c.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="案件名で絞り込み"
            placeholderTextColor={c.mutedForeground}
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 8,
              color: c.foreground,
              fontSize: 15,
            }}
          />
        </View>
      </View>
      <FlatList
        data={data}
        keyExtractor={(d) => d.project.id}
        contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={projectsQ.isFetching || phasesQ.isFetching}
            onRefresh={() => {
              projectsQ.refetch();
              phasesQ.refetch();
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState icon="bar-chart-2" title="進行中の案件がありません" />
        }
        renderItem={({ item, index }) => (
          <ProjectGanttCard
            projectId={item.project.id}
            projectName={item.project.name}
            customerName={item.project.customerName}
            unitNumber={item.project.unitNumber}
            phases={item.phases}
            defaultOpen={index === 0}
            onOpenProject={() =>
              router.push(`/projects/${item.project.id}` as never)
            }
            onAddPhase={(pid) => setPhaseModal({ projectId: pid, editing: null })}
            onEditPhase={(p) =>
              setPhaseModal({
                projectId: p.projectId,
                editing: {
                  id: p.id,
                  projectId: p.projectId,
                  name: (p.name ?? p.phaseName) as string,
                  startDate: p.startDate,
                  endDate: p.endDate,
                  status: p.status,
                  staffId: p.staffId ?? null,
                  staffName: p.staffName ?? null,
                  sortOrder: 0,
                  notes: null,
                  createdAt: "",
                } as ProjectPhase,
              })
            }
          />
        )}
      />
      {phaseModal ? (
        <PhaseSheet
          open
          onClose={() => setPhaseModal(null)}
          projectId={phaseModal.projectId}
          editing={phaseModal.editing}
        />
      ) : null}
    </View>
  );
}
