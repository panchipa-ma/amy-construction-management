import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualMode, setManualMode] = useState(false);

  // Prune ids that no longer exist in the current items list (after refetch,
  // filter change, or successful delete). Using a stable signature avoids
  // unnecessary re-renders when items reference changes but ids don't.
  const idSignature = useMemo(
    () => items.map((i) => i.id).join("\u0000"),
    [items],
  );
  const lastSigRef = useRef<string>(idSignature);
  useEffect(() => {
    if (lastSigRef.current === idSignature) return;
    lastSigRef.current = idSignature;
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(items.map((i) => i.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [idSignature, items]);

  const selectionMode = manualMode || selectedIds.size > 0;

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enter = useCallback(() => setManualMode(true), []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setManualMode(false);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds],
  );

  return {
    selectionMode,
    selectedIds,
    selectedItems,
    count: selectedIds.size,
    isSelected,
    toggle,
    enter,
    clear,
    selectAll,
  };
}
