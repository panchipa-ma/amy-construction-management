import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListVendorInvoicesQueryKey,
  getListVendorQuotesQueryKey,
  useConvertVendorQuoteToInvoice,
  useDeleteVendorQuote,
  useListVendorQuotes,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { DateInput, Field, FormSection } from "@/components/form";
import {
  Badge,
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
import { fmtDate, yen } from "@/lib/format";
import { openStorageFile } from "@/lib/open-file";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function VendorQuoteDetail() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useListVendorQuotes(undefined, {
    query: { enabled: true, queryKey: getListVendorQuotesQueryKey() },
  });

  const [convertOpen, setConvertOpen] = useState(false);
  const convertMut = useConvertVendorQuoteToInvoice();
  const deleteMut = useDeleteVendorQuote();

  if (q.isLoading) return <Loader />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const quote = (q.data ?? []).find((x) => x.id === id);
  if (!quote) {
    return (
      <ErrorState
        message="職人見積書が見つかりません"
        onRetry={() => q.refetch()}
      />
    );
  }

  const subtotal = Math.round(quote.amount / 1.1);
  const tax = quote.amount - subtotal;

  const handleConvert = async (invoiceDate: string) => {
    try {
      await convertMut.mutateAsync({
        id: quote.id,
        data: { invoiceDate, dueDate: null },
      });
      // 重複変換を防ぐため元の職人見積書を削除 (WEB と同じ挙動)。
      try {
        await deleteMut.mutateAsync({ id: quote.id });
      } catch {
        // 削除失敗は致命ではないので警告のみ
      }
      const invalidations = [
        qc.invalidateQueries({ queryKey: getListVendorInvoicesQueryKey() }),
        qc.invalidateQueries({ queryKey: getListVendorQuotesQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      ];
      if (quote.projectId) {
        invalidations.push(
          qc.invalidateQueries({ queryKey: getGetProjectQueryKey(quote.projectId) }),
          qc.invalidateQueries({
            queryKey: getGetProjectLedgerQueryKey(quote.projectId),
          }),
        );
      }
      await Promise.all(invalidations);
      setConvertOpen(false);
      router.replace("/vendor-invoices");
    } catch (e) {
      Alert.alert("変換失敗", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />
        }
      >
        <View>
          <H1>{quote.vendorName || "職人見積書"}</H1>
          {quote.projectName ? (
            <Muted style={{ marginTop: 4 }}>{quote.projectName}</Muted>
          ) : null}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Badge tone={quote.status === "matched" ? "success" : "warning"}>
              {quote.status === "matched" ? "案件紐付済" : "未紐付"}
            </Badge>
            {quote.costEntryId ? (
              <Badge tone="success">施工台帳 自動反映済</Badge>
            ) : quote.status === "matched" ? (
              <Badge tone="warning">原価未連携</Badge>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {quote.fileUrl ? (
            <ActionBtn
              icon="printer"
              label="PDFを開く"
              tone="primary"
              onPress={() => void openStorageFile(quote.fileUrl!)}
            />
          ) : null}
          <ActionBtn
            icon="file-text"
            label="請求書化"
            onPress={() => setConvertOpen(true)}
          />
        </View>

        <Card>
          <SectionTitle>基本情報</SectionTitle>
          <Row label="案件" value={quote.projectName ?? "—"} />
          <Row label="号室" value={quote.unitNumber || "—"} />
          <Row label="発行者" value={quote.vendorName || "—"} />
          <Row label="見積日" value={fmtDate(quote.quoteDate)} />
          <Row label="有効期限" value={fmtDate(quote.validUntil)} />
        </Card>

        <Card>
          <SectionTitle>金額</SectionTitle>
          <Row label="小計" value={yen(subtotal)} />
          <Row label="消費税 (10%)" value={yen(tax)} />
          <Row
            label="合計"
            value={
              <Body style={{ fontSize: 18, fontWeight: "700" }}>{yen(quote.amount)}</Body>
            }
          />
        </Card>

        <Card>
          <SectionTitle>施工台帳</SectionTitle>
          {quote.status === "matched" && quote.costEntryId ? (
            <Body style={{ fontSize: 13 }}>
              この職人見積書は <Body style={{ fontWeight: "600" }}>予算原価</Body> として
              施工台帳に自動反映されています。
            </Body>
          ) : (
            <Body style={{ fontSize: 13, color: c.mutedForeground }}>
              号室「{quote.unitNumber || "—"}」に該当する案件が見つからず、
              施工台帳への反映は保留中です。号室を一致させた案件を作成してください。
            </Body>
          )}
        </Card>

        {quote.notes ? (
          <Card>
            <SectionTitle>備考</SectionTitle>
            <Body>{quote.notes}</Body>
          </Card>
        ) : null}

        {quote.fileUrl ? (
          <Pressable
            onPress={() => void openStorageFile(quote.fileUrl!)}
            style={({ pressed }) => [
              {
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.muted,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Feather name="file-text" size={14} color={c.primary} />
            <Body style={{ flex: 1, fontSize: 12, color: c.primary }} numberOfLines={1}>
              {quote.fileName || "見積書PDF"}
            </Body>
            <Feather name="external-link" size={12} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </ScrollView>

      <ConvertModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        defaultIssueDate={todayStr()}
        loading={convertMut.isPending}
        onSubmit={handleConvert}
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
          minWidth: 130,
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
  loading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultIssueDate: string;
  loading: boolean;
  onSubmit: (invoiceDate: string) => void;
}) {
  const c = useColors();
  const [issue, setIssue] = useState(defaultIssueDate);
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
            <Body style={{ fontWeight: "600", fontSize: 16 }}>職人請求書に変換</Body>
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
          <FormSection>
            <Field label="請求日" required>
              <DateInput value={issue} onChangeText={setIssue} />
            </Field>
          </FormSection>
          <Muted style={{ fontSize: 12, marginTop: 4 }}>
            施工台帳の実績原価としても自動反映され、元の職人見積書は削除されます。
          </Muted>
          <Pressable
            disabled={loading || !issue}
            onPress={() => onSubmit(issue)}
            style={({ pressed }) => [
              {
                marginTop: 10,
                paddingVertical: 14,
                borderRadius: 10,
                backgroundColor: !issue ? c.muted : c.primary,
                alignItems: "center",
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Body style={{ color: c.primaryForeground, fontWeight: "700" }}>
              {loading ? "変換中…" : "請求書に変換する"}
            </Body>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
