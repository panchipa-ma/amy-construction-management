import { useQueryClient } from "@tanstack/react-query";
import {
  type ProjectStatus,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useCreateProject,
  useDeleteProject,
  useListCustomers,
  useListEmployees,
  useListProjects,
  useUpdateProject,
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
  NumberInput,
  Select,
  type SelectOption,
  Textarea,
} from "@/components/form";
import { Loader } from "@/components/ui";
import { invalidateDashboard } from "@/lib/invalidate";

const STATUS_OPTIONS: SelectOption<ProjectStatus>[] = [
  { value: "estimating", label: "見積中" },
  { value: "contracted", label: "受注" },
  { value: "in_progress", label: "施工中" },
  { value: "completed", label: "竣工" },
  { value: "archived", label: "完了" },
];

const empty = {
  name: "",
  code: "",
  status: "estimating" as ProjectStatus,
  customerId: "" as string,
  siteAddress: "",
  unitNumber: "",
  startDate: "",
  endDate: "",
  contractAmount: "0",
  salesCommissionRate: "5",
  standardProfitRate: "",
  supervisorCommissionRate: "30",
  otherSalesBonusRecipient: "",
  otherSalesBonusRate: "",
  salesRep: "",
  siteSupervisor: "",
  notes: "",
};

export default function ProjectEditGuarded() {
  return (
    <InternalOnly>
      <ProjectEdit />
    </InternalOnly>
  );
}

