import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjectPhases,
  useCreateProjectPhase,
  useUpdateProjectPhase,
  useDeleteProjectPhase,
  useListStaff,
  useGetProject,
  getListProjectPhasesQueryKey,
  getGetProjectQueryKey,
  type ProjectPhase,
} from "@workspace/api-client-react";
import { isProjectHoliday, japaneseHolidayName } from "@workspace/print-html";
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
import { FileDown, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDate, todayLocalISO } from "@/lib/format";
import {
  openAuthenticatedPrintWindow,
  shareAuthenticatedPrintPdf,
} from "@/lib/print";

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
  "搬出",
  "大工",
  "左官",
  "塗装",
  "電気",
  "設備",
  "ガス",
  "UB",
  "クロス",
  "床",
  "キッチン",
  "仕上げ",
  "雑工",
  "美装",
  "是正工事",
  "リペア",
  "材料",
  "その他",
];
const CUSTOM = "__custom__";

const DAY_PX = 28; // base day width
const ROW_H = "h-14";
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
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function fmtMonthDay(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const NO_STAFF = "__none__";

function makeEmptyForm() {
  const today = todayLocalISO();
  return {
    name: "",
    nameSelect: PRESETS[0],
    customMode: false,
    startDate: today,
    endDate: toISO(addDays(dateOnly(today), 1)),
    status: "planned" as "planned" | "in_progress" | "done",
    staffId: NO_STAFF,
    notes: "",
  };
}

type DragState =
  | { kind: "move"; id: string; startX: number; startDate: string; endDate: string }
  | { kind: "resize-l"; id: string; startX: number; startDate: string; endDate: string }
  | { kind: "resize-r"; id: string; startX: number; startDate: string; endDate: string }
  | null;

export function ProjectGantt({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const phasesQ = useListProjectPhases(projectId, {
    query: { queryKey: getListProjectPhasesQueryKey(projectId) },
  });
  const createMut = useCreateProjectPhase();
  const updateMut = useUpdateProjectPhase();
  const deleteMut = useDeleteProjectPhase();
  const staffQ = useListStaff();
  const allStaff = staffQ.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectPhase | null>(null);
  const [form, setForm] = useState(makeEmptyForm);
  const [drag, setDrag] = useState<DragState>(null);
  const [orderDragId, setOrderDragId] = useState<string | null>(null);
  // optimistic overrides (id -> {startDate,endDate})
  const [override, setOverride] = useState<Record<string, { s: string; e: string }>>(
    {},
  );
  const dragRef = useRef<DragState>(null);
  const overrideRef = useRef<Record<string, { s: string; e: string }>>({});
  const committingRef = useRef<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const projectQ = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId) },
  });
  const project = projectQ.data;
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);
  useEffect(() => {
    overrideRef.current = override;
  }, [override]);

  const phases = phasesQ.data ?? [];

  const range = useMemo(() => {
    if (phases.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
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
    min = addDays(min, -3);
    max = addDays(max, 3);
    return { min, max, totalDays: Math.max(1, diffDays(min, max)) };
  }, [phases]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayOffset =
    today >= range.min && today <= range.max
      ? diffDays(range.min, today) * DAY_PX
      : null;

  const dayMarkers = useMemo(() => {
    const arr: { date: Date; isMonthStart: boolean }[] = [];
    for (let i = 0; i <= range.totalDays; i++) {
      const d = addDays(range.min, i);
      arr.push({ date: d, isMonthStart: d.getDate() === 1 });
    }
    return arr;
  }, [range]);

  // pointer drag handling — listeners are stable; read latest via refs to avoid races
  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const days = Math.round(dx / DAY_PX);
      if (days === 0) {
        setOverride((prev) => {
          if (!prev[d.id]) return prev;
          const { [d.id]: _, ...rest } = prev;
          return rest;
        });
        return;
      }
      const s0 = dateOnly(d.startDate);
      const e0 = dateOnly(d.endDate);
      let ns = s0;
      let ne = e0;
      if (d.kind === "move") {
        ns = addDays(s0, days);
        ne = addDays(e0, days);
      } else if (d.kind === "resize-l") {
        ns = addDays(s0, days);
        if (ns > e0) ns = e0;
      } else if (d.kind === "resize-r") {
        ne = addDays(e0, days);
        if (ne < s0) ne = s0;
      }
      setOverride((prev) => ({
        ...prev,
        [d.id]: { s: toISO(ns), e: toISO(ne) },
      }));
    };
    const onUp = async () => {
      const d = dragRef.current;
      if (!d) return;
      const id = d.id;
      const kind = d.kind;
      // Guard against duplicate commits (pointerup + pointercancel)
      if (committingRef.current.has(id)) {
        setDrag(null);
        return;
      }
      committingRef.current.add(id);
      setDrag(null);
      const ov = overrideRef.current[id];
      if (!ov) {
        committingRef.current.delete(id);
        return;
      }
      const patch: { startDate?: string; endDate?: string } = {};
      if (kind === "move" || kind === "resize-l") patch.startDate = ov.s;
      if (kind === "move" || kind === "resize-r") patch.endDate = ov.e;
      try {
        await updateMut.mutateAsync({ id, data: patch });
        await queryClient.invalidateQueries({
          queryKey: getListProjectPhasesQueryKey(projectId),
        });
        toast({ title: "工程を更新しました" });
      } catch (err) {
        toast({ title: apiErrorMessage(err), variant: "destructive" });
      } finally {
        setOverride((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
        committingRef.current.delete(id);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [projectId, queryClient, toast, updateMut]);

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
    const isPreset = PRESETS.includes(p.name);
    setForm({
      name: p.name,
      nameSelect: isPreset ? p.name : CUSTOM,
      customMode: !isPreset,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      staffId: p.staffId ?? NO_STAFF,
      notes: p.notes ?? "",
    });
    setOpen(true);
  };

  const submit = async () => {
    const finalName = form.customMode ? form.name.trim() : form.nameSelect;
    if (!finalName) {
      toast({ title: "工程名を入力してください", variant: "destructive" });
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast({ title: "開始日・終了日は必須です", variant: "destructive" });
      return;
    }
    if (form.endDate <= form.startDate) {
      toast({ title: "終了日は開始日より後の日付にしてください", variant: "destructive" });
      return;
    }
    const staffIdVal = form.staffId === NO_STAFF ? null : form.staffId;
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          data: {
            name: finalName,
            startDate: form.startDate,
            endDate: form.endDate,
            status: form.status,
            staffId: staffIdVal,
            notes: form.notes || null,
          },
        });
      } else {
        await createMut.mutateAsync({
          projectId,
          data: {
            name: finalName,
            startDate: form.startDate,
            endDate: form.endDate,
            status: form.status,
            staffId: staffIdVal,
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

  const handleExportPdf = async () => {
    if (phases.length === 0) {
      toast({ title: "工程が登録されていません", variant: "destructive" });
      return;
    }
    const safeProjectName = (project?.name || "project").replace(
      /[\\/:*?"<>|]/g,
      "_",
    );
    const printUrl = `/api/print/gantt/${projectId}`;
    const fileName = `工程表_${safeProjectName}.pdf`;
    const userAgent = navigator.userAgent;
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/i.test(userAgent));

    try {
      if (isMobileBrowser) {
        // Mobile browsers should share the generated PDF file, not the
        // authenticated HTML endpoint URL.
        await shareAuthenticatedPrintPdf({
          url: printUrl,
          fileName,
        });
      } else {
        // Desktop keeps the browser print dialog workflow.
        await openAuthenticatedPrintWindow({
          url: `${printUrl}?autoprint=1`,
          fileName,
        });
      }
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

  const reorderPhases = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = phases.findIndex((phase) => phase.id === sourceId);
    const targetIndex = phases.findIndex((phase) => phase.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const next = [...phases];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    try {
      await Promise.all(
        next.map((phase, sortOrder) =>
          updateMut.mutateAsync({
            id: phase.id,
            data: { sortOrder },
          }),
        ),
      );
      await refresh();
    } catch (err) {
      toast({ title: "工程の並べ替えに失敗しました", variant: "destructive" });
    } finally {
      setOrderDragId(null);
    }
  };

  const startDrag = (
    e: React.PointerEvent,
    kind: "move" | "resize-l" | "resize-r",
    p: ProjectPhase,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      kind,
      id: p.id,
      startX: e.clientX,
      startDate: p.startDate,
      endDate: p.endDate,
    });
  };

  return (
    <>
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">工程表</CardTitle>
          <CardDescription>
              左のハンドルをドラッグで工程順を変更できます。工程バーをドラッグで移動、
              左右の端をドラッグで日数変更ができます。
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={phases.length === 0}
            className="gap-2"
            data-testid="button-export-gantt-pdf"
          >
            <FileDown className="w-4 h-4" />
            PDF出力
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            工程を追加
          </Button>
        </div>
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
          <div className="hidden sm:flex border rounded-md overflow-hidden">
            {/* fixed left column (desktop / wide screens only — see the
                sm:hidden block below for the narrow-screen layout, where a
                fixed-width name column would squeeze the Gantt chart) */}
            <div className="w-72 flex-shrink-0 border-r bg-card">
              <div className="h-12 border-b bg-muted/30 flex items-end px-3 pb-1.5 text-xs font-semibold text-muted-foreground">
                工程
              </div>
              {phases.map((p) => {
                const ov = override[p.id];
                const sIso = ov?.s ?? p.startDate;
                const eIso = ov?.e ?? p.endDate;
                const days = diffDays(dateOnly(sIso), dateOnly(eIso)) + 1;
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", p.id);
                      setOrderDragId(p.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId =
                        event.dataTransfer.getData("text/plain") || orderDragId;
                      if (sourceId) void reorderPhases(sourceId, p.id);
                    }}
                    onDragEnd={() => setOrderDragId(null)}
                    className={`${ROW_H} border-b flex flex-col justify-center px-2 group cursor-grab active:cursor-grabbing ${orderDragId === p.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <GripVertical
                        className="w-4 h-4 mt-0.5 text-muted-foreground/70 shrink-0"
                        aria-label="工程の順番を変更"
                      />
                      <span className="font-medium text-sm leading-tight max-h-8 overflow-hidden break-words min-w-0 flex-1">
                        {p.name}
                        {p.staffName && (
                          <span className="ml-1 text-xs text-muted-foreground font-normal">
                            ({p.staffName})
                          </span>
                        )}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                        {STATUS_LABEL[p.status]}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {fmtMonthDay(dateOnly(sIso))}–{fmtMonthDay(dateOnly(eIso))} (
                      {days}日)
                    </div>
                  </div>
                );
              })}
            </div>

            {/* timeline scroll area */}
            <div ref={timelineRef} className="flex-1 overflow-x-auto">
              <div
                className="relative"
                style={{ width: (range.totalDays + 1) * DAY_PX }}
              >
                {/* day header */}
                <div className={`${ROW_H} border-b bg-muted/30 relative`}>
                  {dayMarkers.map((m, i) => {
                    const left = i * DAY_PX;
                    const isHoliday = isProjectHoliday(
                      m.date,
                      project?.saturdayWork ?? true,
                    );
                    return (
                      <div
                        key={i}
                        className={`absolute top-0 bottom-0 border-l ${m.isMonthStart ? "border-foreground/30" : "border-border/40"} ${isHoliday ? "bg-rose-100/80" : ""}`}
                        style={{ left, width: DAY_PX }}
                      >
                        {m.isMonthStart && (
                          <div className="absolute top-1 left-1 text-[10px] font-semibold text-foreground/70 whitespace-nowrap">
                            {m.date.getMonth() + 1}月
                          </div>
                        )}
                        <div
                          className={`absolute bottom-1 left-0 right-0 text-center text-[10px] tabular-nums ${isHoliday ? "text-rose-700 font-semibold" : "text-muted-foreground"}`}
                          title={japaneseHolidayName(m.date) ?? undefined}
                        >
                          {m.date.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* rows */}
                {phases.map((p) => {
                  const ov = override[p.id];
                  const sIso = ov?.s ?? p.startDate;
                  const eIso = ov?.e ?? p.endDate;
                  const s = dateOnly(sIso);
                  const e = dateOnly(eIso);
                  const left = diffDays(range.min, s) * DAY_PX;
                  const width = (diffDays(s, e) + 1) * DAY_PX;
                  const dragging = drag?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`${ROW_H} border-b relative group`}
                    >
                      {/* day grid stripes */}
                      {dayMarkers.map((m, i) => {
                        const isHoliday = isProjectHoliday(
                          m.date,
                          project?.saturdayWork ?? true,
                        );
                        return (
                          <div
                            key={i}
                            className={`absolute top-0 bottom-0 border-l ${m.isMonthStart ? "border-foreground/20" : "border-border/30"} ${isHoliday ? "bg-rose-100/70" : ""}`}
                            style={{ left: i * DAY_PX, width: DAY_PX }}
                          />
                        );
                      })}
                      {todayOffset != null && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-destructive/70 z-10 pointer-events-none"
                          style={{ left: todayOffset }}
                        />
                      )}
                      {/* the bar */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 h-8 rounded ${STATUS_CLR[p.status]} text-white text-xs flex items-center shadow-sm select-none border border-black/20 ${dragging ? "ring-2 ring-primary opacity-90" : ""}`}
                        style={{ left, width: Math.max(width, 12) }}
                        title={`${p.name}: ${formatDate(sIso)} 〜 ${formatDate(eIso)}`}
                      >
                        {/* left handle */}
                        <div
                          className="w-2 h-full cursor-ew-resize rounded-l hover:bg-white/30 flex-shrink-0"
                          onPointerDown={(ev) => startDrag(ev, "resize-l", p)}
                        />
                        {/* body */}
                        <div
                           className="flex-1 px-1 truncate cursor-grab active:cursor-grabbing"
                          onPointerDown={(ev) => startDrag(ev, "move", p)}
                          onDoubleClick={() => openEdit(p)}
                        >
                          {p.name}
                        </div>
                        {/* right handle */}
                        <div
                          className="w-2 h-full cursor-ew-resize rounded-r hover:bg-white/30 flex-shrink-0"
                          onPointerDown={(ev) => startDrag(ev, "resize-r", p)}
                        />
                      </div>
                      {/* hover actions */}
                      <div
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-0.5 bg-background/95 rounded shadow-sm border z-20"
                        style={{ left: Math.max(left + width + 6, 0) }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(p.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {/* Narrow screens (phone portrait): the fixed name column above ate
            too much of the viewport width and squeezed the Gantt chart down
            to almost nothing. Here the chart gets the full width; each
            phase's name is shown as a small pinned label directly above its
            bar instead of in a side column, so it stays readable without
            shrinking the timeline. */}
        {phases.length > 0 && (
          <div className="sm:hidden border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <div
                className="relative"
                style={{ width: (range.totalDays + 1) * DAY_PX }}
              >
                {/* day header */}
                <div className={`${ROW_H} border-b bg-muted/30 relative`}>
                  {dayMarkers.map((m, i) => {
                    const left = i * DAY_PX;
                    const isHoliday = isProjectHoliday(
                      m.date,
                      project?.saturdayWork ?? true,
                    );
                    return (
                      <div
                        key={i}
                        className={`absolute top-0 bottom-0 border-l ${m.isMonthStart ? "border-foreground/30" : "border-border/40"} ${isHoliday ? "bg-rose-100/80" : ""}`}
                        style={{ left, width: DAY_PX }}
                      >
                        {m.isMonthStart && (
                          <div className="absolute top-1 left-1 text-[10px] font-semibold text-foreground/70 whitespace-nowrap">
                            {m.date.getMonth() + 1}月
                          </div>
                        )}
                        <div
                          className={`absolute bottom-1 left-0 right-0 text-center text-[10px] tabular-nums ${isHoliday ? "text-rose-700 font-semibold" : "text-muted-foreground"}`}
                          title={japaneseHolidayName(m.date) ?? undefined}
                        >
                          {m.date.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* phases: name label row + bar row, stacked */}
                {phases.map((p) => {
                  const ov = override[p.id];
                  const sIso = ov?.s ?? p.startDate;
                  const eIso = ov?.e ?? p.endDate;
                  const s = dateOnly(sIso);
                  const e = dateOnly(eIso);
                  const left = diffDays(range.min, s) * DAY_PX;
                  const width = (diffDays(s, e) + 1) * DAY_PX;
                  const dragging = drag?.id === p.id;
                  return (
                    <div key={p.id}>
                      {/* name row — draggable for reordering, like the
                          desktop side column. The label itself is sticky
                          so it stays visible while the row scrolls
                          horizontally with the timeline. */}
                      <div
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", p.id);
                          setOrderDragId(p.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceId =
                            event.dataTransfer.getData("text/plain") || orderDragId;
                          if (sourceId) void reorderPhases(sourceId, p.id);
                        }}
                        onDragEnd={() => setOrderDragId(null)}
                        className={`h-9 border-b bg-muted/20 flex items-center ${orderDragId === p.id ? "opacity-50" : ""}`}
                      >
                        <div className="sticky left-0 z-10 flex items-center gap-1 max-w-[80vw] bg-card/95 backdrop-blur-sm pl-1 pr-1 py-0.5 rounded-r border-r border-border/60 cursor-grab active:cursor-grabbing">
                          <GripVertical
                            className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0"
                            aria-label="工程の順番を変更"
                          />
                          <span className="text-xs font-medium leading-tight truncate min-w-0">
                            {p.name}
                            {p.staffName && (
                              <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                                ({p.staffName})
                              </span>
                            )}
                          </span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                            {STATUS_LABEL[p.status]}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0"
                            onClick={() => openEdit(p)}
                            aria-label="工程を編集"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(p.id)}
                            aria-label="工程を削除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {/* bar row */}
                      <div className={`${ROW_H} border-b relative`}>
                        {dayMarkers.map((m, i) => {
                          const isHoliday = isProjectHoliday(
                            m.date,
                            project?.saturdayWork ?? true,
                          );
                          return (
                            <div
                              key={i}
                              className={`absolute top-0 bottom-0 border-l ${m.isMonthStart ? "border-foreground/20" : "border-border/30"} ${isHoliday ? "bg-rose-100/70" : ""}`}
                              style={{ left: i * DAY_PX, width: DAY_PX }}
                            />
                          );
                        })}
                        {todayOffset != null && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-destructive/70 z-10 pointer-events-none"
                            style={{ left: todayOffset }}
                          />
                        )}
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-8 rounded ${STATUS_CLR[p.status]} text-white text-xs flex items-center shadow-sm select-none border border-black/20 ${dragging ? "ring-2 ring-primary opacity-90" : ""}`}
                          style={{ left, width: Math.max(width, 12) }}
                          title={`${p.name}: ${formatDate(sIso)} 〜 ${formatDate(eIso)}`}
                        >
                          <div
                            className="w-2 h-full cursor-ew-resize rounded-l hover:bg-white/30 flex-shrink-0"
                            onPointerDown={(ev) => startDrag(ev, "resize-l", p)}
                          />
                          <div
                            className="flex-1 px-1 truncate cursor-grab active:cursor-grabbing"
                            onPointerDown={(ev) => startDrag(ev, "move", p)}
                            onDoubleClick={() => openEdit(p)}
                          >
                            {p.name}
                          </div>
                          <div
                            className="w-2 h-full cursor-ew-resize rounded-r hover:bg-white/30 flex-shrink-0"
                            onPointerDown={(ev) => startDrag(ev, "resize-r", p)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-slate-400" />予定
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary" />進行中
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-600" />完了
          </div>
          {todayOffset != null && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-px bg-destructive" />今日
            </div>
          )}
          <div className="ml-auto text-[11px]">
            ヒント: バーをドラッグで移動 / 端をドラッグで日数変更 / ダブルクリックで編集
          </div>
        </div>
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
              <Label>工事項目 *</Label>
              <Select
                value={form.nameSelect}
                onValueChange={(v) => {
                  if (v === CUSTOM) {
                    setForm({ ...form, nameSelect: v, customMode: true, name: form.name });
                  } else {
                    setForm({ ...form, nameSelect: v, customMode: false, name: v });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>その他（自由入力）</SelectItem>
                </SelectContent>
              </Select>
              {form.customMode && (
                <Input
                  className="mt-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="工事項目名を入力"
                  autoFocus
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phStart">開始日 *</Label>
                <Input
                  id="phStart"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => {
                    const startDate = e.target.value;
                    setForm({
                      ...form,
                      startDate,
                      endDate:
                        form.endDate <= startDate
                          ? toISO(addDays(dateOnly(startDate), 1))
                          : form.endDate,
                    });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="phEnd">完了日 *</Label>
                <Input
                  id="phEnd"
                  type="date"
                  value={form.endDate}
                  min={
                    form.startDate
                      ? toISO(addDays(dateOnly(form.startDate), 1))
                      : undefined
                  }
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
              <Label>担当職人</Label>
              <Select
                value={form.staffId}
                onValueChange={(v) => setForm({ ...form, staffId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="未割当" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STAFF}>未割当</SelectItem>
                  {allStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
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
    </>
  );
}
