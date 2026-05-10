import { useListQuotes } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

import {
  Body,
  Card,
  EmptyState,
  ErrorState,
  Loader,
  Muted,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { fmtDate, yen } from "@/lib/format";

export default function QuotesTab() {
  const c = useColors();
  const router = useRouter();
  const q = useListQuotes();

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
      ListEmptyComponent={
        <EmptyState icon="file" title="見積書がありません" />
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push(`/quotes/${item.id}`)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Body style={{ fontWeight: "600" }}>
                {item.subject || item.projectName || "—"}
              </Body>
              <Muted style={{ marginTop: 2 }}>
                {item.quoteNumber} · {fmtDate(item.issueDate)}
              </Muted>
              {item.customerName ? (
                <Muted style={{ marginTop: 2 }}>{item.customerName}</Muted>
              ) : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Body style={{ fontWeight: "700" }}>{yen(item.total)}</Body>
              <Muted>税込</Muted>
            </View>
          </View>
        </Card>
      )}
    />
  );
}
