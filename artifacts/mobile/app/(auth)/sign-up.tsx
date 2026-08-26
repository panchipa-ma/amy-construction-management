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
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [verificationSent, setVerificationSent] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(false);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setGeneralError(null);
    setSuccessMessage(null);
    const normalizedEmail = emailAddress.trim();
    if (!normalizedEmail) {
      setGeneralError("メールアドレスを入力してください。");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await signUp.create({ emailAddress: normalizedEmail });
      if (error) {
        setGeneralError(
          (error as { message?: string })?.message ||
            "登録に失敗しました。",
        );
        return;
      }
      const sendResult = (await signUp.verifications.sendEmailCode()) as {
        error?: { message?: string } | null;
      };
      if (sendResult?.error) {
        setGeneralError(
          sendResult.error.message || "認証コードの送信に失敗しました。",
        );
        return;
      }
      // APIの送信成功後だけ、ローカル状態を認証コード画面へ切り替える。
      setVerificationSent(true);
      setCode("");
      setSuccessMessage("認証コードを送信しました。");
    } catch (err) {
      setGeneralError(
        err instanceof Error
          ? err.message
          : "認証コードの送信に失敗しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [emailAddress, isSubmitting, signUp]);

  const handleResend = useCallback(async () => {
    if (isResending || isSubmitting || isVerifying) return;
    setGeneralError(null);
    setSuccessMessage(null);
    setIsResending(true);
    try {
      const sendResult = (await signUp.verifications.sendEmailCode()) as {
        error?: { message?: string } | null;
      };
      if (sendResult?.error) {
        setGeneralError(
          sendResult.error.message || "認証コードの再送に失敗しました。",
        );
        return;
      }
      setSuccessMessage("認証コードを再送しました。");
    } catch (err) {
      setGeneralError(
        err instanceof Error
          ? err.message
          : "認証コードの再送に失敗しました。",
      );
    } finally {
      setIsResending(false);
    }
  }, [isResending, isSubmitting, isVerifying, signUp]);

  const handleVerify = useCallback(async () => {
    if (isVerifying) return;
    setGeneralError(null);
    setSuccessMessage(null);
    if (!code.trim()) {
      setGeneralError("認証コードを入力してください。");
      return;
    }
    setIsVerifying(true);
    try {
      const verifyResult = (await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      })) as { error?: { message?: string } | null };
      if (verifyResult?.error) {
        setGeneralError(
          verifyResult.error.message || "認証に失敗しました。コードを確認してください。",
        );
        return;
      }
      // verifyEmailCode()直後のsignUp.statusは古いスナップショットの場合が
      // あるため、statusを確認せず成功後は直接finalizeする。
      await signUp.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return;
          router.replace("/(tabs)");
        },
      });
    } catch (err) {
      setGeneralError(
        err instanceof Error ? err.message : "認証に失敗しました。コードを確認してください。",
      );
    } finally {
      setIsVerifying(false);
    }
  }, [code, isVerifying, signUp, router]);

  const handleChangeEmail = useCallback(() => {
    signUp.reset();
    setVerificationSent(false);
    setCode("");
    setGeneralError(null);
    setSuccessMessage(null);
  }, [signUp]);

  const isFetching = fetchStatus === "fetching";
  const needsVerify = verificationSent;

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
                disabled={!code.trim() || isVerifying || isFetching}
                loading={isVerifying || isFetching}
              />
            </View>
            <Pressable
              onPress={handleResend}
              disabled={isResending || isVerifying || isFetching}
              style={{
                marginTop: 12,
                alignItems: "center",
                opacity: isResending || isVerifying || isFetching ? 0.5 : 1,
              }}
            >
              <Text style={{ color: c.primary }}>
                {isResending ? "再送信中..." : "コードを再送する"}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleChangeEmail}
              disabled={isResending || isVerifying}
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
                disabled={!emailAddress.trim() || isSubmitting || isFetching}
                loading={isSubmitting || isFetching}
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
        {successMessage ? (
          <Text style={[styles.success, { color: c.primary }]}>
            {successMessage}
          </Text>
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
  success: {
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
});
