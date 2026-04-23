import { useMemo, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { Plus, Trash2 } from "lucide-react";
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

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

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

  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const entries = data ?? [];
  const allStaff = staffQ.data ?? [];

  // Group entries by staffId × date
  const cellMap = useMemo(() => {
    const m = new Map<string, typeof entries>();
    entries.forEach((e) => {
      const k = `${e.staffId}|${e.date}`;
      const arr = m.get(k);
      if (arr) arr.push(e);
      else m.set(k, [e]);
    });
    return m;
  }, [entries]);

  // Show all staff; sort by role+name. If staff list is large, this gives a full
  // overview of who is/isn't booked.
  const visibleStaff = useMemo(
    () =>
      [...allStaff].sort((a, b) =>
        (a.role + a.name).localeCompare(b.role + b.name, "ja"),
      ),
    [allStaff],
  );

  const openAddFor = (staffId: string, date: string) => {
    setForm({ ...empty, staffId, date });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId || !form.staffId || !form.date || !form.task) {
      toast({
        title: "案件・職人・日付・作業内容は必須です",
        variant: "destructive",
      });
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
      await invalidateDashboard(queryClient);
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

  const todayISO = toISO(new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">工程表</h1>
          <p className="text-sm text-muted-foreground mt-1">
            職人ごとに横並びで週単位の現場割当を確認できます。
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
              <Button className="gap-2" onClick={() => setForm(empty)}>
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
                      {allStaff.map((s) => (
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

      {isLoading || staffQ.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : visibleStaff.length === 0 ? (
        <div className="border rounded-md py-16 text-center text-sm text-muted-foreground">
          職人を登録すると工程表に表示されます。
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* Header: day columns */}
            <div className="grid grid-cols-[180px_repeat(7,minmax(140px,1fr))] bg-muted/40 border-b sticky top-0 z-10">
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-r">
                職人 / 業種
              </div>
              {days.map((d) => {
                const iso = toISO(d);
                const isToday = iso === todayISO;
                const dow = (d.getDay() + 6) % 7;
                return (
                  <div
                    key={iso}
                    className={`px-3 py-2 text-xs font-semibold text-center border-r last:border-r-0 ${
                      isToday ? "bg-primary/10 text-primary" : ""
                    } ${dow === 5 ? "text-blue-600" : ""} ${dow === 6 ? "text-red-600" : ""}`}
                  >
                    <div>{DAY_LABELS[dow]}</div>
                    <div className="tabular-nums">
                      {d.getMonth() + 1}/{d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Body: one row per staff */}
            {visibleStaff.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[180px_repeat(7,minmax(140px,1fr))] border-b last:border-b-0 hover:bg-accent/5"
              >
                <div className="px-3 py-3 border-r bg-muted/20 sticky left-0 z-[1]">
                  <div className="font-semibold text-sm leading-tight">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {s.role}
                  </div>
                </div>
                {days.map((d) => {
                  const iso = toISO(d);
                  const isToday = iso === todayISO;
                  const dow = (d.getDay() + 6) % 7;
                  const isWeekend = dow === 5 || dow === 6;
                  const cellEntries = cellMap.get(`${s.id}|${iso}`) ?? [];
                  return (
                    <div
                      key={iso}
                      onClick={(e) => {
                        // Click empty area to add (ignore clicks on entries)
                        if (e.target === e.currentTarget) openAddFor(s.id, iso);
                      }}
                      className={`min-h-[110px] p-1.5 border-r last:border-r-0 group relative cursor-pointer ${
                        isToday
                          ? "bg-primary/5"
                          : isWeekend
                            ? "bg-muted/10"
                            : ""
                      } hover:bg-accent/10`}
                    >
                      <div className="space-y-1 pointer-events-none">
                        {cellEntries.map((e) => (
                          <div
                            key={e.id}
                            className="rounded border bg-card px-2 py-1.5 text-[11px] leading-snug shadow-sm relative pointer-events-auto"
                          >
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDelete(e.id);
                              }}
                              className="absolute top-0.5 right-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1"
                              aria-label="削除"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <div className="font-semibold pr-5 truncate">
                              {e.task}
                            </div>
                            <div className="text-muted-foreground truncate pr-5">
                              {e.projectName}
                            </div>
                            {(e.startTime || e.endTime) && (
                              <div className="text-muted-foreground tabular-nums">
                                {e.startTime ?? ""}
                                {e.endTime ? `-${e.endTime}` : ""}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {cellEntries.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Plus className="w-4 h-4" />
                            追加
                          </div>
                        </div>
                      )}
                      {cellEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openAddFor(s.id, iso);
                          }}
                          className="mt-1 w-full text-[10px] text-muted-foreground hover:text-primary border border-dashed border-muted-foreground/30 rounded py-0.5 flex items-center justify-center gap-1 hover:bg-accent/20"
                          aria-label="この日にもう一件追加"
                        >
                          <Plus className="w-3 h-3" />
                          もう一件
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
