import { useQueryClient } from "@tanstack/react-query";
import {
  getListQuotesQueryKey,
  useDeleteQuote,
  useListQuotes,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { Fab } from "@/components/form";
import { SelectionBar } from "@/components/selection-bar";
import {
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

export default function QuotesTab() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useListQuotes();
  const items = q.data ?? [];
  const sel = useSelection(items);
  const deleteMut = useDeleteQuote();
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const onDelete = async () => {
    setBusy(true);
    try {
      await runBulkDelete(
        sel.selectedItems,
        (id) => deleteMut.mutateAsync({ id }),
        () => qc.invalidateQueries({ queryKey: getListQuotesQueryKey() }),
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
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={<EmptyState icon="file" title="見積書がありません" />}
        renderItem={({ item }) => (
          <Card
            selectable={sel.selectionMode}
            selected={sel.isSelected(item.id)}
            onLongPress={() => sel.toggle(item.id)}
            onPress={() =>
              sel.selectionMode
                ? sel.toggle(item.id)
                : router.push(`/quotes/${item.id}`)
            }
          >
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
      {!sel.selectionMode ? (
        <Fab onPress={() => router.push("/quotes/edit")} label="新規見積" />
      ) : null}
    </View>
  );
}
