import { useListStaff } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { Fab } from "@/components/form";
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
  const router = useRouter();
  const q = useListStaff();

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={<EmptyState icon="users" title="職人が登録されていません" />}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/staff/edit?id=${item.id}`)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Body style={{ fontWeight: "600", flex: 1 }}>{item.name}</Body>
              <Badge tone="accent">{item.role}</Badge>
            </View>
            {item.company ? <Muted style={{ marginTop: 4 }}>{item.company}</Muted> : null}
            {item.phone ? <Muted style={{ marginTop: 2 }}>{item.phone}</Muted> : null}
            {item.dailyRate != null ? (
              <Muted style={{ marginTop: 4 }}>日当 {yen(item.dailyRate)}</Muted>
            ) : null}
          </Card>
        )}
      />
      <Fab onPress={() => router.push("/staff/edit")} label="新規" />
    </View>
  );
}
