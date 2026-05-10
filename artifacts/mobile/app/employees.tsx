import { useListEmployees } from "@workspace/api-client-react";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { Badge, Body, Card, EmptyState, ErrorState, Loader, Muted } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

export default function EmployeesScreenGuarded() {
  return (
    <InternalOnly>
      <EmployeesScreen />
    </InternalOnly>
  );
}

function EmployeesScreen() {
  const c = useColors();
  const q = useListEmployees();

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
      ListEmptyComponent={<EmptyState icon="user" title="社員が登録されていません" />}
      renderItem={({ item }) => (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "600" }}>{item.name}</Body>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <Badge tone="accent">{item.role}</Badge>
              </View>
              {item.phone ? <Muted style={{ marginTop: 6 }}>{item.phone}</Muted> : null}
              {item.email ? <Muted>{item.email}</Muted> : null}
              {item.notes ? <Muted style={{ marginTop: 4 }}>{item.notes}</Muted> : null}
            </View>
          </View>
        </Card>
      )}
    />
  );
}
