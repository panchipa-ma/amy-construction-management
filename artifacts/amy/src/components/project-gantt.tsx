import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjectPhases,
  useCreateProjectPhase,
  useUpdateProjectPhase,
  useDeleteProjectPhase,
  getListProjectPhasesQueryKey,
  type ProjectPhase,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDate, todayLocalISO } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  planned: "予定",
  in_progress: "進行中",
  done: "完了",
};
const STATUS_CLR: Record<string, string> = {
  planned: "bg-slate-400",
  in_progress: "bg-primary",
  done: "bg-emerald-600",
};

const PRESETS = [
  "解体",
  "墨出し",
  "下地",
  "造作",
  "電気",
  "設備",
  "クロス",
  "塗装",
  "床仕上げ",
  "クリーニング",
  "引渡し",
];

function dateOnly(s: string): Date {
  return new Date(s.slice(0, 10) + "T00:00:00");
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmtMonthDay(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function makeEmptyForm() {
  const today = todayLocalISO();
  return {
    name: "",
    startDate: today,
    endDate: today,
    status: "planned" as "planned" | "in_progress" | "done",
    notes: "",
  };
}

export function ProjectGantt({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const phasesQ = useListProjectPhases(projectId, {
    query: { queryKey: getListProjectPhasesQueryKey(projectId) },
  });
  const createMut = useCreateProjectPhase();
  const updateMut = useUpdateProjectPhase();
  const deleteMut = useDeleteProjectPhase();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectPhase | null>(null);
  const [form, setForm] = useState(makeEmptyForm);

  const phases = phasesQ.data ?? [];

  const range = useMemo(() => {
    if (phases.length === 0) {
      const today = new Date();
      return { min: today, max: addDays(today, 30), totalDays: 30 };
    }
    let min = dateOnly(phases[0].startDate);
    let max = dateOnly(phases[0].endDate);
    for (const p of phases) {
      const s = dateOnly(p.startDate);
      const e = dateOnly(p.endDate);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    min = addDays(min, -2);
    max = addDays(max, 2);
    return { min, max, totalDays: Math.max(1, diffDays(min, max)) };
  }, [phases]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset =
    today >= range.min && today <= range.max
      ? (diffDays(range.min, today) / range.totalDays) * 100
      : null;

  const monthMarkers = useMemo(() => {
    const markers: { date: Date; offset: number }[] = [];
    const cursor = new Date(range.min);
    cursor.setDate(1);
    while (cursor <= range.max) {
      const off = (diffDays(range.min, cursor) / range.totalDays) * 100;
      if (off >= 0 && off <= 100) markers.push({ date: new Date(cursor), offset: off });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return markers;
  }, [range]);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: getListProjectPhasesQueryKey(projectId),
    });

  const openNew = () => {
    setEditing(null);
    setForm(makeEmptyForm());
    setOpen(true);
  };
  const openEdit = (p: ProjectPhase) => {
    setEditing(p);
    setForm({
      name: p.name,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      notes: p.notes ?? "",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name || !form.startDate || !form.endDate) {
      toast({ title: "工程名・開始日・終了日は必須です", variant: "destructive" });
      return;
    }
    if (form.endDate < form.startDate) {
      toast({ title: "終了日は開始日以降にしてください", variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          data: {
            name: form.name,
            startDate: form.startDate,
            endDate: form.endDate,
            status: form.status,
            notes: form.notes || null,
          },
        });
      } else {
        await createMut.mutateAsync({
          projectId,
          data: {
            name: form.name,
            startDate: form.startDate,
            endDate: form.endDate,
            status: form.status,
            notes: form.notes || null,
          },
        });
      }
      await refresh();
      toast({ title: editing ? "工程を更新しました" : "工程を追加しました" });
      setOpen(false);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この工程を削除しますか?")) return;
    try {
      await deleteMut.mutateAsync({ id });
      await refresh();
      toast({ title: "削除しました" });
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">工程表</CardTitle>
          <CardDescription>工程の期間と進捗をガントチャートで管理します。</CardDescription>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          工程を追加
        </Button>
      </CardHeader>
      <CardContent>
        {phases.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              工程がまだ登録されていません。
            </p>
            <p className="text-xs text-muted-foreground">
              例: {PRESETS.slice(0, 6).join(" / ")} ...
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* timeline header */}
            <div className="flex pb-2 border-b">
              <div className="w-56 flex-shrink-0 text-xs font-medium text-muted-foreground">
                工程
              </div>
              <div className="flex-1 relative h-6">
                {monthMarkers.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 text-[10px] text-muted-foreground border-l border-muted h-full pl-1"
                    style={{ left: `${m.offset}%` }}
                  >
                    {m.date.getMonth() + 1}月
                  </div>
                ))}
              </div>
            </div>
            {/* rows */}
            {phases.map((p) => {
              const s = dateOnly(p.startDate);
              const e = dateOnly(p.endDate);
              const left = (diffDays(range.min, s) / range.totalDays) * 100;
              const width = Math.max(
                ((diffDays(s, e) + 1) / range.totalDays) * 100,
                1.5,
              );
              const days = diffDays(s, e) + 1;
              return (
                <div
                  key={p.id}
                  className="flex items-center group hover:bg-muted/40 -mx-2 px-2 rounded"
                >
                  <div className="w-56 flex-shrink-0 py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {p.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0">
                        {STATUS_LABEL[p.status]}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtMonthDay(s)}–{fmtMonthDay(e)} ({days}日)
                    </div>
                  </div>
                  <div className="flex-1 relative h-10">
                    {todayOffset != null && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-destructive/60 z-10"
                        style={{ left: `${todayOffset}%` }}
                        title="今日"
                      />
                    )}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-6 rounded ${STATUS_CLR[p.status]} text-white text-[10px] flex items-center px-2 shadow-sm`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${p.name}: ${formatDate(p.startDate)} 〜 ${formatDate(p.endDate)}`}
                    >
                      <span className="truncate">{p.name}</span>
                    </div>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-0.5 bg-background/95 rounded shadow-sm">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {todayOffset != null && (
              <div className="flex items-center pt-3 border-t mt-3 text-xs text-muted-foreground">
                <div className="w-56" />
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-px bg-destructive" />
                  今日 ({fmtMonthDay(today)})
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "工程を編集" : "工程を追加"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="phName">工程名 *</Label>
              <Input
                id="phName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例: 解体, 下地, クロス..."
                list="phase-presets"
              />
              <datalist id="phase-presets">
                {PRESETS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phStart">開始日 *</Label>
                <Input
                  id="phStart"
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="phEnd">終了日 *</Label>
                <Input
                  id="phEnd"
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>状態</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    status: v as "planned" | "in_progress" | "done",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">予定</SelectItem>
                  <SelectItem value="in_progress">進行中</SelectItem>
                  <SelectItem value="done">完了</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="phNotes">備考</Label>
              <Input
                id="phNotes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={submit}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {editing ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
