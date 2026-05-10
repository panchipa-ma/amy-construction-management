import { useListCustomers } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { Fab } from "@/components/form";
import { Body, Card, EmptyState, ErrorState, Loader, Muted } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { pct } from "@/lib/format";

export default function CustomersScreenGuarded() {
  return (
    <InternalOnly>
      <CustomersScreen />
    </InternalOnly>
  );
}

function CustomersScreen() {
  const c = useColors();
  const router = useRouter();
  const q = useListCustomers();

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
        ListEmptyComponent={<EmptyState icon="users" title="顧客が登録されていません" />}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/customers/edit?id=${item.id}`)}>
            <Body style={{ fontWeight: "600" }}>{item.name}</Body>
            {item.contactName ? <Muted style={{ marginTop: 2 }}>{item.contactName}</Muted> : null}
            {item.phone ? <Muted style={{ marginTop: 2 }}>{item.phone}</Muted> : null}
            {item.address ? <Muted style={{ marginTop: 2 }}>{item.address}</Muted> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
              <Muted>規定利率 {pct(item.defaultProfitRate)}</Muted>
              <Muted>営業 {pct(item.defaultSalesCommissionRate)}</Muted>
              <Muted>監督 {pct(item.defaultSupervisorCommissionRate)}</Muted>
            </View>
          </Card>
        )}
      />
      <Fab onPress={() => router.push("/customers/edit")} label="新規" />
    </View>
  );
}
