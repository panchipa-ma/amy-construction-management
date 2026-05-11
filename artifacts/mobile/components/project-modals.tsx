import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  type CostCategory,
  type CostEntry,
  type CreateProjectPhaseBodyStatus,
  type ProgressLog,
  type ProjectPhase,
  type ScheduleEntry,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListAllProjectPhasesQueryKey,
  getListProjectsQueryKey,
  getListProgressLogsQueryKey,
  getListProjectPhasesQueryKey,
  getListScheduleEntriesQueryKey,
  getListStaffAssignmentsQueryKey,
  useCreateCostEntry,
  useCreateProgressLog,
  useCreateProjectPhase,
  useCreateScheduleEntry,
  useDeleteCostEntry,
  useDeleteProgressLog,
  useDeleteProjectPhase,
  useDeleteScheduleEntry,
  useListProjects,
  useListStaff,
  useUpdateCostEntry,
  useUpdateProjectPhase,
  useUpdateScheduleEntry,
} from "@workspace/api-client-react";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

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
import { confirmDestructive, notify } from "@/lib/confirm";
import { invalidateDashboard } from "@/lib/invalidate";

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
  onDelete,
  deleting,
  deleteConfirmTitle,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  loading: boolean;
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
  onDelete?: () => void;
  deleting?: boolean;
  deleteConfirmTitle?: string;
}) {
  const c = useColors();
  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirmDestructive({
      title: deleteConfirmTitle ?? "削除しますか？",
      message: "この操作は元に戻せません。",
      confirmLabel: "削除",
    });
    if (!ok) return;
    onDelete();
  };
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
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              {onDelete ? (
                <Pressable onPress={handleDelete} hitSlop={8} disabled={deleting || loading}>
                  <Feather name="trash-2" size={20} color={c.destructive} />
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} hitSlop={8}>
                <Feather name="x" size={20} color={c.mutedForeground} />
              </Pressable>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>{children}</ScrollView>
          <View
            style={{
              padding: 16,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.border,
            }}
          >
            <Pressable
              disabled={loading || deleting || submitDisabled}
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
                {loading ? "保存中…" : (submitLabel ?? "保存")}
              </Body>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ============= COST ENTRY ============= */

export function CostEntrySheet({
  open,
  onClose,
  projectId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editing?: CostEntry | null;
}) {
  const qc = useQueryClient();
  const createMut = useCreateCostEntry();
  const updateMut = useUpdateCostEntry();
  const deleteMut = useDeleteCostEntry();

  const [category, setCategory] = useState<CostCategory>("material");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("0");
  const [actualAmount, setActualAmount] = useState("0");
  const [entryDate, setEntryDate] = useState(todayStr());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCategory(editing.category);
      setDescription(editing.description);
      setVendor(editing.vendor ?? "");
      setPlannedAmount(String(editing.plannedAmount ?? 0));
      setActualAmount(String(editing.actualAmount ?? 0));
      setEntryDate(editing.entryDate);
      setNotes(editing.notes ?? "");
    } else {
      setCategory("material");
      setDescription("");
      setVendor("");
      setPlannedAmount("0");
      setActualAmount("0");
      setEntryDate(todayStr());
      setNotes("");
    }
  }, [open, editing]);

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: getGetProjectLedgerQueryKey(projectId) }),
      qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
      invalidateDashboard(qc),
    ]);

  const submit = async () => {
    if (!description.trim()) return;
    const data = {
      projectId,
      category,
      description: description.trim(),
      vendor: vendor || null,
      plannedAmount: Number(plannedAmount) || 0,
      actualAmount: Number(actualAmount) || 0,
      entryDate,
      notes: notes || null,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data });
      } else {
        await createMut.mutateAsync({ data });
      }
      await invalidate();
      onClose();
    } catch (e) {
      notify("保存失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    try {
      await deleteMut.mutateAsync({ id: editing.id });
      await invalidate();
      onClose();
    } catch (e) {
      notify("削除失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SheetWrapper
      open={open}
      title={editing ? "原価明細を編集" : "原価明細を追加"}
      onClose={onClose}
      loading={createMut.isPending || updateMut.isPending}
      deleting={deleteMut.isPending}
      onSubmit={submit}
      submitDisabled={!description.trim()}
      onDelete={editing ? onDelete : undefined}
      deleteConfirmTitle="原価明細を削除"
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

/* ============= PHASE ============= */

export function PhaseSheet({
  open,
  onClose,
  projectId,
  editing,
  showProjectPicker,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  editing?: ProjectPhase | null;
  showProjectPicker?: boolean;
}) {
  const qc = useQueryClient();
  const createMut = useCreateProjectPhase();
  const updateMut = useUpdateProjectPhase();
  const deleteMut = useDeleteProjectPhase();
  const staffQ = useListStaff();
  const projectsQ = useListProjects(undefined, {
    query: {
      enabled: !!showProjectPicker,
      queryKey: getListProjectsQueryKey(),
    },
  });

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [status, setStatus] = useState<CreateProjectPhaseBodyStatus>("planned");
  const [staffId, setStaffId] = useState("");
  const [notes, setNotes] = useState("");
  const [pickedProjectId, setPickedProjectId] = useState("");

  const staffOptions: SelectOption[] = [
    { value: "", label: "未割当" },
    ...(staffQ.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];
  const projectOptions: SelectOption[] = [
    { value: "", label: "案件を選択…" },
    ...((projectsQ.data ?? []).map((p) => ({
      value: p.id,
      label: p.customerName ? `${p.name} (${p.customerName})` : p.name,
    }))),
  ];

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setStartDate(editing.startDate);
      setEndDate(editing.endDate);
      setStatus(editing.status as CreateProjectPhaseBodyStatus);
      setStaffId(editing.staffId ?? "");
      setNotes(editing.notes ?? "");
      setPickedProjectId(editing.projectId);
    } else {
      setName("");
      setStartDate(todayStr());
      setEndDate(todayStr());
      setStatus("planned");
      setStaffId("");
      setNotes("");
      setPickedProjectId(projectId ?? "");
    }
  }, [open, editing, projectId]);

  const effectiveProjectId = projectId ?? pickedProjectId;

  const invalidate = () =>
    Promise.all([
      effectiveProjectId
        ? qc.invalidateQueries({
            queryKey: getListProjectPhasesQueryKey(effectiveProjectId),
          })
        : Promise.resolve(),
      qc.invalidateQueries({ queryKey: getListAllProjectPhasesQueryKey() }),
      qc.invalidateQueries({ queryKey: getListStaffAssignmentsQueryKey() }),
    ]);

  const submit = async () => {
    if (!name.trim()) return;
    if (!effectiveProjectId) {
      notify("案件未選択", "案件を選択してください");
      return;
    }
    const body = {
      name: name.trim(),
      startDate,
      endDate,
      status,
      staffId: staffId || null,
      notes: notes || null,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: body });
      } else {
        await createMut.mutateAsync({ projectId: effectiveProjectId, data: body });
      }
      await invalidate();
      onClose();
    } catch (e) {
      notify("保存失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    try {
      await deleteMut.mutateAsync({ id: editing.id });
      await invalidate();
      onClose();
    } catch (e) {
      notify("削除失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SheetWrapper
      open={open}
      title={editing ? "工程を編集" : "工程を追加"}
      onClose={onClose}
      loading={createMut.isPending || updateMut.isPending}
      deleting={deleteMut.isPending}
      onSubmit={submit}
      submitDisabled={!name.trim()}
      onDelete={editing ? onDelete : undefined}
      deleteConfirmTitle="工程を削除"
    >
      <FormSection>
        {showProjectPicker && !editing ? (
          <Field label="案件" required>
            <Select
              value={pickedProjectId}
              onValueChange={(v) => setPickedProjectId(v ?? "")}
              options={projectOptions}
            />
          </Field>
        ) : null}
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

/* ============= PROGRESS LOG ============= */

export function ProgressLogSheet({
  open,
  onClose,
  projectId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editing?: ProgressLog | null;
}) {
  const qc = useQueryClient();
  const createMut = useCreateProgressLog();
  const deleteMut = useDeleteProgressLog();

  const [date, setDate] = useState(todayStr());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date);
      setTitle(editing.title);
      setDescription(editing.description ?? "");
    } else {
      setDate(todayStr());
      setTitle("");
      setDescription("");
    }
  }, [open, editing]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListProgressLogsQueryKey({ projectId }) });

  const submit = async () => {
    if (!title.trim()) return;
    if (editing) {
      // No update endpoint; treat save as no-op for edits.
      onClose();
      return;
    }
    try {
      await createMut.mutateAsync({
        data: {
          projectId,
          date,
          title: title.trim(),
          description: description || null,
        },
      });
      await invalidate();
      onClose();
    } catch (e) {
      notify("保存失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    try {
      await deleteMut.mutateAsync({ id: editing.id });
      await invalidate();
      onClose();
    } catch (e) {
      notify("削除失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SheetWrapper
      open={open}
      title={editing ? "進捗ログ" : "進捗を記録"}
      onClose={onClose}
      loading={createMut.isPending}
      deleting={deleteMut.isPending}
      onSubmit={submit}
      submitDisabled={!editing && !title.trim()}
      submitLabel={editing ? "閉じる" : "保存"}
      onDelete={editing ? onDelete : undefined}
      deleteConfirmTitle="進捗ログを削除"
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

/* ============= SCHEDULE ENTRY ============= */

export function ScheduleEntrySheet({
  open,
  onClose,
  editing,
  defaultProjectId,
  defaultStaffId,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  editing?: ScheduleEntry | null;
  defaultProjectId?: string;
  defaultStaffId?: string;
  defaultDate?: string;
}) {
  const qc = useQueryClient();
  const createMut = useCreateScheduleEntry();
  const updateMut = useUpdateScheduleEntry();
  const deleteMut = useDeleteScheduleEntry();
  const projectsQ = useListProjects();
  const staffQ = useListStaff();

  const [projectId, setProjectId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [task, setTask] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProjectId(editing.projectId);
      setStaffId(editing.staffId);
      setDate(editing.date);
      setTask(editing.task);
      setStartTime(editing.startTime ?? "");
      setEndTime(editing.endTime ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setProjectId(defaultProjectId ?? "");
      setStaffId(defaultStaffId ?? "");
      setDate(defaultDate ?? todayStr());
      setTask("");
      setStartTime("");
      setEndTime("");
      setNotes("");
    }
  }, [open, editing, defaultProjectId, defaultStaffId, defaultDate]);

  const projectOptions: SelectOption[] = [
    { value: "", label: "選択してください" },
    ...(projectsQ.data ?? []).map((p) => ({
      value: p.id,
      label: p.unitNumber ? `${p.name} (${p.unitNumber})` : p.name,
    })),
  ];
  const staffOptions: SelectOption[] = [
    { value: "", label: "選択してください" },
    ...(staffQ.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const canSubmit = !!projectId && !!staffId && !!task.trim();

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: getListScheduleEntriesQueryKey() }),
      qc.invalidateQueries({ queryKey: getListStaffAssignmentsQueryKey() }),
    ]);

  const submit = async () => {
    if (!canSubmit) return;
    const body = {
      projectId,
      staffId,
      date,
      task: task.trim(),
      startTime: startTime || null,
      endTime: endTime || null,
      notes: notes || null,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: body });
      } else {
        await createMut.mutateAsync({ data: body });
      }
      await invalidate();
      onClose();
    } catch (e) {
      notify("保存失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    try {
      await deleteMut.mutateAsync({ id: editing.id });
      await invalidate();
      onClose();
    } catch (e) {
      notify("削除失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SheetWrapper
      open={open}
      title={editing ? "出面を編集" : "出面を追加"}
      onClose={onClose}
      loading={createMut.isPending || updateMut.isPending}
      deleting={deleteMut.isPending}
      onSubmit={submit}
      submitDisabled={!canSubmit}
      onDelete={editing ? onDelete : undefined}
      deleteConfirmTitle="出面を削除"
    >
      <FormSection>
        <Field label="案件" required>
          <Select value={projectId} onValueChange={(v) => setProjectId(v)} options={projectOptions} />
        </Field>
        <Field label="職人" required>
          <Select value={staffId} onValueChange={(v) => setStaffId(v)} options={staffOptions} />
        </Field>
        <Field label="日付" required>
          <DateInput value={date} onChangeText={setDate} />
        </Field>
        <Field label="作業内容" required>
          <Input value={task} onChangeText={setTask} placeholder="例: 解体作業" />
        </Field>
        <Field label="開始時刻 (HH:MM)">
          <Input value={startTime} onChangeText={setStartTime} placeholder="08:00" />
        </Field>
        <Field label="終了時刻 (HH:MM)">
          <Input value={endTime} onChangeText={setEndTime} placeholder="17:00" />
        </Field>
        <Field label="備考">
          <Textarea value={notes} onChangeText={setNotes} rows={2} />
        </Field>
      </FormSection>
    </SheetWrapper>
  );
}
