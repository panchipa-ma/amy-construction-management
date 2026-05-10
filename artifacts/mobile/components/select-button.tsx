import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, View } from "react-native";

import { Body } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

/**
 * Right-aligned 選択 pill that enters multi-select mode. Use above the list,
 * shown only when not already in selection mode. Pair with `useSelection`.
 */
export function SelectButton({
  onPress,
  label = "選択",
  disabled,
}: {
  onPress: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          opacity: disabled ? 0.5 : 1,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather name="check-square" size={14} color={c.foreground} />
      <Body style={{ fontSize: 13, fontWeight: "600", color: c.foreground }}>
        {label}
      </Body>
    </Pressable>
  );
}

/**
 * A toolbar row that places content (e.g. filter pills) on the left and the
 * 選択 button on the right. Used above lists.
 */
export function ListToolbar({
  onSelect,
  selectDisabled,
  children,
}: {
  onSelect: () => void;
  selectDisabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      <SelectButton onPress={onSelect} disabled={selectDisabled} />
    </View>
  );
}
