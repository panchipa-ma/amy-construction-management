import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import {
  getGetMeQueryKey,
  setAuthTokenGetter,
  useGetMe,
} from "@workspace/api-client-react";
import { Redirect, Tabs } from "expo-router";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { isInternal } from "@/lib/role";

export default function TabsLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const c = useColors();

  // Keep an always-current ref to getToken so the token getter never goes stale.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Register the token getter synchronously on the first render (before any
  // generated API hook below fires its first request). Using useState's
  // lazy initializer guarantees this runs exactly once, before useGetMe.
  useState(() => {
    setAuthTokenGetter(() => getTokenRef.current());
    return null;
  });

  const meQ = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!isSignedIn },
  });

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
        name="quotes"
        options={{
          title: "見積",
          href: internal ? "/(tabs)/quotes" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="file" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: "請求",
          href: internal ? "/(tabs)/invoices" : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="dollar-sign" size={size} color={color} />
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
    </Tabs>
  );
}
