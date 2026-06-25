import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ToolSchedule } from "@superglue/shared";
import { queryKeys } from "./query-keys";
import { useSuperglueClient } from "./use-client";
import { hasResolvedOrgId, useOrg } from "@/src/app/org-context";
import { useCallback } from "react";

export function useInvalidateSchedules() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(orgId) }),
    [queryClient, orgId],
  );
}

export function useSchedules() {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();

  const query = useQuery({
    queryKey: queryKeys.schedules.list(orgId),
    queryFn: async () => {
      const client = createClient();
      return client.listToolSchedules();
    },
    enabled: hasResolvedOrgId(orgId),
  });

  const getSchedulesForTool = useCallback(
    (toolId: string): ToolSchedule[] => {
      return (query.data ?? []).filter((s) => s.toolId === toolId);
    },
    [query.data],
  );

  return {
    schedules: query.data ?? [],
    isInitiallyLoading: query.isLoading,
    isRefreshing: query.isRefetching,
    getSchedulesForTool,
    error: query.error,
  };
}
