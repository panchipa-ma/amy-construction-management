import { Feather } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

function parseISODate(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

const JP_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function fmtJP(s: string): string {
  const d = parseISODate(s);
  if (!d) return "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${JP_WEEKDAYS[d.getDay()]})`;
}

export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          fontSize: 13,
          color: c.foreground,
          marginBottom: 6,
          fontWeight: "500",
        }}
      >
        {label}
        {required ? <Text style={{ color: c.destructive }}> *</Text> : null}
      </Text>
      {children}
      {hint ? (
        <Text style={{ fontSize: 11, color: c.mutedForeground, marginTop: 4 }}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text style={{ fontSize: 12, color: c.destructive, marginTop: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  ...rest
}: {
  value: string;
  onChangeText: (v: string) => void;
} & Omit<TextInputProps, "value" | "onChangeText" | "style">) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.mutedForeground}
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
        fontSize: 15,
        color: c.foreground,
        backgroundColor: c.card,
      }}
      {...rest}
    />
  );
}

export function Textarea({
  value,
  onChangeText,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.mutedForeground}
      multiline
      textAlignVertical="top"
      style={{
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        color: c.foreground,
        backgroundColor: c.card,
        minHeight: 24 * rows,
      }}
    />
  );
}

export function NumberInput({
  value,
  onChangeText,
  placeholder,
  decimal = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  decimal?: boolean;
}) {
  return (
    <Input
      value={value}
      onChangeText={(v) => {
        const cleaned = decimal
          ? v.replace(/[^0-9.\-]/g, "")
          : v.replace(/[^0-9\-]/g, "");
        onChangeText(cleaned);
      }}
      placeholder={placeholder}
      keyboardType={decimal ? "decimal-pad" : "number-pad"}
    />
  );
}

