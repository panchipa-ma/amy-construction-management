import {
  useGetProject,
  useGetProjectLedger,
  useListProjectPhases,
} from "@workspace/api-client-react";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
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
import {
  COST_CATEGORY_LABEL,
  PHASE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  fmtDate,
  pct,
  yen,
} from "@/lib/format";

export default function ProjectDetailGuarded() {
  return (
    <InternalOnly>
      <ProjectDetail />
    </InternalOnly>
  );
}

function ProjectDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const projQ = useGetProject(id);
  const ledgerQ = useGetProjectLedger(id);
  const phasesQ = useListProjectPhases(id);

  if (projQ.isLoading) return <Loader />;
  if (projQ.isError) return <ErrorState onRetry={() => projQ.refetch()} />;
  const p = projQ.data;
  if (!p) return null;

  const ledger = ledgerQ.data;
  const profit = p.contractAmount - p.actualCost;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={projQ.isFetching || ledgerQ.isFetching}
          onRefresh={() => {
            projQ.refetch();
            ledgerQ.refetch();
            phasesQ.refetch();
          }}
        />
      }
    >
      <View>
        <H1>{p.name}</H1>
        <Muted style={{ marginTop: 4 }}>{p.customerName}</Muted>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          <Badge tone="accent">
            {PROJECT_STATUS_LABEL[p.status] ?? p.status}
          </Badge>
          {p.code ? <Badge>{p.code}</Badge> : null}
          {p.unitNumber ? <Badge>{p.unitNumber}</Badge> : null}
        </View>
      </View>

      <Card>
        <SectionTitle>基本情報</SectionTitle>
        <Row label="現場" value={p.siteAddress || "—"} />
        <Row label="着工" value={fmtDate(p.startDate)} />
        <Row label="竣工予定" value={fmtDate(p.endDate)} />
        {p.salesRep ? <Row label="担当営業" value={p.salesRep} /> : null}
        {p.siteSupervisor ? <Row label="現場監督" value={p.siteSupervisor} /> : null}
      </Card>

      <Card>
        <SectionTitle>金額</SectionTitle>
        <Row label="契約金額" value={yen(p.contractAmount)} />
        <Row label="予算原価" value={yen(p.plannedCost)} />
        <Row label="実績原価" value={yen(p.actualCost)} />
        <Row
          label="粗利"
          value={
            <Body style={{ color: profit >= 0 ? c.success : c.destructive, fontWeight: "700" }}>
              {yen(profit)}
            </Body>
          }
        />
        {p.contractAmount > 0 ? (
          <Row label="粗利率" value={pct((profit / p.contractAmount) * 100)} />
        ) : null}
      </Card>

      {ledger && ledger.byCategory.length > 0 ? (
        <Card>
          <SectionTitle>カテゴリ別 原価</SectionTitle>
          {ledger.byCategory.map((cat) => (
            <Row
              key={cat.category}
              label={COST_CATEGORY_LABEL[cat.category] ?? cat.category}
              value={
                <View style={{ alignItems: "flex-end" }}>
                  <Body style={{ fontWeight: "600" }}>{yen(cat.actualAmount)}</Body>
                  <Muted style={{ fontSize: 11 }}>予算 {yen(cat.plannedAmount)}</Muted>
                </View>
              }
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>工程</SectionTitle>
        {phasesQ.isLoading ? (
          <Loader />
        ) : (phasesQ.data ?? []).length === 0 ? (
          <EmptyState icon="calendar" title="工程が登録されていません" />
        ) : (
          (phasesQ.data ?? [])
            .slice()
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map((ph) => (
              <View key={ph.id} style={{ paddingVertical: 8, borderBottomColor: c.border, borderBottomWidth: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Body style={{ fontWeight: "600", flex: 1 }}>{ph.name}</Body>
                  <Badge tone={ph.status === "done" ? "success" : ph.status === "in_progress" ? "accent" : "default"}>
                    {PHASE_STATUS_LABEL[ph.status] ?? ph.status}
                  </Badge>
                </View>
                <Muted style={{ marginTop: 2 }}>
                  {fmtDate(ph.startDate)} 〜 {fmtDate(ph.endDate)}
                </Muted>
                {ph.staffName ? <Muted>担当: {ph.staffName}</Muted> : null}
              </View>
            ))
        )}
      </Card>

      {ledger && ledger.entries.length > 0 ? (
        <Card>
          <SectionTitle>原価明細</SectionTitle>
          {ledger.entries.map((e) => (
            <View
              key={e.id}
              style={{
                paddingVertical: 8,
                borderBottomColor: c.border,
                borderBottomWidth: 1,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Body style={{ fontWeight: "500", flex: 1, paddingRight: 8 }}>{e.description}</Body>
                <Body style={{ fontWeight: "600" }}>{yen(e.actualAmount || e.plannedAmount)}</Body>
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" }}>
                <Badge>{COST_CATEGORY_LABEL[e.category] ?? e.category}</Badge>
                {e.vendor ? <Muted style={{ fontSize: 11 }}>{e.vendor}</Muted> : null}
                <Muted style={{ fontSize: 11 }}>· {fmtDate(e.entryDate)}</Muted>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
