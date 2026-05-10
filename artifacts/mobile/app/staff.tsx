import { useListStaff } from "@workspace/api-client-react";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { Badge, Body, Card, EmptyState, ErrorState, Loader, Muted } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { yen } from "@/lib/format";

export default function StaffScreenGuarded() {
  return (
    <InternalOnly>
      <StaffScreen />
    </InternalOnly>
  );
}

function StaffScreen() {
  const c = useColors();
  const q = useListStaff();

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      data={q.data ?? []}
      keyExtractor={(x) => x.id}
      contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
      }
      ListEmptyComponent={<EmptyState icon="tool" title="職人が登録されていません" />}
      renderItem={({ item }) => (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "600" }}>{item.name}</Body>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <Badge>{item.role}</Badge>
              </View>
              {item.company ? <Muted style={{ marginTop: 6 }}>{item.company}</Muted> : null}
              {item.phone ? <Muted>{item.phone}</Muted> : null}
            </View>
            {item.dailyRate ? (
              <View style={{ alignItems: "flex-end" }}>
                <Body style={{ fontWeight: "600" }}>{yen(item.dailyRate)}</Body>
                <Muted style={{ fontSize: 11 }}>日当</Muted>
              </View>
            ) : null}
          </View>
        </Card>
      )}
    />
  );
}
