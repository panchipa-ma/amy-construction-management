import { useAuth, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useGetMe } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import { Body, Card, Loader, Muted, SectionTitle } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { isInternal } from "@/lib/role";

type MenuItem = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  href?: string;
  onPress?: () => void;
  destructive?: boolean;
};

export default function MoreTab() {
  const c = useColors();
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const meQ = useGetMe();

  if (meQ.isLoading) return <Loader />;

  const internal = isInternal(meQ.data ?? null);

  const internalItems: MenuItem[] = [
    { label: "顧客", icon: "users", href: "/customers" },
    { label: "職人", icon: "tool", href: "/staff" },
    { label: "社員", icon: "user", href: "/employees" },
    { label: "月次歩合", icon: "trending-up", href: "/commissions" },
    { label: "ユーザー管理", icon: "shield", href: "/users" },
  ];

  const vendorItems: MenuItem[] = [
    { label: "職人請求書", icon: "file-text", href: "/vendor-invoices" },
    { label: "職人見積書", icon: "file", href: "/vendor-quotes" },
  ];

  const commonItems: MenuItem[] = [
    { label: "プロフィール", icon: "user", href: "/profile" },
  ];

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
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
    >
      <Card>
        <Muted>サインイン中</Muted>
        <Body style={{ marginTop: 4, fontWeight: "600" }}>
          {user?.fullName || user?.primaryEmailAddress?.emailAddress || "ユーザー"}
        </Body>
        {user?.primaryEmailAddress?.emailAddress ? (
          <Muted style={{ marginTop: 2 }}>
            {user.primaryEmailAddress.emailAddress}
          </Muted>
        ) : null}
        <Muted style={{ marginTop: 6 }}>
          権限: {internal ? "社内" : "社外 (職人)"}
        </Muted>
      </Card>

      {internal ? (
        <>
          <SectionTitle>マスタ・集計</SectionTitle>
          {internalItems.map((it) => (
            <MenuRow key={it.label} item={it} onPressItem={() => it.href && router.push(it.href as never)} />
          ))}
        </>
      ) : null}

      <SectionTitle>職人ドキュメント</SectionTitle>
      {vendorItems.map((it) => (
        <MenuRow
          key={it.label}
          item={it}
          onPressItem={() => it.href && router.push(it.href as never)}
        />
      ))}

      <SectionTitle>アカウント</SectionTitle>
      {commonItems.map((it) => (
        <MenuRow key={it.label} item={it} onPressItem={() => it.href && router.push(it.href as never)} />
      ))}
      <MenuRow
        item={{ label: "ログアウト", icon: "log-out", destructive: true }}
        onPressItem={onSignOut}
      />

      <Muted style={{ textAlign: "center", marginTop: 16 }}>
        AMY 施工管理 · モバイル版 (閲覧)
      </Muted>
    </ScrollView>
  );
}

function MenuRow({
  item,
  onPressItem,
}: {
  item: MenuItem;
  onPressItem: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPressItem}
      style={({ pressed }) => [
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather
        name={item.icon}
        size={20}
        color={item.destructive ? c.destructive : c.primary}
      />
      <Body style={{ flex: 1, color: item.destructive ? c.destructive : c.foreground, fontWeight: "500" }}>
        {item.label}
      </Body>
      {!item.destructive ? (
        <Feather name="chevron-right" size={18} color={c.mutedForeground} />
      ) : null}
    </Pressable>
  );
}
