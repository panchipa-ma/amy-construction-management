import { useQueryClient } from "@tanstack/react-query";
import {
  getListCustomersQueryKey,
  useCreateCustomer,
  useDeleteCustomer,
  useListCustomers,
  useUpdateCustomer,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";

import { InternalOnly } from "@/components/InternalOnly";
import {
  Field,
  FormScreen,
  FormSection,
  Input,
  NumberInput,
  Textarea,
} from "@/components/form";
import { Loader } from "@/components/ui";

const empty = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  defaultProfitRate: "20",
  defaultSalesCommissionRate: "5",
  defaultSupervisorCommissionRate: "30",
  defaultSalesRep: "",
  defaultOtherSalesBonusRecipient: "",
  defaultOtherSalesBonusRate: "",
};

export default function CustomerEditGuarded() {
  return (
    <InternalOnly>
      <CustomerEdit />
    </InternalOnly>
  );
}

function CustomerEdit() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const listQ = useListCustomers();
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const deleteMut = useDeleteCustomer();

  const [form, setForm] = useState(empty);
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && listQ.data && !loaded) {
      const c = listQ.data.find((x) => x.id === id);
      if (!c) return;
      setForm({
        name: c.name,
        contactName: c.contactName ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        address: c.address ?? "",
        notes: c.notes ?? "",
        defaultProfitRate: String(c.defaultProfitRate ?? 20),
        defaultSalesCommissionRate: String(c.defaultSalesCommissionRate ?? 5),
        defaultSupervisorCommissionRate: String(c.defaultSupervisorCommissionRate ?? 30),
        defaultSalesRep: c.defaultSalesRep ?? "",
        defaultOtherSalesBonusRecipient: c.defaultOtherSalesBonusRecipient ?? "",
        defaultOtherSalesBonusRate:
          c.defaultOtherSalesBonusRate != null ? String(c.defaultOtherSalesBonusRate) : "",
      });
      setLoaded(true);
    }
  }, [isEdit, listQ.data, loaded, id]);

  if (isEdit && !loaded) return <Loader />;

  const set = <K extends keyof typeof form>(key: K, v: string) =>
    setForm((s) => ({ ...s, [key]: v }));

  const submit = async () => {
    const data = {
      name: form.name.trim(),
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
      defaultProfitRate: Number(form.defaultProfitRate) || 20,
      defaultSalesCommissionRate: Number(form.defaultSalesCommissionRate) || 5,
      defaultSupervisorCommissionRate: Number(form.defaultSupervisorCommissionRate) || 30,
      defaultSalesRep: form.defaultSalesRep || null,
      defaultOtherSalesBonusRecipient: form.defaultOtherSalesBonusRecipient || null,
      defaultOtherSalesBonusRate:
        form.defaultOtherSalesBonusRate === "" ? null : Number(form.defaultOtherSalesBonusRate),
    };
    if (isEdit && id) {
      await updateMut.mutateAsync({ id, data });
    } else {
      await createMut.mutateAsync({ data });
    }
    await qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
    router.back();
  };

  const onDelete = isEdit
    ? async () => {
        await deleteMut.mutateAsync({ id: id! });
        await qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        router.back();
      }
    : undefined;

  return (
    <FormScreen
      title={isEdit ? "顧客を編集" : "新規顧客"}
      onSave={submit}
      saving={createMut.isPending || updateMut.isPending}
      validate={() => {
        const missing: Array<{ name?: string; label: string }> = [];
        if (!form.name.trim()) missing.push({ name: "customerName", label: "顧客名" });
        return missing;
      }}
      onDelete={onDelete}
      deleting={deleteMut.isPending}
    >
      <FormSection title="基本情報">
        <Field label="顧客名" name="customerName" required>
          <Input value={form.name} onChangeText={(v) => set("name", v)} placeholder="株式会社○○" />
        </Field>
        <Field label="ご担当者名">
          <Input value={form.contactName} onChangeText={(v) => set("contactName", v)} />
        </Field>
        <Field label="電話番号">
          <Input value={form.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" />
        </Field>
        <Field label="メール">
          <Input
            value={form.email}
            onChangeText={(v) => set("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>
        <Field label="住所">
          <Input value={form.address} onChangeText={(v) => set("address", v)} />
        </Field>
        <Field label="備考">
          <Textarea value={form.notes} onChangeText={(v) => set("notes", v)} rows={3} />
        </Field>
      </FormSection>

      <FormSection title="規定値（案件作成時にプリフィル）">
        <Field label="規定利率 (%)" hint="施工台帳の規定粗利額算出に使用">
          <NumberInput
            value={form.defaultProfitRate}
            onChangeText={(v) => set("defaultProfitRate", v)}
          />
        </Field>
        <Field label="営業歩合 (%)">
          <NumberInput
            value={form.defaultSalesCommissionRate}
            onChangeText={(v) => set("defaultSalesCommissionRate", v)}
          />
        </Field>
        <Field label="現場監督歩合 (%)">
          <NumberInput
            value={form.defaultSupervisorCommissionRate}
            onChangeText={(v) => set("defaultSupervisorCommissionRate", v)}
          />
        </Field>
        <Field label="担当営業（規定）">
          <Input value={form.defaultSalesRep} onChangeText={(v) => set("defaultSalesRep", v)} />
        </Field>
        <Field label="マネジメント報酬 受取人（規定）" hint="社員名（自由入力）">
          <Input
            value={form.defaultOtherSalesBonusRecipient}
            onChangeText={(v) => set("defaultOtherSalesBonusRecipient", v)}
          />
        </Field>
        <Field label="マネジメント報酬率 (%)" hint="受取人指定時のみ有効">
          <NumberInput
            value={form.defaultOtherSalesBonusRate}
            onChangeText={(v) => set("defaultOtherSalesBonusRate", v)}
          />
        </Field>
      </FormSection>
    </FormScreen>
  );
}
