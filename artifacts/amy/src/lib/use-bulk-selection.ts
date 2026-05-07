import { useEffect, useMemo, useState } from "react";

/**
 * Generic multi-select state for list pages. Keeps a Set of selected ids and
 * automatically prunes ids that disappear from the visible list (e.g. after a
 * filter change or deletion). Designed to pair with `BulkDeleteBar`.
 */
export function useBulkSelection<T extends string>(allIds: readonly T[]) {
  const [selected, setSelected] = useState<Set<T>>(() => new Set());

  // Drop selections that are no longer in the list (filter changed, deleted, etc.).
  // Compare by membership, not Set instance, so we only set state when needed.
  const idsKey = useMemo(() => allIds.join("|"), [allIds]);
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(allIds);
      let changed = false;
      const next = new Set<T>();
      prev.forEach((id) => {
        if (present.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
    // idsKey is the canonical fingerprint of allIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const allChecked = allIds.length > 0 && selected.size === allIds.length;
  const someChecked = selected.size > 0 && selected.size < allIds.length;

  return {
    selected,
    selectedIds: Array.from(selected),
    count: selected.size,
    isSelected: (id: T) => selected.has(id),
    toggle: (id: T) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (ids: readonly T[]) => setSelected(new Set(ids)),
    toggleAll: () => {
      if (allChecked) setSelected(new Set());
      else setSelected(new Set(allIds));
    },
    clear: () => setSelected(new Set()),
    allChecked,
    someChecked,
    /**
     * For Radix Checkbox: pass directly to `checked`.
     * "indeterminate" renders the dash glyph when some (but not all) are selected.
     */
    headerCheckedState:
      allIds.length === 0
        ? false
        : allChecked
          ? true
          : someChecked
            ? ("indeterminate" as const)
            : false,
  };
}
