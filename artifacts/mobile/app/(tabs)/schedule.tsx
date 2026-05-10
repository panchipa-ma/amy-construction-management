import {
  useListAllProjectPhases,
  useListProjects,
} from "@workspace/api-client-react";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

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

export default function ScheduleTab() {
  const c = useColors();
  const phasesQ = useListAllProjectPhases();
  const projectsQ = useListProjects();

  if (phasesQ.isLoading || projectsQ.isLoading) return <Loader />;
  if (phasesQ.isError) return <ErrorState onRetry={() => phasesQ.refetch()} />;

  const projectName = new Map(
    (projectsQ.data ?? []).map((p) => [p.id, p.name]),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = (phasesQ.data ?? [])
    .filter((p) => {
      const end = new Date(p.endDate);
      end.setHours(23, 59, 59, 999);
      return end >= today;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      data={upcoming}
      keyExtractor={(p) => p.phaseId}
      contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={phasesQ.isFetching}
          onRefresh={() => phasesQ.refetch()}
        />
      }
      ListEmptyComponent={
        <EmptyState icon="calendar" title="予定された工程はありません" />
      }
      renderItem={({ item }) => {
        const start = new Date(item.startDate);
        const end = new Date(item.endDate);
        const isActive = start <= today && end >= today;
        return (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Body style={{ fontWeight: "600" }}>{item.phaseName}</Body>
                <Muted style={{ marginTop: 2 }}>
                  {item.projectName ?? projectName.get(item.projectId) ?? "(案件不明)"}
                </Muted>
                <Muted style={{ marginTop: 2 }}>
                  {fmtDate(item.startDate)} 〜 {fmtDate(item.endDate)}
                </Muted>
                {item.staffName ? (
                  <Muted style={{ marginTop: 2 }}>担当: {item.staffName}</Muted>
                ) : null}
              </View>
              <View style={{ gap: 6, alignItems: "flex-end" }}>
                <Badge tone={item.status === "done" ? "success" : item.status === "in_progress" ? "accent" : "default"}>
                  {PHASE_STATUS_LABEL[item.status] ?? item.status}
                </Badge>
                {isActive ? <Badge tone="warning">進行中</Badge> : null}
              </View>
            </View>
          </Card>
        );
      }}
    />
  );
}
