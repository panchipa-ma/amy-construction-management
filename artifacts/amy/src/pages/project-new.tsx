import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProject,
  useListCustomers,
  useListEmployees,
  ProjectStatus,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_STATUS_OPTIONS } from "@/components/project-status-select";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { apiErrorMessage } from "@/lib/api-error";
import { ArrowLeft } from "lucide-react";

export default function ProjectNewPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const customersQ = useListCustomers();
  const employeesQ = useListEmployees();
  const salesRepOptions = (employeesQ.data ?? []).filter((e) =>
    /営業|sales/i.test(e.role ?? ""),
  );
  const supervisorOptions = (employeesQ.data ?? []).filter((e) =>
    /現場|監督|supervisor/i.test(e.role ?? ""),
  );
  const createMut = useCreateProject();

  const [form, setForm] = useState({
    name: "",
    code: "",
    customerId: "",
    status: ProjectStatus.estimating as ProjectStatus,
    siteAddress: "",
    unitNumber: "",
    startDate: "",
    endDate: "",
    contractAmount: "0",
    standardProfitRate: "20",
    salesCommissionRate: "5",
    supervisorCommissionRate: "30",
    otherSalesBonusRecipient: "",
    otherSalesBonusRate: "",
    salesRep: "",
    siteSupervisor: "",
    notes: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.customerId) {
      toast({ title: "案件名と顧客は必須です", variant: "destructive" });
      return;
    }
    try {
      const res = await createMut.mutateAsync({
        data: {
          name: form.name,
          code: form.code || null,
          customerId: form.customerId,
          status: form.status,
          siteAddress: form.siteAddress || null,
          unitNumber: form.unitNumber || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          contractAmount: Number(form.contractAmount) || 0,
          standardProfitRate:
            form.standardProfitRate === ""
              ? 20
              : Number(form.standardProfitRate),
          salesCommissionRate:
            form.salesCommissionRate === ""
              ? 5
              : Number(form.salesCommissionRate),
          supervisorCommissionRate:
            form.supervisorCommissionRate === ""
              ? 30
              : Number(form.supervisorCommissionRate),
          otherSalesBonusRecipient: form.otherSalesBonusRecipient || null,
          otherSalesBonusRate:
            form.otherSalesBonusRate === ""
              ? null
              : Number(form.otherSalesBonusRate),
          salesRep: form.salesRep || null,
          siteSupervisor: form.siteSupervisor || null,
          notes: form.notes || null,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "案件を作成しました" });
      setLocation(`/projects/${res.id}`);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        案件一覧に戻る
      </Link>
      <div>
        <h1 className="text-2xl font-bold">案件を作成</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">案件情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">案件名 *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="code">案件番号</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="例: 2026-001"
                />
              </div>
              <div>
                <Label>ステータス</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as ProjectStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>顧客 *</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(v) => {
                    const cust = (customersQ.data ?? []).find(
                      (c) => c.id === v,
                    );
                    // 顧客の規定値で常に上書き（顧客に値がなければクリア）
                    setForm((f) => ({
                      ...f,
                      customerId: v,
                      standardProfitRate:
                        cust?.defaultProfitRate != null
                          ? String(cust.defaultProfitRate)
                          : "",
                      salesCommissionRate:
                        cust?.defaultSalesCommissionRate != null
                          ? String(cust.defaultSalesCommissionRate)
                          : "",
                      supervisorCommissionRate:
                        cust?.defaultSupervisorCommissionRate != null
                          ? String(cust.defaultSupervisorCommissionRate)
                          : "",
                      salesRep: cust?.defaultSalesRep ?? "",
                      otherSalesBonusRecipient:
                        cust?.defaultOtherSalesBonusRecipient ?? "",
                      otherSalesBonusRate:
                        cust?.defaultOtherSalesBonusRate != null
                          ? String(cust.defaultOtherSalesBonusRate)
                          : "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="顧客を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customersQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(customersQ.data ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    顧客が登録されていません。{" "}
                    <Link href="/customers" className="underline">
                      顧客を登録
                    </Link>
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <Label htmlFor="siteAddress">現場住所</Label>
                <Input
                  id="siteAddress"
                  value={form.siteAddress}
                  onChange={(e) =>
                    setForm({ ...form, siteAddress: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="unitNumber">マンション号室</Label>
                <Input
                  id="unitNumber"
                  value={form.unitNumber}
                  onChange={(e) =>
                    setForm({ ...form, unitNumber: e.target.value })
                  }
                  placeholder="例: 305号室"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  職人請求書を号室で自動振分けする際に使用します
                </p>
              </div>
              <div>
                <Label htmlFor="startDate">着工日</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="endDate">竣工予定日</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="contractAmount">契約金額 (税抜・円)</Label>
                <Input
                  id="contractAmount"
                  type="number"
                  value={form.contractAmount}
                  onChange={(e) =>
                    setForm({ ...form, contractAmount: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="standardProfitRate">
                  規定利率 (%) ※施工台帳の規定粗利額算出に使用
                </Label>
                <Input
                  id="standardProfitRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.standardProfitRate}
                  onChange={(e) =>
                    setForm({ ...form, standardProfitRate: e.target.value })
                  }
                  placeholder="例: 20"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  顧客の規定値が自動入力されます (顧客マスタで変更可)
                </p>
              </div>
              <div>
                <Label htmlFor="salesRep">担当営業</Label>
                <Input
                  id="salesRep"
                  list="salesRepList"
                  value={form.salesRep}
                  onChange={(e) => setForm({ ...form, salesRep: e.target.value })}
                  placeholder="例: 亘 / 筒井 / 山下 / 峯本"
                />
                <datalist id="salesRepList">
                  {salesRepOptions.map((e) => (
                    <option key={e.id} value={e.name} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground mt-1">
                  選択肢は社員ページで役割「営業」で登録してください
                </p>
              </div>
              <div>
                <Label htmlFor="salesCommissionRate">営業歩合率 (%) ※売上に対して</Label>
                <Input
                  id="salesCommissionRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.salesCommissionRate}
                  onChange={(e) =>
                    setForm({ ...form, salesCommissionRate: e.target.value })
                  }
                  placeholder="5.0 〜 7.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  顧客の規定値が自動入力されます (顧客マスタで変更可)
                </p>
              </div>
              <div>
                <Label htmlFor="siteSupervisor">担当現場監督</Label>
                <Input
                  id="siteSupervisor"
                  list="supervisorList"
                  value={form.siteSupervisor}
                  onChange={(e) =>
                    setForm({ ...form, siteSupervisor: e.target.value })
                  }
                  placeholder="例: 野村 / 畑 / 森"
                />
                <datalist id="supervisorList">
                  {supervisorOptions.map((e) => (
                    <option key={e.id} value={e.name} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground mt-1">
                  選択肢は社員ページで役割「現場監督」で登録してください
                </p>
              </div>
              <div>
                <Label htmlFor="supervisorCommissionRate">
                  監督歩合率 (%) ※規定超過粗利に対して
                </Label>
                <Input
                  id="supervisorCommissionRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.supervisorCommissionRate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      supervisorCommissionRate: e.target.value,
                    })
                  }
                  placeholder="例: 30"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  顧客の規定値が自動入力されます (顧客マスタで変更可)
                </p>
              </div>
              <div>
                <Label htmlFor="otherSalesBonusRecipient">
                  マネジメント報酬 受取人
                </Label>
                <Input
                  id="otherSalesBonusRecipient"
                  list="bonusRecipientList"
                  value={form.otherSalesBonusRecipient}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      otherSalesBonusRecipient: e.target.value,
                    })
                  }
                  placeholder="例: 亘 (空欄ならボーナスなし)"
                />
                <datalist id="bonusRecipientList">
                  {(employeesQ.data ?? []).map((e) => (
                    <option key={e.id} value={e.name} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground mt-1">
                  自分の売上の一部を分ける相手を社員から選択
                </p>
              </div>
              <div>
                <Label htmlFor="otherSalesBonusRate">
                  マネジメント報酬率 (%)
                </Label>
                <Input
                  id="otherSalesBonusRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.otherSalesBonusRate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      otherSalesBonusRate: e.target.value,
                    })
                  }
                  placeholder="例: 2.5"
                  disabled={!form.otherSalesBonusRecipient}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  営業歩合からこの率分を差し引いて受取人へ渡す
                </p>
              </div>
              <div className="col-span-2">
                <Label htmlFor="notes">備考</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Link href="/projects">
                <Button type="button" variant="outline">
                  キャンセル
                </Button>
              </Link>
              <Button type="submit" disabled={createMut.isPending}>
                作成する
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
