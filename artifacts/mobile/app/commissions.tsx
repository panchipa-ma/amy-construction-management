import { Feather } from "@expo/vector-icons";
import { useGetCommissions } from "@workspace/api-client-react";
import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

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
import { fmtDate, yen } from "@/lib/format";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CommissionsScreenGuarded() {
  return (
    <InternalOnly>
      <CommissionsScreen />
    </InternalOnly>
  );
}

function CommissionsScreen() {
  const c = useColors();
  const [month, setMonth] = useState(currentMonth());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const q = useGetCommissions({ month });

  if (q.isLoading && !q.data) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const data = q.data;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
      }
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={() => setMonth(shiftMonth(month, -1))}
          style={({ pressed }) => [
            { padding: 10, borderRadius: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="chevron-left" size={20} color={c.foreground} />
        </Pressable>
        <H1>{month}</H1>
        <Pressable
          onPress={() => setMonth(shiftMonth(month, 1))}
          style={({ pressed }) => [
            { padding: 10, borderRadius: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="chevron-right" size={20} color={c.foreground} />
        </Pressable>
      </View>

      {data && data.totals ? (
        <Card>
          <SectionTitle>合計</SectionTitle>
          <Row label="営業歩合" value={yen(data.totals.salesCommission)} />
          <Row label="現場監督歩合" value={yen(data.totals.supervisorCommission)} />
          <Row label="マネジメント報酬" value={yen(data.totals.otherSalesBonus)} />
          <Row
            label="総額"
            value={
              <Body style={{ fontSize: 18, fontWeight: "700" }}>
                {yen(data.totals.total)}
              </Body>
            }
          />
          <Row
            label="対象請求書"
            value={`${data.totals.invoiceCount} 件 / ${yen(data.totals.invoiceTotal)}`}
          />
        </Card>
      ) : null}

      <SectionTitle>担当者別</SectionTitle>

      {!data || data.people.length === 0 ? (
        <Card>
          <EmptyState icon="users" title="該当する歩合がありません" subtitle="月を変更してみてください" />
        </Card>
      ) : (
        data.people.map((p) => {
          const open = !!expanded[p.name];
          return (
            <Card
              key={p.name + (p.staffId ?? "")}
              onPress={() => setExpanded((s) => ({ ...s, [p.name]: !open }))}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: "600" }}>{p.name}</Body>
                  {!p.staffId ? (
                    <View style={{ marginTop: 4, flexDirection: "row" }}>
                      <Badge tone="warning">職人/社員未登録</Badge>
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Body style={{ fontWeight: "700", fontSize: 16 }}>{yen(p.total)}</Body>
                  <Muted style={{ fontSize: 11 }}>{open ? "閉じる" : "詳細"}</Muted>
                </View>
              </View>
              {open ? (
                <View style={{ marginTop: 10 }}>
                  <Row label="営業" value={yen(p.salesCommission)} />
                  <Row label="現場監督" value={yen(p.supervisorCommission)} />
                  <Row label="マネジメント" value={yen(p.otherSalesBonus)} />
                  <SectionTitle>請求書 ({p.lines.length})</SectionTitle>
                  {p.lines.map((line, i) => (
                    <View
                      key={i}
                      style={{
                        paddingVertical: 6,
                        borderBottomColor: c.border,
                        borderBottomWidth: 1,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Body style={{ flex: 1, fontSize: 13 }}>
                          {line.projectName ?? "—"}
                        </Body>
                        <Body style={{ fontWeight: "600", fontSize: 13 }}>
                          {yen(line.amount)}
                        </Body>
                      </View>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                        <Badge tone={line.kind === "sales" ? "accent" : line.kind === "supervisor" ? "default" : "success"}>
                          {line.kind === "sales" ? "営業" : line.kind === "supervisor" ? "監督" : "マネジメント"}
                        </Badge>
                        <Muted style={{ fontSize: 11 }}>
                          {line.invoiceNumber} · {fmtDate(line.sentAt)}
                        </Muted>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}
