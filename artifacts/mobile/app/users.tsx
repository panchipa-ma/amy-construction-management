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
import { Alert, FlatList, RefreshControl, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import { SelectionBar } from "@/components/selection-bar";
import { isInternal } from "@/lib/role";
import {
  Badge,
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

  const onAction = (u: AppUser) => {
    const isSelf = u.id === meId;
    Alert.alert(
      u.email ?? u.clerkUserId,
      `権限: ${u.role === "internal" ? "社内" : "社外"} / ステータス: ${
        u.status === "approved" ? "承認済" : "承認待ち"
      }`,
      [
        { text: "キャンセル", style: "cancel" },
        ...(u.status === "pending"
          ? [
              {
                text: "承認する",
                onPress: async () => {
                  await updateMut.mutateAsync({ id: u.id, data: { status: "approved" } });
                  await qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
                },
              },
            ]
          : []),
        ...(!isSelf && u.role === "external"
          ? [
              {
                text: "社内に昇格",
                onPress: async () => {
                  await updateMut.mutateAsync({
                    id: u.id,
                    data: { role: "internal", status: "approved" },
                  });
                  await qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
                },
              },
            ]
          : []),
        ...(!isSelf && u.role === "internal"
          ? [
              {
                text: "社外に降格",
                onPress: async () => {
                  await updateMut.mutateAsync({ id: u.id, data: { role: "external" } });
                  await qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
                },
              },
            ]
          : []),
      ],
    );
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
      ) : null}
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
                if (sel.selectionMode) {
                  if (!isSelf) sel.toggle(u.id);
                } else {
                  onAction(u);
                }
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Body style={{ fontWeight: "600" }}>{u.email ?? u.clerkUserId}</Body>
                  {u.approvedAt ? (
                    <Muted style={{ fontSize: 11, marginTop: 2 }}>
                      承認: {fmtDateTime(u.approvedAt)}
                    </Muted>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Badge tone={u.role === "internal" ? "accent" : "default"}>
                    {u.role === "internal" ? "社内" : "社外"}
                  </Badge>
                  <Badge tone={u.status === "approved" ? "success" : "warning"}>
                    {u.status === "approved" ? "承認済" : "承認待ち"}
                  </Badge>
                  {isSelf ? <Muted style={{ fontSize: 10 }}>あなた</Muted> : null}
                </View>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}
