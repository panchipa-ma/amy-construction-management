import { useQueryClient } from "@tanstack/react-query";
import {
  getListVendorQuotesQueryKey,
  useDeleteVendorQuote,
  useListVendorQuotes,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { Feather } from "@expo/vector-icons";
import { Pressable } from "react-native";

import { Fab } from "@/components/form";
import { SelectButton } from "@/components/select-button";
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

export default function VendorQuotesScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useListVendorQuotes(undefined, {
    query: { enabled: true, queryKey: getListVendorQuotesQueryKey() },
  });
  const items = q.data ?? [];
  const sel = useSelection(items);
  const deleteMut = useDeleteVendorQuote();
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const onDelete = async () => {
    setBusy(true);
    try {
      await runBulkDelete(
        sel.selectedItems,
        (id) => deleteMut.mutateAsync({ id }),
        () => qc.invalidateQueries({ queryKey: getListVendorQuotesQueryKey() }),
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
          total={items.length}
          onCancel={sel.clear}
          onSelectAll={sel.selectAll}
          onDelete={onDelete}
          busy={busy}
        />
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 12, paddingTop: 10 }}>
          <SelectButton onPress={sel.enter} disabled={items.length === 0} />
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={<EmptyState icon="file" title="職人見積書がありません" />}
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
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: c.primary,
                  }}
                  numberOfLines={1}
                >
                  {item.fileName || "見積書PDF"}
                </Body>
                <Feather name="external-link" size={12} color={c.mutedForeground} />
              </Pressable>
            ) : null}
          </Card>
        )}
      />
      {!sel.selectionMode ? (
        <Fab onPress={() => router.push("/vendor-quotes/new")} label="見積書を作成" />
      ) : null}
    </View>
  );
}
