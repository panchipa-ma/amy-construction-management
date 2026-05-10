import { Feather } from "@expo/vector-icons";
import {
  useListAllProjectPhases,
  useListProjects,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";

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
import { PHASE_STATUS_LABEL, fmtDate } from "@/lib/format";

// 工程表: 案件ごとに アコーディオン形式で 工程 (project_phases) を表示。
// 担当職人 / 期間 / ステータス を確認可能。新規追加は案件詳細から。
export default function GanttScreen() {
  const c = useColors();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const projectsQ = useListProjects();
  const phasesQ = useListAllProjectPhases();

  const data = useMemo(() => {
    const projects = projectsQ.data ?? [];
    const phases = phasesQ.data ?? [];
    // 施工中・契約済 を default 表示 (web と同じ)
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
    const byProject = new Map<string, typeof phases>();
    for (const ph of phases) {
      const arr = byProject.get(ph.projectId) ?? [];
      arr.push(ph);
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
    return <ErrorState onRetry={() => { projectsQ.refetch(); phasesQ.refetch(); }} />;

  const toggle = (id: string) => {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={projectsQ.isFetching || phasesQ.isFetching}
            onRefresh={() => { projectsQ.refetch(); phasesQ.refetch(); }}
          />
        }
        ListEmptyComponent={
          <EmptyState icon="bar-chart-2" title="進行中の案件がありません" />
        }
        renderItem={({ item }) => {
          const open = openIds.has(item.project.id);
          return (
            <Card>
              <Pressable onPress={() => toggle(item.project.id)}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Body style={{ fontWeight: "600" }}>{item.project.name}</Body>
                    <Muted style={{ marginTop: 2 }}>
                      {item.project.customerName}
                      {item.project.unitNumber
                        ? ` · ${item.project.unitNumber}`
                        : ""}
                    </Muted>
                    <Muted style={{ marginTop: 2 }}>
                      工程 {item.phases.length} 件
                    </Muted>
                  </View>
                  <Feather
                    name={open ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={c.mutedForeground}
                  />
                </View>
              </Pressable>
              {open ? (
                <View style={{ marginTop: 12, gap: 8 }}>
                  {item.phases.length === 0 ? (
                    <Muted>工程が登録されていません</Muted>
                  ) : (
                    item.phases.map((ph) => (
                      <View
                        key={ph.phaseId}
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: c.border,
                          paddingTop: 8,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Body style={{ fontWeight: "600" }}>
                              {ph.phaseName}
                            </Body>
                            <Muted style={{ marginTop: 2 }}>
                              {fmtDate(ph.startDate)} 〜 {fmtDate(ph.endDate)}
                            </Muted>
                            {ph.staffName ? (
                              <Muted style={{ marginTop: 2 }}>
                                担当: {ph.staffName}
                              </Muted>
                            ) : null}
                          </View>
                          <Badge
                            tone={
                              ph.status === "done"
                                ? "success"
                                : ph.status === "in_progress"
                                  ? "accent"
                                  : "default"
                            }
                          >
                            {PHASE_STATUS_LABEL[ph.status] ?? ph.status}
                          </Badge>
                        </View>
                      </View>
                    ))
                  )}
                  <Pressable
                    onPress={() =>
                      router.push(`/projects/${item.project.id}` as never)
                    }
                    style={({ pressed }) => [
                      {
                        marginTop: 8,
                        paddingVertical: 10,
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
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </View>
  );
}
