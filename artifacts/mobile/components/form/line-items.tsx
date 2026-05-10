import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Body, Muted } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { yen } from "@/lib/format";

import { Field, Input, NumberInput } from "./index";

export type LineItemForm = {
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  notes: string;
};

export const emptyLineItem: LineItemForm = {
  description: "",
  unit: "式",
  quantity: "1",
  unitPrice: "0",
  notes: "",
};

export function LineItemsEditor({
  items,
  onChange,
}: {
  items: LineItemForm[];
  onChange: (items: LineItemForm[]) => void;
}) {
  const c = useColors();

  const update = (i: number, patch: Partial<LineItemForm>) => {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const remove = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };
  const add = () => onChange([...items, { ...emptyLineItem }]);

  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;

  return (
    <View>
      {items.map((it, i) => {
        const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
        return (
          <View
            key={i}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 10,
              padding: 12,
              marginBottom: 10,
              backgroundColor: c.card,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Body style={{ flex: 1, fontWeight: "600", color: c.mutedForeground, fontSize: 12 }}>
                #{i + 1}
              </Body>
              <Pressable
                onPress={() => remove(i)}
                hitSlop={8}
                style={({ pressed }) => [
                  { padding: 4 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Feather name="trash-2" size={16} color={c.destructive} />
              </Pressable>
            </View>
            <Field label="工事項目">
              <Input
                value={it.description}
                onChangeText={(v) => update(i, { description: v })}
                placeholder="例: 解体工事"
              />
            </Field>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="数量">
                  <NumberInput
                    value={it.quantity}
                    onChangeText={(v) => update(i, { quantity: v })}
                  />
                </Field>
              </View>
              <View style={{ width: 80 }}>
                <Field label="単位">
                  <Input
                    value={it.unit}
                    onChangeText={(v) => update(i, { unit: v })}
                    placeholder="式"
                  />
                </Field>
              </View>
            </View>
            <Field label="単価 (円)">
              <NumberInput
                value={it.unitPrice}
                onChangeText={(v) => update(i, { unitPrice: v })}
                decimal={false}
              />
            </Field>
            <Field label="備考">
              <Input value={it.notes} onChangeText={(v) => update(i, { notes: v })} />
            </Field>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                paddingTop: 6,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: c.border,
              }}
            >
              <Muted>小計 </Muted>
              <Body style={{ fontWeight: "600" }}>{yen(lineTotal)}</Body>
            </View>
          </View>
        );
      })}

      <Pressable
        onPress={add}
        style={({ pressed }) => [
          {
            paddingVertical: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: c.primary,
            borderStyle: "dashed",
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Feather name="plus" size={16} color={c.primary} />
        <Body style={{ color: c.primary, fontWeight: "600" }}>明細を追加</Body>
      </Pressable>

      <View
        style={{
          marginTop: 14,
          padding: 12,
          backgroundColor: c.muted,
          borderRadius: 10,
          gap: 4,
        }}
      >
        <Row label="小計" value={yen(subtotal)} />
        <Row label="消費税 (10%)" value={yen(tax)} />
        <Row label="合計 (税込)" value={yen(total)} bold />
      </View>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Muted>{label}</Muted>
      <Body style={{ fontWeight: bold ? "700" : "500", fontSize: bold ? 16 : 14 }}>{value}</Body>
    </View>
  );
}

export function lineItemsToApi(items: LineItemForm[]) {
  return items
    .filter((it) => it.description.trim())
    .map((it) => ({
      description: it.description.trim(),
      unit: it.unit || null,
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      notes: it.notes || null,
    }));
}

export function lineItemsFromApi(
  items: ReadonlyArray<{
    description: string;
    unit?: string | null;
    quantity: number;
    unitPrice: number;
    notes?: string | null;
  }>,
): LineItemForm[] {
  return items.map((it) => ({
    description: it.description,
    unit: it.unit ?? "",
    quantity: String(it.quantity),
    unitPrice: String(it.unitPrice),
    notes: it.notes ?? "",
  }));
}
