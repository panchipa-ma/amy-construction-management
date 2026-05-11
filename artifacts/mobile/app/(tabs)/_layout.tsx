import { useAuth, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import {
  getGetMeQueryKey,
  setAuthTokenGetter,
  useGetMe,
} from "@workspace/api-client-react";
import { Redirect, Tabs, usePathname, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { isProfileComplete, readProfile } from "@/lib/profile";
import { isInternal } from "@/lib/role";

export default function TabsLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const c = useColors();

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useState(() => {
    setAuthTokenGetter(() => getTokenRef.current());
    return null;
  });

  const meQ = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!isSignedIn },
  });

  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  // プロフィール (口座番号・会社情報など) 未入力ならプロフィール画面へ強制誘導。
  // WEB の ProfileGate と同等。職人請求書/見積書の発行元・振込先に必須。
  const profileComplete = userLoaded && user
    ? isProfileComplete(readProfile(user))
    : true;
  useEffect(() => {
    if (!userLoaded || !user) return;
    if (!profileComplete && pathname !== "/profile") {
      router.replace("/profile");
    }
  }, [userLoaded, user, profileComplete, pathname, router]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  if (meQ.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (meQ.data?.status === "pending") {
    return <Redirect href="/pending" />;
  }

  const internal = isInternal(meQ.data ?? null);
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { color: c.foreground, fontWeight: "600" },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
          ...(isWeb ? { height: 84 } : {}),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: internal ? "ホーム" : "見積/請求",
          tabBarIcon: ({ color, size }) => (
            <Feather name={internal ? "home" : "file-text"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "案件",
          href: internal ? "/(tabs)/projects" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="briefcase" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gantt"
        options={{
          title: "工程表",
          href: internal ? "/gantt" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="bar-chart-2" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="staff-assignments"
        options={{
          title: "出面表",
          href: internal ? "/staff-assignments" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="clipboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: "領収書",
          href: internal ? "/receipts" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="file" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "出面",
          href: internal ? null : "/(tabs)/schedule",
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "その他",
          tabBarIcon: ({ color, size }) => (
            <Feather name="menu" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden routes registered so links continue to work */}
      <Tabs.Screen name="quotes" options={{ href: null, title: "見積" }} />
      <Tabs.Screen name="invoices" options={{ href: null, title: "請求" }} />
    </Tabs>
  );
}
