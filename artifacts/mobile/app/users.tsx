import { useQueryClient } from "@tanstack/react-query";
import {
  type AppUser,
  getListUsersQueryKey,
  useDeleteUser,
  useGetMe,
  useListUsers,
  useUpdateUser,
} from "@workspace/api-client-react";
import React, { useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, View } from "react-native";

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
              data:
                next === "internal"
                  ? { role: "internal", status: "approved" }
                  : { role: "external" },
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
        <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 12, paddingTop: 10 }}>
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
