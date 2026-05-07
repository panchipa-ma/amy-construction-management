import { useState } from "react";
import { ProjectStatus } from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ProjectStatusBadge } from "@/components/status-badge";
import { PROJECT_STATUS_OPTIONS } from "@/components/project-status-select";

export function EditableProjectStatusBadge({
  status,
  onChange,
}: {
  status: ProjectStatus;
  onChange: (next: ProjectStatus) => void | Promise<void>;
}) {
  const [pending, setPending] = useState<ProjectStatus | null>(null);
  const display = pending ?? status;
  return (
    <Select
      value={display}
      onValueChange={async (val) => {
        if (val === status) return;
        setPending(val as ProjectStatus);
        try {
          await onChange(val as ProjectStatus);
        } finally {
          setPending(null);
        }
      }}
    >
      <SelectTrigger
        className="h-auto w-auto inline-flex border-0 bg-transparent shadow-none p-0 gap-1 hover:opacity-80 focus:ring-0 focus:ring-offset-0 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-50"
        aria-label="ステータスを変更"
        data-testid={`select-status-${display}`}
      >
        <ProjectStatusBadge status={display} />
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
