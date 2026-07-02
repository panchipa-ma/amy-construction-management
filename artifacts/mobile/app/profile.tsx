import { useAuth, useUser } from "@clerk/expo";
import { useGetMe } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";

import { Field, FormScreen, FormSection, Input, Select } from "@/components/form";
import { Body, Loader, Muted } from "@/components/ui";
import { EMPTY_PROFILE, readProfile, saveProfile, type UserProfile } from "@/lib/profile";

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useAuth();
  const meQ = useGetMe();
  const initial = useMemo(() => (user ? readProfile(user) : EMPTY_PROFILE), [user]);
  const [p, setP] = useState<UserProfile>(initial);
  const [saving, setSaving] = useState(false);

  if (meQ.isLoading) return <Loader />;
  if (!user) return null;

  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    setP((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await saveProfile(user, p);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormScreen
      title="プロフィール編集"
      onSave={submit}
      onCancel={async () => {
        if (router.canGoBack()) {
          router.back();
        } else {
          await signOut();
          router.replace("/(auth)/sign-in");
        }
      }}
      saving={saving}
      validate={() => {
        const missing: Array<{ name?: string; label: string }> = [];
        if (!p.companyName.trim()) missing.push({ name: "companyName", label: "会社名 / 屋号" });
        if (!p.postalCode.trim()) missing.push({ name: "postalCode", label: "郵便番号" });
        if (!p.address.trim()) missing.push({ name: "address", label: "住所" });
        if (!p.email.trim()) missing.push({ name: "email", label: "E-Mail" });
        if (!p.bankName.trim()) missing.push({ name: "bankName", label: "銀行名" });
        if (!p.branchName.trim()) missing.push({ name: "branchName", label: "支店名" });
        if (!p.accountType.trim()) missing.push({ name: "accountType", label: "口座種別" });
        if (!p.accountNumber.trim()) missing.push({ name: "accountNumber", label: "口座番号" });
        if (!p.accountHolder.trim()) missing.push({ name: "accountHolder", label: "口座名義 (カナ)" });
        return missing;
      }}
    >
      <FormSection>
        <Body style={{ fontSize: 13 }}>
          サインイン中: {user.fullName ?? user.primaryEmailAddress?.emailAddress}
        </Body>
        <Muted style={{ fontSize: 11, marginTop: 4 }}>
          職人請求書 / 見積書の発行元・振込先として使われます。登録番号以外は必須です。
        </Muted>
      </FormSection>

      <FormSection title="発行元情報">
        <Field label="会社名 / 屋号" name="companyName" required>
          <Input value={p.companyName} onChangeText={(v) => set("companyName", v)} />
        </Field>
        <Field label="郵便番号" name="postalCode" required>
          <Input value={p.postalCode} onChangeText={(v) => set("postalCode", v)} placeholder="570-0000" />
        </Field>
        <Field label="住所" name="address" required>
          <Input value={p.address} onChangeText={(v) => set("address", v)} />
        </Field>
        <Field label="TEL">
          <Input value={p.tel} onChangeText={(v) => set("tel", v)} keyboardType="phone-pad" />
        </Field>
        <Field label="FAX">
          <Input value={p.fax} onChangeText={(v) => set("fax", v)} keyboardType="phone-pad" />
        </Field>
        <Field label="E-Mail" name="email" required>
          <Input
            value={p.email}
            onChangeText={(v) => set("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>
        <Field label="インボイス登録番号" hint="任意 (Tから始まる13桁)">
          <Input value={p.registrationNumber} onChangeText={(v) => set("registrationNumber", v)} />
        </Field>
      </FormSection>

      <FormSection title="お振込先">
        <Field label="銀行名" name="bankName" required>
          <Input value={p.bankName} onChangeText={(v) => set("bankName", v)} />
        </Field>
        <Field label="支店名" name="branchName" required>
          <Input value={p.branchName} onChangeText={(v) => set("branchName", v)} />
        </Field>
        <Field label="支店コード">
          <Input value={p.branchCode} onChangeText={(v) => set("branchCode", v)} />
        </Field>
        <Field label="口座種別" name="accountType" required>
          <Select
            value={p.accountType}
            onValueChange={(v) => set("accountType", v)}
            options={[
              { value: "普通", label: "普通" },
              { value: "当座", label: "当座" },
            ]}
          />
        </Field>
        <Field label="口座番号" name="accountNumber" required>
          <Input value={p.accountNumber} onChangeText={(v) => set("accountNumber", v)} />
        </Field>
        <Field label="口座名義 (カナ)" name="accountHolder" required>
          <Input value={p.accountHolder} onChangeText={(v) => set("accountHolder", v)} />
        </Field>
      </FormSection>
    </FormScreen>
  );
}
