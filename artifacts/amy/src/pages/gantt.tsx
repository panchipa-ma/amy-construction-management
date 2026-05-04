import { useState, useMemo } from "react";
import { useListProjects } from "@workspace/api-client-react";
import { ProjectGantt } from "@/components/project-gantt";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Search, Plus } from "lucide-react";
import { Link } from "wouter";
import { ProjectStatusBadge } from "@/components/status-badge";

const STATUS_LABELS: Record<string, string> = {
  estimating: "見積中",
  contracted: "契約済",
  in_progress: "施工中",
  completed: "完工",
  archived: "保管",
};

export default function GanttPage() {
  const projectsQ = useListProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const projects = useMemo(() => {
    let list = projectsQ.data ?? [];
    if (statusFilter === "active") {
      list = list.filter(
        (p) => p.status === "in_progress" || p.status === "contracted",
      );
    } else if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.customerName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [projectsQ.data, statusFilter, search]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(projects.map((p) => p.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  if (projectsQ.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">工程表</h1>
          <p className="text-sm text-muted-foreground mt-1">
            案件ごとの工事工程（ガントチャート）を一覧で確認・編集できます。
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            新規案件作成
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="案件名・顧客名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">施工中・契約済</SelectItem>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="estimating">見積中</SelectItem>
            <SelectItem value="contracted">契約済</SelectItem>
            <SelectItem value="in_progress">施工中</SelectItem>
            <SelectItem value="completed">完工</SelectItem>
            <SelectItem value="archived">保管</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
          >
            すべて展開
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
          >
            すべて閉じる
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="border rounded-md py-16 text-center text-sm text-muted-foreground">
          {statusFilter === "active"
            ? "施工中・契約済の案件がありません。"
            : "該当する案件がありません。"}
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => {
            const expanded = expandedIds.has(p.id);
            return (
              <div key={p.id} className="border rounded-md bg-card">
                <button
                  type="button"
                  onClick={() => toggleExpand(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {p.name}
                      </span>
                      <ProjectStatusBadge status={p.status} />
                    </div>
                    {p.customerName && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {p.customerName}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/projects/${p.id}`}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    className="text-xs text-primary hover:underline flex-shrink-0"
                  >
                    案件詳細
                  </Link>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 border-t">
                    <ProjectGantt projectId={p.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
