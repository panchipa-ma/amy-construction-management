import { ProjectStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
  [ProjectStatus.estimating]: { label: "見積中", className: "bg-blue-100 text-blue-800 border-blue-200" },
  [ProjectStatus.contracted]: { label: "受注", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  [ProjectStatus.in_progress]: { label: "施工中", className: "bg-amber-100 text-amber-800 border-amber-200" },
  [ProjectStatus.completed]: { label: "竣工", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  [ProjectStatus.archived]: { label: "完了", className: "bg-gray-100 text-gray-800 border-gray-200" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[ProjectStatus.archived];
  return (
    <Badge variant="outline" className={`${config.className} font-medium whitespace-nowrap`}>
      {config.label}
    </Badge>
  );
}
