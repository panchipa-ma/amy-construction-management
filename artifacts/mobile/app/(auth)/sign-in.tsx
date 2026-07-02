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
  const [code, setCode] = React.useState("");
  const [codeSent, setCodeSent] = React.useState(false);
  const [generalError, setGeneralError] = React.useState<string | null>(null);

  const handleSendCode = useCallback(async () => {
    setGeneralError(null);
    try {
      const { error } = await signIn.emailCode.sendCode({ emailAddress });
      if (error) {
        setGeneralError(
          (error as { message?: string })?.message ||
            "認証コードの送信に失敗しました。",
        );
        return;
      }
      setCodeSent(true);
    } catch (err) {
      setGeneralError(
        err instanceof Error
          ? err.message
          : "認証コードの送信に失敗しました。",
      );
    }
  }, [emailAddress, signIn]);

  const handleVerify = useCallback(async () => {
    setGeneralError(null);
    try {
      const { error } = await signIn.emailCode.verifyCode({ code });
      if (error) {
        setGeneralError(
          (error as { message?: string })?.message || "認証に失敗しました。",
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
        setGeneralError("認証が完了しませんでした。コードを確認してください。");
      }
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "認証に失敗しました。",
      );
    }
  }, [code, signIn, router]);

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
          <Text
            style={{
              marginTop: 6,
              color: c.mutedForeground,
              textAlign: "center",
            }}
          >
            {codeSent
              ? "メールに届いた認証コードを入力してください"
              : "ログインして続けてください"}
          </Text>
        </View>

        {codeSent ? (
          <>
            <Text style={[styles.label, { color: c.mutedForeground }]}>
              認証コード
            </Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: c.border, color: c.foreground, backgroundColor: c.card },
              ]}
              keyboardType="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
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
                title="ログイン"
                onPress={handleVerify}
                disabled={!code}
                loading={isFetching}
              />
            </View>
            <Pressable
              onPress={handleSendCode}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text style={{ color: c.primary }}>コードを再送する</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setCodeSent(false);
                setCode("");
                setGeneralError(null);
              }}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text style={{ color: c.mutedForeground }}>
                メールアドレスを変更する
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: c.mutedForeground }]}>
              メールアドレス
            </Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: c.border, color: c.foreground, backgroundColor: c.card },
              ]}
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

            <View style={{ marginTop: 20 }}>
              <PrimaryButton
                title="認証コードを送信"
                onPress={handleSendCode}
                disabled={!emailAddress}
                loading={isFetching}
              />
            </View>

            {/* Required for Clerk bot protection */}
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