export function DateInput({
  value,
  onChangeText,
  placeholder = "日付を選択",
  allowClear = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const c = useColors();
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(parseISODate(value) ?? new Date());

  if (Platform.OS === "web") {
    return React.createElement("input" as unknown as React.ComponentType<Record<string, unknown>>, {
      type: "date",
      value: value || "",
      onChange: (e: { target: { value: string } }) => onChangeText(e.target.value),
      style: {
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 15,
        color: c.foreground,
        backgroundColor: c.card,
        fontFamily: "inherit",
      },
    });
  }

  const openPicker = () => {
    const initial = parseISODate(value) ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        onChange: (event, selected) => {
          if (event.type === "set" && selected) onChangeText(fmtISO(selected));
        },
      });
    } else {
      setIosDraft(initial);
      setIosOpen(true);
    }
  };

  const display = value ? fmtJP(value) : "";

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={openPicker}
          style={({ pressed }) => [
            {
              flex: 1,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === "ios" ? 12 : 10,
              backgroundColor: c.card,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text
            style={{
              fontSize: 15,
              color: display ? c.foreground : c.mutedForeground,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {display || placeholder}
          </Text>
          <Feather name="calendar" size={16} color={c.mutedForeground} />
        </Pressable>
        {allowClear && value ? (
          <Pressable
            onPress={() => onChangeText("")}
            hitSlop={8}
            style={({ pressed }) => [
              {
                paddingHorizontal: 8,
                paddingVertical: 8,
              },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Feather name="x-circle" size={18} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {Platform.OS === "ios" ? (
        <Modal
          transparent
          animationType="fade"
          visible={iosOpen}
          onRequestClose={() => setIosOpen(false)}
        >
          <Pressable
            onPress={() => setIosOpen(false)}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "flex-end",
            }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: c.card,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingBottom: 24,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: c.border,
                }}
              >
                <Pressable onPress={() => setIosOpen(false)}>
                  <Text style={{ color: c.mutedForeground, fontSize: 15 }}>
                    キャンセル
                  </Text>
                </Pressable>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.foreground }}>
                  日付を選択
                </Text>
                <Pressable
                  onPress={() => {
                    onChangeText(fmtISO(iosDraft));
                    setIosOpen(false);
                  }}
                >
                  <Text style={{ color: c.primary, fontSize: 15, fontWeight: "600" }}>
                    完了
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={iosDraft}
                mode="date"
                display="inline"
                onChange={(_, selected) => {
                  if (selected) setIosDraft(selected);
                }}
                locale="ja-JP"
                themeVariant="light"
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

export function Switch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const c = useColors();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: c.border, true: c.primary }}
      thumbColor="#fff"
    />
  );
}

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = "選択してください",
  allowEmpty = false,
}: {
  value: T | "";
  onValueChange: (v: T | "") => void;
  options: SelectOption<T>[];
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          {
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: Platform.OS === "ios" ? 12 : 10,
            backgroundColor: c.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={{ fontSize: 15, color: current ? c.foreground : c.mutedForeground }}>
          {current?.label ?? placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color={c.mutedForeground} />
      </Pressable>
      <Modal
        transparent
        animationType="fade"
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "70%",
            }}
          >
            <View
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: c.border,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.foreground }}>
                {placeholder}
              </Text>
            </View>
            <ScrollView>
              {allowEmpty ? (
                <Pressable
                  onPress={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    {
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: c.border,
                    },
                    pressed && { backgroundColor: c.muted },
                  ]}
                >
                  <Text style={{ fontSize: 15, color: c.mutedForeground, fontStyle: "italic" }}>
                    （未選択）
                  </Text>
                </Pressable>
              ) : null}
              {options.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    {
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: c.border,
                      backgroundColor: opt.value === value ? c.muted : "transparent",
                    },
                    pressed && { backgroundColor: c.muted },
                  ]}
                >
                  <Text style={{ fontSize: 15, color: c.foreground }}>{opt.label}</Text>
                </Pressable>
              ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function FormScreen({
  title,
  onSave,
  saving,
  saveLabel = "保存",
  saveDisabled,
  validate,
  onDelete,
  deleting,
  children,
}: {
  title: string;
  onSave: () => Promise<void> | void;
  saving?: boolean;
  saveLabel?: string;
  saveDisabled?: boolean;
  /**
   * Returns labels of missing required fields. If non-empty, an alert lists
   * them and `onSave` is not called. Use this so users can tap 保存 and see
   * which fields they still need to fill.
   */
  validate?: () => string[];
  onDelete?: () => Promise<void> | void;
  deleting?: boolean;
  children: React.ReactNode;
}) {
  const c = useColors();
  const router = useRouter();

  const handleSave = useCallback(async () => {
    if (validate) {
      const missing = validate();
      if (missing.length > 0) {
        Alert.alert(
          "未入力の項目があります",
          missing.map((f) => `・${f}`).join("\n"),
          [{ text: "OK" }],
        );
        return;
      }
    }
    try {
      await onSave();
    } catch (err: unknown) {
      Alert.alert("保存に失敗しました", err instanceof Error ? err.message : String(err));
    }
  }, [onSave, validate]);

  const handleDelete = useCallback(() => {
    if (!onDelete) return;
    Alert.alert("削除しますか？", "この操作は取り消せません。", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await onDelete();
          } catch (err: unknown) {
            Alert.alert("削除に失敗しました", err instanceof Error ? err.message : String(err));
          }
        },
      },
    ]);
  }, [onDelete]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 12,
          paddingTop: 12,
          paddingBottom: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border,
          backgroundColor: c.card,
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            { paddingHorizontal: 8, paddingVertical: 6 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={{ color: c.primary, fontSize: 15 }}>キャンセル</Text>
        </Pressable>
        <Text
          style={{ fontSize: 16, fontWeight: "600", color: c.foreground, flex: 1, textAlign: "center" }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={!!saveDisabled || !!saving}
          style={({ pressed }) => [
            {
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: saveDisabled || saving ? c.muted : c.primary,
              minWidth: 70,
              alignItems: "center",
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={c.primaryForeground} size="small" />
          ) : (
            <Text
              style={{
                color: saveDisabled ? c.mutedForeground : c.primaryForeground,
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              {saveLabel}
            </Text>
          )}
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
        {onDelete ? (
          <Pressable
            onPress={handleDelete}
            disabled={!!deleting}
            style={({ pressed }) => [
              {
                marginTop: 24,
                paddingVertical: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: c.destructive,
                alignItems: "center",
                opacity: deleting ? 0.5 : 1,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            {deleting ? (
              <ActivityIndicator color={c.destructive} />
            ) : (
              <Text style={{ color: c.destructive, fontWeight: "600" }}>削除</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function FormSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 20 }}>
      {title ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: c.mutedForeground,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** FAB for list screens */
export function Fab({
  onPress,
  icon = "plus",
  label,
  inTabs,
}: {
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  label?: string;
  /** When inside a bottom-tab screen, raise the FAB above the tab bar. */
  inTabs?: boolean;
}) {
  const c = useColors();
  const bottom = inTabs ? (Platform.OS === "ios" ? 100 : 80) : 24;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          position: "absolute",
          right: 18,
          bottom,
          backgroundColor: c.primary,
          borderRadius: label ? 28 : 32,
          paddingHorizontal: label ? 18 : 0,
          height: label ? 52 : 56,
          width: label ? undefined : 56,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Feather name={icon} size={24} color={c.primaryForeground} />
      {label ? (
        <Text style={{ color: c.primaryForeground, fontWeight: "600", fontSize: 15 }}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Common API error → string */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "予期しないエラーが発生しました";
}
