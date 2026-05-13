import { useUser } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListVendorQuotesQueryKey,
  useCreateVendorQuote,
  useListProjects,
  useListStaff,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";

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
  lineItemsToApi,
} from "@/components/form/line-items";
import { Body, Muted } from "@/components/ui";
import { plus3MonthsISO, todayLocalISO } from "@/lib/format";
import { generateAndUploadVendorDoc } from "@/lib/pdf";
import { EMPTY_PROFILE, isProfileComplete, readProfile } from "@/lib/profile";

function todayStr() {
  return todayLocalISO();
}

function autoVendorDocNumber(prefix: "VQ" | "INV"): string {
  const datePart = todayStr().replace(/-/g, "");
  const suffix = String(Math.floor(100 + Math.random() * 900));
  return `${prefix}-${datePart}-${suffix}`;
}

export default function VendorQuoteNew() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useUser();
  const profile = useMemo(() => (user ? readProfile(user) : EMPTY_PROFILE), [user]);
  const profileOk = isProfileComplete(profile);

  const projectsQ = useListProjects();
  const staffQ = useListStaff();
  const createMut = useCreateVendorQuote();

  const [projectId, setProjectId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [vendorName, setVendorName] = useState("");
  // 見積No 自動採番 (VQ-YYYYMMDD-XXX)。ユーザーが任意で上書き可。
  const [docNumber, setDocNumber] = useState(() => autoVendorDocNumber("VQ"));
  const [issueDate, setIssueDateRaw] = useState(todayStr());
  // 有効期限デフォルト = 見積日の3ヶ月後 (発行日変更で自動同期、ユーザー編集で停止)。
  const [validUntil, setValidUntilRaw] = useState(plus3MonthsISO(todayStr()));
  const [validUntilTouched, setValidUntilTouched] = useState(false);
  const setIssueDate = (v: string) => {
    setIssueDateRaw(v);
    if (!validUntilTouched && v) setValidUntilRaw(plus3MonthsISO(v));
  };
  const setValidUntil = (v: string) => {
    setValidUntilRaw(v);
    setValidUntilTouched(true);
  };
  const [recipientName, setRecipientName] = useState("株式会社AMY");
  const [recipientContactName, setRecipientContactName] = useState("");
  const [authorName, setAuthorName] = useState(user?.fullName ?? "");
  const [items, setItems] = useState<LineItemForm[]>([{ ...emptyLineItem }]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (staffId) {
      const s = (staffQ.data ?? []).find((x) => x.id === staffId);
      if (s && !vendorName) setVendorName(s.name);
    }
  }, [staffId, staffQ.data, vendorName]);

  const project = (projectsQ.data ?? []).find((p) => p.id === projectId);
  const projectOptions: SelectOption[] = (projectsQ.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.name}${p.unitNumber ? ` (${p.unitNumber})` : ""}`,
  }));
  const staffOptions: SelectOption[] = [
    { value: "", label: "未選択" },
    ...(staffQ.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const subject = project?.name ?? "";
  const apiItems = lineItemsToApi(items);
  const subtotal = apiItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const total = subtotal + Math.round(subtotal * 0.1);

  const submit = async () => {
    if (!profileOk) throw new Error("プロフィールが未完成です。");
    if (!project) throw new Error("案件を選択してください");
    if (!vendorName.trim()) throw new Error("発行者(職人/業者)を入力してください");
    if (!docNumber.trim()) throw new Error("見積No を入力してください");
    if (apiItems.length === 0) throw new Error("明細を1行以上入力してください");

    const docItems = apiItems.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }));

    const fileNameBase = `vendor-quote-${docNumber.replace(/[^A-Za-z0-9_-]/g, "_")}-${Date.now()}`;
    const stamped = `作成者: ${authorName} / ご担当: ${recipientContactName} / 宛名: ${recipientName}${
      notes ? `\n${notes}` : ""
    }`;

    const upload = await generateAndUploadVendorDoc(
      {
        kind: "quote",
        docNumber: docNumber.trim(),
        issueDate,
        validUntilOrDue: validUntil || null,
        recipientName,
        recipientContactName,
        authorName,
        subject,
        items: docItems,
        notes,
        profile,
      },
      fileNameBase,
    );

    await createMut.mutateAsync({
      data: {
        vendorName: vendorName.trim(),
        staffId: staffId || null,
        unitNumber: project.unitNumber || project.name,
        amount: total,
        quoteDate: issueDate,
        validUntil: validUntil || null,
        fileUrl: upload.fileUrl,
        fileName: upload.fileName,
        notes: stamped,
      },
    });

    await qc.invalidateQueries({ queryKey: getListVendorQuotesQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    if (project.id) {
      await qc.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
      await qc.invalidateQueries({ queryKey: getGetProjectLedgerQueryKey(project.id) });
    }
    router.back();
  };

  return (
    <FormScreen
      title="新規 職人見積書"
      onSave={submit}
      saving={createMut.isPending}
      validate={() => {
        const missing: Array<{ name?: string; label: string }> = [];
        if (!projectId) missing.push({ name: "projectId", label: "案件" });
        if (!vendorName.trim()) missing.push({ name: "vendorName", label: "発行者 (職人/業者)" });
        if (!docNumber.trim()) missing.push({ name: "docNumber", label: "見積No" });
        if (!issueDate) missing.push({ name: "issueDate", label: "見積日" });
        if (!recipientName.trim()) missing.push({ name: "recipientName", label: "宛先 (御中)" });
        if (!profileOk) missing.push({ label: "プロフィール (発行元情報)" });
        return missing;
      }}
    >
      {!profileOk ? (
        <FormSection>
          <Body style={{ color: "#b91c1c", fontWeight: "600" }}>
            ⚠ プロフィールが未完成です
          </Body>
          <Muted style={{ marginTop: 4 }}>
            「その他」 → 「プロフィール」から発行元情報を入力してください。
          </Muted>
        </FormSection>
      ) : null}

      <FormSection title="基本情報">
        <Field label="案件" name="projectId" required>
          <Select
            value={projectId}
            onValueChange={(v) => setProjectId(v)}
            options={projectOptions}
            placeholder="案件を選択"
          />
        </Field>
        <Field label="職人マスタ">
          <Select value={staffId} onValueChange={(v) => setStaffId(v)} options={staffOptions} />
        </Field>
        <Field label="発行者 (職人/業者)" name="vendorName" required>
          <Input value={vendorName} onChangeText={setVendorName} />
        </Field>
        <Field label="見積No" name="docNumber" required>
          <Input value={docNumber} onChangeText={setDocNumber} placeholder="VQ-2025-0001" />
        </Field>
        <Field label="見積日" name="issueDate" required>
          <DateInput value={issueDate} onChangeText={setIssueDate} />
        </Field>
        <Field label="有効期限">
          <DateInput value={validUntil} onChangeText={setValidUntil} />
        </Field>
      </FormSection>

      <FormSection title="宛先・担当">
        <Field label="宛先 (御中)" name="recipientName" required>
          <Input value={recipientName} onChangeText={setRecipientName} />
        </Field>
        <Field label="ご担当者">
          <Input value={recipientContactName} onChangeText={setRecipientContactName} />
        </Field>
        <Field label="作成者 (担当)">
          <Input value={authorName} onChangeText={setAuthorName} />
        </Field>
      </FormSection>

      <FormSection title="明細">
        <LineItemsEditor items={items} onChange={setItems} />
      </FormSection>

      <FormSection title="備考">
        <Textarea value={notes} onChangeText={setNotes} rows={3} />
      </FormSection>

      <FormSection>
        <Body style={{ fontSize: 11 }}>
          合計金額 (税込): <Body style={{ fontWeight: "700" }}>¥{total.toLocaleString()}</Body>
        </Body>
      </FormSection>
    </FormScreen>
  );
}
