import { useQueryClient } from "@tanstack/react-query";
import {
  getListVendorInvoicesQueryKey,
  useDeleteVendorInvoice,
  useListVendorInvoices,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { Fab } from "@/components/form";
import { SelectionBar } from "@/components/selection-bar";
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
import { useSelection } from "@/hooks/useSelection";
import { runBulkDelete } from "@/lib/bulk-delete";
import { fmtDate, yen } from "@/lib/format";

const FILTERS = [
  { label: "未払", value: "unpaid" as const },
  { label: "支払済", value: "paid" as const },
  { label: "全て", value: "all" as const },
];

export default function VendorInvoicesScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ paid?: string }>();
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">(
    params.paid === "true" ? "paid" : "unpaid",
  );
  useEffect(() => {
    if (params.paid === "true") setFilter("paid");
    else if (params.paid === undefined) setFilter("unpaid");
  }, [params.paid]);
  const q = useListVendorInvoices();
  const all = q.data ?? [];
  const filtered =
    filter === "all"
      ? all
      : filter === "paid"
        ? all.filter((v) => v.paid)
        : all.filter((v) => !v.paid);
  const sel = useSelection(filtered);
  const deleteMut = useDeleteVendorInvoice();
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const onDelete = async () => {
    setBusy(true);
    try {
      await runBulkDelete(
        sel.selectedItems,
        (id) => deleteMut.mutateAsync({ id }),
        () => qc.invalidateQueries({ queryKey: getListVendorInvoicesQueryKey() }),
      );
      sel.clear();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {sel.selectionMode ? (
        <SelectionBar
          count={sel.count}
          total={filtered.length}
          onCancel={sel.clear}
          onSelectAll={sel.selectAll}
          onDelete={onDelete}
          busy={busy}
        />
      ) : (
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
      )}

      <FlatList
        data={filtered}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={<EmptyState icon="file-text" title="職人請求書がありません" />}
        renderItem={({ item }) => (
          <Card
            selectable={sel.selectionMode}
            selected={sel.isSelected(item.id)}
            onLongPress={() => sel.toggle(item.id)}
            onPress={() => sel.selectionMode && sel.toggle(item.id)}
          >
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
      {!sel.selectionMode ? (
        <Fab
          onPress={() =>
            Alert.alert("職人請求書を追加", "どちらの方法で追加しますか?", [
              {
                text: "写真をアップロード",
                onPress: () => router.push("/vendor-invoices/upload"),
              },
              {
                text: "フォームから作成 (PDF生成)",
                onPress: () => router.push("/vendor-invoices/new"),
              },
              { text: "キャンセル", style: "cancel" },
            ])
          }
          label="追加"
        />
      ) : null}
    </View>
  );
}
