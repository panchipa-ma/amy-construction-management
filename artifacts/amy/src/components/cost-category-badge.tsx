import { CostCategory } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

const CATEGORY_CONFIG: Record<CostCategory, { label: string; className: string }> = {
  [CostCategory.material]: { label: "材料", className: "bg-orange-100 text-orange-800 border-orange-200" },
  [CostCategory.subcontract]: { label: "外注", className: "bg-blue-100 text-blue-800 border-blue-200" },
  [CostCategory.labor]: { label: "労務", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  [CostCategory.expense]: { label: "経費", className: "bg-purple-100 text-purple-800 border-purple-200" },
  [CostCategory.other]: { label: "その他", className: "bg-gray-100 text-gray-800 border-gray-200" },
};

export function CostCategoryBadge({ category }: { category: CostCategory }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG[CostCategory.other];
  return (
    <Badge variant="outline" className={`${config.className} font-medium whitespace-nowrap`}>
      {config.label}
    </Badge>
  );
}
