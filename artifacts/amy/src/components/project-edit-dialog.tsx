import { useEffect, useState, type FormEvent } from "react";
import {
  ProjectStatus,
  type Customer,
  type Employee,
  type Project,
  type UpdateProjectBody,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_STATUS_OPTIONS } from "@/components/project-status-select";

type ProjectForm = {
  name: string;
  code: string;
  customerId: string;
  status: ProjectStatus;
  siteAddress: string;
  unitNumber: string;
  startDate: string;
  endDate: string;
  saturdayWork: boolean;
  contractAmount: string;
  standardProfitRate: string;
  salesCommissionRate: string;
  supervisorCommissionRate: string;
  otherSalesBonusRecipient: string;
  otherSalesBonusRate: string;
  salesRep: string;
  siteSupervisor: string;
  notes: string;
};

function projectToForm(project: Project): ProjectForm {
  return {
    name: project.name,
    code: project.code ?? "",
    customerId: project.customerId,
    status: project.status,
    siteAddress: project.siteAddress ?? "",
    unitNumber: project.unitNumber ?? "",
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
    saturdayWork: project.saturdayWork,
    contractAmount: String(project.contractAmount ?? 0),
    standardProfitRate: String(project.standardProfitRate ?? ""),
    salesCommissionRate: String(project.salesCommissionRate ?? ""),
    supervisorCommissionRate: String(project.supervisorCommissionRate ?? ""),
    otherSalesBonusRecipient: project.otherSalesBonusRecipient ?? "",
    otherSalesBonusRate: String(project.otherSalesBonusRate ?? ""),
    salesRep: project.salesRep ?? "",
    siteSupervisor: project.siteSupervisor ?? "",
    notes: project.notes ?? "",
  };
}

function optionalNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

