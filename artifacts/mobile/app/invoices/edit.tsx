import { useQueryClient } from "@tanstack/react-query";
import {
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  useCreateInvoice,
  useDeleteInvoice,
  useGetInvoice,
  useListInvoices,
  useListProjects,
  useUpdateInvoice,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import {
  DateInput,
  Field,
  FormScreen,
  FormSection,
  Input,
  Select,
  type SelectOption,
  Switch,
  Textarea,
} from "@/components/form";
import {
  LineItemsEditor,
  type LineItemForm,
  emptyLineItem,
  lineItemsFromApi,
  lineItemsToApi,
} from "@/components/form/line-items";
import { Body, Loader } from "@/components/ui";
import { endOfNextMonthISO, todayLocalISO } from "@/lib/format";
import { invalidateDashboard } from "@/lib/invalidate";

function todayStr() {
  return todayLocalISO();
}

export default function InvoiceEditGuarded() {
  return (
    <InternalOnly>
      <InvoiceEdit />
    </InternalOnly>
  );
}

function InvoiceEdit() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id, projectId: presetProject } = useLocalSearchParams<{
    id?: string;
    projectId?: string;
  }>();
  const isEdit = !!id;

  const projectsQ = useListProjects();
  const invListQ = useListInvoices(undefined, {
    query: { enabled: !isEdit, queryKey: getListInvoicesQueryKey() },
  });
  const invQ = useGetInvoice(id!, {
    query: { enabled: isEdit, queryKey: getGetInvoiceQueryKey(id ?? "") },
  });
  const createMut = useCreateInvoice();
  const updateMut = useUpdateInvoice();
  const deleteMut = useDeleteInvoice();

  const [projectId, setProjectId] = useState<string>(presetProject ?? "");
  const [customerName, setCustomerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [subject, setSubject] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [autoNumberSet, setAutoNumberSet] = useState(false);
  const [issueDate, setIssueDateRaw] = useState(todayStr());
  // 翌月末を初期値に。ユーザーが手動で変更したら自動同期を停止。
  const [dueDate, setDueDateRaw] = useState(endOfNextMonthISO(todayStr()));
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const setIssueDate = (v: string) => {
    setIssueDateRaw(v);
    if (!dueDateTouched && v) setDueDateRaw(endOfNextMonthISO(v));
  };
  const setDueDate = (v: string) => {
    setDueDateRaw(v);
    setDueDateTouched(true);
  };
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState(false);
  const [sentToClient, setSentToClient] = useState(false);
  const [items, setItems] = useState<LineItemForm[]>([{ ...emptyLineItem }]);
  const [loaded, setLoaded] = useState(!isEdit);

  // 新規作成時、既存の番号から次の番号を自動提案する (例: INV-20260510-003)
  useEffect(() => {
    if (isEdit || autoNumberSet || invoiceNumber || !invListQ.data) return;
    const today = todayStr().replace(/-/g, "");
    const prefix = `INV-${today}-`;
    const used = invListQ.data
      .map((i) => i.invoiceNumber)
      .filter((n) => n.startsWith(prefix))
      .map((n) => Number(n.slice(prefix.length)) || 0);
    const next = (used.length ? Math.max(...used) : 0) + 1;
    setInvoiceNumber(`${prefix}${String(next).padStart(3, "0")}`);
    setAutoNumberSet(true);
  }, [isEdit, autoNumberSet, invoiceNumber, invListQ.data]);

  useEffect(() => {
    if (isEdit && invQ.data && !loaded) {
      const inv = invQ.data;
      setProjectId(inv.projectId);
      setCustomerName(inv.customerName ?? "");
      setContactName(inv.contactName ?? "");
      setSubject(inv.subject ?? "");
      setInvoiceNumber(inv.invoiceNumber);
      setIssueDateRaw(inv.issueDate);
      setDueDateRaw(inv.dueDate ?? "");
      // 既存値はユーザー設定済みとみなし、自動同期を停止
      setDueDateTouched(true);
      setNotes(inv.notes ?? "");
      setPaid(inv.paid);
      setSentToClient(inv.sentToClient);
      setItems(lineItemsFromApi(inv.items));
      setLoaded(true);
    }
  }, [isEdit, invQ.data, loaded]);

  if (isEdit && !loaded) return <Loader />;

  const projectOptions: SelectOption[] = (projectsQ.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.name} (${p.customerName})`,
  }));

  const submit = async () => {
    const apiItems = lineItemsToApi(items);
    const data = {
      projectId,
      invoiceNumber: invoiceNumber.trim(),
      customerName: customerName || null,
      contactName: contactName || null,
      subject: subject || null,
      issueDate,
      dueDate: dueDate || null,
      notes: notes || null,
      paid,
      sentToClient,
      items: apiItems,
    };
    if (isEdit && id) await updateMut.mutateAsync({ id, data });
    else await createMut.mutateAsync({ data });
    await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    if (isEdit && id) await qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
    await invalidateDashboard(qc);
    router.back();
  };

  const onDelete = isEdit
    ? async () => {
        await deleteMut.mutateAsync({ id: id! });
        await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
        await invalidateDashboard(qc);
        router.dismissAll();
        router.replace("/(tabs)/invoices");
      }
    : undefined;

  return (
    <FormScreen
      title={isEdit ? "請求書を編集" : "新規請求書"}
      onSave={submit}
      saving={createMut.isPending || updateMut.isPending}
      validate={() => {
        const missing: Array<{ name?: string; label: string }> = [];
        if (!projectId) missing.push({ name: "projectId", label: "案件" });
        if (!invoiceNumber.trim())
          missing.push({ name: "invoiceNumber", label: "請求書No" });
        if (!issueDate) missing.push({ name: "issueDate", label: "発行日" });
        if (lineItemsToApi(items).length === 0)
          missing.push({ label: "明細 (1行以上)" });
        return missing;
      }}
      onDelete={onDelete}
      deleting={deleteMut.isPending}
    >
      <FormSection title="基本情報">
        <Field label="案件" name="projectId" required>
          <Select
            value={projectId}
            onValueChange={(v) => setProjectId(v)}
            options={projectOptions}
            placeholder="案件を選択"
          />
        </Field>
        <Field label="請求書No" name="invoiceNumber" required>
          <Input value={invoiceNumber} onChangeText={setInvoiceNumber} placeholder="INV-2025-0001" />
        </Field>
        <Field label="顧客名" hint="空欄の場合は案件の顧客を使用">
          <Input value={customerName} onChangeText={setCustomerName} />
        </Field>
        <Field label="ご担当者名">
          <Input value={contactName} onChangeText={setContactName} />
        </Field>
        <Field label="件名">
          <Input value={subject} onChangeText={setSubject} />
        </Field>
        <Field label="発行日" name="issueDate" required>
          <DateInput value={issueDate} onChangeText={setIssueDate} />
        </Field>
        <Field label="お支払期限">
          <DateInput value={dueDate} onChangeText={setDueDate} />
        </Field>
        <Field label="備考">
          <Textarea value={notes} onChangeText={setNotes} rows={3} />
        </Field>
      </FormSection>

      <FormSection title="ステータス">
        <ToggleRow
          label="顧客へ送付済"
          value={sentToClient}
          onValueChange={setSentToClient}
          hint="月次歩合計算の対象月のキー"
        />
        <ToggleRow
          label="入金済"
          value={paid}
          onValueChange={setPaid}
        />
      </FormSection>

      <FormSection title="明細">
        <LineItemsEditor items={items} onChange={setItems} />
      </FormSection>
    </FormScreen>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  hint,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: "500" }}>{label}</Body>
        {hint ? <Body style={{ fontSize: 11, opacity: 0.6 }}>{hint}</Body> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}
