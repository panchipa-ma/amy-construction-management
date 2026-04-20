import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateQuote,
  useListProjects,
  getListQuotesQueryKey,
  type LineItem,
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
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LineItemsEditor } from "@/components/line-items-editor";
import { useToast } from "@/hooks/use-toast";
import { invalidateDashboard } from "@/lib/invalidate";
import { ArrowLeft } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";

function searchParamProjectId(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("projectId") ?? "";
}

export default function QuoteNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const projectsQ = useListProjects();
  const createMut = useCreateQuote();

  const [projectId, setProjectId] = useState(searchParamProjectId());
  const [quoteNumber, setQuoteNumber] = useState(() => {
    const d = new Date();
    return `Q-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
  });
  const [issueDate, setIssueDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { description: "", unit: "式", quantity: 1, unitPrice: 0 },
  ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !quoteNumber || !issueDate) {
      toast({ title: "案件・見積番号・発行日は必須です", variant: "destructive" });
      return;
    }
    try {
      const res = await createMut.mutateAsync({
        data: {
          projectId,
          quoteNumber,
          issueDate,
          validUntil: validUntil || null,
          notes: notes || null,
          items,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListQuotesQueryKey(),
      });
      await invalidateDashboard(queryClient);
      toast({ title: "見積書を作成しました" });
      setLocation(`/quotes/${res.id}`);
    } catch (err) {
      toast({ title: apiErrorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/quotes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        見積書一覧に戻る
      </Link>
      <h1 className="text-2xl font-bold">見積書を作成</h1>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>案件 *</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="案件を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projectsQ.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="qn">見積番号 *</Label>
                <Input
                  id="qn"
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="iss">発行日 *</Label>
                <Input
                  id="iss"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="vu">有効期限</Label>
                <Input
                  id="vu"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="qnotes">備考</Label>
              <Textarea
                id="qnotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">明細</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItemsEditor items={items} onChange={setItems} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href="/quotes">
            <Button type="button" variant="outline">
              キャンセル
            </Button>
          </Link>
          <Button type="submit" disabled={createMut.isPending}>
            作成する
          </Button>
        </div>
      </form>
    </div>
  );
}
