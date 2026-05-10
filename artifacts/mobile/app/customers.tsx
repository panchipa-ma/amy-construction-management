import { useListCustomers } from "@workspace/api-client-react";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
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
  const q = useListCustomers();

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
      ListEmptyComponent={<EmptyState icon="users" title="顧客が登録されていません" />}
      renderItem={({ item }) => (
        <Card>
          <Body style={{ fontWeight: "600" }}>{item.name}</Body>
          {item.contactName ? <Muted style={{ marginTop: 2 }}>{item.contactName}</Muted> : null}
          {item.phone ? <Muted style={{ marginTop: 2 }}>{item.phone}</Muted> : null}
          {item.address ? <Muted style={{ marginTop: 2 }}>{item.address}</Muted> : null}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <Muted>規定利率 {pct(item.defaultProfitRate)}</Muted>
            <Muted>営業 {pct(item.defaultSalesCommissionRate)}</Muted>
          </View>
        </Card>
      )}
    />
  );
}
