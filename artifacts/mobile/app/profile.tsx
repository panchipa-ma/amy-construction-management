import { useUser } from "@clerk/expo";
import { useGetMe } from "@workspace/api-client-react";
import React from "react";
import { ScrollView } from "react-native";

import { Card, ErrorState, Loader, Muted, Row, SectionTitle } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { fmtDateTime } from "@/lib/format";

export default function ProfileScreen() {
  const c = useColors();
  const { user } = useUser();
  const meQ = useGetMe();

  if (meQ.isLoading) return <Loader />;
  if (meQ.isError) return <ErrorState onRetry={() => meQ.refetch()} />;

  const me = meQ.data;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
    >
      <Card>
        <SectionTitle>アカウント</SectionTitle>
        <Row label="名前" value={user?.fullName ?? "—"} />
        <Row label="メール" value={user?.primaryEmailAddress?.emailAddress ?? "—"} />
        <Row label="権限" value={me?.role === "internal" ? "社内" : "社外 (職人)"} />
        <Row label="ステータス" value={me?.status === "approved" ? "承認済" : "承認待ち"} />
        {me?.approvedAt ? <Row label="承認日時" value={fmtDateTime(me.approvedAt)} /> : null}
      </Card>

      <Muted style={{ textAlign: "center" }}>
        プロフィールの詳細編集は Web 版から行えます。
      </Muted>
    </ScrollView>
  );
}
