import { useQueryClient } from "@tanstack/react-query";
import {
  getListVendorInvoicesQueryKey,
  useDeleteVendorInvoice,
  useListVendorInvoices,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Fab } from "@/components/form";
import { ListToolbar } from "@/components/select-button";
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
import { openStorageFile } from "@/lib/open-file";
import { ActionSheetModal } from "@/components/ActionSheetModal";

const FILTERS = [
  { label: "全て", value: "all" as const },
  { label: "未払", value: "unpaid" as const },
  { label: "支払済", value: "paid" as const },
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
  const [addSheet, setAddSheet] = useState(false);

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
        <ListToolbar onSelect={sel.enter} selectDisabled={filtered.length === 0}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
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
        </ListToolbar>
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
            {item.fileUrl ? (
              <Pressable
                onPress={() => {
                  if (sel.selectionMode) sel.toggle(item.id);
                  else void openStorageFile(item.fileUrl!);
                }}
                hitSlop={6}
                style={({ pressed }) => [
                  {
                    marginTop: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.muted,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Feather name="file-text" size={14} color={c.primary} />
                <Body
                  style={{ flex: 1, fontSize: 12, color: c.primary }}
                  numberOfLines={1}
                >
                  {item.fileName || "請求書PDF"}
                </Body>
                <Feather name="external-link" size={12} color={c.mutedForeground} />
              </Pressable>
            ) : null}
            {item.quoteFileUrl ? (
              <Pressable
                onPress={() => {
                  if (sel.selectionMode) sel.toggle(item.id);
                  else void openStorageFile(item.quoteFileUrl!);
                }}
                hitSlop={6}
                style={({ pressed }) => [
                  {
                    marginTop: 6,
                    paddingVertical: 5,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: c.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Feather name="paperclip" size={12} color={c.mutedForeground} />
                <Body
                  style={{ flex: 1, fontSize: 11, color: c.mutedForeground }}
                  numberOfLines={1}
                >
                  [見積] {item.quoteFileName || "見積書PDF"}
                </Body>
              </Pressable>
            ) : null}
          </Card>
        )}
      />
      {!sel.selectionMode ? (
        <Fab onPress={() => setAddSheet(true)} label="追加" />
      ) : null}

      <ActionSheetModal
        visible={addSheet}
        title="職人請求書を追加"
        message="どちらの方法で追加しますか?"
        onClose={() => setAddSheet(false)}
        options={[
          {
            label: "写真をアップロード",
            icon: "image",
            onPress: () => router.push("/vendor-invoices/upload"),
          },
          {
            label: "フォームから作成 (PDF生成)",
            icon: "file-text",
            onPress: () => router.push("/vendor-invoices/new"),
          },
        ]}
      />
    </View>
  );
}
