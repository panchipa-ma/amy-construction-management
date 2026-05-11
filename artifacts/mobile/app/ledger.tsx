import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useListProjects } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";

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
import { PROJECT_STATUS_LABEL, yen } from "@/lib/format";
import { printApiDoc } from "@/lib/print-doc";

// 施工台帳: 案件ごとの 契約金額 / 実績原価 / 粗利 を一覧表示。
// 案件タップで詳細 (台帳セクション) に遷移。
export default function LedgerScreen() {
  const c = useColors();
  const router = useRouter();
  const { getToken } = useAuth();
  const [search, setSearch] = useState("");
  const q = useListProjects();

  const printLedger = async (projectId: string, projectName: string) => {
    try {
      const safe = (projectName || "project").replace(/[\\/:*?"<>|]/g, "_");
      await printApiDoc({
        path: `/api/print/ledger/${projectId}`,
        fileName: `施工台帳_${safe}.pdf`,
        getToken,
      });
    } catch (err) {
      Alert.alert("PDFの作成に失敗しました", String((err as Error).message ?? err));
    }
  };

  const data = useMemo(() => {
    const all = q.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.customerName ?? "").toLowerCase().includes(s) ||
        (p.unitNumber ?? "").toLowerCase().includes(s),
    );
  }, [q.data, search]);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const totals = data.reduce(
    (acc, p) => {
      acc.contract += p.contractAmount;
      acc.actual += p.actualCost;
      acc.profit += p.contractAmount - p.actualCost;
      return acc;
    },
    { contract: 0, actual: 0, profit: 0 },
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: 12, gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.card,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 12,
          }}
        >
          <Feather name="search" size={16} color={c.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="案件・顧客・号室で検索"
            placeholderTextColor={c.mutedForeground}
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 8,
              color: c.foreground,
              fontSize: 15,
            }}
          />
        </View>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Muted>合計契約</Muted>
              <Body style={{ fontWeight: "700" }}>{yen(totals.contract)}</Body>
            </View>
            <View>
              <Muted>合計実績</Muted>
              <Body style={{ fontWeight: "700" }}>{yen(totals.actual)}</Body>
            </View>
            <View>
              <Muted>粗利</Muted>
              <Body
                style={{
                  fontWeight: "700",
                  color: totals.profit >= 0 ? c.success : c.destructive,
                }}
              >
                {yen(totals.profit)}
              </Body>
            </View>
          </View>
        </Card>
      </View>
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
        ListEmptyComponent={<EmptyState icon="book-open" title="案件がありません" />}
        renderItem={({ item }) => {
          const profit = item.contractAmount - item.actualCost;
          const rate =
            item.contractAmount > 0
              ? Math.round((profit / item.contractAmount) * 1000) / 10
              : 0;
          return (
            <Pressable
              onPress={() => router.push(`/ledger/${item.id}` as never)}
            >
              {({ pressed }) => (
                <Card style={pressed ? { opacity: 0.7 } : undefined}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Body style={{ fontWeight: "600" }}>{item.name}</Body>
                      <Muted style={{ marginTop: 2 }}>
                        {item.customerName}
                        {item.unitNumber ? ` · ${item.unitNumber}` : ""}
                      </Muted>
                      <View style={{ marginTop: 6 }}>
                        <Badge>
                          {PROJECT_STATUS_LABEL[item.status] ?? item.status}
                        </Badge>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Muted>契約 (税込)</Muted>
                      <Body style={{ fontWeight: "700" }}>
                        {yen(item.contractAmount)}
                      </Body>
                      <Muted style={{ marginTop: 6 }}>実績原価</Muted>
                      <Body>{yen(item.actualCost)}</Body>
                      <Muted style={{ marginTop: 6 }}>粗利 ({rate}%)</Muted>
                      <Body
                        style={{
                          fontWeight: "700",
                          color: profit >= 0 ? c.success : c.destructive,
                        }}
                      >
                        {yen(profit)}
                      </Body>
                    </View>
                  </View>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      printLedger(item.id, item.name);
                    }}
                    style={({ pressed }) => [
                      {
                        marginTop: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        paddingVertical: 10,
                        borderRadius: 8,
                        backgroundColor: c.primary,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Feather
                      name="printer"
                      size={14}
                      color={c.primaryForeground}
                    />
                    <Body
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: c.primaryForeground,
                      }}
                    >
                      施工台帳をPDF・印刷
                    </Body>
                  </Pressable>
                </Card>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
