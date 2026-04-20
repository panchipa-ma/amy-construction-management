import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProject,
  useGetProjectLedger,
  useDeleteProject,
  useListQuotes,
  useListInvoices,
  useListScheduleEntries,
  useListProgressLogs,
  useCreateCostEntry,
  useUpdateCostEntry,
  useDeleteCostEntry,
  useCreateProgressLog,
  useDeleteProgressLog,
  getGetProjectQueryKey,
  getGetProjectLedgerQueryKey,
  getListProjectsQueryKey,
  getListQuotesQueryKey,
  getListInvoicesQueryKey,
  getListScheduleEntriesQueryKey,
  getListProgressLogsQueryKey,
  CostCategory,
  type CostEntry,
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
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  ImagePlus,
} from "lucide-react";
import { ProjectStatusBadge } from "@/components/status-badge";
import { CostCategoryBadge } from "@/components/cost-category-badge";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { LedgerSummary } from "@/components/ledger-summary";
import { ProjectGantt } from "@/components/project-gantt";

const COST_CATEGORY_LABEL: Record<string, string> = {
  material: "材料",
  subcontract: "外注",
  labor: "労務",
  expense: "経費",
  other: "その他",
};

const emptyCost = {
  category: CostCategory.material as string,
  description: "",
  vendor: "",
  plannedAmount: "0",
  actualAmount: "0",
  entryDate: new Date().toISOString().slice(0, 10),
  notes: "",
};

const emptyLog = {
  date: new Date().toISOString().slice(0, 10),
  title: "",
  description: "",
  photoUrl: "",
};

