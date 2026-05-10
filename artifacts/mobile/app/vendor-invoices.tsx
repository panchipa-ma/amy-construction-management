import { useListVendorInvoices } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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
import { fmtDate, yen } from "@/lib/format";

const FILTERS = [
  { label: "未払", value: "unpaid" as const },
  { label: "支払済", value: "paid" as const },
  { label: "全て", value: "all" as const },
];

export default function VendorInvoicesScreen() {
  const c = useColors();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("unpaid");
  const q = useListVendorInvoices();

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const all = q.data ?? [];
  const filtered =
    filter === "all"
      ? all
      : filter === "paid"
        ? all.filter((v) => v.paid)
        : all.filter((v) => !v.paid);

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
        data={filtered}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={<EmptyState icon="file-text" title="職人請求書がありません" />}
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
                  {fmtDate(item.invoiceDate)}
                </Muted>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  <Badge tone={item.status === "matched" ? "success" : "warning"}>
                    {item.status === "matched" ? "案件紐付済" : "未紐付"}
                  </Badge>
                  <Badge tone={item.paid ? "success" : "default"}>
                    {item.paid ? "振込済" : "未振込"}
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
      <Fab onPress={() => router.push("/vendor-invoices/new")} label="請求書を作成" />
    </View>
  );
}
