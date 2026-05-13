import { Feather } from "@expo/vector-icons";
import {
  getListVendorQuotesQueryKey,
  useListVendorQuotes,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import {
  Badge,
  Body,
  Card,
  ErrorState,
  H1,
  Loader,
  Muted,
  Row,
  SectionTitle,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { fmtDate, yen } from "@/lib/format";
import { openStorageFile } from "@/lib/open-file";

export default function VendorQuoteDetail() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useListVendorQuotes(undefined, {
    query: { enabled: true, queryKey: getListVendorQuotesQueryKey() },
  });

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const quote = (q.data ?? []).find((x) => x.id === id);
  if (!quote) {
    return (
      <ErrorState
        message="職人見積書が見つかりません"
        onRetry={() => q.refetch()}
      />
    );
  }

  const subtotal = Math.round(quote.amount / 1.1);
  const tax = quote.amount - subtotal;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
      >
        <View>
          <H1>{quote.vendorName || "職人見積書"}</H1>
          {quote.projectName ? (
            <Muted style={{ marginTop: 4 }}>{quote.projectName}</Muted>
          ) : null}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Badge tone={quote.status === "matched" ? "success" : "warning"}>
              {quote.status === "matched" ? "案件紐付済" : "未紐付"}
            </Badge>
            {quote.costEntryId ? (
              <Badge tone="success">施工台帳 自動反映済</Badge>
            ) : quote.status === "matched" ? (
              <Badge tone="warning">原価未連携</Badge>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {quote.fileUrl ? (
            <ActionBtn
              icon="printer"
              label="PDFを開く"
              tone="primary"
              onPress={() => void openStorageFile(quote.fileUrl!)}
            />
          ) : null}
          <ActionBtn
            icon="file-text"
            label="請求書化"
            onPress={() =>
              router.push(`/vendor-invoices/new?fromVendorQuoteId=${quote.id}`)
            }
          />
        </View>

        <Card>
          <SectionTitle>基本情報</SectionTitle>
          <Row label="案件" value={quote.projectName ?? "—"} />
          <Row label="号室" value={quote.unitNumber || "—"} />
          <Row label="発行者" value={quote.vendorName || "—"} />
          <Row label="見積日" value={fmtDate(quote.quoteDate)} />
          <Row label="有効期限" value={fmtDate(quote.validUntil)} />
        </Card>

        <Card>
          <SectionTitle>金額</SectionTitle>
          <Row label="小計" value={yen(subtotal)} />
          <Row label="消費税 (10%)" value={yen(tax)} />
          <Row
            label="合計"
            value={
              <Body style={{ fontSize: 18, fontWeight: "700" }}>{yen(quote.amount)}</Body>
            }
          />
        </Card>

        <Card>
          <SectionTitle>施工台帳</SectionTitle>
          {quote.status === "matched" && quote.costEntryId ? (
            <Body style={{ fontSize: 13 }}>
              この職人見積書は <Body style={{ fontWeight: "600" }}>予算原価</Body> として
              施工台帳に自動反映されています。
            </Body>
          ) : (
            <Body style={{ fontSize: 13, color: c.mutedForeground }}>
              号室「{quote.unitNumber || "—"}」に該当する案件が見つからず、
              施工台帳への反映は保留中です。号室を一致させた案件を作成してください。
            </Body>
          )}
        </Card>

        {quote.notes ? (
          <Card>
            <SectionTitle>備考</SectionTitle>
            <Body>{quote.notes}</Body>
          </Card>
        ) : null}

        {quote.fileUrl ? (
          <Pressable
            onPress={() => void openStorageFile(quote.fileUrl!)}
            style={({ pressed }) => [
              {
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.muted,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Feather name="file-text" size={14} color={c.primary} />
            <Body style={{ flex: 1, fontSize: 12, color: c.primary }} numberOfLines={1}>
              {quote.fileName || "見積書PDF"}
            </Body>
            <Feather name="external-link" size={12} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  tone = "default",
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  tone?: "default" | "primary";
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minWidth: 130,
          paddingVertical: 10,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          backgroundColor: tone === "primary" ? c.primary : c.card,
          borderWidth: 1,
          borderColor: tone === "primary" ? c.primary : c.border,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather
        name={icon}
        size={14}
        color={tone === "primary" ? c.primaryForeground : c.foreground}
      />
      <Body
        style={{
          color: tone === "primary" ? c.primaryForeground : c.foreground,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Body>
    </Pressable>
  );
}

