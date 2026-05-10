import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  type CostCategory,
  type CreateProjectPhaseBodyStatus,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListProgressLogsQueryKey,
  getListProjectPhasesQueryKey,
  useCreateCostEntry,
  useCreateProgressLog,
  useCreateProjectPhase,
  useListStaff,
} from "@workspace/api-client-react";
import React, { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  DateInput,
  Field,
  FormSection,
  Input,
  NumberInput,
  Select,
  type SelectOption,
  Textarea,
} from "@/components/form";
import { Body } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CATEGORY_OPTIONS: SelectOption<CostCategory>[] = [
  { value: "material", label: "材料" },
  { value: "subcontract", label: "外注" },
  { value: "labor", label: "人工" },
  { value: "expense", label: "経費" },
  { value: "other", label: "その他" },
];

const PHASE_STATUS_OPTIONS: SelectOption<CreateProjectPhaseBodyStatus>[] = [
  { value: "planned", label: "予定" },
  { value: "in_progress", label: "進行中" },
  { value: "done", label: "完了" },
];

function SheetWrapper({
  open,
  title,
  onClose,
  children,
  loading,
  onSubmit,
  submitDisabled,
  submitLabel,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  loading: boolean;
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
}) {
  const c = useColors();
  return (
    <Modal transparent animationType="slide" visible={open} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: c.background,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "90%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: c.border,
            }}
          >
            <Body style={{ fontWeight: "600", fontSize: 16 }}>{title}</Body>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>{children}</ScrollView>
          <View style={{ padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
            <Pressable
              disabled={loading || submitDisabled}
              onPress={onSubmit}
              style={({ pressed }) => [
                {
                  paddingVertical: 14,
                  borderRadius: 10,
                  backgroundColor: submitDisabled ? c.muted : c.primary,
                  alignItems: "center",
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Body style={{ color: c.primaryForeground, fontWeight: "700" }}>
                {loading ? "保存中…" : submitLabel ?? "保存"}
              </Body>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function CostEntrySheet({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const qc = useQueryClient();
  const createMut = useCreateCostEntry();

  const [category, setCategory] = useState<CostCategory>("material");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("0");
  const [actualAmount, setActualAmount] = useState("0");
  const [entryDate, setEntryDate] = useState(todayStr());
  const [notes, setNotes] = useState("");

  const reset = () => {
    setCategory("material");
    setDescription("");
    setVendor("");
    setPlannedAmount("0");
    setActualAmount("0");
    setEntryDate(todayStr());
    setNotes("");
  };

  const submit = async () => {
    if (!description.trim()) return;
    try {
      await createMut.mutateAsync({
        data: {
          projectId,
          category,
          description: description.trim(),
          vendor: vendor || null,
          plannedAmount: Number(plannedAmount) || 0,
          actualAmount: Number(actualAmount) || 0,
          entryDate,
          notes: notes || null,
        },
      });
      await qc.invalidateQueries({ queryKey: getGetProjectLedgerQueryKey(projectId) });
      await qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      reset();
      onClose();
    } catch (e) {
      Alert.alert("保存失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SheetWrapper
      open={open}
      title="原価明細を追加"
      onClose={onClose}
      loading={createMut.isPending}
      onSubmit={submit}
      submitDisabled={!description.trim()}
    >
      <FormSection>
        <Field label="カテゴリ" required>
          <Select
            value={category}
            onValueChange={(v) => v && setCategory(v as CostCategory)}
            options={CATEGORY_OPTIONS}
          />
        </Field>
        <Field label="工事項目 / 摘要" required>
          <Input value={description} onChangeText={setDescription} />
        </Field>
        <Field label="仕入先 / 外注先">
          <Input value={vendor} onChangeText={setVendor} />
        </Field>
        <Field label="予算原価 (円)">
          <NumberInput value={plannedAmount} onChangeText={setPlannedAmount} decimal={false} />
        </Field>
        <Field label="実績原価 (円)">
          <NumberInput value={actualAmount} onChangeText={setActualAmount} decimal={false} />
        </Field>
        <Field label="登録日" required>
          <DateInput value={entryDate} onChangeText={setEntryDate} />
        </Field>
        <Field label="備考">
          <Textarea value={notes} onChangeText={setNotes} rows={2} />
        </Field>
      </FormSection>
    </SheetWrapper>
  );
}

export function PhaseSheet({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const qc = useQueryClient();
  const createMut = useCreateProjectPhase();
  const staffQ = useListStaff();

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [status, setStatus] = useState<CreateProjectPhaseBodyStatus>("planned");
  const [staffId, setStaffId] = useState("");
  const [notes, setNotes] = useState("");

  const staffOptions: SelectOption[] = [
    { value: "", label: "未割当" },
    ...(staffQ.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const reset = () => {
    setName("");
    setStartDate(todayStr());
    setEndDate(todayStr());
    setStatus("planned");
    setStaffId("");
    setNotes("");
  };

  const submit = async () => {
    if (!name.trim()) return;
    try {
      await createMut.mutateAsync({
        projectId,
        data: {
          name: name.trim(),
          startDate,
          endDate,
          status,
          staffId: staffId || null,
          notes: notes || null,
        },
      });
      await qc.invalidateQueries({ queryKey: getListProjectPhasesQueryKey(projectId) });
      reset();
      onClose();
    } catch (e) {
      Alert.alert("保存失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SheetWrapper
      open={open}
      title="工程を追加"
      onClose={onClose}
      loading={createMut.isPending}
      onSubmit={submit}
      submitDisabled={!name.trim()}
    >
      <FormSection>
        <Field label="工程名" required>
          <Input value={name} onChangeText={setName} placeholder="例: 解体" />
        </Field>
        <Field label="開始日" required>
          <DateInput value={startDate} onChangeText={setStartDate} />
        </Field>
        <Field label="終了日" required>
          <DateInput value={endDate} onChangeText={setEndDate} />
        </Field>
        <Field label="ステータス">
          <Select
            value={status}
            onValueChange={(v) => v && setStatus(v as CreateProjectPhaseBodyStatus)}
            options={PHASE_STATUS_OPTIONS}
          />
        </Field>
        <Field label="担当職人">
          <Select value={staffId} onValueChange={(v) => setStaffId(v)} options={staffOptions} />
        </Field>
        <Field label="備考">
          <Textarea value={notes} onChangeText={setNotes} rows={2} />
        </Field>
      </FormSection>
    </SheetWrapper>
  );
}

export function ProgressLogSheet({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const qc = useQueryClient();
  const createMut = useCreateProgressLog();

  const [date, setDate] = useState(todayStr());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setDate(todayStr());
    setTitle("");
    setDescription("");
  };

  const submit = async () => {
    if (!title.trim()) return;
    try {
      await createMut.mutateAsync({
        data: {
          projectId,
          date,
          title: title.trim(),
          description: description || null,
        },
      });
      await qc.invalidateQueries({
        queryKey: getListProgressLogsQueryKey({ projectId }),
      });
      reset();
      onClose();
    } catch (e) {
      Alert.alert("保存失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SheetWrapper
      open={open}
      title="進捗を記録"
      onClose={onClose}
      loading={createMut.isPending}
      onSubmit={submit}
      submitDisabled={!title.trim()}
    >
      <FormSection>
        <Field label="日付" required>
          <DateInput value={date} onChangeText={setDate} />
        </Field>
        <Field label="タイトル" required>
          <Input value={title} onChangeText={setTitle} placeholder="例: 配管接続完了" />
        </Field>
        <Field label="詳細">
          <Textarea value={description} onChangeText={setDescription} rows={4} />
        </Field>
      </FormSection>
    </SheetWrapper>
  );
}
