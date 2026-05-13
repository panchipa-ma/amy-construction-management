import { Feather } from "@expo/vector-icons";
import {
  useGetDashboardSummary,
  useGetMe,
  useListVendorInvoices,
  useListVendorQuotes,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import {
  Badge,
  Body,
  Card,
  EmptyState,
  ErrorState,
  H1,
  Loader,
  Muted,
  Row,
  SectionTitle,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { fmtDate, yen } from "@/lib/format";
import { isInternal } from "@/lib/role";

export default function HomeTab() {
  const meQ = useGetMe();
  if (meQ.isLoading) return <Loader />;
  return isInternal(meQ.data ?? null) ? <InternalDashboard /> : <ExternalHome />;
}

function InternalDashboard() {
  const c = useColors();
  const router = useRouter();
  const dash = useGetDashboardSummary();

  if (dash.isLoading) return <Loader />;
  if (dash.isError) return <ErrorState onRetry={() => dash.refetch()} />;

  const d = dash.data;
  if (!d) return null;
  const grossPct =
    d.contractValueActive > 0
      ? (d.grossProfitActive / d.contractValueActive) * 100
      : null;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={dash.isFetching} onRefresh={() => dash.refetch()} />
      }
    >
      <H1>ダッシュボード</H1>
      <Muted>進行中案件と請求の概況</Muted>

      <SectionTitle>クイック操作</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <QuickAction
          icon="users"
          label="顧客一覧"
          onPress={() => router.push("/customers")}
        />
        <QuickAction
          icon="file-text"
          label="見積書一覧"
          onPress={() => router.push("/(tabs)/quotes")}
        />
        <QuickAction
          icon="dollar-sign"
          label="請求書一覧"
          onPress={() => router.push("/(tabs)/invoices")}
        />
        <QuickAction
          icon="edit-3"
          label="職人見積書一覧"
          onPress={() => router.push("/vendor-quotes")}
        />
        <QuickAction
          icon="upload"
          label="職人請求書一覧"
          onPress={() => router.push("/vendor-invoices")}
        />
        <QuickAction
          icon="book-open"
          label="施工台帳"
          onPress={() => router.push("/ledger")}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <KpiCard
          icon="briefcase"
          label="進行中案件"
          value={String(d.activeProjects)}
          onPress={() => router.push("/(tabs)/projects")}
        />
        <KpiCard
          icon="check-circle"
          label="今月竣工"
          value={String(d.completedThisMonth)}
          onPress={() =>
            router.push(`/projects/completed?month=${d.currentMonth}`)
          }
        />
      </View>

      <Pressable onPress={() => router.push("/(tabs)/projects")}>
        <Card>
          <SectionTitle>進行中案件 合計</SectionTitle>
          <Row label="契約金額" value={yen(d.contractValueActive)} />
          <Row label="実績原価" value={yen(d.actualCostActive)} />
          <Row
            label="粗利"
            value={
              <Body
                style={{
                  color: d.grossProfitActive >= 0 ? c.success : c.destructive,
                  fontWeight: "700",
                }}
              >
                {yen(d.grossProfitActive)}
                {grossPct !== null ? `  (${grossPct.toFixed(1)}%)` : ""}
              </Body>
            }
          />
        </Card>
      </Pressable>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <KpiCard
          icon="file-text"
          label={`請求中案件 (${monthLabel(d.currentMonth)})`}
          value={String(d.currentMonthBilledProjectsCount)}
          onPress={() => router.push("/(tabs)/invoices?outstanding=1")}
        />
        <KpiCard
          icon="alert-circle"
          label="未入金請求案件"
          value={String(d.billedProjectsCount)}
          onPress={() => router.push("/(tabs)/invoices?outstanding=1")}
        />
      </View>

      <Pressable
        onPress={() => router.push("/(tabs)/invoices?outstanding=1")}
      >
        <Card>
          <SectionTitle>請求中案件 合計</SectionTitle>
          <Row
            label={`今月 (${monthLabel(d.currentMonth)}) 請求金額`}
            value={yen(d.currentMonthInvoiceTotal)}
          />
          <Row
            label="未入金 (該当月以前)"
            value={
              <Body style={{ color: c.destructive, fontWeight: "700" }}>
                {yen(d.priorOutstandingInvoiceTotal)}
              </Body>
            }
          />
          <Row
            label="合計"
            value={
              <Body style={{ color: c.foreground, fontWeight: "700" }}>
                {yen(d.unpaidInvoiceTotal)}
              </Body>
            }
          />
        </Card>
      </Pressable>

      <Muted style={{ marginTop: 8, textAlign: "center" }}>
        最終更新: {fmtDate(new Date().toISOString())}
      </Muted>
    </ScrollView>
  );
}

