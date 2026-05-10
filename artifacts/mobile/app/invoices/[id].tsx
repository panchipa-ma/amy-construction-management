import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  useGetInvoice,
  useUpdateInvoice,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { Switch } from "@/components/form";
import { printApiDoc } from "@/lib/print-doc";
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
  const router = useRouter();
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useGetInvoice(id);
  const updateMut = useUpdateInvoice();
  const [printing, setPrinting] = useState(false);

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const inv = q.data;
  if (!inv) return null;

  const togglePaid = async (v: boolean) => {
    await updateMut.mutateAsync({
      id: inv.id,
      data: {
        projectId: inv.projectId,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName ?? null,
        contactName: inv.contactName ?? null,
        subject: inv.subject ?? null,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate ?? null,
        notes: inv.notes ?? null,
        paid: v,
        sentToClient: inv.sentToClient,
        items: inv.items,
      },
    });
    await qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(inv.id) });
    await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
  };

  const toggleSent = async (v: boolean) => {
    await updateMut.mutateAsync({
      id: inv.id,
      data: {
        projectId: inv.projectId,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName ?? null,
        contactName: inv.contactName ?? null,
        subject: inv.subject ?? null,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate ?? null,
        notes: inv.notes ?? null,
        paid: inv.paid,
        sentToClient: v,
        items: inv.items,
      },
    });
    await qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(inv.id) });
    await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
  };

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

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => router.push(`/invoices/edit?id=${inv.id}`)}
          style={({ pressed }) => [
            {
              flex: 1,
              paddingVertical: 12,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="edit-2" size={14} color={c.foreground} />
          <Body style={{ fontWeight: "600" }}>編集</Body>
        </Pressable>
        <Pressable
          disabled={printing}
          onPress={async () => {
            try {
              setPrinting(true);
              await printApiDoc({
                path: `/api/print/invoice/${inv.id}`,
                fileName: `請求書-${inv.invoiceNumber}.pdf`,
                getToken: () => getToken(),
              });
            } catch (e) {
              Alert.alert("PDFを作成できませんでした", String((e as Error).message ?? e));
            } finally {
              setPrinting(false);
            }
          }}
          style={({ pressed }) => [
            {
              flex: 1,
              paddingVertical: 12,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: c.primary,
              opacity: printing ? 0.6 : 1,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="printer" size={14} color={c.primaryForeground} />
          <Body style={{ fontWeight: "600", color: c.primaryForeground }}>
            {printing ? "作成中…" : "PDF・印刷"}
          </Body>
        </Pressable>
      </View>

      <Card>
        <SectionTitle>ステータス</SectionTitle>
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: "500" }}>顧客へ送付済</Body>
            {inv.sentAt ? (
              <Muted style={{ fontSize: 11 }}>送付日 {fmtDate(inv.sentAt)}</Muted>
            ) : null}
          </View>
          <Switch value={inv.sentToClient} onValueChange={toggleSent} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: "500" }}>入金済</Body>
            {inv.paidAt ? (
              <Muted style={{ fontSize: 11 }}>入金日 {fmtDate(inv.paidAt)}</Muted>
            ) : null}
          </View>
          <Switch value={inv.paid} onValueChange={togglePaid} />
        </View>
      </Card>

      <Card>
        <SectionTitle>基本情報</SectionTitle>
        <Row label="案件" value={inv.projectName ?? "—"} />
        {inv.customerName ? <Row label="顧客" value={inv.customerName} /> : null}
        {inv.contactName ? <Row label="ご担当" value={inv.contactName} /> : null}
        <Row label="発行日" value={fmtDate(inv.issueDate)} />
        <Row label="お支払期限" value={fmtDate(inv.dueDate)} />
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
              <Body style={{ fontWeight: "600" }}>{yen(it.quantity * it.unitPrice)}</Body>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Row label="小計" value={yen(inv.subtotal)} />
        <Row label="消費税 (10%)" value={yen(inv.tax)} />
        <Row
          label="合計"
          value={<Body style={{ fontSize: 18, fontWeight: "700" }}>{yen(inv.total)}</Body>}
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
