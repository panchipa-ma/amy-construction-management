import { useSignIn } from "@clerk/expo";
import { useCheckReviewLogin, useReviewLogin } from "@workspace/api-client-react";
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
  const [reviewMode, setReviewMode] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const checkReviewMut = useCheckReviewLogin();
  const reviewLoginMut = useReviewLogin();

  const handleSendCode = useCallback(async () => {
    setGeneralError(null);
    try {
      // App Store 審査用デモアカウントはパスワードログイン (OTP 受信箱なし)。
      try {
        const check = await checkReviewMut.mutateAsync({
          data: { email: emailAddress },
        });
        if (check.isReviewAccount) {
          setReviewMode(true);
          return;
        }
      } catch {
        // check 失敗時は通常の OTP フローへ
      }
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
  }, [emailAddress, signIn, checkReviewMut]);

  const handleReviewLogin = useCallback(async () => {
    setGeneralError(null);
    try {
      const r = await reviewLoginMut.mutateAsync({
        data: { email: emailAddress, password },
      });
      const { error } = await signIn.ticket({ ticket: r.token });
      if (error) {
        setGeneralError(
          (error as { message?: string })?.message || "ログインに失敗しました。",
        );
        return;
      }
      // NOTE: signIn.status はレンダリング時のスナップショットのため、
      // ticket() 直後に読むと古い値のまま "complete" にならないことがある。
      // ticket() がエラーなしで返った時点でセッションは作成済みなので、
      // status を見ずに finalize() を直接呼ぶ。
      try {
        const fin = await signIn.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) return;
            router.replace("/(tabs)");
          },
        });
        if (fin && (fin as { error?: unknown }).error) {
          setGeneralError("ログインが完了しませんでした。");
        }
      } catch {
        setGeneralError("ログインが完了しませんでした。");
      }
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "ログインに失敗しました。",
      );
    }
  }, [emailAddress, password, reviewLoginMut, signIn, router]);

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
      // NOTE: signIn.status はスナップショットのため直後に読むと古いことがある。
      // verifyCode() 成功時は finalize() を直接呼ぶ。
      try {
        const fin = await signIn.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) return;
            router.replace("/(tabs)");
          },
        });
        if (fin && (fin as { error?: unknown }).error) {
          setGeneralError("認証が完了しませんでした。コードを確認してください。");
        }
      } catch {
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
            {reviewMode
              ? "パスワードを入力してください"
              : codeSent
                ? "メールに届いた認証コードを入力してください"
                : "ログインして続けてください"}
          </Text>
        </View>

        {reviewMode ? (
          <>
            <Text style={[styles.label, { color: c.mutedForeground }]}>
              パスワード
            </Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: c.border, color: c.foreground, backgroundColor: c.card },
              ]}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              placeholder="パスワード"
              placeholderTextColor={c.mutedForeground}
              value={password}
              onChangeText={setPassword}
            />
            <View style={{ marginTop: 20 }}>
              <PrimaryButton
                title="ログイン"
                onPress={handleReviewLogin}
                disabled={!password}
                loading={reviewLoginMut.isPending || isFetching}
              />
            </View>
            <Pressable
              onPress={() => {
                setReviewMode(false);
                setPassword("");
                setGeneralError(null);
              }}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text style={{ color: c.mutedForeground }}>
                メールアドレスを変更する
              </Text>
            </Pressable>
          </>
        ) : codeSent ? (
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
