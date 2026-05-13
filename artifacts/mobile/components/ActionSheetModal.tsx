import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, View } from "react-native";

import { Body, Muted } from "./ui";
import { useColors } from "@/hooks/useColors";

export type ActionSheetOption = {
  label: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  destructive?: boolean;
  onPress: () => void | Promise<void>;
};

/**
 * クロスプラットフォーム ボトムシート アクション選択。
 *
 * Alert.alert はExpo Web ではボタンの onPress が発火しない既知の制限があるため、
 * Modal + Pressable で実装。Pressable 内の onPress はユーザージェスチャー
 * チェーンを保つため、ImagePicker などをそのまま起動できる。
 */
export function ActionSheetModal({
  visible,
  title,
  message,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}) {
  const c = useColors();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => {
            /* swallow taps on the sheet */
          }}
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingTop: 8,
            paddingBottom: 28,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: c.border,
              marginBottom: 12,
            }}
          />
          {title || message ? (
            <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {title ? (
                <Body style={{ fontWeight: "700", textAlign: "center" }}>
                  {title}
                </Body>
              ) : null}
              {message ? (
                <Muted
                  style={{ textAlign: "center", marginTop: 4, fontSize: 12 }}
                >
                  {message}
                </Muted>
              ) : null}
            </View>
          ) : null}
          {options.map((opt, i) => (
            <Pressable
              key={i}
              onPress={async () => {
                onClose();
                // 次フレームで実行: Modal を閉じてから picker を起動するほうが
                // Web でユーザージェスチャー扱いされやすい。
                await Promise.resolve();
                await opt.onPress();
              }}
              style={({ pressed }) => [
                {
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderTopWidth: 1,
                  borderTopColor: c.border,
                },
                pressed && { backgroundColor: c.muted },
              ]}
            >
              {opt.icon ? (
                <Feather
                  name={opt.icon}
                  size={18}
                  color={opt.destructive ? c.destructive : c.foreground}
                />
              ) : null}
              <Body
                style={{
                  flex: 1,
                  fontWeight: "600",
                  color: opt.destructive ? c.destructive : c.foreground,
                }}
              >
                {opt.label}
              </Body>
            </Pressable>
          ))}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              {
                marginTop: 10,
                marginHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: c.muted,
                alignItems: "center",
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Body style={{ fontWeight: "600" }}>キャンセル</Body>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
