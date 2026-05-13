import { useQueryClient } from "@tanstack/react-query";
import {
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  useCreateQuote,
  useDeleteQuote,
  useGetQuote,
  useListProjects,
  useListQuotes,
  useUpdateQuote,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";

import { InternalOnly } from "@/components/InternalOnly";
import {
  DateInput,
  Field,
  FormScreen,
  FormSection,
  Input,
  Select,
  type SelectOption,
  Textarea,
} from "@/components/form";
import {
  LineItemsEditor,
  type LineItemForm,
  emptyLineItem,
  lineItemsFromApi,
  lineItemsToApi,
} from "@/components/form/line-items";
import { Loader } from "@/components/ui";
import { plus3MonthsISO, todayLocalISO } from "@/lib/format";

function todayStr() {
  return todayLocalISO();
}

export default function QuoteEditGuarded() {
  return (
    <InternalOnly>
      <QuoteEdit />
    </InternalOnly>
  );
}

function QuoteEdit() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id, projectId: presetProject } = useLocalSearchParams<{
    id?: string;
    projectId?: string;
  }>();
  const isEdit = !!id;

  const projectsQ = useListProjects();
  const quotesQ = useListQuotes(undefined, {
    query: { enabled: !isEdit, queryKey: getListQuotesQueryKey() },
  });
  const quoteQ = useGetQuote(id!, {
    query: { enabled: isEdit, queryKey: getGetQuoteQueryKey(id ?? "") },
  });
  const createMut = useCreateQuote();
  const updateMut = useUpdateQuote();
  const deleteMut = useDeleteQuote();

  const [projectId, setProjectId] = useState<string>(presetProject ?? "");
  const [subject, setSubject] = useState("");
  const [contactName, setContactName] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [autoNumberSet, setAutoNumberSet] = useState(false);
  const [issueDate, setIssueDateRaw] = useState(todayStr());
  // 有効期限デフォルト = 見積日の3ヶ月後。発行日変更で常に再計算。手動編集も可。
  const [validUntil, setValidUntil] = useState(plus3MonthsISO(todayStr()));
  const setIssueDate = (v: string) => {
    setIssueDateRaw(v);
    if (v) setValidUntil(plus3MonthsISO(v));
  };
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItemForm[]>([{ ...emptyLineItem }]);
  const [loaded, setLoaded] = useState(!isEdit);

  // 新規作成時、既存の番号から次の番号を自動提案する (例: Q-20260510-003)
  useEffect(() => {
    if (isEdit || autoNumberSet || quoteNumber || !quotesQ.data) return;
    const today = todayStr().replace(/-/g, "");
    const prefix = `Q-${today}-`;
    const used = quotesQ.data
      .map((q) => q.quoteNumber)
      .filter((n) => n.startsWith(prefix))
      .map((n) => Number(n.slice(prefix.length)) || 0);
    const next = (used.length ? Math.max(...used) : 0) + 1;
    setQuoteNumber(`${prefix}${String(next).padStart(3, "0")}`);
    setAutoNumberSet(true);
  }, [isEdit, autoNumberSet, quoteNumber, quotesQ.data]);

  useEffect(() => {
    if (isEdit && quoteQ.data && !loaded) {
      const q = quoteQ.data;
      setProjectId(q.projectId);
      setSubject(q.subject ?? "");
      setContactName(q.contactName ?? "");
      setQuoteNumber(q.quoteNumber);
      setIssueDateRaw(q.issueDate);
      setValidUntil(q.validUntil ?? "");
      setNotes(q.notes ?? "");
      setItems(lineItemsFromApi(q.items));
      setLoaded(true);
    }
  }, [isEdit, quoteQ.data, loaded]);

  if (isEdit && !loaded) return <Loader />;

  const projectOptions: SelectOption[] = (projectsQ.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.name} (${p.customerName})`,
  }));

  const submit = async () => {
    const apiItems = lineItemsToApi(items);
    const data = {
      projectId,
      subject: subject || null,
      contactName: contactName || null,
      quoteNumber: quoteNumber.trim(),
      issueDate,
      validUntil: validUntil || null,
      notes: notes || null,
      items: apiItems,
    };
    if (isEdit && id) await updateMut.mutateAsync({ id, data });
    else await createMut.mutateAsync({ data });
    await qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
    if (isEdit && id) await qc.invalidateQueries({ queryKey: getGetQuoteQueryKey(id) });
    router.back();
  };

  const onDelete = isEdit
    ? async () => {
        await deleteMut.mutateAsync({ id: id! });
        await qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
        router.dismissAll();
        router.replace("/(tabs)/quotes");
      }
    : undefined;

  return (
    <FormScreen
      title={isEdit ? "見積書を編集" : "新規見積書"}
      onSave={submit}
      saving={createMut.isPending || updateMut.isPending}
      validate={() => {
        const missing: Array<{ name?: string; label: string }> = [];
        if (!projectId) missing.push({ name: "projectId", label: "案件" });
        if (!quoteNumber.trim())
          missing.push({ name: "quoteNumber", label: "見積No" });
        if (!issueDate) missing.push({ name: "issueDate", label: "見積日" });
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
        <Field label="件名" hint="空欄の場合は案件名を使用">
          <Input value={subject} onChangeText={setSubject} />
        </Field>
        <Field label="ご担当者名">
          <Input value={contactName} onChangeText={setContactName} />
        </Field>
        <Field label="見積No" name="quoteNumber" required>
          <Input value={quoteNumber} onChangeText={setQuoteNumber} placeholder="Q-2025-0001" />
        </Field>
        <Field label="見積日" name="issueDate" required>
          <DateInput value={issueDate} onChangeText={setIssueDate} />
        </Field>
        <Field label="有効期限">
          <DateInput value={validUntil} onChangeText={setValidUntil} />
        </Field>
        <Field label="備考">
          <Textarea value={notes} onChangeText={setNotes} rows={3} />
        </Field>
      </FormSection>

      <FormSection title="明細">
        <LineItemsEditor items={items} onChange={setItems} />
      </FormSection>
    </FormScreen>
  );
}
