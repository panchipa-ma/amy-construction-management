import { useListVendorQuotes } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, RefreshControl, View } from "react-native";

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
import { fmtDate, yen } from "@/lib/format";

export default function VendorQuotesScreen() {
  const c = useColors();
  const router = useRouter();
  const q = useListVendorQuotes(undefined, {
    query: { enabled: true, queryKey: ["listVendorQuotes"] },
  });

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
        ListEmptyComponent={<EmptyState icon="file" title="職人見積書がありません" />}
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Body style={{ fontWeight: "600" }}>{item.vendorName}</Body>
                {item.projectName ? (
                  <Muted style={{ marginTop: 2 }}>{item.projectName}</Muted>
                ) : null}
                <Muted style={{ marginTop: 2 }}>
                  {item.unitNumber ? `${item.unitNumber}号室 · ` : ""}
                  {fmtDate(item.quoteDate)}
                </Muted>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  <Badge tone={item.status === "matched" ? "success" : "warning"}>
                    {item.status === "matched" ? "案件紐付済" : "未紐付"}
                  </Badge>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Body style={{ fontWeight: "700" }}>{yen(item.amount)}</Body>
                <Muted>税込</Muted>
              </View>
            </View>
          </Card>
        )}
      />
      <Fab onPress={() => router.push("/vendor-quotes/new")} label="見積書を作成" />
    </View>
  );
}
