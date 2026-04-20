import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListScheduleEntries,
  useCreateScheduleEntry,
  useDeleteScheduleEntry,
  useListProjects,
  useListStaff,
  getListScheduleEntriesQueryKey,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { Plus, CalendarDays, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const empty = {
  projectId: "",
  staffId: "",
  date: "",
  task: "",
  startTime: "",
  endTime: "",
  notes: "",
};

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const from = toISO(weekStart);
  const to = toISO(addDays(weekStart, 6));

  const { data, isLoading } = useListScheduleEntries({ from, to });
  const projectsQ = useListProjects();
  const staffQ = useListStaff();
  const createMut = useCreateScheduleEntry();
  const deleteMut = useDeleteScheduleEntry();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId || !form.staffId || !form.date || !form.task) {
      toast({ title: "案件・職人・日付・作業内容は必須です", variant: "destructive" });
      return;
    }
    try {
      await createMut.mutateAsync({
        data: {
          projectId: form.projectId,
          staffId: form.staffId,
          date: form.date,
          task: form.task,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          notes: form.notes || null,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListScheduleEntriesQueryKey({ from, to }),
      });
      toast({ title: "予定を追加しました" });
      setOpen(false);
      setForm(empty);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMut.mutateAsync({ id });
      await queryClient.invalidateQueries({
        queryKey: getListScheduleEntriesQueryKey({ from, to }),
      });
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const entries = data ?? [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">スケジュール</h1>
          <p className="text-sm text-muted-foreground mt-1">
            職人と現場の割り当てを週単位で確認します。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            前週
          </Button>
          <Button
            variant="outline"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            今週
          </Button>
          <Button
            variant="outline"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            翌週
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                予定を追加
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>予定を追加</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label>案件 *</Label>
                  <Select
                    value={form.projectId}
                    onValueChange={(v) => setForm({ ...form, projectId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="案件を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {(projectsQ.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>職人 *</Label>
                  <Select
                    value={form.staffId}
                    onValueChange={(v) => setForm({ ...form, staffId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="職人を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {(staffQ.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="sd">日付 *</Label>
                  <Input
                    id="sd"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="task">作業内容 *</Label>
                  <Input
                    id="task"
                    value={form.task}
                    onChange={(e) => setForm({ ...form, task: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="st">開始時刻</Label>
                    <Input
                      id="st"
                      type="time"
                      value={form.startTime}
                      onChange={(e) =>
                        setForm({ ...form, startTime: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="et">終了時刻</Label>
                    <Input
                      id="et"
                      type="time"
                      value={form.endTime}
                      onChange={(e) =>
                        setForm({ ...form, endTime: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="snotes">備考</Label>
                  <Textarea
                    id="snotes"
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                    rows={2}
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
                  <Button type="submit">追加</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {formatDate(from)} 〜 {formatDate(to)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="grid grid-cols-7 gap-3">
              {days.map((d) => {
                const iso = toISO(d);
                const dayEntries = entries.filter((e) => e.date === iso);
                const isToday = iso === toISO(new Date());
                return (
                  <div
                    key={iso}
                    className={`border rounded-md p-3 min-h-[200px] ${isToday ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      {["月", "火", "水", "木", "金", "土", "日"][
                        (d.getDay() + 6) % 7
                      ]}{" "}
                      {d.getMonth() + 1}/{d.getDate()}
                    </div>
                    <div className="space-y-2">
                      {dayEntries.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-2">-</div>
                      ) : (
                        dayEntries.map((e) => (
                          <div
                            key={e.id}
                            className="border rounded p-2 bg-card text-xs space-y-1 group"
                          >
                            <div className="flex items-start justify-between">
                              <Badge variant="outline" className="text-xs">
                                {e.staffName}
                              </Badge>
                              <button
                                onClick={() => handleDelete(e.id)}
                                className="opacity-0 group-hover:opacity-100 text-destructive"
                                aria-label="削除"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="font-medium">{e.task}</div>
                            <div className="text-muted-foreground truncate">
                              {e.projectName}
                            </div>
                            {(e.startTime || e.endTime) && (
                              <div className="text-muted-foreground">
                                {e.startTime ?? ""}
                                {e.endTime ? `-${e.endTime}` : ""}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {entries.length === 0 && !isLoading && (
            <div className="py-8 flex flex-col items-center text-center gap-2">
              <CalendarDays className="w-8 h-8 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                この週の予定はありません
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
