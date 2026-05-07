import { type ReactNode, useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type Props = {
  /** Number of currently selected rows. Bar is hidden when 0. */
  count: number;
  /** Clear selection (keeps rows). */
  onClear: () => void;
  /**
   * Perform the actual deletion. The bar awaits this, closes the confirm dialog,
   * and then calls `onClear` so the caller doesn't have to remember.
   */
  onDelete: () => Promise<void> | void;
  /** Singular label of the item being deleted, e.g. "見積書" / "顧客". */
  itemLabel: string;
  /** Disable the delete button (e.g. while the mutation is pending). */
  isPending?: boolean;
  /** Optional extra text shown inside the confirm dialog. */
  description?: ReactNode;
};

/**
 * Sticky bar shown at the top of a list when one or more rows are selected.
 * Click "選択した N件を削除" → confirm → caller's `onDelete` runs.
 *
 * Looks like a contextual action bar (similar to Gmail / Notion bulk actions).
 */
export function BulkDeleteBar({
  count,
  onClear,
  onDelete,
  itemLabel,
  isPending,
  description,
}: Props) {
  const [confirm, setConfirm] = useState(false);
  if (count === 0) return null;

  const handleConfirm = async () => {
    try {
      await onDelete();
    } finally {
      setConfirm(false);
    }
  };

  return (
    <>
      <div
        className="sticky top-0 z-30 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary text-primary-foreground px-4 py-2 shadow-md"
        data-testid="bulk-delete-bar"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <span data-testid="bulk-selected-count">{count}件 選択中</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="text-primary-foreground hover:bg-primary-foreground/15 gap-1.5"
            data-testid="button-bulk-clear"
          >
            <X className="w-3.5 h-3.5" />
            選択解除
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirm(true)}
            disabled={isPending}
            className="gap-1.5"
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
            選択した{count}件を削除
          </Button>
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              選択した{count}件の{itemLabel}を削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              {description ?? "この操作は取り消せません。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-bulk-delete-confirm"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Run a delete mutation across many ids in parallel. Returns a summary of
 * successes and failures; the caller decides how to present them via toast.
 */
export async function runBulkDelete<TId extends string>(
  ids: readonly TId[],
  deleteOne: (id: TId) => Promise<unknown>,
): Promise<{ ok: number; failed: { id: TId; error: unknown }[] }> {
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      await deleteOne(id);
      return id;
    }),
  );
  let ok = 0;
  const failed: { id: TId; error: unknown }[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok += 1;
    else failed.push({ id: ids[i], error: r.reason });
  });
  return { ok, failed };
}
