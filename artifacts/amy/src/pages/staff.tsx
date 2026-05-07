import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStaff,
  useCreateStaff,
  useUpdateStaff,
  useDeleteStaff,
  useListStaffAssignments,
  getListStaffQueryKey,
  type Staff,
} from "@workspace/api-client-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { BulkDeleteBar, runBulkDelete } from "@/components/bulk-delete-bar";
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
import { EditableText, EditableNumber } from "@/components/editable-cell";
import { Plus, Trash2, HardHat, MapPin, CalendarClock, Users } from "lucide-react";
import { formatCurrency, formatDate, todayLocalISO, addDaysISO } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";

const empty = { name: "", role: "", phone: "", dailyRate: "0", company: "", otherSalesBonusRate: "" };

type StaffStatusEntry = { name: string; firstDate: string; lastDate: string };
type StaffStatus = {
  active: StaffStatusEntry[];
  upcoming: StaffStatusEntry | null;
};

function StaffStatusCell({ status }: { status?: StaffStatus }) {
  if (!status || (status.active.length === 0 && !status.upcoming)) {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <CalendarClock className="w-3 h-3" />
        空き
      </span>
    );
  }
  return (
    <div className="space-y-1 text-xs">
      {status.active.map((p, i) => (
        <div key={`a${i}`} className="flex items-start gap-1.5">
          <Badge className="shrink-0 px-1.5 py-0 text-[10px] h-4">稼働中</Badge>
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-medium truncate">
              <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
              {p.name}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {formatDate(p.firstDate)} 〜 {formatDate(p.lastDate)}
            </div>
          </div>
        </div>
      ))}
      {status.upcoming && (
        <div className="flex items-start gap-1.5">
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] h-4">
            次回
          </Badge>
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-medium truncate">
              <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
              {status.upcoming.name}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {formatDate(status.upcoming.firstDate)}〜
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StaffPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListStaff();
  const today = todayLocalISO();
  const assignmentsQ = useListStaffAssignments({
    from: addDaysISO(today, -7),
    to: addDaysISO(today, 45),
  });
  const statusByStaff = useMemo(() => {
    const m = new Map<string, StaffStatus>();
    for (const s of assignmentsQ.data ?? []) {
      const active = s.projects.filter(
        (p) => p.firstDate <= today && today <= p.lastDate,
      );
      const upcomingList = s.projects.filter((p) => p.firstDate > today);
      const upcoming = [...upcomingList].sort((a, b) =>
        a.firstDate.localeCompare(b.firstDate),
      )[0];
      m.set(s.staffId, {
        active: active.map((p) => ({
          name: p.unitNumber ? `${p.projectName} (${p.unitNumber})` : p.projectName,
          firstDate: p.firstDate,
          lastDate: p.lastDate,
        })),
        upcoming: upcoming
          ? {
              name: upcoming.unitNumber
                ? `${upcoming.projectName} (${upcoming.unitNumber})`
                : upcoming.projectName,
              firstDate: upcoming.firstDate,
              lastDate: upcoming.lastDate,
            }
          : null,
      });
    }
    return m;
  }, [assignmentsQ.data, today]);
  const createMut = useCreateStaff();
  const updateMut = useUpdateStaff();
  const deleteMut = useDeleteStaff();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = () => {
    setForm(empty);
    setOpen(true);
  };

  const inlineUpdate = async (s: Staff, patch: Partial<{ name: string; role: string; phone: string | null; dailyRate: number | null; company: string | null; otherSalesBonusRate: number | null }>) => {
    try {
      await updateMut.mutateAsync({
        id: s.id,
        data: {
          name: patch.name ?? s.name,
          role: patch.role ?? s.role,
          phone: patch.phone !== undefined ? patch.phone : (s.phone ?? null),
          dailyRate: patch.dailyRate !== undefined ? patch.dailyRate : (s.dailyRate ?? null),
          company: patch.company !== undefined ? patch.company : (s.company ?? null),
          otherSalesBonusRate:
            patch.otherSalesBonusRate !== undefined
              ? patch.otherSalesBonusRate
              : (s.otherSalesBonusRate ?? null),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
      await invalidateDashboard(queryClient);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
      await queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.role) {
      toast({ title: "氏名と職種は必須です", variant: "destructive" });
      return;
    }
    const data = {
      name: form.name,
      role: form.role,
      phone: form.phone || null,
      dailyRate: form.dailyRate ? Number(form.dailyRate) : null,
      company: form.company || null,
      otherSalesBonusRate: form.otherSalesBonusRate
        ? Number(form.otherSalesBonusRate)
        : null,
    };
    try {
      await createMut.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
      await invalidateDashboard(queryClient);
      toast({ title: "職人を登録しました" });
      setOpen(false);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync({ id: deleteId });
      await queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
      await invalidateDashboard(queryClient);
      toast({ title: "職人を削除しました" });
      setDeleteId(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const rows = data ?? [];
  const sel = useBulkSelection(rows.map((s) => s.id));

  const handleBulkDelete = async () => {
    const ids = sel.selectedIds;
    const { ok, failed } = await runBulkDelete(ids, (id) =>
      deleteMut.mutateAsync({ id }),
    );
    await queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });
    await invalidateDashboard(queryClient);
    sel.clear();
    if (failed.length === 0) {
      toast({ title: `${ok}件の職人を削除しました` });
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
          <h1 className="text-2xl font-bold">職人</h1>
          <p className="text-sm text-muted-foreground mt-1">
            社員と外注先の職人を管理します。各セルをクリックして直接編集できます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/staff-assignments">
            <Button variant="outline" className="gap-2">
              <Users className="w-4 h-4" />
              出面表
            </Button>
          </Link>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            職人を追加
          </Button>
        </div>
      </div>

      <BulkDeleteBar
        count={sel.count}
        onClear={sel.clear}
        onDelete={handleBulkDelete}
        itemLabel="職人"
        isPending={deleteMut.isPending}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">職人一覧</CardTitle>
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
                <HardHat className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="font-medium">職人が登録されていません</div>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="w-4 h-4" />
                最初の職人を登録
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
                  <TableHead>氏名</TableHead>
                  <TableHead>職種</TableHead>
                  <TableHead>会社</TableHead>
                  <TableHead className="min-w-[260px]">現状況 (発注の参考)</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead className="text-right">日当</TableHead>
                  <TableHead className="text-right">マネジメント報酬</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const status = statusByStaff.get(s.id);
                  return (
                    <TableRow key={s.id} data-state={sel.isSelected(s.id) ? "selected" : undefined}>
                      <TableCell className="w-10 p-1">
                        <Checkbox
                          checked={sel.isSelected(s.id)}
                          onCheckedChange={() => sel.toggle(s.id)}
                          aria-label={`${s.name}を選択`}
                          data-testid={`checkbox-row-${s.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium p-1">
                        <EditableText
                          value={s.name}
                          onSave={(v) => v && inlineUpdate(s, { name: v })}
                          required
                          placeholder="氏名"
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <EditableText
                          value={s.role}
                          onSave={(v) => v && inlineUpdate(s, { role: v })}
                          required
                          placeholder="職種"
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <EditableText
                          value={s.company ?? ""}
                          onSave={(v) => inlineUpdate(s, { company: v || null })}
                          placeholder="会社名"
                        />
                      </TableCell>
                      <TableCell>
                        <StaffStatusCell status={status ?? undefined} />
                      </TableCell>
                      <TableCell className="p-1">
                        <EditableText
                          value={s.phone ?? ""}
                          onSave={(v) => inlineUpdate(s, { phone: v || null })}
                          placeholder="電話番号"
                        />
                      </TableCell>
                      <TableCell className="text-right p-1">
                        <EditableNumber
                          value={s.dailyRate ?? 0}
                          onSave={(v) => inlineUpdate(s, { dailyRate: v || null })}
                          placeholder="日当"
                        />
                      </TableCell>
                      <TableCell className="text-right p-1 tabular-nums">
                        <div className="flex items-center justify-end gap-1">
                          <EditableNumber
                            value={s.otherSalesBonusRate ?? 0}
                            onSave={(v) =>
                              inlineUpdate(s, { otherSalesBonusRate: v || null })
                            }
                            placeholder="0"
                          />
                          <span className="text-muted-foreground text-xs">%</span>
                        </div>
                      </TableCell>
                      <TableCell className="p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(s.id)}
                          className="text-destructive hover:text-destructive h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>職人を追加</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sname">氏名 *</Label>
                <Input
                  id="sname"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="role">職種 *</Label>
                <Input
                  id="role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="大工 / クロス / 電気 など"
                />
              </div>
              <div>
                <Label htmlFor="company">会社</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="phone2">電話</Label>
                <Input
                  id="phone2"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="rate">日当 (円)</Label>
                <Input
                  id="rate"
                  type="number"
                  value={form.dailyRate}
                  onChange={(e) =>
                    setForm({ ...form, dailyRate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="bonus">マネジメント報酬率 (%)</Label>
                <Input
                  id="bonus"
                  type="number"
                  step="0.1"
                  placeholder="例: 亘 → 2.5"
                  value={form.otherSalesBonusRate}
                  onChange={(e) =>
                    setForm({ ...form, otherSalesBonusRate: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  自分以外の営業が獲得した売上から受け取る歩合率
                </p>
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
            <AlertDialogTitle>職人を削除しますか?</AlertDialogTitle>
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
