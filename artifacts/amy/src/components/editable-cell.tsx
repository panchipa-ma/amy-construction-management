import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type BaseProps = {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
};

// Enter キーで同じ table 内の次の入力フィールドへフォーカス移動する。
// blur されると onBlur(commit) が走るので、保存は自動で行われる。
export function focusNextEditableInput(
  current: HTMLInputElement | HTMLTextAreaElement,
): boolean {
  const root: ParentNode = current.closest("table") ?? document;
  const all = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled])',
    ),
  ).filter((el) => !el.readOnly && el.offsetParent !== null);
  const idx = all.indexOf(current);
  if (idx >= 0 && idx + 1 < all.length) {
    const next = all[idx + 1];
    next.focus();
    if (next instanceof HTMLInputElement) {
      try {
        next.select();
      } catch {
        /* date/number inputs don't support select() in all browsers */
      }
    }
    return true;
  }
  return false;
}

export function EditableText({
  value,
  onSave,
  multiline = false,
  required = false,
  ...rest
}: BaseProps & {
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  required?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  // Cancel-intent flag set by Escape so the synchronous onBlur skips commit.
  const cancelRef = useRef(false);
  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setV(value);
      return;
    }
    if (required && !v.trim()) {
      // Required field cannot be saved empty — revert.
      setV(value);
      return;
    }
    if (v !== value) onSave(v);
  };
  const common = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV(e.target.value),
    onBlur: commit,
    placeholder: rest.placeholder,
    disabled: rest.disabled,
    className: cn(
      "w-full bg-transparent border-0 outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded-sm px-1 -mx-1",
      rest.inputClassName,
    ),
  };
  if (multiline) {
    return (
      <textarea
        {...common}
        rows={2}
        className={cn(common.className, "min-h-[2.5rem] resize-none")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (e.currentTarget as HTMLTextAreaElement).blur();
          }
          if (e.key === "Escape") {
            cancelRef.current = true;
            (e.currentTarget as HTMLTextAreaElement).blur();
          }
        }}
      />
    );
  }
  return (
    <input
      type="text"
      {...common}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const el = e.currentTarget as HTMLInputElement;
          if (!focusNextEditableInput(el)) el.blur();
        }
        if (e.key === "Escape") {
          cancelRef.current = true;
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function EditableNumber({
  value,
  onSave,
  ...rest
}: BaseProps & {
  value: number;
  onSave: (next: number) => void;
}) {
  const [v, setV] = useState(value === 0 ? "" : String(value));
  const valueRef = useRef(value);
  const cancelRef = useRef(false);
  useEffect(() => {
    valueRef.current = value;
    setV(value === 0 ? "" : String(value));
  }, [value]);
  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setV(valueRef.current === 0 ? "" : String(valueRef.current));
      return;
    }
    const n = v === "" ? 0 : Number(v);
    if (!Number.isFinite(n)) {
      setV(valueRef.current === 0 ? "" : String(valueRef.current));
      return;
    }
    if (n !== valueRef.current) onSave(n);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      step="1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const el = e.currentTarget as HTMLInputElement;
          if (!focusNextEditableInput(el)) el.blur();
        }
        if (e.key === "Escape") {
          cancelRef.current = true;
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      placeholder={rest.placeholder}
      disabled={rest.disabled}
      className={cn(
        "w-full bg-transparent border-0 outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded-sm px-1 -mx-1 text-right tabular-nums",
        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        rest.inputClassName,
      )}
    />
  );
}

function normalizeDate(d: string): string {
  // Accept "YYYY-MM-DD", ISO timestamp, or "" — return "YYYY-MM-DD" or ""
  if (!d) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
  return m ? m[1] : "";
}

export function EditableDate({
  value,
  onSave,
  required = false,
  ...rest
}: BaseProps & {
  value: string;
  onSave: (next: string) => void;
  required?: boolean;
}) {
  const initial = normalizeDate(value);
  const [v, setV] = useState(initial);
  const initialRef = useRef(initial);
  const cancelRef = useRef(false);
  useEffect(() => {
    const norm = normalizeDate(value);
    initialRef.current = norm;
    setV(norm);
  }, [value]);
  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setV(initialRef.current);
      return;
    }
    if (required && !v) {
      // Required field cannot be cleared — revert to initial.
      setV(initialRef.current);
      return;
    }
    if (v !== initialRef.current) onSave(v);
  };
  return (
    <input
      type="date"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const el = e.currentTarget as HTMLInputElement;
          if (!focusNextEditableInput(el)) el.blur();
        }
        if (e.key === "Escape") {
          cancelRef.current = true;
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      disabled={rest.disabled}
      className={cn(
        "w-full bg-transparent border-0 outline-none focus:bg-background focus:ring-1 focus:ring-ring rounded-sm px-1 -mx-1 text-xs",
        rest.inputClassName,
      )}
    />
  );
}
