import { Feather } from "@expo/vector-icons";
import {
  type ProjectStatus,
  useListProjects,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { Fab } from "@/components/form";
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

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const data = q.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
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
            <Card onPress={() => router.push(`/projects/${item.id}`)}>
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
                  <View style={{ marginTop: 8, flexDirection: "row", gap: 6 }}>
                    <Badge tone={statusTone(item.status)}>
                      {PROJECT_STATUS_LABEL[item.status] ?? item.status}
                    </Badge>
                    {item.salesRep ? <Badge>{item.salesRep}</Badge> : null}
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
      <Fab onPress={() => router.push("/projects/edit")} label="新規案件" />
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
