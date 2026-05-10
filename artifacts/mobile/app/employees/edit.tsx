import { useQueryClient } from "@tanstack/react-query";
import {
  getListEmployeesQueryKey,
  useCreateEmployee,
  useDeleteEmployee,
  useListEmployees,
  useUpdateEmployee,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";

import { InternalOnly } from "@/components/InternalOnly";
import { Field, FormScreen, FormSection, Input, Textarea } from "@/components/form";
import { Loader } from "@/components/ui";

const empty = { name: "", role: "営業", phone: "", email: "", notes: "" };

export default function EmployeeEditGuarded() {
  return (
    <InternalOnly>
      <EmployeeEdit />
    </InternalOnly>
  );
}

function EmployeeEdit() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const listQ = useListEmployees();
  const createMut = useCreateEmployee();
  const updateMut = useUpdateEmployee();
  const deleteMut = useDeleteEmployee();

  const [form, setForm] = useState(empty);
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && listQ.data && !loaded) {
      const e = listQ.data.find((x) => x.id === id);
      if (!e) return;
      setForm({
        name: e.name,
        role: e.role,
        phone: e.phone ?? "",
        email: e.email ?? "",
        notes: e.notes ?? "",
      });
      setLoaded(true);
    }
  }, [isEdit, listQ.data, loaded, id]);

  if (isEdit && !loaded) return <Loader />;
  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) throw new Error("名前は必須です");
    if (!form.role.trim()) throw new Error("役職は必須です");
    const data = {
      name: form.name.trim(),
      role: form.role.trim(),
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
    };
    if (isEdit && id) await updateMut.mutateAsync({ id, data });
    else await createMut.mutateAsync({ data });
    await qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
    router.back();
  };

  const onDelete = isEdit
    ? async () => {
        await deleteMut.mutateAsync({ id: id! });
        await qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        router.back();
      }
    : undefined;

  return (
    <FormScreen
      title={isEdit ? "社員を編集" : "新規社員"}
      onSave={submit}
      saving={createMut.isPending || updateMut.isPending}
      saveDisabled={!form.name.trim() || !form.role.trim()}
      onDelete={onDelete}
      deleting={deleteMut.isPending}
    >
      <FormSection>
        <Field label="名前" required>
          <Input value={form.name} onChangeText={(v) => set("name", v)} />
        </Field>
        <Field label="役職" required hint="例: 営業 / 現場監督 / 事務（自由入力）">
          <Input value={form.role} onChangeText={(v) => set("role", v)} />
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
        <Field label="備考">
          <Textarea value={form.notes} onChangeText={(v) => set("notes", v)} />
        </Field>
      </FormSection>
    </FormScreen>
  );
}
