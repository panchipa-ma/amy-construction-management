import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  type CostEntry,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useGetProject,
  useGetProjectLedger,
  useUpdateProject,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { CostEntrySheet } from "@/components/project-modals";
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
  PROJECT_STATUS_LABEL,
  fmtDate,
  pct,
  yen,
} from "@/lib/format";
import { printApiDoc } from "@/lib/print-doc";

const DEFAULT_STANDARD_PROFIT_RATE = 0.2;
const DEFAULT_SUPERVISOR_COMMISSION_RATE = 0.3;

const CAT_KEYS = ["material", "subcontract", "labor", "expense", "other"] as const;
type Cat = (typeof CAT_KEYS)[number];

export default function LedgerDetailGuarded() {
  return (
    <InternalOnly>
      <LedgerDetail />
    </InternalOnly>
  );
}

function LedgerDetail() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();

  const qc = useQueryClient();
  const projQ = useGetProject(id);
  const ledgerQ = useGetProjectLedger(id);
  const updateProjectMut = useUpdateProject();

  const [costOpen, setCostOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<CostEntry | null>(null);

  if (projQ.isLoading || ledgerQ.isLoading) return <Loader />;
  if (projQ.isError) return <ErrorState onRetry={() => projQ.refetch()} />;
  const p = projQ.data;
  const ledger = ledgerQ.data;
  if (!p || !ledger) return <ErrorState onRetry={() => ledgerQ.refetch()} />;

  // Web parity calculations
  const orderAmount = ledger.contractAmount;
  const orderCost = ledger.plannedCost;
  const orderProfit = orderAmount - orderCost;
  const actualCost = ledger.actualCost;
  const grossProfit = orderAmount - actualCost;

  const salesCommissionRate = (p.salesCommissionRate ?? 5) / 100;
  const salesCommission = Math.round(orderAmount * salesCommissionRate);

  const standardProfitRate =
    p.standardProfitRate != null
      ? p.standardProfitRate / 100
      : DEFAULT_STANDARD_PROFIT_RATE;
  const standardProfit = Math.round(orderAmount * standardProfitRate);
  const profitAfterSales = grossProfit - salesCommission;
  const excessProfit = Math.max(0, profitAfterSales - standardProfit);
  const supervisorCommissionRate =
    p.supervisorCommissionRate != null
      ? p.supervisorCommissionRate / 100
      : DEFAULT_SUPERVISOR_COMMISSION_RATE;
  const supervisorCommission = Math.round(excessProfit * supervisorCommissionRate);
  const finalProfit = grossProfit - salesCommission - supervisorCommission;

  const budgetCost = Math.max(0, orderAmount - salesCommission - standardProfit);
  const budgetProfit = orderAmount - budgetCost;

  const totalsByCat: Record<Cat, number> = {
    material: 0,
    subcontract: 0,
    labor: 0,
    expense: 0,
    other: 0,
  };
  for (const e of ledger.entries) {
    const k = (CAT_KEYS as readonly string[]).includes(e.category)
      ? (e.category as Cat)
      : "other";
    totalsByCat[k] += e.actualAmount;
  }

  const toggleLedgerCompleted = async () => {
    const isCompleted = !!p.ledgerCompletedAt;
    const next = isCompleted ? null : new Date().toISOString();
    const confirmMsg = isCompleted
      ? "施工台帳の完了を取り消しますか?"
      : "施工台帳を完了にしますか?\n現場監督歩合がこの月で計上されます。";
    Alert.alert(
      isCompleted ? "完了を取り消す" : "施工台帳を完了",
      confirmMsg,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "OK",
          onPress: async () => {
            try {
              await updateProjectMut.mutateAsync({
                id: p.id,
                data: { ledgerCompletedAt: next },
              });
              await qc.invalidateQueries({ queryKey: getGetProjectQueryKey(p.id) });
              await qc.invalidateQueries({ queryKey: getGetProjectLedgerQueryKey(p.id) });
              await qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
            } catch (err) {
              Alert.alert("失敗しました", String((err as Error).message ?? err));
            }
          },
        },
      ],
    );
  };

  const printPdf = async () => {
    try {
      const safe = (p.name || "project").replace(/[\\/:*?"<>|]/g, "_");
      await printApiDoc({
        path: `/api/print/ledger/${p.id}`,
        fileName: `施工台帳_${safe}.pdf`,
        getToken,
      });
    } catch (err) {
      Alert.alert("PDFの作成に失敗しました", String((err as Error).message ?? err));
    }
  };

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
            }}
          />
        }
      >
        <View>
          <H1>{p.name}</H1>
          <Muted style={{ marginTop: 4 }}>{p.customerName}</Muted>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Badge tone="accent">{PROJECT_STATUS_LABEL[p.status] ?? p.status}</Badge>
            {p.code ? <Badge>{p.code}</Badge> : null}
            {p.unitNumber ? <Badge>{p.unitNumber}</Badge> : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <ActionButton
            icon="edit-2"
            label="案件を編集"
            onPress={() => router.push(`/projects/edit?id=${p.id}` as never)}
          />
          <ActionButton icon="printer" label="PDF出力" onPress={printPdf} />
        </View>
        <ActionButton
          icon={p.ledgerCompletedAt ? "rotate-ccw" : "check-circle"}
          label={
            p.ledgerCompletedAt
              ? `完了済を取り消す (${fmtDate(p.ledgerCompletedAt)})`
              : "施工台帳を完了"
          }
          onPress={toggleLedgerCompleted}
          tone={p.ledgerCompletedAt ? undefined : "success"}
        />

        {/* 基本情報 */}
        <Card>
          <SectionTitle>基本情報</SectionTitle>
          <Row label="契約番号" value={p.code || "—"} />
          <Row
            label="規定利率"
            value={`${(p.standardProfitRate ?? 20).toFixed(1)}%`}
          />
          <Row label="担当営業" value={p.salesRep || "—"} />
          <Row
            label="営業歩合率"
            value={`${(p.salesCommissionRate ?? 5).toFixed(1)}%`}
          />
          <Row label="担当現場監督" value={p.siteSupervisor || "—"} />
          <Row
            label="監督歩合率"
            value={`${(p.supervisorCommissionRate ?? 30).toFixed(1)}%`}
          />
          <Row
            label="マネジメント報酬"
            value={
              p.otherSalesBonusRecipient && p.otherSalesBonusRate
                ? `${p.otherSalesBonusRecipient} へ ${p.otherSalesBonusRate.toFixed(1)}%`
                : "—"
            }
          />
          <Row label="工事場所" value={p.siteAddress || "—"} />
          <Row label="着工日" value={fmtDate(p.startDate)} />
          <Row label="引渡日" value={fmtDate(p.endDate)} />
          {p.notes ? (
            <View style={{ marginTop: 6 }}>
              <Muted>備考</Muted>
              <Body style={{ marginTop: 2 }}>{p.notes}</Body>
            </View>
          ) : null}
        </Card>

        {/* 受注 / 予算組み / 締め */}
        <Card>
          <SectionTitle>受注 / 予算組み / 締め</SectionTitle>
          <ThreeColRow head="" a="受注 (計画)" b="予算組み" d="締め (実績)" header />
          <ThreeColRow head="売上" a={yen(orderAmount)} b={yen(orderAmount)} d={yen(orderAmount)} bold />
          <ThreeColRow
            head="原価"
            a={yen(orderCost)}
            b={`≤ ${yen(budgetCost)}`}
            d={yen(actualCost)}
            bold
          />
          <ThreeColRow
            head="粗利"
            a={yen(orderProfit)}
            b={`≥ ${yen(budgetProfit)}`}
            d={yen(grossProfit)}
            tone={grossProfit < 0 ? "destructive" : "success"}
            bold
          />
          <ThreeColRow
            head="粗利率"
            a={pctOrDash(orderProfit, orderAmount)}
            b={`≥ ${pctOrDash(budgetProfit, orderAmount)}`}
            d={pctOrDash(grossProfit, orderAmount)}
            tone={grossProfit < 0 ? "destructive" : "success"}
          />
          <Muted style={{ marginTop: 8, fontSize: 11 }}>
            予算組み = 売上 − 営業歩合 − 規定粗利額 (協力会社・経費の上限)
          </Muted>
        </Card>

        {/* 歩合・最終利益 */}
        <Card>
          <SectionTitle>
            歩合・最終利益 (規定 {(standardProfitRate * 100).toFixed(1)}% / 監督 {(supervisorCommissionRate * 100).toFixed(1)}%)
          </SectionTitle>
          <CalcRow label="売上" amount={orderAmount} note="受注金額" />
          <CalcRow
            label="実原価"
            amount={-actualCost}
            note="原価明細 実績合計"
            tone="destructive"
          />
          <CalcRow
            label="粗利"
            amount={grossProfit}
            note="売上 − 実原価"
            tone={grossProfit < 0 ? "destructive" : undefined}
            highlight
          />
          <CalcRow
            label={`営業歩合 (${(salesCommissionRate * 100).toFixed(1)}%)`}
            amount={-salesCommission}
            note={`売上 × 営業歩合率${p.salesRep ? ` (${p.salesRep})` : ""}`}
            tone="destructive"
          />
          <CalcRow
            label="営業歩合控除後 粗利"
            amount={profitAfterSales}
            note="粗利 − 営業歩合"
            tone={profitAfterSales < 0 ? "destructive" : undefined}
            highlight
          />
          <CalcRow
            label={`規定粗利額 (${(standardProfitRate * 100).toFixed(1)}%)`}
            amount={standardProfit}
            note="売上 × 規定利率"
            muted
          />
          <CalcRow
            label="規定超過粗利"
            amount={excessProfit}
            note="max(0, 営業歩合控除後粗利 − 規定粗利額)"
            tone={excessProfit > 0 ? "success" : undefined}
          />
          <CalcRow
            label={`監督歩合 (${(supervisorCommissionRate * 100).toFixed(1)}%)`}
            amount={-supervisorCommission}
            note={`規定超過粗利 × ${(supervisorCommissionRate * 100).toFixed(1)}%${p.siteSupervisor ? ` (${p.siteSupervisor})` : ""}`}
            tone="destructive"
          />
          <CalcRow
            label="最終会社利益"
            amount={finalProfit}
            note="粗利 − 営業歩合 − 監督歩合"
            tone={finalProfit < 0 ? "destructive" : "success"}
            highlight
            bold
          />
        </Card>

        {/* カテゴリ別 計画 vs 実績 */}
        {ledger.byCategory.length > 0 ? (
          <Card>
            <SectionTitle>カテゴリ別 計画 vs 実績</SectionTitle>
            {ledger.byCategory.map((cat) => {
              const over = cat.actualAmount > cat.plannedAmount;
              return (
                <View
                  key={cat.category}
                  style={{ paddingVertical: 6, borderBottomColor: c.border, borderBottomWidth: 1 }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Body style={{ fontWeight: "600" }}>
                      {COST_CATEGORY_LABEL[cat.category] ?? cat.category}
                    </Body>
                    <Body
                      style={{
                        fontWeight: "600",
                        color: over ? c.destructive : c.foreground,
                      }}
                    >
                      {yen(cat.actualAmount)} / {yen(cat.plannedAmount)}
                    </Body>
                  </View>
                </View>
              );
            })}
          </Card>
        ) : null}

        {/* 原価明細 */}
        <Card>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <SectionTitle>原価明細 ({ledger.entries.length}件)</SectionTitle>
            <Pressable
              onPress={() => {
                setEditingCost(null);
                setCostOpen(true);
              }}
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

          {ledger.entries.length === 0 ? (
            <EmptyState icon="dollar-sign" title="原価明細がありません" />
          ) : (
            <>
              {ledger.entries.map((e) => {
                const diff = e.actualAmount - e.plannedAmount;
                const overrun = diff > 0;
                return (
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
                        {e.description || "(無題)"}
                      </Body>
                      <Body style={{ fontWeight: "600" }}>{yen(e.actualAmount)}</Body>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge>{COST_CATEGORY_LABEL[e.category] ?? e.category}</Badge>
                      {e.vendor ? <Muted style={{ fontSize: 11 }}>{e.vendor}</Muted> : null}
                      <Muted style={{ fontSize: 11 }}>· {fmtDate(e.entryDate)}</Muted>
                      <Muted style={{ fontSize: 11 }}>
                        · 計画 {yen(e.plannedAmount)}
                      </Muted>
                      {diff !== 0 ? (
                        <Body
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: overrun ? c.destructive : c.success,
                          }}
                        >
                          {overrun ? "+" : ""}
                          {yen(diff)}
                        </Body>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              {/* カテゴリ別小計 */}
              <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border }}>
                {CAT_KEYS.map((k) =>
                  totalsByCat[k] > 0 ? (
                    <Row
                      key={k}
                      label={COST_CATEGORY_LABEL[k] ?? k}
                      value={yen(totalsByCat[k])}
                    />
                  ) : null,
                )}
                <Row
                  label="合計"
                  value={
                    <Body style={{ fontWeight: "700" }}>{yen(actualCost)}</Body>
                  }
                />
              </View>
            </>
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
    </>
  );
}

function pctOrDash(num: number, den: number): string {
  if (den === 0) return "-";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function ActionButton({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  tone?: "success";
}) {
  const c = useColors();
  const bg = tone === "success" ? c.success : c.card;
  const fg = tone === "success" ? "#fff" : c.foreground;
  const border = tone === "success" ? c.success : c.border;
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
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather name={icon} size={14} color={fg} />
      <Body style={{ fontWeight: "600", color: fg }}>{label}</Body>
    </Pressable>
  );
}

function ThreeColRow({
  head,
  a,
  b,
  d,
  header,
  bold,
  tone,
}: {
  head: string;
  a: string;
  b: string;
  d: string;
  header?: boolean;
  bold?: boolean;
  tone?: "destructive" | "success";
}) {
  const c = useColors();
  const color =
    tone === "destructive" ? c.destructive : tone === "success" ? c.success : c.foreground;
  const labelColor = header ? c.mutedForeground : c.mutedForeground;
  const valueWeight = bold ? "700" : header ? "600" : "400";
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 6,
        borderBottomColor: c.border,
        borderBottomWidth: header ? 1 : 0.5,
        alignItems: "center",
      }}
    >
      <Body style={{ width: 56, color: header ? c.foreground : c.mutedForeground, fontSize: 12, fontWeight: header ? "700" : "500" }}>
        {head}
      </Body>
      <Body
        style={{
          flex: 1,
          textAlign: "right",
          fontSize: 12,
          color: header ? labelColor : color,
          fontWeight: valueWeight as any,
        }}
      >
        {a}
      </Body>
      <Body
        style={{
          flex: 1,
          textAlign: "right",
          fontSize: 12,
          color: header ? labelColor : c.mutedForeground,
          fontWeight: header ? "600" : "400",
        }}
      >
        {b}
      </Body>
      <Body
        style={{
          flex: 1,
          textAlign: "right",
          fontSize: 12,
          color: header ? labelColor : color,
          fontWeight: valueWeight as any,
        }}
      >
        {d}
      </Body>
    </View>
  );
}

function CalcRow({
  label,
  amount,
  note,
  tone,
  muted,
  highlight,
  bold,
}: {
  label: string;
  amount: number;
  note?: string;
  tone?: "destructive" | "success";
  muted?: boolean;
  highlight?: boolean;
  bold?: boolean;
}) {
  const c = useColors();
  const color =
    tone === "destructive"
      ? c.destructive
      : tone === "success"
        ? c.success
        : muted
          ? c.mutedForeground
          : c.foreground;
  return (
    <View
      style={{
        paddingVertical: 6,
        borderBottomColor: c.border,
        borderBottomWidth: 0.5,
        backgroundColor: highlight ? c.muted : undefined,
        marginHorizontal: highlight ? -12 : 0,
        paddingHorizontal: highlight ? 12 : 0,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Body style={{ fontWeight: bold ? "700" : "500", flex: 1, paddingRight: 8 }}>
          {label}
        </Body>
        <Body
          style={{
            fontWeight: bold ? "700" : "600",
            color,
          }}
        >
          {amount < 0 ? "−" : ""}
          {yen(Math.abs(amount))}
        </Body>
      </View>
      {note ? (
        <Muted style={{ fontSize: 11, marginTop: 2 }}>{note}</Muted>
      ) : null}
    </View>
  );
}
