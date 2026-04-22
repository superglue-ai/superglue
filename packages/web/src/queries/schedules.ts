import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ToolSchedule } from "@superglue/shared";
import { queryKeys } from "./query-keys";
import { useEESuperglueClient } from "./use-client";
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
  const createClient = useEESuperglueClient();

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

export function useCreateSchedule() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toolId,
      schedule,
    }: {
      toolId: string;
      schedule: {
        cronExpression: string;
        timezone: string;
        enabled?: boolean;
        payload?: Record<string, any>;
        options?: Record<string, any>;
      };
    }) => {
      const client = createClient();
      return client.createToolSchedule(toolId, schedule);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(orgId) });
    },
  });
}

export function useUpdateSchedule() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toolId,
      scheduleId,
      updates,
    }: {
      toolId: string;
      scheduleId: string;
      updates: Record<string, any>;
    }) => {
      const client = createClient();
      return client.updateToolSchedule(toolId, scheduleId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(orgId) });
    },
  });
}

export function useDeleteSchedule() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ toolId, scheduleId }: { toolId: string; scheduleId: string }) => {
      const client = createClient();
      return client.deleteToolSchedule(toolId, scheduleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(orgId) });
    },
  });
}
