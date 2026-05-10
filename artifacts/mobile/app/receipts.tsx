import { useListReceipts } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Linking, RefreshControl, View } from "react-native";

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

const CATEGORY_LABEL: Record<string, string> = {
  labor: "労務",
  subcontract: "外注",
  material: "材料",
  rental: "レンタル",
  expense: "経費",
  other: "その他",
};

export default function ReceiptsScreen() {
  const c = useColors();
  const router = useRouter();
  const q = useListReceipts();

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const data = q.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
    <FlatList
      style={{ backgroundColor: c.background }}
      data={data}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 96 }}
      refreshControl={
        <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
      }
      ListEmptyComponent={
        <EmptyState
          icon="camera"
          title="領収書がありません"
          subtitle="右下の「+」から撮影またはアルバムから追加できます"
        />
      }
      renderItem={({ item }) => (
        <Card onPress={() => item.fileUrl && Linking.openURL(item.fileUrl)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Body style={{ fontWeight: "600" }}>{item.vendor}</Body>
              {item.projectName ? (
                <Muted style={{ marginTop: 2 }}>{item.projectName}</Muted>
              ) : null}
              <Muted style={{ marginTop: 2 }}>
                {item.unitNumber ? `${item.unitNumber} · ` : ""}
                {fmtDate(item.receiptDate)}
              </Muted>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <Badge>{CATEGORY_LABEL[item.category] ?? item.category}</Badge>
                <Badge tone={item.status === "matched" ? "success" : "warning"}>
                  {item.status === "matched" ? "案件紐付済" : "未紐付"}
                </Badge>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Body style={{ fontWeight: "700" }}>{yen(item.amount)}</Body>
              <Muted style={{ marginTop: 4 }}>{item.fileName}</Muted>
            </View>
          </View>
        </Card>
      )}
    />
    <Fab onPress={() => router.push("/receipts/new")} label="撮影" />
    </View>
  );
}
