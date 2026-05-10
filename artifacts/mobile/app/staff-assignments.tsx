import { useListStaffAssignments } from "@workspace/api-client-react";
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
import { fmtDate } from "@/lib/format";

// 職人出面表: 職人ごとに 現在割り当てられている案件と期間を一覧。
// (Web は日別 matrix だが、モバイルでは縦リスト形式で表示)
export default function StaffAssignmentsScreen() {
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
                  {fmtDate(p.firstDate)} 〜 {fmtDate(p.lastDate)}
                </Muted>
              </View>
            ))}
          </View>
        </Card>
      )}
    />
  );
}
