import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
}) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          base,
          style as ViewStyle,
          pressed && { opacity: 0.7 },
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style as ViewStyle]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "600",
        color: c.mutedForeground,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      {children}
    </Text>
  );
}

export function H1({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const c = useColors();
  return (
    <Text style={[{ fontSize: 24, fontWeight: "700", color: c.foreground }, style]}>
      {children}
    </Text>
  );
}

export function H2({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const c = useColors();
  return (
    <Text style={[{ fontSize: 18, fontWeight: "600", color: c.foreground }, style]}>
      {children}
    </Text>
  );
}

export function Muted({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  const c = useColors();
  return (
    <Text style={[{ fontSize: 13, color: c.mutedForeground }, style]}>{children}</Text>
  );
}

export function Body({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
}) {
  const c = useColors();
  return <Text style={[{ fontSize: 15, color: c.foreground }, style]}>{children}</Text>;
}

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
}) {
  const c = useColors();
  const palette: Record<string, { bg: string; fg: string }> = {
    default: { bg: c.muted, fg: c.foreground },
    success: { bg: "#dcfce7", fg: "#15803d" },
    warning: { bg: "#fef3c7", fg: "#92400e" },
    danger: { bg: "#fee2e2", fg: "#b91c1c" },
    accent: { bg: "#dbeafe", fg: c.primary },
  };
  const p = palette[tone];
  return (
    <View
      style={{
        backgroundColor: p.bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: p.fg, fontSize: 11, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

export function Loader() {
  const c = useColors();
  return (
    <View style={{ padding: 32, alignItems: "center" }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  subtitle,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
}) {
  const c = useColors();
  return (
    <View style={{ padding: 40, alignItems: "center" }}>
      <Feather name={icon} size={36} color={c.mutedForeground} />
      <Text
        style={{
          marginTop: 12,
          fontSize: 16,
          fontWeight: "600",
          color: c.foreground,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ marginTop: 4, fontSize: 13, color: c.mutedForeground, textAlign: "center" }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ padding: 32, alignItems: "center" }}>
      <Feather name="alert-circle" size={32} color={c.destructive} />
      <Text style={{ marginTop: 12, color: c.foreground }}>
        {message || "読み込みに失敗しました"}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            {
              marginTop: 12,
              paddingHorizontal: 18,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: c.primary,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={{ color: c.primaryForeground, fontWeight: "600" }}>再試行</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  icon,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  variant?: "primary" | "outline" | "ghost";
}) {
  const c = useColors();
  const isOutline = variant === "outline";
  const isGhost = variant === "ghost";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 8,
          backgroundColor: isOutline || isGhost ? "transparent" : c.primary,
          borderWidth: isOutline ? 1 : 0,
          borderColor: c.border,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline || isGhost ? c.primary : c.primaryForeground} />
      ) : (
        <>
          {icon ? (
            <Feather
              name={icon}
              size={16}
              color={isOutline || isGhost ? c.primary : c.primaryForeground}
            />
          ) : null}
          <Text
            style={{
              color: isOutline || isGhost ? c.primary : c.primaryForeground,
              fontWeight: "600",
              fontSize: 15,
            }}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Row({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: React.ReactNode;
  valueStyle?: TextStyle;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
        gap: 12,
      }}
    >
      <Text style={{ color: c.mutedForeground, fontSize: 13, flexShrink: 0 }}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text
          style={[
            { color: c.foreground, fontSize: 14, flex: 1, textAlign: "right" },
            valueStyle,
          ]}
        >
          {value}
        </Text>
      ) : (
        <View style={{ flex: 1, alignItems: "flex-end" }}>{value}</View>
      )}
    </View>
  );
}
