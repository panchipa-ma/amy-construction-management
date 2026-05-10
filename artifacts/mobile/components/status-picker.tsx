import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { Body } from "@/components/ui";

export type StatusPickerOption<T extends string> = {
  label: string;
  value: T;
  color?: string;
};

export function StatusPicker<T extends string>({
  open,
  title,
  options,
  current,
  onSelect,
  onClose,
}: {
  open: boolean;
  title?: string;
  options: StatusPickerOption<T>[];
  current?: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const c = useColors();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            width: "100%",
            maxWidth: 360,
            backgroundColor: c.card,
            borderRadius: 14,
            paddingVertical: 8,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          {title ? (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
              }}
            >
              <Body style={{ fontWeight: "700" }}>{title}</Body>
            </View>
          ) : null}
          {options.map((o) => {
            const isCurrent = o.value === current;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  onClose();
                  if (!isCurrent) onSelect(o.value);
                }}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    gap: 12,
                  },
                  pressed && { backgroundColor: c.muted },
                ]}
              >
                {o.color ? (
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      backgroundColor: o.color,
                    }}
                  />
                ) : null}
                <Body style={{ flex: 1, fontWeight: isCurrent ? "700" : "500" }}>
                  {o.label}
                </Body>
                {isCurrent ? (
                  <Feather name="check" size={18} color={c.primary} />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              {
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: 1,
                borderTopColor: c.border,
                alignItems: "center",
              },
              pressed && { backgroundColor: c.muted },
            ]}
          >
            <Body style={{ color: c.mutedForeground, fontWeight: "600" }}>
              キャンセル
            </Body>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
