import { useListInvoices } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";

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

const FILTERS: { label: string; value: "all" | "unpaid" | "paid" }[] = [
  { label: "未入金", value: "unpaid" },
  { label: "入金済", value: "paid" },
  { label: "全て", value: "all" },
];

export default function InvoicesTab() {
  const c = useColors();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("unpaid");

  const q = useListInvoices();

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const all = q.data ?? [];
  const filtered =
    filter === "all"
      ? all
      : filter === "paid"
        ? all.filter((i) => i.paid)
        : all.filter((i) => !i.paid);

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
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={<EmptyState icon="dollar-sign" title="請求書がありません" />}
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/invoices/${item.id}`)}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Body style={{ fontWeight: "600" }}>
                  {item.subject || item.projectName || "—"}
                </Body>
                <Muted style={{ marginTop: 2 }}>
                  {item.invoiceNumber} · {fmtDate(item.issueDate)}
                </Muted>
                {item.customerName ? (
                  <Muted style={{ marginTop: 2 }}>{item.customerName}</Muted>
                ) : null}
                <View style={{ marginTop: 6, flexDirection: "row", gap: 6 }}>
                  <Badge tone={item.paid ? "success" : "warning"}>
                    {item.paid ? "入金済" : "未入金"}
                  </Badge>
                  {item.sentToClient ? <Badge tone="accent">送付済</Badge> : null}
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Body style={{ fontWeight: "700" }}>{yen(item.total)}</Body>
                <Muted>税込</Muted>
                {item.dueDate ? (
                  <Muted style={{ marginTop: 2 }}>期限: {fmtDate(item.dueDate)}</Muted>
                ) : null}
              </View>
            </View>
          </Card>
        )}
      />
    </View>
  );
}
