import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  getGetCostPipelineQueryKey,
} from "@workspace/api-client-react";

export function invalidateDashboard(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetCostPipelineQueryKey() }),
  ]).then(() => undefined);
}
