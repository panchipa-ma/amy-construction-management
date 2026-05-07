import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCompanyProfile,
  useUpdateCompanyProfile,
  getGetCompanyProfileQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMe } from "@/lib/role";
import { apiErrorMessage } from "@/lib/api-error";

type Form = {
  name: string;
  postalCode: string;
  address: string;
  registrationNumber: string;
  tel: string;
  fax: string;
  email: string;
  contact: string;
  bankName: string;
  branchName: string;
  branchCode: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
  termsDelivery: string;
  termsPayment: string;
  termsValidity: string;
};

const EMPTY: Form = {
  name: "",
  postalCode: "",
  address: "",
  registrationNumber: "",
  tel: "",
  fax: "",
  email: "",
  contact: "",
  bankName: "",
  branchName: "",
  branchCode: "",
  accountType: "普通",
  accountNumber: "",
  accountHolder: "",
  termsDelivery: "",
  termsPayment: "",
  termsValidity: "",
};

export default function CompanyProfilePage() {
  const { me } = useMe();
  const isInternal = me?.role === "internal";
  const { data, isLoading } = useGetCompanyProfile();
  const updateMut = useUpdateCompanyProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hydrated && data) {
      setForm({
        name: data.name,
        postalCode: data.postalCode,
        address: data.address,
        registrationNumber: data.registrationNumber,
        tel: data.tel,
        fax: data.fax,
        email: data.email,
        contact: data.contact,
        bankName: data.bankName,
        branchName: data.branchName,
        branchCode: data.branchCode,
        accountType: data.accountType || "普通",
        accountNumber: data.accountNumber,
        accountHolder: data.accountHolder,
        termsDelivery: data.termsDelivery,
        termsPayment: data.termsPayment,
        termsValidity: data.termsValidity,
      });
      setHydrated(true);
    }
  }, [data, hydrated]);

  const upd = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await updateMut.mutateAsync({ data: form });
      await queryClient.invalidateQueries({
        queryKey: getGetCompanyProfileQueryKey(),
      });
      toast({ title: "会社プロフィールを保存しました" });
    } catch (e) {
      toast({ title: apiErrorMessage(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const readOnly = !isInternal;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">会社プロフィール</h1>
        <p className="text-sm text-muted-foreground mt-1">
          請求書・見積書に発行元情報として自動反映されます。
          {readOnly && "（社内管理者のみ編集できます）"}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <section className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground">
              会社情報
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="会社名" required>
                <Input
                  value={form.name}
                  onChange={(e) => upd("name", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="インボイス登録番号">
                <Input
                  value={form.registrationNumber}
                  onChange={(e) => upd("registrationNumber", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="郵便番号">
                <Input
                  value={form.postalCode}
                  onChange={(e) => upd("postalCode", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="担当者">
                <Input
                  value={form.contact}
                  onChange={(e) => upd("contact", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="住所" colSpan={2}>
                <Input
                  value={form.address}
                  onChange={(e) => upd("address", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="TEL">
                <Input
                  value={form.tel}
                  onChange={(e) => upd("tel", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="FAX">
                <Input
                  value={form.fax}
                  onChange={(e) => upd("fax", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="E-Mail" colSpan={2}>
                <Input
                  value={form.email}
                  onChange={(e) => upd("email", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground">
              振込先情報
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="銀行名">
                <Input
                  value={form.bankName}
                  onChange={(e) => upd("bankName", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="支店名">
                <Input
                  value={form.branchName}
                  onChange={(e) => upd("branchName", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="店番号">
                <Input
                  value={form.branchCode}
                  onChange={(e) => upd("branchCode", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="口座種別">
                <Select
                  value={form.accountType}
                  onValueChange={(v) => upd("accountType", v)}
                  disabled={readOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="普通">普通</SelectItem>
                    <SelectItem value="当座">当座</SelectItem>
                    <SelectItem value="貯蓄">貯蓄</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="口座番号">
                <Input
                  value={form.accountNumber}
                  onChange={(e) => upd("accountNumber", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="口座名義">
                <Input
                  value={form.accountHolder}
                  onChange={(e) => upd("accountHolder", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground">
              見積書 取引条件
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <Field label="納期">
                <Input
                  value={form.termsDelivery}
                  onChange={(e) => upd("termsDelivery", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="支払条件">
                <Input
                  value={form.termsPayment}
                  onChange={(e) => upd("termsPayment", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="有効期限">
                <Input
                  value={form.termsValidity}
                  onChange={(e) => upd("termsValidity", e.target.value)}
                  disabled={readOnly}
                />
              </Field>
            </div>
          </section>

          {!readOnly && (
            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                保存
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  required,
  colSpan,
  children,
}: {
  label: string;
  required?: boolean;
  colSpan?: number;
  children: React.ReactNode;
}) {
  return (
    <div className={colSpan === 2 ? "col-span-2 space-y-1" : "space-y-1"}>
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}
