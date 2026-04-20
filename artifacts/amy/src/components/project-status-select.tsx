import { ProjectStatus } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PROJECT_STATUS_OPTIONS = [
  { value: ProjectStatus.estimating, label: "見積中" },
  { value: ProjectStatus.contracted, label: "受注" },
  { value: ProjectStatus.in_progress, label: "施工中" },
  { value: ProjectStatus.completed, label: "竣工" },
  { value: ProjectStatus.archived, label: "完了" },
];

export function ProjectStatusSelect({
  value,
  onChange,
  placeholder = "ステータス",
  className,
}: {
  value?: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUS_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
