import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListVendorInvoicesQueryKey,
  useCreateVendorInvoice,
  useListProjects,
  useListStaff,
} from "@workspace/api-client-react";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";

import {
  DateInput,
  Field,
  FormScreen,
  FormSection,
  Input,
  NumberInput,
  Select,
  Textarea,
  type SelectOption,
} from "@/components/form";
import { Body, Muted } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { pickImage, pickUploadAndOcr, uploadAsset } from "@/lib/upload";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function VendorInvoiceUpload() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const projectsQ = useListProjects();
  const staffQ = useListStaff();
  const createMut = useCreateVendorInvoice();

  const [vendorName, setVendorName] = useState("");
  const [staffId, setStaffId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayStr());
  const [notes, setNotes] = useState("");

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<"idle" | "uploading">("idle");

  const projectOptions: SelectOption[] = [
    { value: "", label: "未紐付 (号室で自動紐付)" },
    ...(projectsQ.data ?? []).map((p) => ({
      value: p.id,
      label: `${p.name}${p.unitNumber ? ` (${p.unitNumber})` : ""}`,
    })),
  ];
  const staffOptions: SelectOption[] = [
    { value: "", label: "未選択" },
    ...(staffQ.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const handlePickUpload = async () => {
    try {
      setBusy("uploading");
      const r = await pickUploadAndOcr("vendor_invoice");
      if (!r) {
        setBusy("idle");
        return;
      }
      const { upload, ocr } = r;
      setPreviewUri(upload.fileUrl);
      setFileUrl(upload.fileUrl);
      setFileName(upload.fileName);
      if (ocr) {
        if (ocr.vendor && !vendorName) setVendorName(ocr.vendor);
        if (ocr.amount && !amount) setAmount(String(Math.round(ocr.amount)));
        if (ocr.date && /^\d{4}-\d{2}-\d{2}$/.test(ocr.date)) setInvoiceDate(ocr.date);
        if (ocr.unitNumber && !unitNumber) setUnitNumber(ocr.unitNumber);
        if (ocr.notes && !notes) setNotes(ocr.notes);
        Alert.alert(
          "読み取り完了",
          `信頼度: ${ocr.confidence === "high" ? "高" : ocr.confidence === "medium" ? "中" : "低"}\n内容を確認・修正して保存してください。`,
        );
      } else {
        Alert.alert("アップロード完了", "OCR読み取りはスキップされました。手動で入力してください。");
      }
    } catch (err) {
      Alert.alert("エラー", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("idle");
    }
  };

  const handleReplace = async () => {
    try {
      const asset = await pickImage();
      if (!asset) return;
      setBusy("uploading");
      const upload = await uploadAsset(asset);
      setPreviewUri(upload.fileUrl);
      setFileUrl(upload.fileUrl);
      setFileName(upload.fileName);
    } catch (err) {
      Alert.alert("エラー", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("idle");
    }
  };

  const submit = async () => {
    const project = (projectsQ.data ?? []).find((p) => p.id === projectId);
    const finalUnit =
      unitNumber.trim() || project?.unitNumber || project?.name || "未設定";
    await createMut.mutateAsync({
      data: {
        vendorName: vendorName.trim(),
        staffId: staffId || null,
        unitNumber: finalUnit,
        amount: Number(amount),
        invoiceDate,
        fileUrl,
        fileName,
        notes: notes.trim() || null,
      },
    });
    await qc.invalidateQueries({ queryKey: getListVendorInvoicesQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    if (project?.id) {
      await qc.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
      await qc.invalidateQueries({ queryKey: getGetProjectLedgerQueryKey(project.id) });
    }
    router.back();
  };

  return (
    <FormScreen
      title="請求書をアップロード"
      onSave={submit}
      saving={createMut.isPending}
      validate={() => {
        const missing: string[] = [];
        if (!fileUrl) missing.push("画像 / PDF (アップロード)");
        if (!vendorName.trim()) missing.push("発行者 (職人/業者)");
        if (!amount || Number.isNaN(Number(amount))) missing.push("金額");
        if (!invoiceDate) missing.push("請求日");
        return missing;
      }}
    >
      <FormSection title="画像 (写真をアップロードすると自動で読み取ります)">
        {previewUri ? (
          <View style={{ gap: 8 }}>
            <Image
              source={{ uri: previewUri }}
              style={{
                width: "100%",
                height: 240,
                borderRadius: 8,
                backgroundColor: c.muted,
              }}
              contentFit="contain"
            />
            <Muted style={{ fontSize: 11 }}>{fileName}</Muted>
            <Pressable
              onPress={handleReplace}
              disabled={busy !== "idle"}
              style={({ pressed }) => [
                {
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  opacity: busy !== "idle" ? 0.6 : 1,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              {busy === "uploading" ? <ActivityIndicator size="small" /> : null}
              <Body>差し替え</Body>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={handlePickUpload}
            disabled={busy !== "idle"}
            style={({ pressed }) => [
              {
                paddingVertical: 24,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: c.primary,
                borderStyle: "dashed",
                alignItems: "center",
                gap: 8,
                opacity: busy !== "idle" ? 0.6 : 1,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            {busy !== "idle" ? (
              <>
                <ActivityIndicator color={c.primary} />
                <Body style={{ color: c.primary, fontWeight: "600" }}>
                  アップロード中…
                </Body>
              </>
            ) : (
              <>
                <Feather name="camera" size={28} color={c.primary} />
                <Body style={{ color: c.primary, fontWeight: "700" }}>
                  請求書を撮影 / 選択
                </Body>
                <Muted style={{ fontSize: 12 }}>
                  自動で 業者名・金額・日付・号室 を読み取ります
                </Muted>
              </>
            )}
          </Pressable>
        )}
      </FormSection>

      <FormSection title="基本情報">
        <Field label="発行者 (職人/業者)" required>
          <Input value={vendorName} onChangeText={setVendorName} />
        </Field>
        <Field label="職人マスタ" hint="マスタから選択 (任意)">
          <Select
            value={staffId}
            onValueChange={(v) => {
              setStaffId(v);
              const s = (staffQ.data ?? []).find((x) => x.id === v);
              if (s && !vendorName) setVendorName(s.name);
            }}
            options={staffOptions}
          />
        </Field>
        <Field label="金額 (税込)" required>
          <NumberInput value={amount} onChangeText={setAmount} placeholder="0" />
        </Field>
        <Field label="請求日" required>
          <DateInput value={invoiceDate} onChangeText={setInvoiceDate} />
        </Field>
      </FormSection>

      <FormSection title="案件への紐付">
        <Field label="案件" hint="未選択の場合は号室で自動紐付されます">
          <Select
            value={projectId}
            onValueChange={(v) => {
              setProjectId(v);
              const p = (projectsQ.data ?? []).find((x) => x.id === v);
              if (p?.unitNumber && !unitNumber) setUnitNumber(p.unitNumber);
            }}
            options={projectOptions}
          />
        </Field>
        <Field label="号室" hint="自動振り分けキー (マンション号室)">
          <Input value={unitNumber} onChangeText={setUnitNumber} placeholder="例: 305" />
        </Field>
      </FormSection>

      <FormSection title="備考">
        <Textarea value={notes} onChangeText={setNotes} rows={3} />
      </FormSection>
    </FormScreen>
  );
}
