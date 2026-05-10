import { useSignIn, useSSO } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState, PrimaryButton } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

const useWarmUpBrowser = () => {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

export default function SignInScreen() {
  useWarmUpBrowser();
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = React.useState(false);

  const handleSubmit = useCallback(async () => {
    setGeneralError(null);
    try {
      const { error } = await signIn.password({ emailAddress, password });
      if (error) {
        setGeneralError(
          (error as { message?: string })?.message ||
            "ログインに失敗しました。",
        );
        return;
      }
      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) return;
            router.replace("/(tabs)");
          },
        });
      } else {
        setGeneralError("追加の認証が必要です。Web版でお試しください。");
      }
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "ログインに失敗しました。",
      );
    }
  }, [emailAddress, password, signIn, router]);

  const handleGoogle = useCallback(async () => {
    setGeneralError(null);
    setOauthLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: ({ session }) => {
            if (session?.currentTask) return;
            router.replace("/(tabs)");
          },
        });
      }
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "Google ログインに失敗しました。",
      );
    } finally {
      setOauthLoading(false);
    }
  }, [router, startSSOFlow]);

  const isFetching = fetchStatus === "fetching";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={{ width: 72, height: 72, borderRadius: 16, marginBottom: 16 }}
          />
          <Text style={{ fontSize: 26, fontWeight: "700", color: c.foreground }}>
            AMY 施工管理
          </Text>
          <Text style={{ marginTop: 6, color: c.mutedForeground }}>
            ログインして続けてください
          </Text>
        </View>

        <Text style={[styles.label, { color: c.mutedForeground }]}>
          メールアドレス
        </Text>
        <TextInput
          style={[styles.input, { borderColor: c.border, color: c.foreground, backgroundColor: c.card }]}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={c.mutedForeground}
          value={emailAddress}
          onChangeText={setEmailAddress}
        />
        {errors?.fields?.identifier ? (
          <Text style={[styles.error, { color: c.destructive }]}>
            {errors.fields.identifier.message}
          </Text>
        ) : null}

        <Text style={[styles.label, { color: c.mutedForeground, marginTop: 12 }]}>
          パスワード
        </Text>
        <TextInput
          style={[styles.input, { borderColor: c.border, color: c.foreground, backgroundColor: c.card }]}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
          placeholderTextColor={c.mutedForeground}
          value={password}
          onChangeText={setPassword}
        />
        {errors?.fields?.password ? (
          <Text style={[styles.error, { color: c.destructive }]}>
            {errors.fields.password.message}
          </Text>
        ) : null}

        {generalError ? (
          <View style={{ marginTop: 12 }}>
            <ErrorState message={generalError} />
          </View>
        ) : null}

        <View style={{ marginTop: 20 }}>
          <PrimaryButton
            title="ログイン"
            onPress={handleSubmit}
            disabled={!emailAddress || !password}
            loading={isFetching}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginVertical: 20,
            gap: 8,
          }}
        >
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>または</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        </View>

        <Pressable
          onPress={handleGoogle}
          disabled={oauthLoading}
          style={({ pressed }) => [
            {
              paddingVertical: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              justifyContent: "center",
              opacity: oauthLoading ? 0.5 : 1,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="globe" size={18} color={c.foreground} />
          <Text style={{ color: c.foreground, fontWeight: "600", fontSize: 15 }}>
            Google で続ける
          </Text>
        </Pressable>

        <View
          style={{
            marginTop: 24,
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Text style={{ color: c.mutedForeground }}>初めてご利用ですか?</Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable>
              <Text style={{ color: c.primary, fontWeight: "600" }}>
                新規登録
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
});
