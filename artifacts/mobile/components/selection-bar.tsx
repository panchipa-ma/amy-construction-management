import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Body } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { confirmDestructive } from "@/lib/confirm";

export function SelectionBar({
  count,
  total,
  onCancel,
  onSelectAll,
  onDelete,
  busy,
  label = "件選択",
}: {
  count: number;
  total: number;
  onCancel: () => void;
  onSelectAll?: () => void;
  onDelete: () => void | Promise<void>;
  busy?: boolean;
  label?: string;
}) {
  const c = useColors();

  const confirmDelete = async () => {
    if (busy) return;
    const ok = await confirmDestructive({
      title: "選択した項目を削除",
      message: `${count} 件を削除します。元に戻せません。`,
      confirmLabel: "削除する",
    });
    if (!ok) return;
    await onDelete();
  };

  return (
    <View
      style={{
        backgroundColor: c.primary,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Pressable
        onPress={onCancel}
        disabled={busy}
        hitSlop={8}
        style={({ pressed }) => [
          { padding: 4 },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Feather name="x" size={22} color={c.primaryForeground} />
      </Pressable>
      <Body
        style={{
          color: c.primaryForeground,
          fontWeight: "700",
          flex: 1,
        }}
      >
        {count}
        {label}
      </Body>
      {onSelectAll && count < total ? (
        <Pressable
          onPress={onSelectAll}
          disabled={busy}
          hitSlop={6}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Feather name="check-square" size={16} color={c.primaryForeground} />
          <Body style={{ color: c.primaryForeground, fontWeight: "600", fontSize: 13 }}>
            全選択
          </Body>
        </Pressable>
      ) : null}
      <Pressable
        onPress={confirmDelete}
        disabled={busy}
        hitSlop={6}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: c.destructive,
            borderRadius: 8,
            opacity: busy ? 0.7 : 1,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Feather name="trash-2" size={16} color="#fff" />
        )}
        <Body style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>削除</Body>
      </Pressable>
    </View>
  );
}
