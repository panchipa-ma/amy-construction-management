// 見積書・職人見積書 で共通して使う、明細行のペースト解析。
//
// - クリップボードに改行/タブが含まれる場合のみ multi-cell paste と判定。
// - 列順は `description, unit, quantity, unitPrice, notes`。
// - ペースト開始フィールドからの相対オフセットで列をマッピングするので、
//   description 欄で貼ると 5 列全部、数量欄で貼ると [quantity, unitPrice, notes] に
//   マップされる。

export type LineItemField =
  | "description"
  | "unit"
  | "quantity"
  | "unitPrice"
  | "notes";

export const LINE_ITEM_FIELD_ORDER: LineItemField[] = [
  "description",
  "unit",
  "quantity",
  "unitPrice",
  "notes",
];

export type ParsedLineItem = Partial<{
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}>;

export function isMultiCellPaste(text: string): boolean {
  return /\n|\t/.test(text);
}

export function parsePastedLineItems(
  text: string,
  startField: LineItemField,
): ParsedLineItem[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  // 末尾の空行は除去 (Excel コピーは末尾に改行が付く)。
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  if (lines.length === 0) return [];

  const startIdx = LINE_ITEM_FIELD_ORDER.indexOf(startField);
  if (startIdx < 0) return [];

  return lines.map((line) => {
    const cols = line.split("\t");
    const item: ParsedLineItem = {};
    cols.forEach((col, i) => {
      const field = LINE_ITEM_FIELD_ORDER[startIdx + i];
      if (!field) return;
      const trimmed = col.trim();
      if (field === "quantity" || field === "unitPrice") {
        const cleaned = trimmed.replace(/[,，¥￥\s円]/g, "");
        if (cleaned === "") return;
        const n = Number(cleaned);
        if (Number.isFinite(n)) item[field] = n;
      } else {
        item[field] = trimmed;
      }
    });
    return item;
  });
}
