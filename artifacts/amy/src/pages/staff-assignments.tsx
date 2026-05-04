import { Fragment, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListStaffAssignments,
  useListScheduleEntries,
  useListAllProjectPhases,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, todayLocalISO, addDaysISO } from "@/lib/format";
import { HardHat, MapPin, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export default function StaffAssignmentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">職人 出面表</h1>
        <p className="text-sm text-muted-foreground mt-1">
          各職人がいつ・どの案件に入っているかを一覧で確認できます。
        </p>
      </div>

      <Tabs defaultValue="matrix" className="w-full">
        <TabsList>
          <TabsTrigger value="matrix">出面表 (日別)</TabsTrigger>
          <TabsTrigger value="list">案件一覧 (職人別)</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix" className="mt-4">
          <AttendanceMatrix />
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <AssignmentList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Matrix view ---------------- */

const PROJECT_COLORS = [
  "bg-blue-100 text-blue-900 border-blue-300",
  "bg-emerald-100 text-emerald-900 border-emerald-300",
  "bg-amber-100 text-amber-900 border-amber-300",
  "bg-purple-100 text-purple-900 border-purple-300",
  "bg-pink-100 text-pink-900 border-pink-300",
  "bg-cyan-100 text-cyan-900 border-cyan-300",
  "bg-orange-100 text-orange-900 border-orange-300",
  "bg-lime-100 text-lime-900 border-lime-300",
];

function AttendanceMatrix() {
  const [anchor, setAnchor] = useState<string>(todayLocalISO());
  const [days, setDays] = useState<number>(14);

  const from = anchor;
  const to = addDaysISO(anchor, days - 1);

  const dateList = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < days; i++) arr.push(addDaysISO(anchor, i));
    return arr;
  }, [anchor, days]);

  const staffQ = useListStaffAssignments({ from, to });
  const scheduleQ = useListScheduleEntries({ from, to });
  const phasesQ = useListAllProjectPhases();

  const staff = staffQ.data ?? [];
  const entries = scheduleQ.data ?? [];
  const allPhases = phasesQ.data ?? [];

  const toDateKey = (d: string | Date): string => {
    const s = typeof d === "object" ? (d as Date).toISOString() : String(d);
    return s.slice(0, 10);
  };

  // staffId -> date -> entries[]
  const grid = useMemo(() => {
    const m = new Map<string, Map<string, typeof entries>>();
    for (const e of entries) {
      const dk = toDateKey(e.date);
      if (!m.has(e.staffId)) m.set(e.staffId, new Map());
      const dm = m.get(e.staffId)!;
      if (!dm.has(dk)) dm.set(dk, []);
      dm.get(dk)!.push(e);
    }
    return m;
  }, [entries]);

  const projectColor = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) ids.add(e.projectId);
    for (const p of allPhases) ids.add(p.projectId);
    const map = new Map<string, string>();
    Array.from(ids).forEach((id, i) => map.set(id, PROJECT_COLORS[i % PROJECT_COLORS.length]));
    return map;
  }, [entries, allPhases]);

  const projectLegend = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (!map.has(e.projectId)) map.set(e.projectId, e.projectName);
    }
    for (const p of allPhases) {
      if (!map.has(p.projectId)) map.set(p.projectId, p.projectName);
    }
    return Array.from(map.entries());
  }, [entries, allPhases]);

  // Per-staff days-on counts for selected range
  const staffDayCount = useMemo(() => {
    const unique = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!unique.has(e.staffId)) unique.set(e.staffId, new Set());
      unique.get(e.staffId)!.add(toDateKey(e.date));
    }
    return new Map(Array.from(unique.entries()).map(([k, v]) => [k, v.size]));
  }, [entries]);

  const projectPhaseGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        phases: typeof allPhases;
      }
    >();
    for (const p of allPhases) {
      if (!groups.has(p.projectId)) {
        groups.set(p.projectId, {
          projectId: p.projectId,
          projectName: p.projectName,
          phases: [],
        });
      }
      groups.get(p.projectId)!.phases.push(p);
    }
    return Array.from(groups.values());
  }, [allPhases]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="anchor" className="text-xs">開始日</Label>
              <Input
                id="anchor"
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <Label htmlFor="days" className="text-xs">表示日数</Label>
              <select
                id="days"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="block h-9 w-24 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={7}>7日</option>
                <option value={14}>14日</option>
                <option value={21}>21日</option>
                <option value={30}>30日</option>
              </select>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAnchor(addDaysISO(anchor, -days))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setAnchor(todayLocalISO())}
              >
                今日
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAnchor(addDaysISO(anchor, days))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {projectLegend.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <span className="text-muted-foreground font-medium">案件:</span>
              {projectLegend.map(([id, name]) => (
                <Link
                  key={id}
                  href={`/projects/${id}`}
                  className={`px-2 py-0.5 rounded border ${projectColor.get(id)} hover:opacity-80`}
                >
                  {name}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {staffQ.isLoading || scheduleQ.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : staff.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            職人が登録されていません。
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border rounded-sm overflow-x-auto bg-card">
          <table className="border-collapse text-xs tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-primary text-primary-foreground border border-border px-2 py-2 text-left w-44 min-w-44">
                  職人
                </th>
                <th className="bg-primary text-primary-foreground border border-border px-2 py-2 w-12 text-center">
                  稼働日
                </th>
                {dateList.map((d) => {
                  const dt = new Date(d + "T00:00:00");
                  const dow = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
                  const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                  const isToday = d === todayLocalISO();
                  return (
                    <th
                      key={d}
                      className={`border border-border px-1 py-1 w-20 min-w-20 text-center font-medium ${
                        isToday
                          ? "bg-accent text-accent-foreground"
                          : isWeekend
                          ? "bg-muted"
                          : "bg-muted/40"
                      }`}
                    >
                      <div className="text-[10px] leading-tight">
                        {dt.getMonth() + 1}/{dt.getDate()}
                      </div>
                      <div className="text-[10px] leading-tight">({dow})</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.staffId} className="hover:bg-muted/20">
                  <td className="sticky left-0 z-10 bg-card border border-border px-2 py-2">
                    <div className="flex items-center gap-1.5 font-medium text-sm">
                      <HardHat className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{s.staffName}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {s.role}
                      {s.company ? ` · ${s.company}` : ""}
                    </div>
                  </td>
                  <td className="border border-border text-center font-semibold">
                    {staffDayCount.get(s.staffId) ?? 0}
                  </td>
                  {dateList.map((d) => {
                    const cell = grid.get(s.staffId)?.get(d) ?? [];
                    const isWeekend = (() => {
                      const dt = new Date(d + "T00:00:00");
                      return dt.getDay() === 0 || dt.getDay() === 6;
                    })();
                    return (
                      <td
                        key={d}
                        className={`border border-border align-top p-0.5 ${
                          isWeekend ? "bg-muted/30" : ""
                        }`}
                      >
                        <div className="flex flex-col gap-0.5">
                          {cell.map((e) => (
                            <Link
                              key={e.id}
                              href={`/projects/${e.projectId}`}
                              className={`block text-[10px] px-1 py-0.5 rounded border truncate ${projectColor.get(
                                e.projectId,
                              )} hover:opacity-80`}
                              title={`${e.projectName} — ${e.task}${e.startTime ? ` (${e.startTime})` : ""}`}
                            >
                              {e.projectName}
                            </Link>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {phasesQ.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : projectPhaseGroups.length > 0 ? (
        <>
          <div className="pt-2">
            <h3 className="text-sm font-semibold text-foreground">全案件 工程スケジュール</h3>
            <p className="text-xs text-muted-foreground">各案件の工程と担当職人を一覧表示</p>
          </div>
          <div className="border border-border rounded-sm overflow-x-auto bg-card">
            <table className="border-collapse text-xs tabular-nums">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-primary text-primary-foreground border border-border px-2 py-2 text-left w-44 min-w-44">
                    案件 / 工程
                  </th>
                  <th className="bg-primary text-primary-foreground border border-border px-2 py-2 w-20 min-w-20 text-center">
                    担当
                  </th>
                  {dateList.map((d) => {
                    const dt = new Date(d + "T00:00:00");
                    const dow = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
                    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                    const isToday = d === todayLocalISO();
                    return (
                      <th
                        key={d}
                        className={`border border-border px-1 py-1 w-20 min-w-20 text-center font-medium ${
                          isToday
                            ? "bg-accent text-accent-foreground"
                            : isWeekend
                            ? "bg-muted"
                            : "bg-muted/40"
                        }`}
                      >
                        <div className="text-[10px] leading-tight">
                          {dt.getMonth() + 1}/{dt.getDate()}
                        </div>
                        <div className="text-[10px] leading-tight">({dow})</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {projectPhaseGroups.map((g) => (
                  <Fragment key={g.projectId}>
                    <tr className="bg-muted/60">
                      <td
                        colSpan={2 + dateList.length}
                        className="sticky left-0 z-10 border border-border px-2 py-1.5"
                      >
                        <Link
                          href={`/projects/${g.projectId}`}
                          className="font-semibold text-sm text-primary hover:underline"
                        >
                          {g.projectName}
                        </Link>
                      </td>
                    </tr>
                    {g.phases.map((p) => {
                      const sd = toDateKey(p.startDate);
                      const ed = toDateKey(p.endDate);
                      return (
                        <tr key={p.phaseId} className="hover:bg-muted/20">
                          <td className="sticky left-0 z-10 bg-card border border-border px-2 py-1.5 pl-6">
                            <span className="text-sm">{p.phaseName}</span>
                          </td>
                          <td className="border border-border text-center text-[10px] px-1">
                            {p.staffName ? (
                              <span className="text-primary font-medium">{p.staffName}</span>
                            ) : (
                              <span className="text-muted-foreground">未割当</span>
                            )}
                          </td>
                          {dateList.map((d) => {
                            const active = d >= sd && d <= ed;
                            const isWeekend = (() => {
                              const dt = new Date(d + "T00:00:00");
                              return dt.getDay() === 0 || dt.getDay() === 6;
                            })();
                            return (
                              <td
                                key={d}
                                className={`border border-border p-0 ${
                                  active
                                    ? p.staffName
                                      ? "bg-blue-200"
                                      : "bg-amber-100"
                                    : isWeekend
                                    ? "bg-muted/30"
                                    : ""
                                }`}
                              >
                                {active && (
                                  <div
                                    className="h-full w-full min-h-[24px]"
                                    title={`${p.phaseName}${p.staffName ? ` (${p.staffName})` : ""}`}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ---------------- List view (previous card-based) ---------------- */

function AssignmentList() {
  const [from, setFrom] = useState<string>(addDaysISO(todayLocalISO(), -7));
  const [to, setTo] = useState<string>(addDaysISO(todayLocalISO(), 30));
  const [filter, setFilter] = useState("");
  const listQ = useListStaffAssignments({ from, to });

  const today = todayLocalISO();
  const filtered = (listQ.data ?? []).filter((s) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      s.staffName.toLowerCase().includes(f) ||
      s.role.toLowerCase().includes(f) ||
      (s.company ?? "").toLowerCase().includes(f) ||
      s.projects.some((p) => p.projectName.toLowerCase().includes(f))
    );
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">期間と検索</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="from">開始日</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <Label htmlFor="to">終了日</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="filter">職人・案件で絞り込み</Label>
              <Input
                id="filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="名前、会社、案件名..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {listQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            職人が見つかりません。
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((s) => {
            const active = s.projects.filter(
              (p) => p.firstDate <= today && today <= p.lastDate,
            );
            const upcoming = s.projects.filter((p) => p.firstDate > today);
            const past = s.projects.filter((p) => p.lastDate < today);
            return (
              <Card key={s.staffId}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <HardHat className="w-4 h-4 text-muted-foreground" />
                        {s.staffName}
                      </CardTitle>
                      <CardDescription className="mt-0.5">
                        {s.role}
                        {s.company ? ` · ${s.company}` : ""}
                      </CardDescription>
                    </div>
                    {active.length > 0 && <Badge>稼働中</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {s.projects.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      この期間の配置はありません。
                    </p>
                  ) : (
                    <>
                      {active.length > 0 && (
                        <ProjectSection
                          label="現在入っている案件"
                          color="text-accent"
                          projects={active}
                        />
                      )}
                      {upcoming.length > 0 && (
                        <ProjectSection
                          label="予定"
                          color="text-primary"
                          projects={upcoming}
                        />
                      )}
                      {past.length > 0 && (
                        <ProjectSection
                          label="過去"
                          color="text-muted-foreground"
                          projects={past}
                        />
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectSection({
  label,
  color,
  projects,
}: {
  label: string;
  color: string;
  projects: {
    projectId: string;
    projectName: string;
    unitNumber?: string | null;
    days: number;
    firstDate: string;
    lastDate: string;
  }[];
}) {
  return (
    <div className="space-y-1.5">
      <div className={`text-xs font-medium ${color}`}>{label}</div>
      <ul className="space-y-1.5">
        {projects.map((p) => (
          <li key={p.projectId} className="text-sm">
            <Link
              href={`/projects/${p.projectId}`}
              className="block group rounded p-2 -mx-2 hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center gap-1.5 font-medium group-hover:text-primary">
                <MapPin className="w-3 h-3 text-muted-foreground" />
                {p.projectName}
                {p.unitNumber && (
                  <span className="text-xs text-muted-foreground">
                    ({p.unitNumber})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <CalendarDays className="w-3 h-3" />
                {formatDate(p.firstDate)} 〜 {formatDate(p.lastDate)} · {p.days}
                日
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
