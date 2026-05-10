import { useQueryClient } from "@tanstack/react-query";
import {
  getListStaffQueryKey,
  useCreateStaff,
  useDeleteStaff,
  useListStaff,
  useUpdateStaff,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";

import { InternalOnly } from "@/components/InternalOnly";
import { Field, FormScreen, FormSection, Input, NumberInput } from "@/components/form";
import { Loader } from "@/components/ui";

const empty = {
  name: "",
  role: "",
  phone: "",
  dailyRate: "",
  company: "",
};

export default function StaffEditGuarded() {
  return (
    <InternalOnly>
      <StaffEdit />
    </InternalOnly>
  );
}

function StaffEdit() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const listQ = useListStaff();
  const createMut = useCreateStaff();
  const updateMut = useUpdateStaff();
  const deleteMut = useDeleteStaff();

  const [form, setForm] = useState(empty);
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (isEdit && listQ.data && !loaded) {
      const s = listQ.data.find((x) => x.id === id);
      if (!s) return;
      setForm({
        name: s.name,
        role: s.role,
        phone: s.phone ?? "",
        dailyRate: s.dailyRate != null ? String(s.dailyRate) : "",
        company: s.company ?? "",
      });
      setLoaded(true);
    }
  }, [isEdit, listQ.data, loaded, id]);

  if (isEdit && !loaded) return <Loader />;
  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) throw new Error("名前は必須です");
    if (!form.role.trim()) throw new Error("職種は必須です");
    const data = {
      name: form.name.trim(),
      role: form.role.trim(),
      phone: form.phone || null,
      dailyRate: form.dailyRate === "" ? null : Number(form.dailyRate),
      company: form.company || null,
    };
    if (isEdit && id) await updateMut.mutateAsync({ id, data });
    else await createMut.mutateAsync({ data });
    await qc.invalidateQueries({ queryKey: getListStaffQueryKey() });
    router.back();
  };

  const onDelete = isEdit
    ? async () => {
        await deleteMut.mutateAsync({ id: id! });
        await qc.invalidateQueries({ queryKey: getListStaffQueryKey() });
        router.back();
      }
    : undefined;

  return (
    <FormScreen
      title={isEdit ? "職人を編集" : "新規職人"}
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
        <Field label="職種" required hint="例: 大工 / クロス / 電気 / 解体">
          <Input value={form.role} onChangeText={(v) => set("role", v)} />
        </Field>
        <Field label="所属会社">
          <Input value={form.company} onChangeText={(v) => set("company", v)} />
        </Field>
        <Field label="電話番号">
          <Input value={form.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" />
        </Field>
        <Field label="日当 (円)">
          <NumberInput value={form.dailyRate} onChangeText={(v) => set("dailyRate", v)} decimal={false} />
        </Field>
      </FormSection>
    </FormScreen>
  );
}
