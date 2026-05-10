import { useQueryClient } from "@tanstack/react-query";
import {
  getListCustomersQueryKey,
  useDeleteCustomer,
  useListCustomers,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { Fab } from "@/components/form";
import { SelectButton } from "@/components/select-button";
import { SelectionBar } from "@/components/selection-bar";
import { Body, Card, EmptyState, ErrorState, Loader, Muted } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useSelection } from "@/hooks/useSelection";
import { runBulkDelete } from "@/lib/bulk-delete";
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
  const qc = useQueryClient();
  const q = useListCustomers();
  const items = q.data ?? [];
  const sel = useSelection(items);
  const deleteMut = useDeleteCustomer();
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const onDelete = async () => {
    setBusy(true);
    try {
      await runBulkDelete(
        sel.selectedItems,
        (id) => deleteMut.mutateAsync({ id }),
        () => qc.invalidateQueries({ queryKey: getListCustomersQueryKey() }),
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
        ListEmptyComponent={<EmptyState icon="users" title="顧客が登録されていません" />}
        renderItem={({ item }) => (
          <Card
            selectable={sel.selectionMode}
            selected={sel.isSelected(item.id)}
            onLongPress={() => sel.toggle(item.id)}
            onPress={() =>
              sel.selectionMode
                ? sel.toggle(item.id)
                : router.push(`/customers/edit?id=${item.id}`)
            }
          >
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
      {!sel.selectionMode ? (
        <Fab onPress={() => router.push("/customers/edit")} label="新規" />
      ) : null}
    </View>
  );
}
