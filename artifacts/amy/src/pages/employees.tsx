import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useListUsers,
  getListEmployeesQueryKey,
  type Employee,
} from "@workspace/api-client-react";

const UNLINKED = "__none__";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EditableText } from "@/components/editable-cell";
import { Plus, Trash2, Briefcase } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";

const ROLE_PRESETS = ["営業", "現場監督", "事務"] as const;

const empty = {
  name: "",
  role: "営業",
  phone: "",
  email: "",
  notes: "",
};

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListEmployees();
  const createMut = useCreateEmployee();
  const updateMut = useUpdateEmployee();
  const deleteMut = useDeleteEmployee();
  const usersQ = useListUsers();
  const appUsers = usersQ.data ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = () => {
    setForm(empty);
    setOpen(true);
  };

  const inlineUpdate = async (
    e: Employee,
    patch: Partial<{
      name: string;
      role: string;
      phone: string | null;
      email: string | null;
      notes: string | null;
      appUserId: string | null;
    }>,
  ) => {
    try {
      await updateMut.mutateAsync({
        id: e.id,
        data: {
          name: patch.name ?? e.name,
          role: patch.role ?? e.role,
          phone: patch.phone !== undefined ? patch.phone : (e.phone ?? null),
          email: patch.email !== undefined ? patch.email : (e.email ?? null),
          notes: patch.notes !== undefined ? patch.notes : (e.notes ?? null),
          appUserId:
            patch.appUserId !== undefined ? patch.appUserId : (e.appUserId ?? null),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      await invalidateDashboard(queryClient);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
      await queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
    }
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name || !form.role) {
      toast({ title: "氏名と役割は必須です", variant: "destructive" });
      return;
    }
    const data = {
      name: form.name,
      role: form.role,
      phone: form.phone || null,
      email: form.email ? form.email.toLowerCase() : null,
      notes: form.notes || null,
    };
    try {
      await createMut.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      await invalidateDashboard(queryClient);
      toast({ title: "社員を登録しました" });
      setOpen(false);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync({ id: deleteId });
      await queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      await invalidateDashboard(queryClient);
      toast({ title: "社員を削除しました" });
      setDeleteId(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const rows = data ?? [];

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">社員</h1>
          <p className="text-sm text-muted-foreground mt-1">
            営業・現場監督・事務などの社内メンバーを管理します。案件作成画面の「担当営業」「担当現場監督」のドロップダウン候補になります。
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          社員を追加
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">社員一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="font-medium">社員が登録されていません</div>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="w-4 h-4" />
                最初の社員を登録
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>氏名</TableHead>
                  <TableHead>役割</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead>メール</TableHead>
                  <TableHead className="min-w-[180px]">アプリ連動</TableHead>
                  <TableHead>備考</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium p-1">
                      <EditableText
                        value={e.name}
                        onSave={(v) => v && inlineUpdate(e, { name: v })}
                        required
                        placeholder="氏名"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableText
                        value={e.role}
                        onSave={(v) => v && inlineUpdate(e, { role: v })}
                        required
                        placeholder="営業 / 現場監督 / 事務"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableText
                        value={e.phone ?? ""}
                        onSave={(v) => inlineUpdate(e, { phone: v || null })}
                        placeholder="電話番号"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableText
                        value={e.email ?? ""}
                        onSave={(v) =>
                          inlineUpdate(e, {
                            email: v ? v.toLowerCase() : null,
                          })
                        }
                        placeholder="メール"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Select
                        value={e.appUserId ?? UNLINKED}
                        onValueChange={(v) =>
                          inlineUpdate(e, {
                            appUserId: v === UNLINKED ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="未連動">
                            {e.appUserId
                              ? (e.appUserName ||
                                  e.appUserEmail ||
                                  "未連動")
                              : "未連動"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNLINKED}>未連動</SelectItem>
                          {appUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.displayName || u.email || u.clerkUserId}
                              {u.status === "pending" ? " (承認待ち)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1">
                      <EditableText
                        value={e.notes ?? ""}
                        onSave={(v) => inlineUpdate(e, { notes: v || null })}
                        placeholder="—"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(e.id)}
                        className="text-destructive hover:text-destructive h-8 w-8"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
            <DialogTitle>社員を追加</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ename">氏名 *</Label>
                <Input
                  id="ename"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="erole">役割 *</Label>
                <Select
                  value={
                    ROLE_PRESETS.includes(
                      form.role as (typeof ROLE_PRESETS)[number],
                    )
                      ? form.role
                      : "__custom__"
                  }
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      role: v === "__custom__" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger id="erole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_PRESETS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">その他 (自由入力)</SelectItem>
                  </SelectContent>
                </Select>
                {!ROLE_PRESETS.includes(
                  form.role as (typeof ROLE_PRESETS)[number],
                ) && (
                  <Input
                    className="mt-2"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="例: 設計"
                  />
                )}
              </div>
              <div>
                <Label htmlFor="ephone">電話</Label>
                <Input
                  id="ephone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="eemail">メール</Label>
                <Input
                  id="eemail"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="enotes">備考</Label>
                <Input
                  id="enotes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="submit">登録</Button>
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
            <AlertDialogTitle>社員を削除しますか?</AlertDialogTitle>
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
