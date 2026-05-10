import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  type CostCategory,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListInvoicesQueryKey,
  getListQuotesQueryKey,
  useConvertQuoteToInvoice,
  useGetQuote,
  useImportQuoteToLedger,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { InternalOnly } from "@/components/InternalOnly";
import {
  DateInput,
  Field,
  FormSection,
  Input,
  Select,
  type SelectOption,
} from "@/components/form";
import {
  Body,
  Card,
  ErrorState,
  H1,
  Loader,
  Muted,
  Row,
  SectionTitle,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { COST_CATEGORY_LABEL, fmtDate, yen } from "@/lib/format";
import { printApiDoc } from "@/lib/print-doc";

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

export default function QuoteDetailGuarded() {
  return (
    <InternalOnly>
      <QuoteDetail />
    </InternalOnly>
  );
}

function QuoteDetail() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useGetQuote(id);

  const [convertOpen, setConvertOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  const convertMut = useConvertQuoteToInvoice();
  const importMut = useImportQuoteToLedger();

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const quote = q.data;
  if (!quote) return null;

  const handleConvert = async (invoiceNumber: string, issueDate: string, dueDate: string) => {
    try {
      const inv = await convertMut.mutateAsync({
        id: quote.id,
        data: { invoiceNumber, issueDate, dueDate: dueDate || null },
      });
      await qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      setConvertOpen(false);
      router.push(`/invoices/${inv.id}`);
    } catch (e) {
      Alert.alert("変換失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleImport = async (
    category: CostCategory,
    entryDate: string,
    replaceExisting: boolean,
  ) => {
    try {
      await importMut.mutateAsync({
        id: quote.id,
        data: { category, entryDate, replaceExisting },
      });
      await qc.invalidateQueries({ queryKey: getGetProjectLedgerQueryKey(quote.projectId) });
      await qc.invalidateQueries({ queryKey: getGetProjectQueryKey(quote.projectId) });
      await qc.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      setImportOpen(false);
      Alert.alert("取込完了", "施工台帳に予算原価として取り込みました");
    } catch (e) {
      Alert.alert("取込失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
      >
        <View>
          <H1>{quote.subject || quote.projectName || "見積書"}</H1>
          <Muted style={{ marginTop: 4 }}>{quote.quoteNumber}</Muted>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <ActionBtn
            icon="edit-2"
            label="編集"
            onPress={() => router.push(`/quotes/edit?id=${quote.id}`)}
          />
          <ActionBtn
            icon="printer"
            label={printing ? "作成中" : "PDF"}
            tone="primary"
            onPress={async () => {
              try {
                setPrinting(true);
                await printApiDoc({
                  path: `/api/print/quote/${quote.id}`,
                  fileName: `見積書-${quote.quoteNumber}.pdf`,
                  getToken: () => getToken(),
                });
              } catch (e) {
                Alert.alert("PDFを作成できませんでした", String((e as Error).message ?? e));
              } finally {
                setPrinting(false);
              }
            }}
          />
          <ActionBtn
            icon="file-text"
            label="請求書化"
            onPress={() => setConvertOpen(true)}
          />
          <ActionBtn
            icon="download"
            label="台帳取込"
            onPress={() => setImportOpen(true)}
          />
        </View>

        <Card>
          <SectionTitle>基本情報</SectionTitle>
          <Row label="案件" value={quote.projectName ?? "—"} />
          {quote.customerName ? <Row label="顧客" value={quote.customerName} /> : null}
          {quote.contactName ? <Row label="ご担当" value={quote.contactName} /> : null}
          <Row label="見積日" value={fmtDate(quote.issueDate)} />
          <Row label="有効期限" value={fmtDate(quote.validUntil)} />
        </Card>

        <Card>
          <SectionTitle>明細</SectionTitle>
          {quote.items.map((it, i) => (
            <View
              key={i}
              style={{ paddingVertical: 8, borderBottomColor: c.border, borderBottomWidth: 1 }}
            >
              <Body style={{ fontWeight: "500" }}>{it.description}</Body>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Muted>
                  {it.quantity} {it.unit ?? ""} × {yen(it.unitPrice)}
                </Muted>
                <Body style={{ fontWeight: "600" }}>{yen(it.quantity * it.unitPrice)}</Body>
              </View>
              {it.notes ? <Muted style={{ fontSize: 11 }}>{it.notes}</Muted> : null}
            </View>
          ))}
        </Card>

        <Card>
          <Row label="小計" value={yen(quote.subtotal)} />
          <Row label="消費税 (10%)" value={yen(quote.tax)} />
          <Row
            label="合計"
            value={
              <Body style={{ fontSize: 18, fontWeight: "700" }}>{yen(quote.total)}</Body>
            }
          />
        </Card>

        {quote.notes ? (
          <Card>
            <SectionTitle>備考</SectionTitle>
            <Body>{quote.notes}</Body>
          </Card>
        ) : null}
      </ScrollView>

      <ConvertModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        defaultIssueDate={todayStr()}
        defaultNumber={`INV-${quote.quoteNumber.replace(/^Q-?/i, "")}`}
        loading={convertMut.isPending}
        onSubmit={handleConvert}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        loading={importMut.isPending}
        onSubmit={handleImport}
      />
    </>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  tone = "default",
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  tone?: "default" | "primary";
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          backgroundColor: tone === "primary" ? c.primary : c.card,
          borderWidth: 1,
          borderColor: tone === "primary" ? c.primary : c.border,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather
        name={icon}
        size={14}
        color={tone === "primary" ? c.primaryForeground : c.foreground}
      />
      <Body
        style={{
          color: tone === "primary" ? c.primaryForeground : c.foreground,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Body>
    </Pressable>
  );
}

function ConvertModal({
  open,
  onClose,
  defaultIssueDate,
  defaultNumber,
  loading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultIssueDate: string;
  defaultNumber: string;
  loading: boolean;
  onSubmit: (n: string, d: string, due: string) => void;
}) {
  const c = useColors();
  const [num, setNum] = useState(defaultNumber);
  const [issue, setIssue] = useState(defaultIssueDate);
  const [due, setDue] = useState("");
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
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              paddingBottom: 10,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: c.border,
            }}
          >
            <Body style={{ fontWeight: "600", fontSize: 16 }}>請求書に変換</Body>
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
          <FormSection>
            <Field label="請求書No" required>
              <Input value={num} onChangeText={setNum} />
            </Field>
            <Field label="発行日" required>
              <DateInput value={issue} onChangeText={setIssue} />
            </Field>
            <Field label="お支払期限">
              <DateInput value={due} onChangeText={setDue} />
            </Field>
          </FormSection>
          <Pressable
            disabled={loading || !num.trim() || !issue}
            onPress={() => onSubmit(num.trim(), issue, due)}
            style={({ pressed }) => [
              {
                marginTop: 10,
                paddingVertical: 14,
                borderRadius: 10,
                backgroundColor: !num.trim() || !issue ? c.muted : c.primary,
                alignItems: "center",
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Body style={{ color: c.primaryForeground, fontWeight: "700" }}>
              {loading ? "変換中…" : "変換する"}
            </Body>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ImportModal({
  open,
  onClose,
  loading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  onSubmit: (category: CostCategory, date: string, replace: boolean) => void;
}) {
  const c = useColors();
  const [category, setCategory] = useState<CostCategory>("subcontract");
  const [date, setDate] = useState(todayStr());
  const [replace, setReplace] = useState(false);
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
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              paddingBottom: 10,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: c.border,
            }}
          >
            <Body style={{ fontWeight: "600", fontSize: 16 }}>施工台帳へ取込</Body>
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
          <FormSection>
            <Field label="カテゴリ" required>
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v as CostCategory)}
                options={CATEGORY_OPTIONS}
              />
            </Field>
            <Field label="登録日" required>
              <DateInput value={date} onChangeText={setDate} />
            </Field>
            <Pressable
              onPress={() => setReplace(!replace)}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: replace ? c.primary : c.border,
                  backgroundColor: replace ? c.primary : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {replace ? <Feather name="check" size={14} color={c.primaryForeground} /> : null}
              </View>
              <Body>既存の予算原価を全削除してから取込</Body>
            </Pressable>
          </FormSection>
          <Pressable
            disabled={loading}
            onPress={() => onSubmit(category, date, replace)}
            style={({ pressed }) => [
              {
                marginTop: 10,
                paddingVertical: 14,
                borderRadius: 10,
                backgroundColor: c.primary,
                alignItems: "center",
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Body style={{ color: c.primaryForeground, fontWeight: "700" }}>
              {loading ? "取込中…" : "取り込む"}
            </Body>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