function monthLabel(yyyymm: string): string {
  const m = /^\d{4}-(\d{2})$/.exec(yyyymm);
  return m ? `${Number(m[1])}月` : yyyymm;
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: "31%",
          minWidth: 100,
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: 10,
          paddingVertical: 14,
          paddingHorizontal: 8,
          alignItems: "center",
          gap: 6,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather name={icon} size={22} color={c.primary} />
      <Body
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: c.foreground,
          textAlign: "center",
        }}
      >
        {label}
      </Body>
    </Pressable>
  );
}

function KpiCard({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const c = useColors();
  const inner = (
    <Card style={{ flex: 1 }}>
      <Feather name={icon} size={20} color={c.primary} />
      <Body style={{ marginTop: 8, color: c.mutedForeground, fontSize: 12 }}>
        {label}
      </Body>
      <Body
        style={{
          marginTop: 2,
          fontSize: 24,
          fontWeight: "700",
          color: c.foreground,
        }}
      >
        {value}
      </Body>
    </Card>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {inner}
    </Pressable>
  );
}

function ExternalHome() {
  const c = useColors();
  const router = useRouter();
  const invoicesQ = useListVendorInvoices();
  const quotesQ = useListVendorQuotes();

  const isLoading = invoicesQ.isLoading || quotesQ.isLoading;
  if (isLoading) return <Loader />;

  const recentInvoices = (invoicesQ.data ?? []).slice(0, 5);
  const recentQuotes = (quotesQ.data ?? []).slice(0, 5);
  const paidCount = (invoicesQ.data ?? []).filter((inv) => inv.paid).length;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={invoicesQ.isFetching || quotesQ.isFetching}
          onRefresh={() => {
            invoicesQ.refetch();
            quotesQ.refetch();
          }}
        />
      }
    >
      <H1>職人 メニュー</H1>
      <Muted>あなたが提出した書類のみ表示されます</Muted>

      <SectionTitle>クイック操作</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <QuickAction
          icon="edit-3"
          label="職人見積書"
          onPress={() => router.push("/vendor-quotes")}
        />
        <QuickAction
          icon="upload"
          label="職人請求書"
          onPress={() => router.push("/vendor-invoices")}
        />
        <QuickAction
          icon="check-circle"
          label={`職人振込済 (${paidCount})`}
          onPress={() => router.push("/vendor-invoices?paid=true")}
        />
        <QuickAction
          icon="calendar"
          label="職人出面表"
          onPress={() => router.push("/(tabs)/schedule")}
        />
      </View>

      <SectionTitle>請求書 (最新)</SectionTitle>
      {recentInvoices.length === 0 ? (
        <Card>
          <EmptyState icon="file-text" title="請求書はまだありません" />
        </Card>
      ) : (
        recentInvoices.map((inv) => (
          <Card key={inv.id}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: "600" }}>
                  {inv.projectName ?? "(未割当)"}
                </Body>
                <Muted>
                  {inv.unitNumber ? `${inv.unitNumber} · ` : ""}
                  {fmtDate(inv.invoiceDate)}
                </Muted>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Body style={{ fontWeight: "700" }}>{yen(inv.amount)}</Body>
                <Badge tone={inv.paid ? "success" : "warning"}>
                  {inv.paid ? "振込済" : "未振込"}
                </Badge>
              </View>
            </View>
          </Card>
        ))
      )}

      <SectionTitle>見積書 (最新)</SectionTitle>
      {recentQuotes.length === 0 ? (
        <Card>
          <EmptyState icon="file" title="見積書はまだありません" />
        </Card>
      ) : (
        recentQuotes.map((q) => (
          <Card key={q.id}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: "600" }}>
                  {q.projectName ?? "(未割当)"}
                </Body>
                <Muted>
                  {q.unitNumber ? `${q.unitNumber} · ` : ""}
                  {fmtDate(q.quoteDate)}
                </Muted>
              </View>
              <Body style={{ fontWeight: "700" }}>{yen(q.amount)}</Body>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