export function ProjectEditDialog({
  open,
  onOpenChange,
  project,
  customers,
  employees,
  isPending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  customers: Customer[];
  employees: Employee[];
  isPending: boolean;
  onSave: (data: UpdateProjectBody) => Promise<boolean>;
}) {
  const [form, setForm] = useState<ProjectForm>(() => projectToForm(project));
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(projectToForm(project));
      setValidationError("");
    }
  }, [open, project]);

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.customerId) {
      setValidationError("案件名と元請は必須です");
      return;
    }
    setValidationError("");

    const saved = await onSave({
      name: form.name.trim(),
      code: form.code.trim() || null,
      customerId: form.customerId,
      status: form.status,
      siteAddress: form.siteAddress.trim() || null,
      unitNumber: form.unitNumber.trim() || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      saturdayWork: form.saturdayWork,
      contractAmount: Number(form.contractAmount) || 0,
      standardProfitRate: optionalNumber(form.standardProfitRate),
      salesCommissionRate: optionalNumber(form.salesCommissionRate),
      supervisorCommissionRate: optionalNumber(form.supervisorCommissionRate),
      otherSalesBonusRecipient:
        form.otherSalesBonusRecipient.trim() || null,
      otherSalesBonusRate: optionalNumber(form.otherSalesBonusRate),
      salesRep: form.salesRep.trim() || null,
      siteSupervisor: form.siteSupervisor.trim() || null,
      notes: form.notes.trim() || null,
    });
    if (saved) onOpenChange(false);
  };

  const salesRepOptions = employees.filter((employee) =>
    /営業|sales/i.test(employee.role ?? ""),
  );
  const supervisorOptions = employees.filter((employee) =>
    /現場|監督|supervisor/i.test(employee.role ?? ""),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>案件情報を編集</DialogTitle>
          <DialogDescription>
            登録済みの案件情報を修正・追加できます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="project-edit-name">案件名 *</Label>
              <Input
                id="project-edit-name"
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="project-edit-code">案件番号</Label>
              <Input
                id="project-edit-code"
                value={form.code}
                onChange={(event) => set("code", event.target.value)}
              />
            </div>
            <div>
              <Label>ステータス</Label>
              <Select
                value={form.status}
                onValueChange={(value) => set("status", value as ProjectStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
               <Label>元請 *</Label>
              <Select
                value={form.customerId}
                onValueChange={(value) => set("customerId", value)}
              >
                <SelectTrigger>
                 <SelectValue placeholder="元請を選択" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="project-edit-address">現場住所</Label>
              <Input
                id="project-edit-address"
                value={form.siteAddress}
                onChange={(event) => set("siteAddress", event.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="project-edit-unit">マンション号室</Label>
              <Input
                id="project-edit-unit"
                value={form.unitNumber}
                onChange={(event) => set("unitNumber", event.target.value)}
                placeholder="例: 305号室"
              />
            </div>
            <div>
              <Label htmlFor="project-edit-start">着工日</Label>
              <Input
                id="project-edit-start"
                type="date"
                value={form.startDate}
                onChange={(event) => set("startDate", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="project-edit-end">竣工予定日</Label>
              <Input
                id="project-edit-end"
                type="date"
                value={form.endDate}
                onChange={(event) => set("endDate", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="project-edit-contract">契約金額</Label>
              <Input
                id="project-edit-contract"
                type="number"
                min="0"
                value={form.contractAmount}
                onChange={(event) => set("contractAmount", event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={form.saturdayWork}
                  onChange={(event) =>
                    set("saturdayWork", event.target.checked)
                  }
                />
                <span className="text-sm">土曜日を稼働日にする</span>
              </label>
            </div>
            <div>
              <Label htmlFor="project-edit-profit">規定利率 (%)</Label>
              <Input
                id="project-edit-profit"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.standardProfitRate}
                onChange={(event) =>
                  set("standardProfitRate", event.target.value)
                }
              />
            </div>
            <div>
              <Label htmlFor="project-edit-sales-rate">営業歩合率 (%)</Label>
              <Input
                id="project-edit-sales-rate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.salesCommissionRate}
                onChange={(event) =>
                  set("salesCommissionRate", event.target.value)
                }
              />
            </div>
            <div>
              <Label htmlFor="project-edit-supervisor-rate">
                監督歩合率 (%)
              </Label>
              <Input
                id="project-edit-supervisor-rate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.supervisorCommissionRate}
                onChange={(event) =>
                  set("supervisorCommissionRate", event.target.value)
                }
              />
            </div>
            <div>
              <Label htmlFor="project-edit-sales-rep">担当営業</Label>
              <Input
                id="project-edit-sales-rep"
                list="project-edit-sales-rep-list"
                value={form.salesRep}
                onChange={(event) => set("salesRep", event.target.value)}
              />
              <datalist id="project-edit-sales-rep-list">
                {salesRepOptions.map((employee) => (
                  <option key={employee.id} value={employee.name} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="project-edit-supervisor">担当現場監督</Label>
              <Input
                id="project-edit-supervisor"
                list="project-edit-supervisor-list"
                value={form.siteSupervisor}
                onChange={(event) => set("siteSupervisor", event.target.value)}
              />
              <datalist id="project-edit-supervisor-list">
                {supervisorOptions.map((employee) => (
                  <option key={employee.id} value={employee.name} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="project-edit-bonus-recipient">
                マネジメント報酬 受取人
              </Label>
              <Input
                id="project-edit-bonus-recipient"
                list="project-edit-bonus-recipient-list"
                value={form.otherSalesBonusRecipient}
                onChange={(event) =>
                  set("otherSalesBonusRecipient", event.target.value)
                }
              />
              <datalist id="project-edit-bonus-recipient-list">
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.name} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="project-edit-bonus-rate">
                マネジメント報酬率 (%)
              </Label>
              <Input
                id="project-edit-bonus-rate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.otherSalesBonusRate}
                onChange={(event) =>
                  set("otherSalesBonusRate", event.target.value)
                }
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="project-edit-notes">備考</Label>
              <Textarea
                id="project-edit-notes"
                value={form.notes}
                onChange={(event) => set("notes", event.target.value)}
                rows={4}
              />
            </div>
          </div>
          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "保存中..." : "変更を保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}