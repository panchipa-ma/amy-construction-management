import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  type AppUser,
  getListUsersQueryKey,
  useCreateInvitation,
  useDeleteUser,
  useGetMe,
  useListUsers,
  useUpdateUser,
} from "@workspace/api-client-react";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { SelectButton } from "@/components/select-button";
import { SelectionBar } from "@/components/selection-bar";
import { isInternal } from "@/lib/role";
import {
  Body,
  Card,
  EmptyState,
  ErrorState,
  Loader,
  Muted,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useSelection } from "@/hooks/useSelection";
import { runBulkDelete } from "@/lib/bulk-delete";
import { fmtDateTime } from "@/lib/format";

export default function UsersGuarded() {
  return (
    <InternalOnly>
      <UsersList />
    </InternalOnly>
  );
}

function UsersList() {
  const c = useColors();
  const qc = useQueryClient();
  const meQ = useGetMe();
  const usersQ = useListUsers();
  const updateMut = useUpdateUser();
  const deleteMut = useDeleteUser();
  const meId = meQ.data?.id;
  const items = (usersQ.data ?? []).filter((u) => u.id !== meId);
  const sel = useSelection(items);
  const [busy, setBusy] = useState(false);

  if (usersQ.isLoading) return <Loader />;
  if (usersQ.isError) return <ErrorState onRetry={() => usersQ.refetch()} />;
  if (!isInternal(meQ.data ?? null)) return null;

  const onDelete = async () => {
    setBusy(true);
    try {
      await runBulkDelete(
        sel.selectedItems,
        (id) => deleteMut.mutateAsync({ id }),
        () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() }),
      );
      sel.clear();
    } finally {
      setBusy(false);
    }
  };

  const refresh = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const toggleRole = (u: AppUser) => {
    if (u.id === meId) {
      Alert.alert("変更不可", "自分自身の権限は変更できません");
      return;
    }
    // Policy: 承認されていないユーザーは社内に昇格できない (社外+pending のまま)。
    if (u.role === "external" && u.status !== "approved") {
      Alert.alert(
        "先に承認が必要です",
        "社内に昇格する前に、まずこのユーザーを承認してください。",
      );
      return;
    }
    const next = u.role === "internal" ? "external" : "internal";
    const label = next === "internal" ? "社内に昇格" : "社外に降格";
    Alert.alert(label, `${u.email ?? u.clerkUserId} を${label}しますか?`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "OK",
        onPress: async () => {
          try {
            await updateMut.mutateAsync({
              id: u.id,
              data: { role: next },
            });
            await refresh();
          } catch (e: any) {
            Alert.alert("エラー", e?.message ?? "更新に失敗しました");
          }
        },
      },
    ]);
  };

  const toggleStatus = (u: AppUser) => {
    if (u.id === meId) {
      Alert.alert("変更不可", "自分自身のステータスは変更できません");
      return;
    }
    const next = u.status === "approved" ? "pending" : "approved";
    const label = next === "approved" ? "承認する" : "承認を取り消す";
    Alert.alert(label, `${u.email ?? u.clerkUserId} を${label}しますか?`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "OK",
        onPress: async () => {
          try {
            await updateMut.mutateAsync({ id: u.id, data: { status: next } });
            await refresh();
          } catch (e: any) {
            Alert.alert("エラー", e?.message ?? "更新に失敗しました");
          }
        },
      },
    ]);
  };

  const allRows: AppUser[] = usersQ.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {sel.selectionMode ? (
        <SelectionBar
          count={sel.count}
          total={items.length}
          onCancel={sel.clear}
          onSelectAll={sel.selectAll}
          onDelete={onDelete}
          busy={busy}
        />
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, gap: 8 }}>
          <InviteButton onSent={refresh} />
          <SelectButton onPress={sel.enter} disabled={items.length === 0} />
        </View>
      )}
      <FlatList
        style={{ backgroundColor: c.background }}
        data={allRows}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={usersQ.isFetching} onRefresh={() => usersQ.refetch()} />
        }
        ListEmptyComponent={<EmptyState icon="users" title="ユーザーがいません" />}
        renderItem={({ item: u }) => {
          const isSelf = u.id === meId;
          return (
            <Card
              selectable={sel.selectionMode && !isSelf}
              selected={sel.isSelected(u.id)}
              onLongPress={isSelf ? undefined : () => sel.toggle(u.id)}
              onPress={() => {
                if (sel.selectionMode && !isSelf) sel.toggle(u.id);
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Body style={{ fontWeight: "600" }}>{u.email ?? u.clerkUserId}</Body>
                  {u.approvedAt ? (
                    <Muted style={{ fontSize: 11, marginTop: 2 }}>
                      承認: {fmtDateTime(u.approvedAt)}
                    </Muted>
                  ) : null}
                  {isSelf ? <Muted style={{ fontSize: 11, marginTop: 2 }}>あなた</Muted> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <ToggleChip
                    label={u.role === "internal" ? "社内" : "社外"}
                    tone={u.role === "internal" ? "accent" : "default"}
                    disabled={isSelf || updateMut.isPending}
                    onPress={() => toggleRole(u)}
                  />
                  <ToggleChip
                    label={u.status === "approved" ? "承認済" : "承認待ち"}
                    tone={u.status === "approved" ? "success" : "warning"}
                    disabled={isSelf || updateMut.isPending}
                    onPress={() => toggleStatus(u)}
                  />
                </View>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

function ShareChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.background,
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name={icon} size={16} color={c.primary} />
      <Body style={{ fontSize: 13, fontWeight: "600", color: c.foreground }}>
        {label}
      </Body>
    </Pressable>
  );
}

function InviteButton({ onSent }: { onSent: () => void }) {
  const c = useColors();
  const inviteMut = useCreateInvitation();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setEmail("");
    setShareUrl(null);
  };

  const submit = async () => {
    const e = email.trim();
    if (!e) {
      Alert.alert("入力エラー", "メールアドレスを入力してください");
      return;
    }
    setBusy(true);
    try {
      const inv = await inviteMut.mutateAsync({ data: { emailAddress: e } });
      onSent();
      // メール送信は Clerk が自動で行う。加えて URL があれば LINE/SMS 等でも案内可能。
      if (inv?.url) {
        setShareUrl(inv.url);
      } else {
        setOpen(false);
        setEmail("");
        Alert.alert("送信しました", `${e} に招待メールを送りました。`);
      }
    } catch (err: any) {
      Alert.alert("エラー", err?.message ?? "招待の送信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const shareMessage = (url: string) =>
    `AMY 施工管理アプリへ招待します。\n以下のリンクから登録してください:\n${url}`;

  const openOrFail = async (urlScheme: string, label: string) => {
    try {
      const ok = await Linking.canOpenURL(urlScheme).catch(() => true);
      if (!ok) {
        Alert.alert("利用不可", `${label} は このデバイスで利用できません。`);
        return;
      }
      await Linking.openURL(urlScheme);
    } catch (err: any) {
      Alert.alert("エラー", err?.message ?? `${label} を開けませんでした`);
    }
  };

  const shareViaLine = (url: string) => {
    const msg = encodeURIComponent(shareMessage(url));
    openOrFail(`https://line.me/R/msg/text/?${msg}`, "LINE");
  };
  const shareViaMail = (url: string) => {
    const subject = encodeURIComponent("AMY 施工管理アプリへの招待");
    const body = encodeURIComponent(shareMessage(url));
    openOrFail(
      `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`,
      "メール",
    );
  };
  const shareViaSms = (url: string) => {
    const body = encodeURIComponent(shareMessage(url));
    // iOS は `sms:&body=`、Android は `sms:?body=` だが `?body=` はどちらも動く
    openOrFail(`sms:?body=${body}`, "SMS");
  };
  const shareViaSystem = async (url: string) => {
    try {
      await Share.share({ message: shareMessage(url) });
    } catch (err: any) {
      Alert.alert("エラー", err?.message ?? "共有に失敗しました");
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: c.primary,
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 14,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Body style={{ color: c.primaryForeground, fontWeight: "600", fontSize: 13 }}>
          + 招待
        </Body>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", padding: 24 }}
        >
          <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 20, gap: 12 }}>
            {!shareUrl ? (
              <>
                <Body style={{ fontWeight: "700", fontSize: 16, color: c.foreground }}>
                  ユーザーを招待
                </Body>
                <Body style={{ fontSize: 13, color: c.mutedForeground }}>
                  メールアドレスを入力して招待を作成します。送信後 LINE / メール / SMS で案内できます。登録後は社外+承認待ちで作成されます。
                </Body>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email@example.com"
                  placeholderTextColor={c.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoFocus
                  editable={!busy}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    fontSize: 15,
                    color: c.foreground,
                    backgroundColor: c.background,
                  }}
                />
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <Pressable
                    onPress={close}
                    disabled={busy}
                    style={({ pressed }) => ({
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: c.border,
                      opacity: busy ? 0.5 : pressed ? 0.85 : 1,
                    })}
                  >
                    <Body style={{ color: c.foreground }}>キャンセル</Body>
                  </Pressable>
                  <Pressable
                    onPress={submit}
                    disabled={busy}
                    style={({ pressed }) => ({
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor: c.primary,
                      opacity: busy ? 0.6 : pressed ? 0.85 : 1,
                    })}
                  >
                    <Body style={{ color: c.primaryForeground, fontWeight: "600" }}>
                      {busy ? "送信中…" : "招待を作成"}
                    </Body>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Body style={{ fontWeight: "700", fontSize: 16, color: c.foreground }}>
                  招待を作成しました
                </Body>
                <Body style={{ fontSize: 13, color: c.mutedForeground }}>
                  {email} に招待メールが送信されました。さらに以下の方法でも案内できます:
                </Body>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: 8,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    backgroundColor: c.background,
                  }}
                >
                  <Text
                    selectable
                    style={{ fontSize: 12, color: c.mutedForeground }}
                  >
                    {shareUrl}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <ShareChip
                    icon="message-circle"
                    label="LINE"
                    onPress={() => shareViaLine(shareUrl)}
                  />
                  <ShareChip
                    icon="mail"
                    label="メール"
                    onPress={() => shareViaMail(shareUrl)}
                  />
                  <ShareChip
                    icon="message-square"
                    label="SMS"
                    onPress={() => shareViaSms(shareUrl)}
                  />
                  <ShareChip
                    icon="share-2"
                    label="その他"
                    onPress={() => shareViaSystem(shareUrl)}
                  />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
                  <Pressable
                    onPress={close}
                    style={({ pressed }) => ({
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor: c.primary,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Body style={{ color: c.primaryForeground, fontWeight: "600" }}>
                      閉じる
                    </Body>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function ToggleChip({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: "default" | "accent" | "success" | "warning";
  disabled?: boolean;
  onPress: () => void;
}) {
  const palette: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    default: { bg: "#f3f4f6", fg: "#374151", border: "#d1d5db" },
    accent: { bg: "#dbeafe", fg: "#1e3a8a", border: "#93c5fd" },
    success: { bg: "#d1fae5", fg: "#065f46", border: "#6ee7b7" },
    warning: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  };
  const p = palette[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: p.bg,
        borderColor: p.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
      })}
    >
      <Body style={{ color: p.fg, fontSize: 12, fontWeight: "600" }}>{label}</Body>
    </Pressable>
  );
}
