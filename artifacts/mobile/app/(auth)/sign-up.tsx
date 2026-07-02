import { useSignUp } from "@clerk/expo";
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

export default function SignUpScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [code, setCode] = React.useState("");
  const [generalError, setGeneralError] = React.useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setGeneralError(null);
    try {
      const { error } = await signUp.create({ emailAddress });
      if (error) {
        setGeneralError(
          (error as { message?: string })?.message ||
            "登録に失敗しました。",
        );
        return;
      }
      await signUp.verifications.sendEmailCode();
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "登録に失敗しました。",
      );
    }
  }, [emailAddress, signUp]);

  const handleVerify = useCallback(async () => {
    setGeneralError(null);
    try {
      await signUp.verifications.verifyEmailCode({ code });
      if (signUp.status === "complete") {
        await signUp.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) return;
            router.replace("/(tabs)");
          },
        });
      } else {
        setGeneralError("認証が完了しませんでした。コードを確認してください。");
      }
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "認証に失敗しました。",
      );
    }
  }, [code, signUp, router]);

  const isFetching = fetchStatus === "fetching";
  const needsVerify =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0;

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
          <Text style={{ fontSize: 24, fontWeight: "700", color: c.foreground }}>
            {needsVerify ? "メール認証" : "新規登録"}
          </Text>
          <Text style={{ marginTop: 6, color: c.mutedForeground, textAlign: "center" }}>
            {needsVerify
              ? "メールに届いた認証コードを入力してください"
              : "アカウントを作成して続けてください"}
          </Text>
        </View>

        {needsVerify ? (
          <>
            <Text style={[styles.label, { color: c.mutedForeground }]}>
              認証コード
            </Text>
            <TextInput
              style={[styles.input, { borderColor: c.border, color: c.foreground, backgroundColor: c.card }]}
              keyboardType="numeric"
              placeholder="000000"
              placeholderTextColor={c.mutedForeground}
              value={code}
              onChangeText={setCode}
            />
            {errors?.fields?.code ? (
              <Text style={[styles.error, { color: c.destructive }]}>
                {errors.fields.code.message}
              </Text>
            ) : null}

            <View style={{ marginTop: 20 }}>
              <PrimaryButton
                title="認証する"
                onPress={handleVerify}
                disabled={!code}
                loading={isFetching}
              />
            </View>
            <Pressable
              onPress={() => signUp.verifications.sendEmailCode()}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text style={{ color: c.primary }}>コードを再送する</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: c.mutedForeground }]}>
              メールアドレス
            </Text>
            <TextInput
              style={[styles.input, { borderColor: c.border, color: c.foreground, backgroundColor: c.card }]}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={c.mutedForeground}
              value={emailAddress}
              onChangeText={setEmailAddress}
            />
            {errors?.fields?.emailAddress ? (
              <Text style={[styles.error, { color: c.destructive }]}>
                {errors.fields.emailAddress.message}
              </Text>
            ) : null}

            <View style={{ marginTop: 20 }}>
              <PrimaryButton
                title="認証コードを送信"
                onPress={handleSubmit}
                disabled={!emailAddress}
                loading={isFetching}
              />
            </View>

            {/* Required for Clerk bot protection on sign-up */}
            <View nativeID="clerk-captcha" />
          </>
        )}

        {generalError ? (
          <View style={{ marginTop: 12 }}>
            <ErrorState message={generalError} />
          </View>
        ) : null}

        <View
          style={{
            marginTop: 24,
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Text style={{ color: c.mutedForeground }}>既にアカウントをお持ちですか?</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text style={{ color: c.primary, fontWeight: "600" }}>
                ログイン
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
