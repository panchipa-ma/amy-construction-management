import { useState } from "react";
import { Link } from "wouter";
import {
  useListProjects,
  ProjectStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectStatusBadge } from "@/components/status-badge";
import { PROJECT_STATUS_OPTIONS } from "@/components/project-status-select";
import { formatCurrency, formatDate } from "@/lib/format";
import { Plus, FolderKanban } from "lucide-react";

export default function ProjectsListPage() {
  const [status, setStatus] = useState<string>("all");
  const params =
    status === "all" ? undefined : { status: status as ProjectStatus };
  const { data, isLoading } = useListProjects(params);
  const rows = data ?? [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">案件一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">
            進行中の案件と完了した案件を管理します。
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            案件を作成
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">案件</CardTitle>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {PROJECT_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <FolderKanban className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">案件がありません</div>
                <div className="text-sm text-muted-foreground mt-1">
                  最初の案件を登録して施工管理を始めましょう。
                </div>
              </div>
              <Link href="/projects/new">
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  案件を作成
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案件名</TableHead>
                  <TableHead>顧客</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>工期</TableHead>
                  <TableHead className="text-right">契約金額</TableHead>
                  <TableHead className="text-right">実績原価</TableHead>
                  <TableHead className="text-right">粗利</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const profit = p.contractAmount - p.actualCost;
                  const overrun = p.actualCost > p.plannedCost;
                  return (
                    <TableRow key={p.id} className="cursor-pointer">
                      <TableCell>
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.code && (
                          <div className="text-xs text-muted-foreground">
                            {p.code}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{p.customerName}</TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(p.startDate)} - {formatDate(p.endDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(p.contractAmount)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${overrun ? "text-destructive font-medium" : ""}`}
                      >
                        {formatCurrency(p.actualCost)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${profit < 0 ? "text-destructive font-medium" : "text-emerald-700"}`}
                      >
                        {formatCurrency(profit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
