import { useUser } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  getListVendorInvoicesQueryKey,
  getListVendorQuotesQueryKey,
  useCreateVendorInvoice,
  useDeleteVendorQuote,
  useListProjects,
  useListStaff,
  useListVendorQuotes,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

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
import { endOfNextMonthISO, todayLocalISO } from "@/lib/format";
import { generateAndUploadVendorDoc } from "@/lib/pdf";
import { EMPTY_PROFILE, isProfileComplete, readProfile } from "@/lib/profile";

function todayStr() {
  return todayLocalISO();
}

function autoInvoiceDocNumber(): string {
  const datePart = todayStr().replace(/-/g, "");
  const suffix = String(Math.floor(100 + Math.random() * 900));
  return `INV-${datePart}-${suffix}`;
}

// Parse the " / " stamped notes block produced by vendor-quotes / vendor-invoices forms.
// Mirrors WEB's parseAuthorRecipient so 見積→請求 変換時 に作成者/宛先/ご担当 が復元される。
function parseAuthorRecipient(notes: string | null | undefined): {
  authorName?: string;
  recipientName?: string;
  recipientContactName?: string;
  rest?: string;
} {
  if (!notes) return {};
  // 見積側は `... / 宛名: Z\nfreeform` の形で stamp する。最初の改行までを meta、それ以降を rest 扱い。
  const newlineIdx = notes.indexOf("\n");
  const head = newlineIdx >= 0 ? notes.slice(0, newlineIdx) : notes;
  const tailFromNewline = newlineIdx >= 0 ? notes.slice(newlineIdx + 1) : "";
  const parts = head.split(" / ").map((s) => s.trim());
  const out: {
    authorName?: string;
    recipientName?: string;
    recipientContactName?: string;
    rest?: string;
  } = {};
  const remaining: string[] = [];
  for (const p of parts) {
    const a = p.match(/^作成者:\s*(.+)$/);
    const r = p.match(/^宛名:\s*(.+)$/);
    const c = p.match(/^ご担当:\s*(.+)$/);
    if (a) out.authorName = a[1];
    else if (r) out.recipientName = r[1];
    else if (c) out.recipientContactName = c[1];
    else remaining.push(p);
  }
  const tailParts = [remaining.join(" / "), tailFromNewline].filter((s) => s.trim());
  if (tailParts.length > 0) out.rest = tailParts.join("\n");
  return out;
}

