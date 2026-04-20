import { LineItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useRef } from "react";

export function LineItemsEditor({
  items,
  onChange,
  minRows = 8,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  minRows?: number;
}) {
  const lastDescRef = useRef<HTMLInputElement | null>(null);

  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange(newItems);
  };

  const addItem = () => {
    onChange([
      ...items,
      { description: "", unit: "式", quantity: 1, unitPrice: 0 },
    ]);
    setTimeout(() => lastDescRef.current?.focus(), 0);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const tax = Math.floor(subtotal * 0.1);
  const total = subtotal + tax;

  const displayCount = Math.max(items.length, minRows);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded border border-border">
        <div className="grid grid-cols-[40px_1fr_70px_90px_120px_140px_40px] bg-primary text-primary-foreground text-xs font-medium">
          <div className="px-2 py-2 text-center border-r border-primary-foreground/20">No.</div>
          <div className="px-2 py-2 border-r border-primary-foreground/20">摘要</div>
          <div className="px-2 py-2 border-r border-primary-foreground/20 text-center">単位</div>
          <div className="px-2 py-2 border-r border-primary-foreground/20 text-right">数量</div>
          <div className="px-2 py-2 border-r border-primary-foreground/20 text-right">単価</div>
          <div className="px-2 py-2 border-r border-primary-foreground/20 text-right">金額</div>
          <div className="px-1 py-2"></div>
        </div>
        {Array.from({ length: displayCount }).map((_, index) => {
          const item = items[index];
          const isReal = !!item;
          const isLastReal = isReal && index === items.length - 1;
          const amount = isReal ? item.quantity * item.unitPrice : 0;
          return (
            <div
              key={index}
              className={`grid grid-cols-[40px_1fr_70px_90px_120px_140px_40px] border-t border-border text-sm ${
                isReal ? "bg-background" : "bg-muted/20"
              }`}
            >
              <div className="px-2 py-1.5 text-center text-muted-foreground tabular-nums border-r border-border self-center">
                {index + 1}
              </div>
              <input
                ref={isLastReal ? lastDescRef : undefined}
                value={item?.description ?? ""}
                onFocus={() => {
                  if (!isReal) addItem();
                }}
                onChange={(e) => {
                  if (isReal) updateItem(index, "description", e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (isLastReal) addItem();
                  }
                }}
                readOnly={!isReal}
                className="px-2 py-1.5 bg-transparent outline-none focus:bg-accent/10 border-r border-border min-w-0 text-foreground"
              />
              <input
                value={item?.unit ?? ""}
                onChange={(e) => isReal && updateItem(index, "unit", e.target.value)}
                readOnly={!isReal}
                className="px-2 py-1.5 bg-transparent outline-none focus:bg-accent/10 border-r border-border text-center min-w-0 text-foreground"
              />
              <input
                type="number"
                min="0"
                step="any"
                value={isReal ? item.quantity : ""}
                onChange={(e) => {
                  if (!isReal) return;
                  const n = e.target.valueAsNumber;
                  updateItem(index, "quantity", Number.isFinite(n) ? n : 0);
                }}
                disabled={!isReal}
                className="px-2 py-1.5 bg-transparent outline-none focus:bg-accent/10 border-r border-border text-right tabular-nums min-w-0"
              />
              <input
                type="number"
                min="0"
                step="any"
                value={isReal ? item.unitPrice : ""}
                onChange={(e) => {
                  if (!isReal) return;
                  const n = e.target.valueAsNumber;
                  updateItem(index, "unitPrice", Number.isFinite(n) ? n : 0);
                }}
                disabled={!isReal}
                className="px-2 py-1.5 bg-transparent outline-none focus:bg-accent/10 border-r border-border text-right tabular-nums min-w-0"
              />
              <div className="px-2 py-1.5 text-right tabular-nums border-r border-border self-center">
                {isReal ? formatCurrency(amount) : ""}
              </div>
              <div className="flex items-center justify-center">
                {isReal && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    aria-label="行を削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          行を追加
        </Button>
        <div className="w-72 border border-border rounded overflow-hidden text-sm">
          <div className="grid grid-cols-[1fr_140px]">
            <div className="px-3 py-2 bg-muted/40 border-r border-border text-right">
              小計
            </div>
            <div className="px-3 py-2 text-right tabular-nums">
              {formatCurrency(subtotal)}
            </div>
            <div className="px-3 py-2 bg-muted/40 border-r border-t border-border text-right">
              消費税 (10%)
            </div>
            <div className="px-3 py-2 border-t border-border text-right tabular-nums">
              {formatCurrency(tax)}
            </div>
            <div className="px-3 py-2 bg-primary text-primary-foreground border-r border-t border-border text-right font-bold">
              合計
            </div>
            <div className="px-3 py-2 bg-primary text-primary-foreground border-t border-border text-right tabular-nums font-bold">
              {formatCurrency(total)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
