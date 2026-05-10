import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  type Project,
  type ProjectStatus,
  useDeleteProject,
  useListProjects,
  useUpdateProject,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { Fab } from "@/components/form";
import { SelectionBar } from "@/components/selection-bar";
import { StatusPicker } from "@/components/status-picker";
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
import { useSelection } from "@/hooks/useSelection";
import { runBulkDelete } from "@/lib/bulk-delete";
import { PROJECT_STATUS_LABEL, fmtDate, yen } from "@/lib/format";

const FILTERS: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "進行中", value: "in_progress" },
  { label: "契約済", value: "contracted" },
  { label: "見積中", value: "estimating" },
  { label: "竣工", value: "completed" },
  { label: "全て", value: "all" },
];

export default function ProjectsTab() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const initial: ProjectStatus | "all" =
    params.status === "completed"
      ? "completed"
      : params.status === "in_progress" ||
          params.status === "contracted" ||
          params.status === "estimating"
        ? (params.status as ProjectStatus)
        : "in_progress";
  const [filter, setFilter] = useState<ProjectStatus | "all">(initial);
  // URL param に応じて filter を同期。param なし → 既定 (進行中) に戻す。
  useEffect(() => {
    if (
      params.status === "completed" ||
      params.status === "in_progress" ||
      params.status === "contracted" ||
      params.status === "estimating"
    ) {
      setFilter(params.status as ProjectStatus);
    } else if (params.status === undefined) {
      setFilter("in_progress");
    }
  }, [params.status]);

  const queryParams = filter === "all" ? undefined : { status: filter };
  const q = useListProjects(queryParams);
  const qc = useQueryClient();
  const updateMut = useUpdateProject();
  const deleteMut = useDeleteProject();
  const [statusTarget, setStatusTarget] = useState<Project | null>(null);
  const data = q.data ?? [];
  const sel = useSelection(data);
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const onBulkDelete = async () => {
    setBusy(true);
    try {
      await runBulkDelete(
        sel.selectedItems,
        (id) => deleteMut.mutateAsync({ id }),
        () => qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }),
      );
      sel.clear();
    } finally {
      setBusy(false);
    }
  };

  const STATUS_OPTIONS: { label: string; value: ProjectStatus }[] = [
    { label: PROJECT_STATUS_LABEL.estimating, value: "estimating" },
    { label: PROJECT_STATUS_LABEL.contracted, value: "contracted" },
    { label: PROJECT_STATUS_LABEL.in_progress, value: "in_progress" },
    { label: PROJECT_STATUS_LABEL.completed, value: "completed" },
    { label: PROJECT_STATUS_LABEL.archived, value: "archived" },
  ];

  const applyStatus = async (project: Project, value: ProjectStatus) => {
    if (value === project.status) return;
    try {
      await updateMut.mutateAsync({
        id: project.id,
        data: { status: value },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }),
        qc.invalidateQueries({
          queryKey: getListProjectsQueryKey(queryParams),
        }),
        qc.invalidateQueries({
          queryKey: getGetProjectQueryKey(project.id),
        }),
      ]);
    } catch (e) {
      Alert.alert("更新失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {sel.selectionMode ? (
        <SelectionBar
          count={sel.count}
          total={data.length}
          onCancel={sel.clear}
          onSelectAll={sel.selectAll}
          onDelete={onBulkDelete}
          busy={busy}
        />
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={({ pressed }) => [
                {
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
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
                {f.label}
              </Body>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={
          <EmptyState icon="briefcase" title="案件がありません" subtitle="フィルタを切り替えてみてください" />
        }
        renderItem={({ item }) => {
          const profit = item.contractAmount - item.actualCost;
          return (
            <Card
              selectable={sel.selectionMode}
              selected={sel.isSelected(item.id)}
              onLongPress={() => sel.toggle(item.id)}
              onPress={() =>
                sel.selectionMode
                  ? sel.toggle(item.id)
                  : router.push(`/projects/${item.id}`)
              }
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Body style={{ fontWeight: "600" }} >{item.name}</Body>
                  <Muted style={{ marginTop: 2 }}>
                    {item.customerName}
                    {item.unitNumber ? ` · ${item.unitNumber}` : ""}
                  </Muted>
                  <Muted style={{ marginTop: 2 }}>
                    {fmtDate(item.startDate)}{item.endDate ? ` 〜 ${fmtDate(item.endDate)}` : ""}
                  </Muted>
                  <View style={{ marginTop: 8, flexDirection: "row", gap: 6, alignItems: "center" }}>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setStatusTarget(item);
                      }}
                      hitSlop={6}
                      style={({ pressed }) => [
                        { flexDirection: "row", alignItems: "center", gap: 2 },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Badge tone={statusTone(item.status)}>
                        {PROJECT_STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                      <Feather
                        name="chevron-down"
                        size={12}
                        color={c.mutedForeground}
                      />
                    </Pressable>
                    {item.salesRep ? (
                      <Badge>営業: {item.salesRep}</Badge>
                    ) : null}
                    {item.siteSupervisor ? (
                      <Badge>監督: {item.siteSupervisor}</Badge>
                    ) : null}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Body style={{ fontWeight: "700" }}>{yen(item.contractAmount)}</Body>
                  <Muted style={{ marginTop: 2 }}>粗利</Muted>
                  <Body style={{ color: profit >= 0 ? c.success : c.destructive, fontWeight: "600" }}>
                    {yen(profit)}
                  </Body>
                </View>
                <Feather name="chevron-right" size={18} color={c.mutedForeground} style={{ marginLeft: 4, marginTop: 2 }} />
              </View>
            </Card>
          );
        }}
      />
      {!sel.selectionMode ? (
        <Fab onPress={() => router.push("/projects/edit")} label="新規案件" />
      ) : null}
      <StatusPicker<ProjectStatus>
        open={!!statusTarget}
        title="ステータスを変更"
        options={STATUS_OPTIONS}
        current={statusTarget?.status}
        onClose={() => setStatusTarget(null)}
        onSelect={(value) => {
          if (statusTarget) applyStatus(statusTarget, value);
        }}
      />
    </View>
  );
}

function statusTone(s: ProjectStatus): "default" | "success" | "warning" | "danger" | "accent" {
  switch (s) {
    case "in_progress":
      return "accent";
    case "completed":
      return "success";
    case "contracted":
      return "default";
    case "estimating":
      return "warning";
    default:
      return "default";
  }
}
