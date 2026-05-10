import { useQueryClient } from "@tanstack/react-query";
import {
  getGetQuoteQueryKey,
  getListQuotesQueryKey,
  useCreateQuote,
  useDeleteQuote,
  useGetQuote,
  useListProjects,
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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [issueDate, setIssueDate] = useState(todayStr());
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItemForm[]>([{ ...emptyLineItem }]);
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && quoteQ.data && !loaded) {
      const q = quoteQ.data;
      setProjectId(q.projectId);
      setSubject(q.subject ?? "");
      setContactName(q.contactName ?? "");
      setQuoteNumber(q.quoteNumber);
      setIssueDate(q.issueDate);
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
    if (!projectId) throw new Error("案件を選択してください");
    if (!quoteNumber.trim()) throw new Error("見積No は必須です");
    if (!issueDate) throw new Error("見積日は必須です");
    const apiItems = lineItemsToApi(items);
    if (apiItems.length === 0) throw new Error("明細を1行以上入力してください");
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
      saveDisabled={!projectId || !quoteNumber.trim() || !issueDate}
      onDelete={onDelete}
      deleting={deleteMut.isPending}
    >
      <FormSection title="基本情報">
        <Field label="案件" required>
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
        <Field label="見積No" required>
          <Input value={quoteNumber} onChangeText={setQuoteNumber} placeholder="Q-2025-0001" />
        </Field>
        <Field label="見積日" required>
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
