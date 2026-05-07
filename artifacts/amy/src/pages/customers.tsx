import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  getListCustomersQueryKey,
  useListEmployees,
  type Customer,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { BulkDeleteBar, runBulkDelete } from "@/components/bulk-delete-bar";

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

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const customersQ = useListCustomers();
  const employeesQ = useListEmployees();
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();
  const deleteMut = useDeleteCustomer();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      contactName: c.contactName ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      notes: c.notes ?? "",
      defaultProfitRate: String(c.defaultProfitRate ?? 20),
      defaultSalesCommissionRate: String(c.defaultSalesCommissionRate ?? 5),
      defaultSupervisorCommissionRate: String(
        c.defaultSupervisorCommissionRate ?? 30,
      ),
      defaultSalesRep: c.defaultSalesRep ?? "",
      defaultOtherSalesBonusRecipient: c.defaultOtherSalesBonusRecipient ?? "",
      defaultOtherSalesBonusRate:
        c.defaultOtherSalesBonusRate != null
          ? String(c.defaultOtherSalesBonusRate)
          : "",
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast({ title: "顧客名は必須です", variant: "destructive" });
      return;
    }
    const data = {
      name: form.name,
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
      defaultProfitRate: Number(form.defaultProfitRate) || 20,
      defaultSalesCommissionRate:
        Number(form.defaultSalesCommissionRate) || 5,
      defaultSupervisorCommissionRate:
        Number(form.defaultSupervisorCommissionRate) || 30,
      defaultSalesRep: form.defaultSalesRep || null,
      defaultOtherSalesBonusRecipient:
        form.defaultOtherSalesBonusRecipient || null,
      defaultOtherSalesBonusRate:
        form.defaultOtherSalesBonusRate === ""
          ? null
          : Number(form.defaultOtherSalesBonusRate),
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data });
      } else {
        await createMut.mutateAsync({ data });
      }
      await queryClient.invalidateQueries({
        queryKey: getListCustomersQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: editing ? "顧客を更新しました" : "顧客を登録しました" });
      setOpen(false);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync({ id: deleteId });
      await queryClient.invalidateQueries({
        queryKey: getListCustomersQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "顧客を削除しました" });
      setDeleteId(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const rows = customersQ.data ?? [];
  const sel = useBulkSelection(rows.map((c) => c.id));

  const handleBulkDelete = async () => {
    const ids = sel.selectedIds;
    const { ok, failed } = await runBulkDelete(ids, (id) =>
      deleteMut.mutateAsync({ id }),
    );
    await queryClient.invalidateQueries({
      queryKey: getListCustomersQueryKey(),
    });
    await invalidateDashboard(queryClient);
    sel.clear();
    if (failed.length === 0) {
      toast({ title: `${ok}件の顧客を削除しました` });
    } else {
      toast({
        title: `${ok}件削除、${failed.length}件失敗`,
        description: apiErrorMessage(failed[0].error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">顧客</h1>
          <p className="text-sm text-muted-foreground mt-1">
            顧客情報を一元管理します。
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          顧客を追加
        </Button>
      </div>

      <BulkDeleteBar
        count={sel.count}
        onClear={sel.clear}
        onDelete={handleBulkDelete}
        itemLabel="顧客"
        isPending={deleteMut.isPending}
        description="関連する案件がある顧客は削除に失敗します。この操作は取り消せません。"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">顧客一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {customersQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="font-medium">顧客がいません</div>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="w-4 h-4" />
                最初の顧客を登録
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={sel.headerCheckedState}
                      onCheckedChange={() => sel.toggleAll()}
                      aria-label="全選択"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>顧客名</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead>メール</TableHead>
                  <TableHead>住所</TableHead>
                  <TableHead className="text-right">規定利率</TableHead>
                  <TableHead className="text-right">営業歩合</TableHead>
                  <TableHead className="text-right">監督歩合</TableHead>
                  <TableHead className="text-right">マネジメント報酬</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} data-state={sel.isSelected(c.id) ? "selected" : undefined}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={sel.isSelected(c.id)}
                        onCheckedChange={() => sel.toggle(c.id)}
                        aria-label={`${c.name}を選択`}
                        data-testid={`checkbox-row-${c.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.contactName || "-"}</TableCell>
                    <TableCell>{c.phone || "-"}</TableCell>
                    <TableCell>{c.email || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.address || "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(c.defaultProfitRate ?? 20).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(c.defaultSalesCommissionRate ?? 5).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(c.defaultSupervisorCommissionRate ?? 30).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.defaultOtherSalesBonusRecipient &&
                      c.defaultOtherSalesBonusRate != null
                        ? `${c.defaultOtherSalesBonusRate.toFixed(1)}% (${c.defaultOtherSalesBonusRecipient})`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(c.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "顧客を編集" : "顧客を追加"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="cname">顧客名 *</Label>
              <Input
                id="cname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact">担当者</Label>
                <Input
                  id="contact"
                  value={form.contactName}
                  onChange={(e) =>
                    setForm({ ...form, contactName: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="phone">電話</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="email">メール</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="addr">住所</Label>
              <Input
                id="addr"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="defaultSalesCommissionRate">
                  営業歩合 (%)
                </Label>
                <Input
                  id="defaultSalesCommissionRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.defaultSalesCommissionRate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultSalesCommissionRate: e.target.value,
                    })
                  }
                  placeholder="例: 5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  案件作成時に既定値としてプリフィル
                </p>
              </div>
              <div>
                <Label htmlFor="defaultSupervisorCommissionRate">
                  現場監督歩合 (%)
                </Label>
                <Input
                  id="defaultSupervisorCommissionRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.defaultSupervisorCommissionRate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultSupervisorCommissionRate: e.target.value,
                    })
                  }
                  placeholder="例: 30"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  規定超過粗利のうち監督への配分率
                </p>
              </div>
              <div>
                <Label htmlFor="defaultSalesRep">担当営業</Label>
                <Input
                  id="defaultSalesRep"
                  list="customerSalesRepList"
                  value={form.defaultSalesRep}
                  onChange={(e) =>
                    setForm({ ...form, defaultSalesRep: e.target.value })
                  }
                  placeholder="例: エディ"
                />
                <datalist id="customerSalesRepList">
                  {(employeesQ.data ?? [])
                    .filter((e) => /営業|sales/i.test(e.role))
                    .map((e) => (
                      <option key={e.id} value={e.name} />
                    ))}
                </datalist>
                <p className="text-xs text-muted-foreground mt-1">
                  案件作成時に「担当営業」へ自動入力
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="defaultProfitRate">規定利率 (%)</Label>
                <Input
                  id="defaultProfitRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.defaultProfitRate}
                  onChange={(e) =>
                    setForm({ ...form, defaultProfitRate: e.target.value })
                  }
                  placeholder="例: 20"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  施工台帳の「規定粗利額」算出に使用
                </p>
              </div>
              <div>
                <Label htmlFor="defaultOtherSalesBonusRecipient">
                  マネジメント報酬 受取人
                </Label>
                <Input
                  id="defaultOtherSalesBonusRecipient"
                  list="customerBonusRecipientList"
                  value={form.defaultOtherSalesBonusRecipient}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultOtherSalesBonusRecipient: e.target.value,
                    })
                  }
                  placeholder="例: 亘 (空欄で対象外)"
                />
                <datalist id="customerBonusRecipientList">
                  {(employeesQ.data ?? []).map((e) => (
                    <option key={e.id} value={e.name} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground mt-1">
                  案件作成時に既定値としてプリフィル
                </p>
              </div>
              <div>
                <Label htmlFor="defaultOtherSalesBonusRate">
                  マネジメント報酬率 (%)
                </Label>
                <Input
                  id="defaultOtherSalesBonusRate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.defaultOtherSalesBonusRate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultOtherSalesBonusRate: e.target.value,
                    })
                  }
                  placeholder="例: 2.5"
                  disabled={!form.defaultOtherSalesBonusRecipient}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  営業歩合からこの率分を差し引いて受取人へ
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="submit">{editing ? "保存" : "登録"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>顧客を削除しますか?</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。関連する案件がある場合は削除できません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
