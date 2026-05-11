import { useQueryClient } from "@tanstack/react-query";
import {
  getListInvoicesQueryKey,
  useDeleteInvoice,
  useListInvoices,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";

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
import { invalidateDashboard } from "@/lib/invalidate";
import { toggleInvoiceField } from "@/lib/invoice-toggle";
import { fmtDate, yen } from "@/lib/format";

type Filter = "all" | "unpaid" | "paid" | "outstanding";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "全て", value: "all" },
  { label: "請求中 (当月)", value: "outstanding" },
  { label: "未入金", value: "unpaid" },
  { label: "入金済", value: "paid" },
];

function isOutstanding(issueDate: string | null | undefined, paid: boolean): boolean {
  if (paid) return false;
  if (!issueDate || !/^\d{4}-\d{2}-\d{2}/.test(String(issueDate))) return false;
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return new Date(String(issueDate)) < monthEnd;
}

export default function InvoicesTab() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ paid?: string; outstanding?: string }>();
  const [filter, setFilter] = useState<Filter>(
    params.outstanding === "1"
      ? "outstanding"
      : params.paid === "true"
        ? "paid"
        : "unpaid",
  );
  useEffect(() => {
    if (params.outstanding === "1") setFilter("outstanding");
    else if (params.paid === "true") setFilter("paid");
    else if (params.paid === undefined && params.outstanding === undefined)
      setFilter("unpaid");
  }, [params.paid, params.outstanding]);

  const q = useListInvoices();
  const all = q.data ?? [];
  const filtered =
    filter === "all"
      ? all
      : filter === "paid"
        ? all.filter((i) => i.paid)
        : filter === "outstanding"
          ? all.filter((i) => isOutstanding(i.issueDate, i.paid))
          : all.filter((i) => !i.paid);
  const sel = useSelection(filtered);
  const deleteMut = useDeleteInvoice();
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const onDelete = async () => {
    setBusy(true);
    try {
      await runBulkDelete(
        sel.selectedItems,
        (id) => deleteMut.mutateAsync({ id }),
        async () => {
          await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          await invalidateDashboard(qc);
        },
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
        ListEmptyComponent={<EmptyState icon="dollar-sign" title="請求書がありません" />}
        renderItem={({ item }) => (
          <Card
            selectable={sel.selectionMode}
            selected={sel.isSelected(item.id)}
            onLongPress={() => sel.toggle(item.id)}
            onPress={() =>
              sel.selectionMode
                ? sel.toggle(item.id)
                : router.push(`/invoices/${item.id}`)
            }
          >
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
                  <Pressable
                    disabled={sel.selectionMode}
                    onPress={() =>
                      toggleInvoiceField(qc, item, "paid", !item.paid)
                    }
                  >
                    <Badge tone={item.paid ? "success" : "warning"}>
                      {item.paid ? "入金済" : "未入金"}
                    </Badge>
                  </Pressable>
                  <Pressable
                    disabled={sel.selectionMode}
                    onPress={() =>
                      toggleInvoiceField(
                        qc,
                        item,
                        "sentToClient",
                        !item.sentToClient,
                      )
                    }
                  >
                    <Badge tone={item.sentToClient ? "accent" : "default"}>
                      {item.sentToClient ? "送付済" : "未送付"}
                    </Badge>
                  </Pressable>
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
      {!sel.selectionMode ? (
        <Fab onPress={() => router.push("/invoices/edit")} label="新規請求書" inTabs />
      ) : null}
    </View>
  );
}
