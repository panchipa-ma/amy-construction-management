import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  useUpdateUser,
  useDeleteUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { useMe } from "@/lib/role";
import { Check, Loader2, Trash2 } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDate } from "@/lib/format";

export default function UsersPage() {
  const usersQ = useListUsers();
  const updateMut = useUpdateUser();
  const deleteMut = useDeleteUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { me } = useMe();
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const update = async (
    id: string,
    body: { role?: "internal" | "external"; status?: "pending" | "approved" },
  ) => {
    setBusyId(id);
    try {
      await updateMut.mutateAsync({ id, data: body });
      await refresh();
    } catch (e) {
      toast({ title: apiErrorMessage(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`「${label}」を削除します。よろしいですか？`)) return;
    setBusyId(id);
    try {
      await deleteMut.mutateAsync({ id });
      await refresh();
    } catch (e) {
      toast({ title: apiErrorMessage(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (usersQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const users = usersQ.data ?? [];
  const pendingCount = users.filter((u) => u.status === "pending").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ユーザー管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          サインインしたユーザーの権限と承認状況を管理します。
          <br />
          新規アカウントは「承認待ち」の状態でログインできず、社内権限の管理者が承認すると利用可能になります。
        </p>
      </div>

      {pendingCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-900">
            承認待ちのユーザーが {pendingCount} 名います。下記から承認してください。
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>メール</TableHead>
                <TableHead>権限</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>連動先</TableHead>
                <TableHead>登録日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = me?.id === u.id;
                const busy = busyId === u.id;
                return (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="font-medium">
                      {u.displayName || "—"}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (自分)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email || "—"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        disabled={isSelf || busy}
                        onValueChange={(v) =>
                          update(u.id, {
                            role: v as "internal" | "external",
                          })
                        }
                      >
                        <SelectTrigger
                          className="w-32"
                          data-testid={`select-role-${u.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="internal">社内</SelectItem>
                          <SelectItem value="external">社外</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.status === "approved" ? (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                          承認済み
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          承認待ち
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.linkedStaffName ? (
                        <Badge variant="secondary" className="mr-1">
                          職人: {u.linkedStaffName}
                        </Badge>
                      ) : null}
                      {u.linkedEmployeeName ? (
                        <Badge variant="secondary">
                          社員: {u.linkedEmployeeName}
                        </Badge>
                      ) : null}
                      {!u.linkedStaffName && !u.linkedEmployeeName ? (
                        <span className="text-muted-foreground">—</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        {u.status === "pending" ? (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              update(u.id, { status: "approved" })
                            }
                            data-testid={`button-approve-${u.id}`}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            承認
                          </Button>
                        ) : (
                          !isSelf && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                update(u.id, { status: "pending" })
                              }
                              data-testid={`button-revoke-${u.id}`}
                            >
                              承認解除
                            </Button>
                          )
                        )}
                        {!isSelf && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              remove(u.id, u.displayName || u.email || u.id)
                            }
                            data-testid={`button-delete-${u.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    ユーザーがいません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
