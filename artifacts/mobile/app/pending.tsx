import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useGetMe } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Card, H1, Muted, PrimaryButton } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

export default function PendingScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const meQ = useGetMe();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        padding: 24,
        paddingTop: insets.top + 24,
      }}
    >
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.muted,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Feather name="clock" size={32} color={c.primary} />
        </View>
        <H1>承認待ち</H1>
      </View>

      <Card>
        <Body>
          アカウントの承認をお待ちください。社内担当者が承認次第、ご利用いただけます。
        </Body>
        <Muted style={{ marginTop: 12 }}>
          承認後はもう一度ログインし直してください。
        </Muted>
        <View style={{ marginTop: 16, gap: 10 }}>
          <PrimaryButton
            title="再読み込み"
            icon="refresh-cw"
            variant="outline"
            onPress={() => meQ.refetch()}
            loading={meQ.isFetching}
          />
          <PrimaryButton
            title="ログアウト"
            icon="log-out"
            variant="ghost"
            onPress={async () => {
              await signOut();
              router.replace("/(auth)/sign-in");
            }}
          />
        </View>
      </Card>
    </ScrollView>
  );
}
