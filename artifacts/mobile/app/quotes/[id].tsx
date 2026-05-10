import { useGetQuote } from "@workspace/api-client-react";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import {
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

export default function QuoteDetailGuarded() {
  return (
    <InternalOnly>
      <QuoteDetail />
    </InternalOnly>
  );
}

function QuoteDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useGetQuote(id);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const quote = q.data;
  if (!quote) return null;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
    >
      <View>
        <H1>{quote.subject || quote.projectName || "見積書"}</H1>
        <Muted style={{ marginTop: 4 }}>{quote.quoteNumber}</Muted>
      </View>

      <Card>
        <SectionTitle>基本情報</SectionTitle>
        <Row label="案件" value={quote.projectName ?? "—"} />
        {quote.customerName ? <Row label="顧客" value={quote.customerName} /> : null}
        {quote.contactName ? <Row label="ご担当" value={quote.contactName} /> : null}
        <Row label="見積日" value={fmtDate(quote.issueDate)} />
        <Row label="有効期限" value={fmtDate(quote.validUntil)} />
      </Card>

      <Card>
        <SectionTitle>明細</SectionTitle>
        {quote.items.map((it, i) => (
          <View
            key={i}
            style={{ paddingVertical: 8, borderBottomColor: c.border, borderBottomWidth: 1 }}
          >
            <Body style={{ fontWeight: "500" }}>{it.description}</Body>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Muted>
                {it.quantity} {it.unit ?? ""} × {yen(it.unitPrice)}
              </Muted>
              <Body style={{ fontWeight: "600" }}>
                {yen(it.quantity * it.unitPrice)}
              </Body>
            </View>
            {it.notes ? <Muted style={{ fontSize: 11 }}>{it.notes}</Muted> : null}
          </View>
        ))}
      </Card>

      <Card>
        <Row label="小計" value={yen(quote.subtotal)} />
        <Row label="消費税 (10%)" value={yen(quote.tax)} />
        <Row
          label="合計"
          value={
            <Body style={{ fontSize: 18, fontWeight: "700" }}>
              {yen(quote.total)}
            </Body>
          }
        />
      </Card>

      {quote.notes ? (
        <Card>
          <SectionTitle>備考</SectionTitle>
          <Body>{quote.notes}</Body>
        </Card>
      ) : null}
    </ScrollView>
  );
}
