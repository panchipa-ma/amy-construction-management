import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getListReceiptsQueryKey,
  useCreateReceipt,
  useListProjects,
  useMatchReceipt,
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
import { COST_CATEGORY_LABEL } from "@/lib/format";
import { pickFromFile, pickUploadAndOcr, uploadAsset } from "@/lib/upload";

type Category = "material" | "subcontract" | "labor" | "expense" | "other";

const CATEGORY_OPTIONS: SelectOption[] = (
  ["material", "subcontract", "labor", "expense", "other"] as Category[]
).map((v) => ({ value: v, label: COST_CATEGORY_LABEL[v] ?? v }));

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewReceipt() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const projectsQ = useListProjects();
  const createMut = useCreateReceipt();
  const matchMut = useMatchReceipt();

  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayStr());
  const [category, setCategory] = useState<Category>("material");
  const [unitNumber, setUnitNumber] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState<"idle" | "uploading" | "ocr">("idle");

  const projectOptions: SelectOption[] = [
    { value: "", label: "未紐付" },
    ...(projectsQ.data ?? []).map((p) => ({
      value: p.id,
      label: `${p.name}${p.unitNumber ? ` (${p.unitNumber})` : ""}`,
    })),
  ];

  const runPickAndUpload = async (source: "camera" | "file") => {
    try {
      setBusy("uploading");
      const result = await pickUploadAndOcr("receipt", source);
      if (!result) {
        setBusy("idle");
        return;
      }
      const { upload, ocr } = result;
      setPreviewUri(upload.fileUrl);
      setFileUrl(upload.fileUrl);
      setFileName(upload.fileName);
      if (ocr) {
        if (ocr.vendor && !vendor) setVendor(ocr.vendor);
        if (ocr.amount && !amount) setAmount(String(Math.round(ocr.amount)));
        if (ocr.date && /^\d{4}-\d{2}-\d{2}$/.test(ocr.date)) setReceiptDate(ocr.date);
        if (ocr.unitNumber && !unitNumber) setUnitNumber(ocr.unitNumber);
        if (ocr.notes && !notes) setNotes(ocr.notes);
        Alert.alert(
          "読み取り完了",
          `信頼度: ${ocr.confidence === "high" ? "高" : ocr.confidence === "medium" ? "中" : "低"}\n内容を確認・修正して保存してください。`,
        );
      } else {
        Alert.alert(
          "アップロード完了",
          "OCR読み取りはスキップされました。手動で項目を入力してください。",
        );
      }
    } catch (err) {
      Alert.alert("エラー", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("idle");
    }
  };

  const handleReplaceImage = async () => {
    try {
      const asset = await pickFromFile();
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
    const amt = Number(amount);
    const created = await createMut.mutateAsync({
      data: {
        vendor: vendor.trim(),
        amount: amt,
        receiptDate,
        category,
        fileUrl,
        fileName,
        unitNumber: unitNumber.trim() || null,
        notes: notes.trim() || null,
      },
    });
    if (projectId && created?.id) {
      try {
        await matchMut.mutateAsync({
          id: created.id,
          data: { projectId },
        });
      } catch (err) {
        Alert.alert(
          "案件への紐付に失敗しました",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    await qc.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    router.back();
  };

  return (
    <FormScreen
      title="領収書を追加"
      onSave={submit}
      saving={createMut.isPending}
      validate={() => {
        const missing: string[] = [];
        if (!fileUrl) missing.push("画像 (アップロード)");
        if (!vendor.trim()) missing.push("店舗・取引先");
        if (!amount || Number.isNaN(Number(amount))) missing.push("金額");
        if (!receiptDate) missing.push("領収日");
        return missing;
      }}
    >
      <FormSection title="領収書 (ファイルを選択すると自動で読み取ります)">
        {previewUri ? (
          <View style={{ gap: 8 }}>
            <Image
              source={{ uri: previewUri }}
              style={{
                width: "100%",
                height: 220,
                borderRadius: 8,
                backgroundColor: c.muted,
              }}
              contentFit="contain"
            />
            <Muted style={{ fontSize: 11 }}>{fileName}</Muted>
            <Pressable
              onPress={handleReplaceImage}
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
              <Body style={{ color: c.foreground }}>画像を差し替え</Body>
            </Pressable>
          </View>
        ) : busy !== "idle" ? (
          <View
            style={{
              paddingVertical: 24,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: c.primary,
              borderStyle: "dashed",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ActivityIndicator color={c.primary} />
            <Body style={{ color: c.primary, fontWeight: "600" }}>
              {busy === "uploading" ? "アップロード中…" : "読み取り中…"}
            </Body>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => runPickAndUpload("camera")}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 22,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: c.primary,
                    borderStyle: "dashed",
                    alignItems: "center",
                    gap: 6,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Feather name="camera" size={26} color={c.primary} />
                <Body style={{ color: c.primary, fontWeight: "700" }}>
                  カメラで撮影
                </Body>
              </Pressable>
              <Pressable
                onPress={() => runPickAndUpload("file")}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: 22,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: c.primary,
                    borderStyle: "dashed",
                    alignItems: "center",
                    gap: 6,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Feather name="folder" size={26} color={c.primary} />
                <Body style={{ color: c.primary, fontWeight: "700" }}>
                  ファイルを選択
                </Body>
              </Pressable>
            </View>
            <Muted style={{ fontSize: 11, textAlign: "center" }}>
              写真ライブラリ・ファイル・Dropbox・Google ドライブ等から選択できます
            </Muted>
            <Muted style={{ fontSize: 12, textAlign: "center" }}>
              自動で 店名・金額・日付 を読み取ります
            </Muted>
          </View>
        )}
      </FormSection>

      <FormSection title="基本情報">
        <Field label="店舗・取引先" required>
          <Input value={vendor} onChangeText={setVendor} placeholder="例: コーナン" />
        </Field>
        <Field label="金額 (税込)" required>
          <NumberInput value={amount} onChangeText={setAmount} placeholder="0" />
        </Field>
        <Field label="領収日" required>
          <DateInput value={receiptDate} onChangeText={setReceiptDate} />
        </Field>
        <Field label="カテゴリ" required>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as Category)}
            options={CATEGORY_OPTIONS}
          />
        </Field>
      </FormSection>

      <FormSection title="案件への紐付 (任意)">
        <Field label="案件" hint="未選択でも保存できます">
          <Select
            value={projectId}
            onValueChange={(v) => setProjectId(v)}
            options={projectOptions}
          />
        </Field>
        <Field label="号室" hint="マンションなど物件単位で紐付けたい時">
          <Input value={unitNumber} onChangeText={setUnitNumber} placeholder="例: 305" />
        </Field>
      </FormSection>

      <FormSection title="備考">
        <Textarea value={notes} onChangeText={setNotes} rows={3} />
      </FormSection>
    </FormScreen>
  );
}