export default function VendorInvoiceNew() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useUser();
  const profile = useMemo(() => (user ? readProfile(user) : EMPTY_PROFILE), [user]);
  const profileOk = isProfileComplete(profile);

  // ?fromVendorQuoteId=<id> — WEB と同じ「職人見積書 → 職人請求書」引継ぎフロー。
  // - projectId / vendorName / 単一サマリ行 / 作成者・宛先 を一度だけ prefill
  // - 保存時 quoteFileUrl/quoteFileName で元見積書PDFを引き継ぎ、元の職人見積書を削除
  const params = useLocalSearchParams<{ fromVendorQuoteId?: string }>();
  const fromVendorQuoteId = params.fromVendorQuoteId ?? "";
  const vendorQuotesQ = useListVendorQuotes(undefined, {
    query: {
      enabled: !!fromVendorQuoteId,
      queryKey: getListVendorQuotesQueryKey(),
    },
  });
  const sourceQuote = useMemo(
    () =>
      fromVendorQuoteId
        ? (vendorQuotesQ.data ?? []).find((q) => q.id === fromVendorQuoteId)
        : undefined,
    [fromVendorQuoteId, vendorQuotesQ.data],
  );
  const prefilledFromQuoteRef = useRef(false);
  const missingQuoteAlertedRef = useRef(false);

  const projectsQ = useListProjects();
  const staffQ = useListStaff();
  const createMut = useCreateVendorInvoice();
  const deleteVendorQuoteMut = useDeleteVendorQuote();

  const [projectId, setProjectId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [vendorName, setVendorName] = useState("");
  // 請求書No 自動採番 (INV-YYYYMMDD-XXX)。ユーザーが任意で上書き可。
  const [docNumber, setDocNumber] = useState(() => autoInvoiceDocNumber());
  const [issueDate, setIssueDateRaw] = useState(todayStr());
  // お支払期限デフォルト = 発行日の翌月末 (発行日変更で自動同期、ユーザー編集で停止)。
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
  const [recipientName, setRecipientName] = useState("株式会社AMY");
  const [recipientContactName, setRecipientContactName] = useState("");
  const [authorName, setAuthorName] = useState(user?.fullName ?? "");
  const [items, setItems] = useState<LineItemForm[]>([{ ...emptyLineItem }]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!authorName && user?.fullName) setAuthorName(user.fullName);
  }, [user, authorName]);

  useEffect(() => {
    if (staffId) {
      const s = (staffQ.data ?? []).find((x) => x.id === staffId);
      if (s && !vendorName) setVendorName(s.name);
    }
  }, [staffId, staffQ.data, vendorName]);

  // One-shot prefill from source vendor quote.
  useEffect(() => {
    if (prefilledFromQuoteRef.current) return;
    if (!fromVendorQuoteId) return;
    if (!sourceQuote) {
      if (
        !vendorQuotesQ.isLoading &&
        vendorQuotesQ.isFetched &&
        !missingQuoteAlertedRef.current
      ) {
        missingQuoteAlertedRef.current = true;
        Alert.alert(
          "見積書が見つかりませんでした",
          "削除された、もしくはアクセス権がない可能性があります。フォームは空のまま開いています。",
        );
      }
      return;
    }
    prefilledFromQuoteRef.current = true;

    if (sourceQuote.projectId) setProjectId(sourceQuote.projectId);
    if (sourceQuote.vendorName) setVendorName(sourceQuote.vendorName);

    const parsed = parseAuthorRecipient(sourceQuote.notes);
    if (parsed.recipientName) setRecipientName(parsed.recipientName);
    if (parsed.recipientContactName)
      setRecipientContactName(parsed.recipientContactName);
    if (parsed.authorName) setAuthorName(parsed.authorName);
    if (parsed.rest) setNotes(parsed.rest);

    // Vendor quote stores tax-included `amount`. Convert back to tax-excluded
    // subtotal for a single summary line so total ≈ original amount.
    const subtotalGuess = Math.round(sourceQuote.amount / 1.1);
    const projName =
      sourceQuote.projectName || sourceQuote.vendorName || "工事一式";
    setItems([
      {
        ...emptyLineItem,
        description: `${projName} 工事一式`,
        quantity: "1",
        unitPrice: String(subtotalGuess),
      },
    ]);

    // 請求書No は初期値として既に自動採番済 (autoInvoiceDocNumber)。
    // 見積→請求 変換でも改めて再生成はせず、初期値をそのまま使う。
  }, [
    fromVendorQuoteId,
    sourceQuote,
    vendorQuotesQ.isLoading,
    vendorQuotesQ.isFetched,
  ]);

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
    if (!profileOk) throw new Error("プロフィールが未完成です。先にプロフィールを編集してください。");
    if (!project) throw new Error("案件を選択してください");
    if (!vendorName.trim()) throw new Error("発行者(職人/業者)を入力してください");
    if (!docNumber.trim()) throw new Error("請求書No を入力してください");
    if (apiItems.length === 0) throw new Error("明細を1行以上入力してください");

    const docItems = apiItems.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }));

    const fileNameBase = `vendor-invoice-${docNumber.replace(/[^A-Za-z0-9_-]/g, "_")}-${Date.now()}`;
    const stamped = `作成者: ${authorName} / ご担当: ${recipientContactName} / 宛名: ${recipientName}${
      notes ? `\n${notes}` : ""
    }`;

    const upload = await generateAndUploadVendorDoc(
      {
        kind: "invoice",
        docNumber: docNumber.trim(),
        issueDate,
        validUntilOrDue: dueDate || null,
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
        invoiceDate: issueDate,
        fileUrl: upload.fileUrl,
        fileName: upload.fileName,
        // 見積→請求 変換時のみ、元の見積書PDFを「引継ぎPDF」として添付。
        quoteFileUrl: sourceQuote?.fileUrl ?? null,
        quoteFileName: sourceQuote?.fileName ?? null,
        notes: stamped,
      },
    });

    // 変換元の職人見積書を削除 (請求書化済みなので一覧から消す)。
    // 削除に失敗しても請求書作成は成功済なので警告のみで処理続行。
    if (sourceQuote) {
      try {
        await deleteVendorQuoteMut.mutateAsync({ id: sourceQuote.id });
      } catch (e) {
        Alert.alert(
          "元の職人見積書の削除に失敗しました",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    await qc.invalidateQueries({ queryKey: getListVendorInvoicesQueryKey() });
    await qc.invalidateQueries({ queryKey: getListVendorQuotesQueryKey() });
    await qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    if (project.id) {
      await qc.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
      await qc.invalidateQueries({ queryKey: getGetProjectLedgerQueryKey(project.id) });
    }
    router.back();
  };

  return (
    <FormScreen
      title="新規 職人請求書"
      onSave={submit}
      saving={createMut.isPending}
      validate={() => {
        const missing: Array<{ name?: string; label: string }> = [];
        if (!projectId) missing.push({ name: "projectId", label: "案件" });
        if (!vendorName.trim()) missing.push({ name: "vendorName", label: "発行者 (職人/業者)" });
        if (!docNumber.trim()) missing.push({ name: "docNumber", label: "請求書No" });
        if (!issueDate) missing.push({ name: "issueDate", label: "請求日" });
        if (!recipientName.trim()) missing.push({ name: "recipientName", label: "宛先 (御中)" });
        if (!profileOk) missing.push({ label: "プロフィール (発行元・振込先)" });
        return missing;
      }}
    >
      {!profileOk ? (
        <FormSection>
          <Body style={{ color: "#b91c1c", fontWeight: "600" }}>
            ⚠ プロフィールが未完成です
          </Body>
          <Muted style={{ marginTop: 4 }}>
            「その他」 → 「プロフィール」から発行元情報・振込先を入力してください。
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
        <Field label="職人マスタ" hint="マスタから選択 (任意)">
          <Select
            value={staffId}
            onValueChange={(v) => setStaffId(v)}
            options={staffOptions}
          />
        </Field>
        <Field label="発行者 (職人/業者)" name="vendorName" required>
          <Input value={vendorName} onChangeText={setVendorName} />
        </Field>
        <Field label="請求書No" name="docNumber" required>
          <Input value={docNumber} onChangeText={setDocNumber} placeholder="V-2025-0001" />
        </Field>
        <Field label="請求日" name="issueDate" required>
          <DateInput value={issueDate} onChangeText={setIssueDate} />
        </Field>
        <Field label="お支払期限">
          <DateInput value={dueDate} onChangeText={setDueDate} />
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
        <Muted style={{ fontSize: 11, marginTop: 4 }}>
          単価は税抜き入力。保存時にPDFを生成しアップロードします。
        </Muted>
      </FormSection>

    </FormScreen>
  );
}
