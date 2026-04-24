import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListReceipts,
  useCreateReceipt,
  useDeleteReceipt,
  useMatchReceipt,
  useRequestUploadUrl,
  useExtractOcr,
  useListProjects,
  getListReceiptsQueryKey,
  getGetProjectLedgerQueryKey,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  type Project,
} from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Upload,
  Trash2,
  Sparkles,
  Loader2,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { formatCurrency, formatDate } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api-error";
import { CostCategoryBadge } from "@/components/cost-category-badge";
import { cn } from "@/lib/utils";

export default function ReceiptsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const listQ = useListReceipts();
  const projectsQ = useListProjects();
  const createMut = useCreateReceipt();
  const deleteMut = useDeleteReceipt();
  const matchMut = useMatchReceipt();
  const requestUrlMut = useRequestUploadUrl();
  const ocrMut = useExtractOcr();

  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [processing, setProcessing] = useState(0);
  const lastObjectPathRef = useRef<string>("");
  const lastContentTypeRef = useRef<string>("");

  const projects = projectsQ.data ?? [];

  const refresh = async (projectIds?: (string | null | undefined)[]) => {
    await queryClient.invalidateQueries({
      queryKey: getListReceiptsQueryKey(),
    });
    await queryClient.invalidateQueries({
      queryKey: getListProjectsQueryKey(),
    });
    const unique = new Set(
      (projectIds ?? []).filter((p): p is string => !!p),
    );
    for (const pid of unique) {
      await queryClient.invalidateQueries({
        queryKey: getGetProjectLedgerQueryKey(pid),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(pid),
      });
    }
    await invalidateDashboard(queryClient);
  };

  const handleProcessFile = async (fileName: string) => {
    const objectPath = lastObjectPathRef.current;
    const contentType = lastContentTypeRef.current;
    if (!objectPath) return;

    const servePath = objectPath.startsWith("/objects/")
      ? `/api/storage${objectPath}`
      : objectPath;

    setProcessing((n) => n + 1);
    try {
      // Run OCR
      let extracted: Awaited<ReturnType<typeof ocrMut.mutateAsync>> | null =
        null;
      try {
        extracted = await ocrMut.mutateAsync({
          data: { objectPath, contentType, kind: "receipt" },
        });
      } catch (err) {
        toast({
          title: "自動読み取りに失敗しました。手動で振分けてください",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      }

      const created = await createMut.mutateAsync({
        data: {
          vendor: extracted?.vendor || fileName,
          unitNumber: extracted?.unitNumber ?? null,
          amount: extracted?.amount ?? 0,
          receiptDate: extracted?.date ?? new Date().toISOString().slice(0, 10),
          category: "expense",
          fileUrl: servePath,
          fileName,
          notes: extracted?.notes ?? null,
        },
      });
      await refresh([created.projectId]);

      const summary = extracted
        ? `${extracted.vendor || "(店舗不明)"} / ${formatCurrency(extracted.amount)} / ${extracted.date}`
        : "ファイルを登録しました";
      toast({
        title: "領収書を登録しました。振分先案件を選んでください",
        description: summary,
      });
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    } finally {
      setProcessing((n) => n - 1);
    }
  };

  const handleDelete = async () => {
    if (!askDelete) return;
    const target = (listQ.data ?? []).find((r) => r.id === askDelete);
    try {
      await deleteMut.mutateAsync({ id: askDelete });
      await refresh([target?.projectId]);
      toast({ title: "削除しました" });
      setAskDelete(null);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  const handleAssign = async (
    receiptId: string,
    nextProjectId: string,
    prevProjectId: string | null,
  ) => {
    try {
      const updated = await matchMut.mutateAsync({
        id: receiptId,
        data: { projectId: nextProjectId },
      });
      await refresh([prevProjectId, updated.projectId]);
      toast({ title: `案件「${updated.projectName}」に振分けました` });
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">領収書</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            アップロードするだけで店舗・金額・日付を自動読み取り。振分先の現場名・号室はプルダウンで検索して選択できます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {processing > 0 && (
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" />
              読み取り中 ({processing})
            </span>
          )}
          <ObjectUploader
            maxNumberOfFiles={1}
            maxFileSize={20 * 1024 * 1024}
            buttonClassName="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            onGetUploadParameters={async (file) => {
              const contentType =
                (file.type as string) ?? "application/octet-stream";
              const res = await requestUrlMut.mutateAsync({
                data: {
                  name: (file.name as string) ?? "receipt.jpg",
                  size: (file.size as number) ?? 0,
                  contentType,
                },
              });
              lastObjectPathRef.current = res.objectPath;
              lastContentTypeRef.current = contentType;
              return {
                method: "PUT",
                url: res.uploadURL,
                headers: { "Content-Type": contentType },
              };
            }}
            onComplete={(result) => {
              const ok = result.successful?.[0];
              if (ok && lastObjectPathRef.current) {
                void handleProcessFile((ok.name as string) ?? "receipt");
              }
            }}
          >
            <Upload className="w-4 h-4" />
            領収書をアップロード
          </ObjectUploader>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">領収書一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (listQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              領収書はまだありません。右上のボタンからファイルを選んでください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>アップロード日</TableHead>
                  <TableHead>店舗・支払先</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>領収日</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead className="min-w-[260px]">振分先案件</TableHead>
                  <TableHead>ファイル</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQ.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(r.uploadedAt.slice(0, 10))}
                    </TableCell>
                    <TableCell className="font-medium">{r.vendor}</TableCell>
                    <TableCell>
                      <CostCategoryBadge category={r.category} />
                    </TableCell>
                    <TableCell>{formatDate(r.receiptDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(r.amount)}
                    </TableCell>
                    <TableCell>
                      <ProjectPicker
                        projects={projects}
                        value={r.projectId ?? null}
                        disabled={matchMut.isPending}
                        onSelect={(pid) =>
                          handleAssign(r.id, pid, r.projectId ?? null)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <a
                        href={r.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        {r.fileName}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAskDelete(r.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!askDelete}
        onOpenChange={(o) => !o && setAskDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>領収書を削除しますか?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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

/* ---------------- Searchable project picker ---------------- */

function ProjectPicker({
  projects,
  value,
  disabled,
  onSelect,
}: {
  projects: Project[];
  value: string | null;
  disabled?: boolean;
  onSelect: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => projects.find((p) => p.id === value) ?? null,
    [projects, value],
  );

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-8 w-full justify-between text-left font-normal min-w-[240px]",
              !selected && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {selected ? (
                <>
                  <span className="font-medium">{selected.name}</span>
                  {selected.unitNumber ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({selected.unitNumber})
                    </span>
                  ) : null}
                </>
              ) : (
                "案件を選択..."
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0" align="start">
          <Command
            filter={(itemValue, search) => {
              if (!search) return 1;
              // Normalize half/full-width and case so e.g. "101" matches "１０１".
              const norm = (s: string) =>
                s.normalize("NFKC").toLowerCase();
              return norm(itemValue).includes(norm(search)) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="現場名・号室で検索..." />
            <CommandList>
              <CommandEmpty>該当する案件がありません</CommandEmpty>
              <CommandGroup>
                {projects.map((p) => {
                  const label = `${p.name} ${p.unitNumber ?? ""} ${p.siteAddress ?? ""}`;
                  return (
                    <CommandItem
                      key={p.id}
                      value={label}
                      onSelect={() => {
                        if (p.id !== value) onSelect(p.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === p.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium">
                          {p.name}
                          {p.unitNumber ? (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              ({p.unitNumber})
                            </span>
                          ) : null}
                        </span>
                        {p.siteAddress ? (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {p.siteAddress}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <Link
          href={`/projects/${selected.id}`}
          className="text-[11px] text-primary hover:underline shrink-0"
          title="案件を開く"
        >
          開く
        </Link>
      )}
      {!selected && (
        <Badge variant="outline" className="text-amber-700 shrink-0 text-[10px]">
          未振分
        </Badge>
      )}
    </div>
  );
}
