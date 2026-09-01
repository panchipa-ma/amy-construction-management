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
import { ChevronDown, ChevronRight, Search, Plus, X } from "lucide-react";
import { Link } from "wouter";
import { ProjectStatusBadge } from "@/components/status-badge";

export default function GanttPage() {
  const projectsQ = useListProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const allProjects = projectsQ.data ?? [];
  const activeProjects = useMemo(
    () =>
      allProjects.filter(
        (p) => p.status !== "completed" && p.customerId && p.customerName.trim(),
      ),
    [allProjects],
  );
  const customerOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const project of activeProjects) {
      if (!byId.has(project.customerId)) {
        byId.set(project.customerId, project.customerName);
      }
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, "ja"),
    );
  }, [activeProjects]);

  const projects = useMemo(() => {
    let list = activeProjects;
    if (selectedCustomerId) {
      list = list.filter((p) => p.customerId === selectedCustomerId);
    }
    if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeProjects, statusFilter, search, selectedCustomerId]);

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
            元請を選択して工程表を作成・編集できます。
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            新規案件作成
          </Button>
        </Link>
      </div>

      <div className="border rounded-lg bg-card p-4 space-y-3">
        <label className="text-sm font-medium">元請を選択して工程表を表示</label>
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={selectedCustomerId}
            onValueChange={setSelectedCustomerId}
          >
            <SelectTrigger className="w-96">
              <SelectValue placeholder="元請を選択してください" />
            </SelectTrigger>
            <SelectContent>
              {customerOptions.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCustomerId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => setSelectedCustomerId("")}
              aria-label="元請選択を解除"
            >
              <X className="w-4 h-4" />
              選択を解除
            </Button>
          )}
        </div>
        {selectedCustomerId ? (
          <p className="text-xs text-muted-foreground">
            選択した元請の案件だけを表示しています。工程の追加・編集・ドラッグ操作ができます。
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            元請を選択していないため、竣工以外の工程表一覧を表示しています。
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="案件名・元請名で検索"
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
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="estimating">見積中</SelectItem>
            <SelectItem value="contracted">契約済</SelectItem>
            <SelectItem value="in_progress">施工中</SelectItem>
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
          {selectedCustomerId
            ? "選択した元請に該当する工程表がありません。"
            : "該当する工程表がありません。"}
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => {
            const expanded = expandedIds.has(p.id);
            return (
              <div
                key={p.id}
                className="border rounded-md bg-card"
              >
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
