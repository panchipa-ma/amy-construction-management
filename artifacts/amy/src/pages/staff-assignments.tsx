import { useState } from "react";
import { Link } from "wouter";
import { useListStaffAssignments } from "@workspace/api-client-react";
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
import { formatDate, todayLocalISO, addDaysISO } from "@/lib/format";
import { HardHat, MapPin, CalendarDays } from "lucide-react";

export default function StaffAssignmentsPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">職人の案件一覧</h1>
        <p className="text-sm text-muted-foreground mt-1">
          指定期間で各職人がどの案件に入っているかを一覧で確認できます。スケジュール画面で配置すると反映されます。
        </p>
      </div>

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
                    {active.length > 0 && (
                      <Badge className="bg-emerald-600">稼働中</Badge>
                    )}
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
                          color="text-emerald-700"
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
