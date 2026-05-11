import { Feather } from "@expo/vector-icons";
import {
  type CostEntry,
  type ProgressLog,
  type ProjectPhase,
  useGetProject,
  useGetProjectLedger,
  useListProgressLogs,
  useListProjectPhases,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { CostEntrySheet, PhaseSheet, ProgressLogSheet } from "@/components/project-modals";
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

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          backgroundColor: c.primary,
          borderWidth: 1,
          borderColor: c.primary,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather name={icon} size={14} color={c.primaryForeground} />
      <Body style={{ fontWeight: "600", color: c.primaryForeground }}>
        {label}
      </Body>
    </Pressable>
  );
}

function ProjectDetail() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const projQ = useGetProject(id);
  const ledgerQ = useGetProjectLedger(id);
  const phasesQ = useListProjectPhases(id);
  const logsQ = useListProgressLogs({ projectId: id });

  const [costOpen, setCostOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<CostEntry | null>(null);
  const [editingPhase, setEditingPhase] = useState<ProjectPhase | null>(null);
  const [editingLog, setEditingLog] = useState<ProgressLog | null>(null);

  if (projQ.isLoading) return <Loader />;
  if (projQ.isError) return <ErrorState onRetry={() => projQ.refetch()} />;
  const p = projQ.data;
  if (!p) return null;

  const ledger = ledgerQ.data;
  const profit = p.contractAmount - p.actualCost;

  return (
    <>
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
              logsQ.refetch();
            }}
          />
        }
      >
        <View>
          <H1>{p.name}</H1>
          <Muted style={{ marginTop: 4 }}>{p.customerName}</Muted>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            <Badge tone="accent">{PROJECT_STATUS_LABEL[p.status] ?? p.status}</Badge>
            {p.code ? <Badge>{p.code}</Badge> : null}
            {p.unitNumber ? <Badge>{p.unitNumber}</Badge> : null}
          </View>
        </View>

        <Pressable
          onPress={() => router.push(`/projects/edit?id=${p.id}`)}
          style={({ pressed }) => [
            {
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
          <Body style={{ fontWeight: "600" }}>案件を編集</Body>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <QuickAction
            icon="file-text"
            label="見積書"
            onPress={() => router.push(`/quotes/edit?projectId=${p.id}`)}
          />
          <QuickAction
            icon="bar-chart-2"
            label="工程表"
            onPress={() => router.push(`/(tabs)/gantt`)}
          />
          <QuickAction
            icon="dollar-sign"
            label="請求書"
            onPress={() => router.push(`/invoices/edit?projectId=${p.id}`)}
          />
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
          <CardHeaderAction title="工程" onAdd={() => setPhaseOpen(true)} />
          {phasesQ.isLoading ? (
            <Loader />
          ) : (phasesQ.data ?? []).length === 0 ? (
            <EmptyState icon="calendar" title="工程が登録されていません" />
          ) : (
            (phasesQ.data ?? [])
              .slice()
              .sort((a, b) => a.startDate.localeCompare(b.startDate))
              .map((ph) => (
                <Pressable
                  key={ph.id}
                  onPress={() => {
                    setEditingPhase(ph);
                    setPhaseOpen(true);
                  }}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 8,
                      borderBottomColor: c.border,
                      borderBottomWidth: 1,
                    },
                    pressed && { backgroundColor: c.muted },
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Body style={{ fontWeight: "600", flex: 1 }}>{ph.name}</Body>
                    <Badge
                      tone={
                        ph.status === "done"
                          ? "success"
                          : ph.status === "in_progress"
                            ? "accent"
                            : "default"
                      }
                    >
                      {PHASE_STATUS_LABEL[ph.status] ?? ph.status}
                    </Badge>
                  </View>
                  <Muted style={{ marginTop: 2 }}>
                    {fmtDate(ph.startDate)} 〜 {fmtDate(ph.endDate)}
                  </Muted>
                  {ph.staffName ? <Muted>担当: {ph.staffName}</Muted> : null}
                </Pressable>
              ))
          )}
        </Card>

        <Card>
          <CardHeaderAction title="原価明細" onAdd={() => setCostOpen(true)} />
          {!ledger || ledger.entries.length === 0 ? (
            <EmptyState icon="dollar-sign" title="原価明細がありません" />
          ) : (
            ledger.entries.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => {
                  setEditingCost(e as CostEntry);
                  setCostOpen(true);
                }}
                style={({ pressed }) => [
                  {
                    paddingVertical: 8,
                    borderBottomColor: c.border,
                    borderBottomWidth: 1,
                  },
                  pressed && { backgroundColor: c.muted },
                ]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Body style={{ fontWeight: "500", flex: 1, paddingRight: 8 }}>
                    {e.description}
                  </Body>
                  <Body style={{ fontWeight: "600" }}>
                    {yen(e.actualAmount || e.plannedAmount)}
                  </Body>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 6,
                    marginTop: 4,
                    alignItems: "center",
                  }}
                >
                  <Badge>{COST_CATEGORY_LABEL[e.category] ?? e.category}</Badge>
                  {e.vendor ? <Muted style={{ fontSize: 11 }}>{e.vendor}</Muted> : null}
                  <Muted style={{ fontSize: 11 }}>· {fmtDate(e.entryDate)}</Muted>
                </View>
              </Pressable>
            ))
          )}
        </Card>

        <Card>
          <CardHeaderAction title="進捗ログ" onAdd={() => setLogOpen(true)} />
          {logsQ.isLoading ? (
            <Loader />
          ) : (logsQ.data ?? []).length === 0 ? (
            <EmptyState icon="message-square" title="進捗ログがありません" />
          ) : (
            (logsQ.data ?? []).map((l) => (
              <Pressable
                key={l.id}
                onPress={() => {
                  setEditingLog(l);
                  setLogOpen(true);
                }}
                style={({ pressed }) => [
                  {
                    paddingVertical: 8,
                    borderBottomColor: c.border,
                    borderBottomWidth: 1,
                  },
                  pressed && { backgroundColor: c.muted },
                ]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Body style={{ fontWeight: "600", flex: 1 }}>{l.title}</Body>
                  <Muted style={{ fontSize: 11 }}>{fmtDate(l.date)}</Muted>
                </View>
                {l.description ? (
                  <Muted style={{ marginTop: 4 }}>{l.description}</Muted>
                ) : null}
              </Pressable>
            ))
          )}
        </Card>
      </ScrollView>

      <CostEntrySheet
        open={costOpen}
        onClose={() => {
          setCostOpen(false);
          setEditingCost(null);
        }}
        projectId={p.id}
        editing={editingCost}
      />
      <PhaseSheet
        open={phaseOpen}
        onClose={() => {
          setPhaseOpen(false);
          setEditingPhase(null);
        }}
        projectId={p.id}
        editing={editingPhase}
      />
      <ProgressLogSheet
        open={logOpen}
        onClose={() => {
          setLogOpen(false);
          setEditingLog(null);
        }}
        projectId={p.id}
        editing={editingLog}
      />
    </>
  );
}

function CardHeaderAction({ title, onAdd }: { title: string; onAdd: () => void }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 6,
      }}
    >
      <SectionTitle>{title}</SectionTitle>
      <Pressable
        onPress={onAdd}
        hitSlop={8}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: c.muted,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Feather name="plus" size={12} color={c.primary} />
        <Body style={{ color: c.primary, fontSize: 12, fontWeight: "600" }}>追加</Body>
      </Pressable>
    </View>
  );
}
