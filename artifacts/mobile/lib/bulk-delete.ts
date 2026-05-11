import { notify } from "./confirm";

export type BulkDeleteItem = { id: string };

export async function runBulkDelete<T extends BulkDeleteItem>(
  items: T[],
  deleteOne: (id: string) => Promise<unknown>,
  invalidate: () => Promise<unknown> | unknown,
): Promise<{ succeeded: string[]; failed: { id: string; error: unknown }[] }> {
  const results = await Promise.allSettled(
    items.map(async (it) => {
      await deleteOne(it.id);
      return it.id;
    }),
  );
  const succeeded: string[] = [];
  const failed: { id: string; error: unknown }[] = [];
  results.forEach((r, idx) => {
    if (r.status === "fulfilled") succeeded.push(r.value);
    else failed.push({ id: items[idx]!.id, error: r.reason });
  });
  // Always refresh the list so deleted rows disappear even when some failed.
  try {
    await invalidate();
  } catch {
    // ignore — invalidation failure shouldn't mask the real outcome
  }
  if (failed.length > 0) {
    const sample = failed[0]!.error;
    const msg = sample instanceof Error ? sample.message : String(sample);
    notify(
      "一部の削除に失敗しました",
      `${succeeded.length} 件削除、${failed.length} 件失敗\n${msg}`,
    );
  }
  return { succeeded, failed };
}