function ProjectEdit() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const customersQ = useListCustomers();
  const employeesQ = useListEmployees();
  const listQ = useListProjects();
  const createMut = useCreateProject();
  const updateMut = useUpdateProject();
  const deleteMut = useDeleteProject();

  const [form, setForm] = useState(empty);
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && listQ.data && !loaded) {
      const p = listQ.data.find((x) => x.id === id);
      if (!p) return;
      setForm({
        name: p.name,
        code: p.code ?? "",
        status: p.status,
        customerId: p.customerId,
        siteAddress: p.siteAddress ?? "",
        unitNumber: p.unitNumber ?? "",
        startDate: p.startDate ?? "",
        endDate: p.endDate ?? "",
        contractAmount: String(p.contractAmount ?? 0),
        salesCommissionRate: String(p.salesCommissionRate ?? 5),
        standardProfitRate: p.standardProfitRate != null ? String(p.standardProfitRate) : "",
        supervisorCommissionRate: String(p.supervisorCommissionRate ?? 30),
        otherSalesBonusRecipient: p.otherSalesBonusRecipient ?? "",
        otherSalesBonusRate: p.otherSalesBonusRate != null ? String(p.otherSalesBonusRate) : "",
        salesRep: p.salesRep ?? "",
        siteSupervisor: p.siteSupervisor ?? "",
        notes: p.notes ?? "",
      });
      setLoaded(true);
    }
  }, [isEdit, listQ.data, loaded, id]);

  if (isEdit && !loaded) return <Loader />;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  // 顧客選択時、その顧客の規定値で常に上書き（顧客に値がなければクリア）
  const onCustomerChange = (cid: string) => {
    const cust = customersQ.data?.find((c) => c.id === cid);
    setForm((s) => ({
      ...s,
      customerId: cid,
      standardProfitRate:
        cust?.defaultProfitRate != null ? String(cust.defaultProfitRate) : "",
      salesCommissionRate:
        cust?.defaultSalesCommissionRate != null
          ? String(cust.defaultSalesCommissionRate)
          : "",
      supervisorCommissionRate:
        cust?.defaultSupervisorCommissionRate != null
          ? String(cust.defaultSupervisorCommissionRate)
          : "",
      salesRep: cust?.defaultSalesRep ?? "",
      otherSalesBonusRecipient: cust?.defaultOtherSalesBonusRecipient ?? "",
      otherSalesBonusRate:
        cust?.defaultOtherSalesBonusRate != null
          ? String(cust.defaultOtherSalesBonusRate)
          : "",
    }));
  };

  const customerOptions: SelectOption[] = (customersQ.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const empOptions: SelectOption[] = (employeesQ.data ?? []).map((e) => ({
    value: e.name,
    label: `${e.name} (${e.role})`,
  }));
  const salesEmpOptions = empOptions.filter((o) =>
    (employeesQ.data ?? []).some((e) => e.name === o.value && /営業/.test(e.role)),
  );
  const supEmpOptions = empOptions.filter((o) =>
    (employeesQ.data ?? []).some((e) => e.name === o.value && /現場|監督/.test(e.role)),
  );

  const submit = async () => {
    const data = {
      name: form.name.trim(),
      code: form.code || null,
      status: form.status,
      customerId: form.customerId,
      siteAddress: form.siteAddress || null,
      unitNumber: form.unitNumber || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      contractAmount: Number(form.contractAmount) || 0,
      salesCommissionRate:
        form.salesCommissionRate === "" ? 0 : Number(form.salesCommissionRate),
      standardProfitRate:
        form.standardProfitRate === "" ? 0 : Number(form.standardProfitRate),
      supervisorCommissionRate:
        form.supervisorCommissionRate === "" ? 0 : Number(form.supervisorCommissionRate),
      otherSalesBonusRecipient: form.otherSalesBonusRecipient || null,
      otherSalesBonusRate:
        form.otherSalesBonusRate === "" ? null : Number(form.otherSalesBonusRate),
      salesRep: form.salesRep || null,
      siteSupervisor: form.siteSupervisor || null,
      notes: form.notes || null,
    };
    if (isEdit && id) await updateMut.mutateAsync({ id, data });
    else await createMut.mutateAsync({ data });
    await qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    if (isEdit && id) await qc.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
    await invalidateDashboard(qc);
    router.back();
  };

  const onDelete = isEdit
    ? async () => {
        await deleteMut.mutateAsync({ id: id! });
        await qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        await invalidateDashboard(qc);
        router.back();
      }
    : undefined;

  return (
    <FormScreen
      title={isEdit ? "案件を編集" : "新規案件"}
      onSave={submit}
      saving={createMut.isPending || updateMut.isPending}
      validate={() => {
        const missing: Array<{ name?: string; label: string }> = [];
        if (!form.name.trim()) missing.push({ name: "name", label: "案件名" });
        if (!form.status) missing.push({ name: "status", label: "ステータス" });
        if (!form.customerId) missing.push({ name: "customerId", label: "顧客" });
        return missing;
      }}
      onDelete={onDelete}
      deleting={deleteMut.isPending}
    >
      <FormSection title="基本情報">
        <Field label="案件名" name="name" required>
          <Input value={form.name} onChangeText={(v) => set("name", v)} />
        </Field>
        <Field label="案件番号">
          <Input value={form.code} onChangeText={(v) => set("code", v)} />
        </Field>
        <Field label="ステータス" name="status" required>
          <Select
            value={form.status}
            onValueChange={(v) => v && set("status", v as ProjectStatus)}
            options={STATUS_OPTIONS}
            placeholder="ステータスを選択"
          />
        </Field>
        <Field label="顧客" name="customerId" required>
          <Select
            value={form.customerId}
            onValueChange={(v) => v && onCustomerChange(v)}
            options={customerOptions}
            placeholder="顧客を選択"
          />
        </Field>
        <Field label="施工場所">
          <Input value={form.siteAddress} onChangeText={(v) => set("siteAddress", v)} />
        </Field>
        <Field label="号室" hint="マンション号室（職人請求書の自動振り分けキー）">
          <Input value={form.unitNumber} onChangeText={(v) => set("unitNumber", v)} />
        </Field>
        <Field label="開始日">
          <DateInput value={form.startDate} onChangeText={(v) => set("startDate", v)} />
        </Field>
        <Field label="終了日">
          <DateInput value={form.endDate} onChangeText={(v) => set("endDate", v)} />
        </Field>
        <Field label="契約金額 (税抜, 円)">
          <NumberInput
            value={form.contractAmount}
            onChangeText={(v) => set("contractAmount", v)}
            decimal={false}
          />
        </Field>
      </FormSection>

      <FormSection title="担当者">
        <Field label="担当営業">
          {salesEmpOptions.length > 0 ? (
            <Select
              value={form.salesRep}
              onValueChange={(v) => set("salesRep", v)}
              options={salesEmpOptions}
              placeholder="営業を選択"
              allowEmpty
            />
          ) : (
            <Input value={form.salesRep} onChangeText={(v) => set("salesRep", v)} />
          )}
        </Field>
        <Field label="担当現場監督">
          {supEmpOptions.length > 0 ? (
            <Select
              value={form.siteSupervisor}
              onValueChange={(v) => set("siteSupervisor", v)}
              options={supEmpOptions}
              placeholder="監督を選択"
              allowEmpty
            />
          ) : (
            <Input value={form.siteSupervisor} onChangeText={(v) => set("siteSupervisor", v)} />
          )}
        </Field>
      </FormSection>

      <FormSection title="歩合・利率">
        <Field label="営業歩合率 (%)">
          <NumberInput
            value={form.salesCommissionRate}
            onChangeText={(v) => set("salesCommissionRate", v)}
          />
        </Field>
        <Field label="規定利率 (%)" hint="施工台帳の規定粗利額算出に使用（顧客既定値で初期化）">
          <NumberInput
            value={form.standardProfitRate}
            onChangeText={(v) => set("standardProfitRate", v)}
          />
        </Field>
        <Field label="現場監督歩合率 (%)" hint="規定超過粗利に対する配分率">
          <NumberInput
            value={form.supervisorCommissionRate}
            onChangeText={(v) => set("supervisorCommissionRate", v)}
          />
        </Field>
      </FormSection>

      <FormSection title="マネジメント報酬">
        <Field label="受取人">
          {empOptions.length > 0 ? (
            <Select
              value={form.otherSalesBonusRecipient}
              onValueChange={(v) => set("otherSalesBonusRecipient", v)}
              options={empOptions}
              placeholder="社員を選択"
              allowEmpty
            />
          ) : (
            <Input
              value={form.otherSalesBonusRecipient}
              onChangeText={(v) => set("otherSalesBonusRecipient", v)}
            />
          )}
        </Field>
        <Field
          label="率 (%)"
          hint="営業歩合から差し引かれます（受取人指定時のみ有効）"
        >
          <NumberInput
            value={form.otherSalesBonusRate}
            onChangeText={(v) => set("otherSalesBonusRate", v)}
          />
        </Field>
      </FormSection>

      <FormSection title="備考">
        <Field label="メモ">
          <Textarea value={form.notes} onChangeText={(v) => set("notes", v)} rows={4} />
        </Field>
      </FormSection>
    </FormScreen>
  );
}
