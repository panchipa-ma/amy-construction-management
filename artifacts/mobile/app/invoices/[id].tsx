import { useGetInvoice } from "@workspace/api-client-react";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
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

export default function InvoiceDetailGuarded() {
  return (
    <InternalOnly>
      <InvoiceDetail />
    </InternalOnly>
  );
}

function InvoiceDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useGetInvoice(id);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const inv = q.data;
  if (!inv) return null;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
    >
      <View>
        <H1>{inv.subject || inv.projectName || "請求書"}</H1>
        <Muted style={{ marginTop: 4 }}>{inv.invoiceNumber}</Muted>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          <Badge tone={inv.paid ? "success" : "warning"}>
            {inv.paid ? "入金済" : "未入金"}
          </Badge>
          {inv.sentToClient ? <Badge tone="accent">送付済</Badge> : null}
        </View>
      </View>

      <Card>
        <SectionTitle>基本情報</SectionTitle>
        <Row label="案件" value={inv.projectName ?? "—"} />
        {inv.customerName ? <Row label="顧客" value={inv.customerName} /> : null}
        {inv.contactName ? <Row label="ご担当" value={inv.contactName} /> : null}
        <Row label="発行日" value={fmtDate(inv.issueDate)} />
        <Row label="お支払期限" value={fmtDate(inv.dueDate)} />
        {inv.sentAt ? <Row label="送付日" value={fmtDate(inv.sentAt)} /> : null}
        {inv.paidAt ? <Row label="入金日" value={fmtDate(inv.paidAt)} /> : null}
      </Card>

      <Card>
        <SectionTitle>明細</SectionTitle>
        {inv.items.map((it, i) => (
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
          </View>
        ))}
      </Card>

      <Card>
        <Row label="小計" value={yen(inv.subtotal)} />
        <Row label="消費税 (10%)" value={yen(inv.tax)} />
        <Row
          label="合計"
          value={
            <Body style={{ fontSize: 18, fontWeight: "700" }}>{yen(inv.total)}</Body>
          }
        />
      </Card>

      {inv.notes ? (
        <Card>
          <SectionTitle>備考</SectionTitle>
          <Body>{inv.notes}</Body>
        </Card>
      ) : null}
    </ScrollView>
  );
}
