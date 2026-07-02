import { useSignIn } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useCallback } from "react";
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

export default function SignInScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [generalError, setGeneralError] = React.useState<string | null>(null);

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
