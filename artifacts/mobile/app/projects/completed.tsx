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
import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { ListToolbar } from "@/components/select-button";
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
import { invalidateDashboard } from "@/lib/invalidate";
import { PROJECT_STATUS_LABEL, fmtDate, yen } from "@/lib/format";

export default function CompletedProjectsScreen() {
  const c = useColors();
  const router = useRouter();
  const q = useListProjects({ status: "completed" });
  const qc = useQueryClient();
  const updateMut = useUpdateProject();
  const deleteMut = useDeleteProject();
  const [statusTarget, setStatusTarget] = useState<Project | null>(null);
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState<string>(
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : "all",
  );
  useEffect(() => {
    if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
      setMonth(params.month);
    } else if (params.month === undefined) {
      setMonth("all");
    }
  }, [params.month]);
  const [busy, setBusy] = useState(false);

  const data = q.data ?? [];

  // 工期終了月オプション (新→旧)
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of data) {
      const d = p.endDate ? String(p.endDate).slice(0, 7) : "";
      if (d) set.add(d);
    }
    return Array.from(set)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((m) => ({
        value: m,
        label: `${m.slice(0, 4)}年${m.slice(5, 7)}月`,
      }));
  }, [data]);

  const rows = useMemo(
    () =>
      month === "all"
        ? data
        : data.filter(
            (p) => p.endDate && String(p.endDate).slice(0, 7) === month,
          ),
    [data, month],
  );

  const sel = useSelection(rows);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const onBulkDelete = async () => {
    setBusy(true);
    try {
      await runBulkDelete(
        sel.selectedItems,
        (id) => deleteMut.mutateAsync({ id }),
        async () => {
          await qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          await invalidateDashboard(qc);
        },
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
      await updateMut.mutateAsync({ id: project.id, data: { status: value } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListProjectsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) }),
        invalidateDashboard(qc),
      ]);
    } catch (e) {
      Alert.alert("更新失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const FILTERS: { label: string; value: string }[] = [
    { label: "全て", value: "all" },
    ...monthOptions,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {sel.selectionMode ? (
        <SelectionBar
          count={sel.count}
          total={rows.length}
          onCancel={sel.clear}
          onSelectAll={sel.selectAll}
          onDelete={onBulkDelete}
          busy={busy}
        />
      ) : (
        <ListToolbar onSelect={sel.enter} selectDisabled={rows.length === 0}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {FILTERS.map((f) => {
              const active = month === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => setMonth(f.value)}
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
        </ListToolbar>
      )}

      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="check-circle"
            title="竣工案件がありません"
            subtitle="ステータスを「竣工」にした案件がここに表示されます"
          />
        }
        renderItem={({ item }) => {
          const profit = Number(item.contractAmount ?? 0) - Number(item.actualCost ?? 0);
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
                  <Body style={{ fontWeight: "600" }}>{item.name}</Body>
                  <Muted style={{ marginTop: 2 }}>
                    {item.customerName}
                    {item.unitNumber ? ` · ${item.unitNumber}` : ""}
                  </Muted>
                  <Muted style={{ marginTop: 2 }}>
                    {fmtDate(item.startDate)}
                    {item.endDate ? ` 〜 ${fmtDate(item.endDate)}` : ""}
                  </Muted>
                  <View style={{ marginTop: 8, flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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
                      <Badge tone="success">
                        {PROJECT_STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                      <Feather name="chevron-down" size={12} color={c.mutedForeground} />
                    </Pressable>
                    {item.salesRep ? <Badge>営業: {item.salesRep}</Badge> : null}
                    {item.siteSupervisor ? <Badge>監督: {item.siteSupervisor}</Badge> : null}
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
