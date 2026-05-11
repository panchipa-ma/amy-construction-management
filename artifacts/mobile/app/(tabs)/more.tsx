import { useAuth, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useGetMe } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import { Body, Card, Loader, Muted, SectionTitle } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { isInternal } from "@/lib/role";

type NavEntry = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  href: string;
  internalOnly?: boolean;
};

// 配列順は WEB のサイドバー (artifacts/amy/src/components/app-shell.tsx) と完全一致。
const NAV: NavEntry[] = [
  { label: "ダッシュボード", icon: "home", href: "/(tabs)" },
  { label: "案件", icon: "briefcase", href: "/(tabs)/projects" },
  { label: "竣工", icon: "check-circle", href: "/projects/completed" },
  { label: "施工台帳", icon: "book-open", href: "/ledger" },
  { label: "工程表", icon: "bar-chart-2", href: "/gantt" },
  { label: "見積", icon: "file-text", href: "/(tabs)/quotes" },
  { label: "請求", icon: "dollar-sign", href: "/(tabs)/invoices" },
  { label: "入金済", icon: "check-circle", href: "/(tabs)/invoices?paid=true" },
  { label: "職人見積書", icon: "edit-3", href: "/vendor-quotes" },
  { label: "職人請求書", icon: "upload", href: "/vendor-invoices" },
  { label: "職人振込済", icon: "check-circle", href: "/vendor-invoices?paid=true" },
  { label: "領収書", icon: "file", href: "/receipts" },
  { label: "職人 出面表", icon: "clipboard", href: "/staff-assignments" },
  { label: "顧客", icon: "users", href: "/customers" },
  { label: "職人", icon: "tool", href: "/staff" },
  { label: "社員", icon: "user", href: "/employees", internalOnly: true },
  { label: "月次歩合", icon: "trending-up", href: "/commissions", internalOnly: true },
  { label: "ユーザー管理", icon: "shield", href: "/users", internalOnly: true },
];

export default function MoreTab() {
  const c = useColors();
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const meQ = useGetMe();

  if (meQ.isLoading) return <Loader />;

  const internal = isInternal(meQ.data ?? null);
  const visible = NAV.filter((n) => !n.internalOnly || internal);

  const onSignOut = () => {
    Alert.alert("ログアウト", "ログアウトしますか?", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
    >
      <Card>
        <Muted>サインイン中</Muted>
        <Body style={{ marginTop: 4, fontWeight: "600" }}>
          {user?.fullName || user?.primaryEmailAddress?.emailAddress || "ユーザー"}
        </Body>
        {user?.primaryEmailAddress?.emailAddress ? (
          <Muted style={{ marginTop: 2 }}>{user.primaryEmailAddress.emailAddress}</Muted>
        ) : null}
        <Muted style={{ marginTop: 6 }}>
          権限: {internal ? "社内（全機能）" : "社外"}
        </Muted>
      </Card>

      <View style={{ marginTop: 8 }}>
        <SectionTitle>メニュー</SectionTitle>
      </View>
      {visible.map((it) => (
        <NavRow
          key={it.href}
          item={it}
          onPress={() => router.push(it.href as never)}
        />
      ))}

      <View style={{ marginTop: 16 }}>
        <SectionTitle>アカウント</SectionTitle>
      </View>
      <NavRow
        item={{ label: "プロフィール", icon: "user", href: "/profile" }}
        onPress={() => router.push("/profile")}
      />
      <NavRow
        item={{ label: "サインアウト", icon: "log-out", href: "" }}
        onPress={onSignOut}
        destructive
      />

      <Muted style={{ textAlign: "center", marginTop: 20 }}>
        AMY 施工管理 · モバイル
      </Muted>
    </ScrollView>
  );
}

function NavRow({
  item,
  onPress,
  destructive,
}: {
  item: NavEntry;
  onPress: () => void;
  destructive?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 13,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather
        name={item.icon}
        size={18}
        color={destructive ? c.destructive : c.primary}
      />
      <Body
        style={{
          flex: 1,
          color: destructive ? c.destructive : c.foreground,
          fontWeight: "500",
        }}
      >
        {item.label}
      </Body>
      {!destructive ? (
        <Feather name="chevron-right" size={18} color={c.mutedForeground} />
      ) : null}
    </Pressable>
  );
}
