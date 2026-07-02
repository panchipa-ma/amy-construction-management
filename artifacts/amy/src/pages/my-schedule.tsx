import { useMemo } from "react";
import {
  useListAllProjectPhases,
  useListProjects,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, todayLocalISO } from "@/lib/format";
import { CalendarDays, MapPin } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  planned: "予定",
  in_progress: "進行中",
  done: "完了",
};

export default function MySchedulePage() {
  const phasesQ = useListAllProjectPhases();
  const projectsQ = useListProjects();
  const today = todayLocalISO();

  const projectName = useMemo(
    () => new Map((projectsQ.data ?? []).map((p) => [p.id, p.name])),
    [projectsQ.data],
  );

  const upcoming = useMemo(
    () =>
      (phasesQ.data ?? [])
        .filter((p) => p.endDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [phasesQ.data, today],
  );

  return (
    <div className="space-y-6 max-w-[900px]">
      <div>
        <h1 className="text-2xl font-bold">マイ工程・出面</h1>
        <p className="text-sm text-muted-foreground mt-1">
          あなたが担当としてアサインされた工程です。社内が作成した工程表・出面が自動で反映されます。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            今後の予定
          </CardTitle>
        </CardHeader>
        <CardContent>
          {phasesQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="font-medium">予定された工程はありません</div>
              <p className="text-sm text-muted-foreground max-w-sm">
                担当としてアサインされると、ここに自動で表示されます。表示されない場合は、社内担当者にアプリ登録メールアドレスの登録をご確認ください。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((p) => {
                const isActive = p.startDate <= today && p.endDate >= today;
                return (
                  <div
                    key={p.phaseId}
                    className="flex items-start justify-between gap-3 p-3 rounded-md border"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.phaseName}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {p.projectName ??
                          projectName.get(p.projectId) ??
                          "(案件不明)"}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums mt-1">
                        {formatDate(p.startDate)} 〜 {formatDate(p.endDate)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        variant={p.status === "done" ? "outline" : "default"}
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                      {isActive && (
                        <Badge className="text-[10px] px-1.5 py-0 h-4">
                          稼働中
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
