import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useListCustomers,
  useGetProjectLedger,
  useUpdateProject,
  useCreateCostEntry,
  useUpdateCostEntry,
  useDeleteCostEntry,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  CostCategory,
  type CostEntry,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Button } from "@/components/ui/button";
import { CostCategoryBadge } from "@/components/cost-category-badge";
import { LedgerSummary } from "@/components/ledger-summary";
import {
  LedgerSpreadsheet,
  type ProjectPatch,
  type CostEntryPatch,
  type CreateCostEntryDraft,
} from "@/components/ledger-spreadsheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { apiErrorMessage } from "@/lib/api-error";
import { openAuthenticatedPrintWindow, pdfFileName } from "@/lib/print";
import { CheckCircle2, ExternalLink, Printer, RotateCcw } from "lucide-react";

export default function LedgerPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const projectsQ = useListProjects();
  const customersQ = useListCustomers();
  const [projectId, setProjectId] = useState<string>("");
  const ledgerQ = useGetProjectLedger(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetProjectLedgerQueryKey(projectId),
    },
  });
  const ledger = ledgerQ.data;
  const projects = projectsQ.data ?? [];
  const selectedProject = projects.find((p) => p.id === projectId);

  const updateProjectMut = useUpdateProject();
  const createCostMut = useCreateCostEntry();
  const updateCostMut = useUpdateCostEntry();
  const deleteCostMut = useDeleteCostEntry();

  const latestCostRef = useRef(new Map<string, CostEntry>());
  const writersRef = useRef(new Map<string, Promise<void>>());

  const invalidateLedger = async () => {
    await queryClient.invalidateQueries({
      queryKey: getGetProjectLedgerQueryKey(projectId),
    });
    await queryClient.invalidateQueries({
      queryKey: getGetProjectQueryKey(projectId),
    });
    await queryClient.invalidateQueries({
      queryKey: getListProjectsQueryKey(),
    });
    await invalidateDashboard(queryClient);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">施工台帳</h1>
          <p className="text-sm text-muted-foreground mt-1">
            案件を選択して計画原価と実績原価、粗利を確認します。
          </p>
        </div>
        {selectedProject && (
          <div className="flex gap-2 flex-wrap">
            {selectedProject.ledgerCompletedAt ? (
              <Button
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  try {
                    await updateProjectMut.mutateAsync({
                      id: selectedProject.id,
                      data: { ledgerCompletedAt: null },
                    });
                    await invalidateLedger();
                    toast({ title: "完了を取り消しました" });
                  } catch (err) {
                    toast({ title: apiErrorMessage(err), variant: "destructive" });
                  }
                }}
              >
                <RotateCcw className="w-4 h-4" />
                完了済を取り消す
                <span className="text-xs text-muted-foreground ml-1">
                  ({formatDate(selectedProject.ledgerCompletedAt)})
                </span>
              </Button>
            ) : (
              <Button
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={async () => {
                  if (!confirm("施工台帳を完了にしますか?\n現場監督歩合がこの月で計上されます。")) return;
                  try {
                    await updateProjectMut.mutateAsync({
                      id: selectedProject.id,
                      data: { ledgerCompletedAt: new Date().toISOString() },
                    });
                    await invalidateLedger();
                    toast({ title: "施工台帳を完了しました" });
                  } catch (err) {
                    toast({ title: apiErrorMessage(err), variant: "destructive" });
                  }
                }}
              >
                <CheckCircle2 className="w-4 h-4" />
                施工台帳を完了
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  await openAuthenticatedPrintWindow({
                    url: `/api/print/ledger/${selectedProject.id}?autoprint=1`,
                    fileName: pdfFileName("施工台帳", selectedProject.name),
                  });
                } catch (err) {
                  toast({ title: apiErrorMessage(err), variant: "destructive" });
                }
              }}
            >
              <Printer className="w-4 h-4" />
              PDF出力
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/projects/${selectedProject.id}`}>
                <ExternalLink className="w-4 h-4" />
                案件詳細を開く
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">案件を選択</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="max-w-xl">
              <SelectValue placeholder="案件を選択してください" />
            </SelectTrigger>
            <SelectContent>
              {projects.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground">
                  案件がまだありません
                </div>
              ) : (
                projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.unitNumber ? ` (${p.unitNumber})` : ""}
                    {p.code ? ` — ${p.code}` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!projectId ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {projectsQ.isLoading
              ? "読み込み中..."
              : "上のリストから案件を選択してください。"}
          </CardContent>
        </Card>
      ) : ledgerQ.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : ledgerQ.isError || !ledger ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-destructive">
            施工台帳の読み込みに失敗しました。
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs defaultValue="sheet" className="w-full">
            <TabsList>
              <TabsTrigger value="sheet">台帳形式</TabsTrigger>
              <TabsTrigger value="summary">サマリー</TabsTrigger>
            </TabsList>
            <TabsContent value="sheet" className="mt-3">
              {selectedProject && (
                <LedgerSpreadsheet
                  ledger={ledger}
                  project={selectedProject}
                  customers={customersQ.data ?? []}
                  onProjectUpdate={async (patch: ProjectPatch) => {
                    try {
                      await updateProjectMut.mutateAsync({
                        id: projectId,
                        data: patch,
                      });
                      await invalidateLedger();
                    } catch (err) {
                      toast({
                        title: apiErrorMessage(err),
                        variant: "destructive",
                      });
                    }
                  }}
                  onCostEntryUpdate={(
                    entryId: string,
                    patch: CostEntryPatch,
                  ) => {
                    const base =
                      latestCostRef.current.get(entryId) ??
                      (ledger.entries.find((e) => e.id === entryId) as
                        | CostEntry
                        | undefined);
                    if (!base) return;
                    const merged: CostEntry = {
                      ...base,
                      category: patch.category ?? base.category,
                      description: patch.description ?? base.description,
                      vendor:
                        patch.vendor !== undefined
                          ? patch.vendor
                          : (base.vendor ?? null),
                      plannedAmount:
                        patch.plannedAmount ?? base.plannedAmount,
                      actualAmount: patch.actualAmount ?? base.actualAmount,
                      entryDate: patch.entryDate ?? base.entryDate,
                      notes:
                        patch.notes !== undefined
                          ? patch.notes
                          : (base.notes ?? null),
                    };
                    latestCostRef.current.set(entryId, merged);
                    if (writersRef.current.has(entryId)) return;
                    const writer = (async () => {
                      try {
                        let lastSent: string | null = null;
                        while (true) {
                          const current =
                            latestCostRef.current.get(entryId);
                          if (!current) break;
                          const body = {
                            projectId,
                            category: current.category as CostCategory,
                            description: current.description,
                            vendor: current.vendor ?? null,
                            plannedAmount: current.plannedAmount,
                            actualAmount: current.actualAmount,
                            entryDate: current.entryDate,
                            notes: current.notes ?? null,
                          };
                          const fingerprint = JSON.stringify(body);
                          if (fingerprint === lastSent) break;
                          lastSent = fingerprint;
                          await updateCostMut.mutateAsync({
                            id: entryId,
                            data: body,
                          });
                        }
                      } catch (err) {
                        toast({
                          title: apiErrorMessage(err),
                          variant: "destructive",
                        });
                      } finally {
                        writersRef.current.delete(entryId);
                        try {
                          await invalidateLedger();
                        } catch {}
                      }
                    })();
                    writersRef.current.set(entryId, writer);
                  }}
                  onCostEntryCreate={async (draft: CreateCostEntryDraft) => {
                    try {
                      await createCostMut.mutateAsync({
                        data: {
                          projectId,
                          category: draft.category as CostCategory,
                          description: draft.description || "新規",
                          vendor: draft.vendor,
                          plannedAmount: draft.plannedAmount,
                          actualAmount: draft.actualAmount,
                          entryDate: draft.entryDate,
                        },
                      });
                      await invalidateLedger();
                    } catch (err) {
                      toast({
                        title: apiErrorMessage(err),
                        variant: "destructive",
                      });
                    }
                  }}
                  onCostEntryDelete={async (entryId: string) => {
                    try {
                      await deleteCostMut.mutateAsync({ id: entryId });
                      await invalidateLedger();
                    } catch (err) {
                      toast({
                        title: apiErrorMessage(err),
                        variant: "destructive",
                      });
                    }
                  }}
                />
              )}
            </TabsContent>
            <TabsContent value="summary" className="mt-3 space-y-6">
              <LedgerSummary ledger={ledger} />
              <Card>
            <CardHeader>
              <CardTitle className="text-base">原価明細</CardTitle>
              <CardDescription>
                台帳形式タブでも直接編集できます。
              </CardDescription>
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
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