export default function ProjectDetailPage() {
  const [, params] = useRoute("/projects/:id");
  const id = params?.id ?? "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const projectQ = useGetProject(id, {
    query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) },
  });
  const ledgerQ = useGetProjectLedger(id, {
    query: { enabled: !!id, queryKey: getGetProjectLedgerQueryKey(id) },
  });
  const quotesQ = useListQuotes({ projectId: id });
  const invoicesQ = useListInvoices({ projectId: id });
  const schedulesQ = useListScheduleEntries({ projectId: id });
  const logsQ = useListProgressLogs({ projectId: id });

  const createCostMut = useCreateCostEntry();
  const updateCostMut = useUpdateCostEntry();
  const deleteCostMut = useDeleteCostEntry();
  const createLogMut = useCreateProgressLog();
  const deleteLogMut = useDeleteProgressLog();
  const deleteProjectMut = useDeleteProject();

  const [costOpen, setCostOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<CostEntry | null>(null);
  const [costForm, setCostForm] = useState(emptyCost);
  const [askDeleteCost, setAskDeleteCost] = useState<string | null>(null);
  const [askDeleteProject, setAskDeleteProject] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState(emptyLog);

  if (projectQ.isLoading || !projectQ.data) {
    return <Skeleton className="h-96 w-full max-w-5xl" />;
  }
  const project = projectQ.data;
  const ledger = ledgerQ.data;

  const openNewCost = () => {
    setEditingCost(null);
    setCostForm(emptyCost);
    setCostOpen(true);
  };
  const openEditCost = (c: CostEntry) => {
    setEditingCost(c);
    setCostForm({
      category: c.category,
      description: c.description,
      vendor: c.vendor ?? "",
      plannedAmount: String(c.plannedAmount),
      actualAmount: String(c.actualAmount),
      entryDate: c.entryDate,
      notes: c.notes ?? "",
    });
    setCostOpen(true);
  };

  const submitCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!costForm.description) {
      toast({ title: "摘要は必須です", variant: "destructive" });
      return;
    }
    const data = {
      projectId: id,
      category: costForm.category as CostCategory,
      description: costForm.description,
      vendor: costForm.vendor || null,
      plannedAmount: Number(costForm.plannedAmount) || 0,
      actualAmount: Number(costForm.actualAmount) || 0,
      entryDate: costForm.entryDate,
      notes: costForm.notes || null,
    };
    try {
      if (editingCost) {
        await updateCostMut.mutateAsync({ id: editingCost.id, data });
      } else {
        await createCostMut.mutateAsync({ data });
      }
      await queryClient.invalidateQueries({
        queryKey: getGetProjectLedgerQueryKey(id),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(id),
      });
      await invalidateDashboard(queryClient);
      toast({ title: editingCost ? "原価を更新しました" : "原価を追加しました" });
      setCostOpen(false);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const confirmDeleteCost = async () => {
    if (!askDeleteCost) return;
    try {
      await deleteCostMut.mutateAsync({ id: askDeleteCost });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectLedgerQueryKey(id),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(id),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "原価を削除しました" });
      setAskDeleteCost(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const submitLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logForm.title || !logForm.date) {
      toast({ title: "タイトルと日付は必須です", variant: "destructive" });
      return;
    }
    try {
      await createLogMut.mutateAsync({
        data: {
          projectId: id,
          date: logForm.date,
          title: logForm.title,
          description: logForm.description || null,
          photoUrl: logForm.photoUrl || null,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListProgressLogsQueryKey({ projectId: id }),
      });
      toast({ title: "進捗記録を追加しました" });
      setLogOpen(false);
      setLogForm(emptyLog);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleDeleteLog = async (logId: string) => {
    try {
      await deleteLogMut.mutateAsync({ id: logId });
      await queryClient.invalidateQueries({
        queryKey: getListProgressLogsQueryKey({ projectId: id }),
      });
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleDeleteProject = async () => {
    try {
      await deleteProjectMut.mutateAsync({ id });
      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "案件を削除しました" });
      setLocation("/projects");
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        案件一覧に戻る
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {project.code && <span>{project.code} · </span>}
            {project.customerName}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setAskDeleteProject(true)}
          className="gap-2 text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
          削除
        </Button>
      </div>

      <Tabs defaultValue="ledger" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="ledger" className="font-semibold">
            施工台帳
          </TabsTrigger>
          <TabsTrigger value="quotes">見積</TabsTrigger>
          <TabsTrigger value="invoices">請求</TabsTrigger>
          <TabsTrigger value="schedule">スケジュール</TabsTrigger>
          <TabsTrigger value="phases">工程表</TabsTrigger>
          <TabsTrigger value="progress">進捗記録</TabsTrigger>
        </TabsList>

        <TabsContent value="phases" className="mt-4">
          <ProjectGantt projectId={id} />
        </TabsContent>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">案件情報</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">顧客</dt>
                  <dd>{project.customerName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">案件番号</dt>
                  <dd>{project.code ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">現場住所</dt>
                  <dd>{project.siteAddress ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">工期</dt>
                  <dd>
                    {formatDate(project.startDate)} 〜{" "}
                    {formatDate(project.endDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">契約金額</dt>
                  <dd className="font-medium tabular-nums">
                    {formatCurrency(project.contractAmount)}
                  </dd>
                </div>
                {project.notes && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">備考</dt>
                    <dd className="whitespace-pre-wrap">{project.notes}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-6 mt-4">
          {ledgerQ.isLoading || !ledger ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <>
              <LedgerSummary ledger={ledger} />

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">原価明細</CardTitle>
                    <CardDescription>すべての原価項目を明細で管理します。</CardDescription>
                  </div>
                  <Button onClick={openNewCost} className="gap-2">
                    <Plus className="w-4 h-4" />
                    原価を追加
                  </Button>
                </CardHeader>
                <CardContent>
                  {ledger.entries.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      原価がまだ登録されていません。
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>日付</TableHead>
                          <TableHead>カテゴリ</TableHead>
                          <TableHead>摘要</TableHead>
                          <TableHead>仕入先</TableHead>
                          <TableHead className="text-right">計画</TableHead>
                          <TableHead className="text-right">実績</TableHead>
                          <TableHead className="text-right">差異</TableHead>
                          <TableHead className="w-24"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.entries.map((e) => {
                          const diff = e.actualAmount - e.plannedAmount;
                          const overrun = diff > 0;
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatDate(e.entryDate)}
                              </TableCell>
                              <TableCell>
                                <CostCategoryBadge category={e.category} />
                              </TableCell>
                              <TableCell className="font-medium">
                                {e.description}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {e.vendor ?? "-"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(e.plannedAmount)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(e.actualAmount)}
                              </TableCell>
                              <TableCell
                                className={`text-right tabular-nums ${overrun ? "text-destructive font-medium" : "text-emerald-700"}`}
                              >
                                {overrun ? "+" : ""}
                                {formatCurrency(diff)}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditCost(e)}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setAskDeleteCost(e.id)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">見積書</CardTitle>
              <Link href={`/quotes/new?projectId=${id}`}>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  新規見積
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {(quotesQ.data ?? []).length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  この案件の見積書はまだありません。
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>見積番号</TableHead>
                      <TableHead>発行日</TableHead>
                      <TableHead>有効期限</TableHead>
                      <TableHead className="text-right">金額</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(quotesQ.data ?? []).map((q) => (
                      <TableRow key={q.id}>
                        <TableCell>
                          <Link
                            href={`/quotes/${q.id}`}
                            className="font-medium hover:underline"
                          >
                            {q.quoteNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(q.issueDate)}</TableCell>
                        <TableCell>{formatDate(q.validUntil)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(q.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">請求書</CardTitle>
              <Link href={`/invoices/new?projectId=${id}`}>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  新規請求
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {(invoicesQ.data ?? []).length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  この案件の請求書はまだありません。
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>請求番号</TableHead>
                      <TableHead>発行日</TableHead>
                      <TableHead>支払期限</TableHead>
                      <TableHead className="text-right">金額</TableHead>
                      <TableHead>状態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoicesQ.data ?? []).map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="font-medium hover:underline"
                          >
                            {inv.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(inv.issueDate)}</TableCell>
                        <TableCell>{formatDate(inv.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(inv.total)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md border ${inv.paid ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200"}`}
                          >
                            {inv.paid ? "入金済" : "未入金"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">この案件の予定</CardTitle>
            </CardHeader>
            <CardContent>
              {(schedulesQ.data ?? []).length === 0 ? (
                <div className="py-8 flex flex-col items-center text-center gap-2">
                  <CalendarDays className="w-8 h-8 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    予定はまだ登録されていません。
                  </div>
                  <Link href="/schedule">
                    <Button variant="outline">スケジュール画面で追加</Button>
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日付</TableHead>
                      <TableHead>職人</TableHead>
                      <TableHead>作業内容</TableHead>
                      <TableHead>時間</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(schedulesQ.data ?? []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{formatDate(s.date)}</TableCell>
                        <TableCell>{s.staffName}</TableCell>
                        <TableCell>{s.task}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.startTime ?? ""}
                          {s.endTime ? ` - ${s.endTime}` : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">進捗記録</CardTitle>
              <Dialog open={logOpen} onOpenChange={setLogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    記録を追加
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>進捗記録を追加</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submitLog} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="ld">日付 *</Label>
                        <Input
                          id="ld"
                          type="date"
                          value={logForm.date}
                          onChange={(e) =>
                            setLogForm({ ...logForm, date: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="lt">タイトル *</Label>
                        <Input
                          id="lt"
                          value={logForm.title}
                          onChange={(e) =>
                            setLogForm({ ...logForm, title: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="ldesc">内容</Label>
                      <Textarea
                        id="ldesc"
                        value={logForm.description}
                        onChange={(e) =>
                          setLogForm({ ...logForm, description: e.target.value })
                        }
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lurl">写真 URL</Label>
                      <Input
                        id="lurl"
                        value={logForm.photoUrl}
                        onChange={(e) =>
                          setLogForm({ ...logForm, photoUrl: e.target.value })
                        }
                        placeholder="https://..."
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setLogOpen(false)}
                      >
                        キャンセル
                      </Button>
                      <Button type="submit">追加</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {(logsQ.data ?? []).length === 0 ? (
                <div className="py-8 flex flex-col items-center text-center gap-2">
                  <ImagePlus className="w-8 h-8 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    現場の進捗記録を残しましょう。
                  </div>
                </div>
              ) : (
                <ul className="divide-y">
                  {(logsQ.data ?? []).map((log) => (
                    <li key={log.id} className="py-4 flex items-start gap-4">
                      {log.photoUrl && (
                        <img
                          src={log.photoUrl}
                          alt={log.title}
                          className="w-24 h-24 object-cover rounded-md border"
                          onError={(e) =>
                            (e.currentTarget.style.display = "none")
                          }
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{log.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(log.date)}
                          </div>
                        </div>
                        {log.description && (
                          <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                            {log.description}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCost ? "原価を編集" : "原価を追加"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCost} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>カテゴリ</Label>
                <Select
                  value={costForm.category}
                  onValueChange={(v) =>
                    setCostForm({ ...costForm, category: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COST_CATEGORY_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ced">日付</Label>
                <Input
                  id="ced"
                  type="date"
                  value={costForm.entryDate}
                  onChange={(e) =>
                    setCostForm({ ...costForm, entryDate: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="cdesc">摘要 *</Label>
                <Input
                  id="cdesc"
                  value={costForm.description}
                  onChange={(e) =>
                    setCostForm({ ...costForm, description: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="cvend">仕入先 / 外注先</Label>
                <Input
                  id="cvend"
                  value={costForm.vendor}
                  onChange={(e) =>
                    setCostForm({ ...costForm, vendor: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="cpla">計画原価 (円)</Label>
                <Input
                  id="cpla"
                  type="number"
                  value={costForm.plannedAmount}
                  onChange={(e) =>
                    setCostForm({ ...costForm, plannedAmount: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="cact">実績原価 (円)</Label>
                <Input
                  id="cact"
                  type="number"
                  value={costForm.actualAmount}
                  onChange={(e) =>
                    setCostForm({ ...costForm, actualAmount: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="cnotes">備考</Label>
                <Textarea
                  id="cnotes"
                  value={costForm.notes}
                  onChange={(e) =>
                    setCostForm({ ...costForm, notes: e.target.value })
                  }
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCostOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="submit">{editingCost ? "保存" : "追加"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!askDeleteCost}
        onOpenChange={(o) => !o && setAskDeleteCost(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>原価項目を削除しますか?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCost}
              className="bg-destructive text-destructive-foreground"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={askDeleteProject}
        onOpenChange={setAskDeleteProject}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>案件を削除しますか?</AlertDialogTitle>
            <AlertDialogDescription>
              関連する見積書、請求書、原価、スケジュール、進捗記録もすべて削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
