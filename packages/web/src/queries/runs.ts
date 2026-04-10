import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { useSuperglueClient } from "./use-client";
import { useOrg } from "@/src/app/org-context";

interface UseRunsParams {
  page: number;
  pageSize?: number;
  search?: string;
  status?: string;
  triggers?: string[];
  timeRange?: string;
  searchUserIds?: string[];
  startedAfter?: Date | null;
}

export function useRuns({
  page,
  pageSize = 25,
  search,
  status,
  triggers,
  timeRange,
  searchUserIds,
  startedAfter,
}: UseRunsParams) {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();

  const filters = {
    search,
    status,
    triggers,
    timeRange,
  };

  return useQuery({
    queryKey: [...queryKeys.runs.list(orgId, filters), page],
    queryFn: async ({ signal }) => {
      const client = createClient();
      const params: Parameters<typeof client.listRuns>[0] & {
        startedAfter?: Date;
        searchUserIds?: string[];
        includeTotal?: boolean;
        signal?: AbortSignal;
      } = {
        limit: pageSize,
        page: page + 1,
        includeTotal: false,
        signal,
      };

      if (status && status !== "all") {
        params.status = status.toLowerCase() as "running" | "success" | "failed" | "aborted";
      }

      if (triggers && triggers.length > 0) {
        params.requestSources = triggers as Parameters<typeof client.listRuns>[0]["requestSources"];
      }

      if (startedAfter) {
        params.startedAfter = startedAfter;
      }

      if (search) {
        params.search = search;
        if (searchUserIds && searchUserIds.length > 0) {
          params.searchUserIds = searchUserIds;
        }
      }

      return client.listRuns(params);
    },
    enabled: !!orgId,
    placeholderData: (previousData) => previousData,
  });
}

export function useToolRuns(
  toolId: string | undefined,
  options?: {
    requestSources?: string[];
    limit?: number;
    enabled?: boolean;
  },
) {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();

  return useQuery({
    queryKey: queryKeys.runs.list(orgId, {
      toolId: toolId ?? "",
      triggers: options?.requestSources,
    }),
    queryFn: async () => {
      const client = createClient();
      const params: any = {
        limit: options?.limit ?? 10,
        page: 1,
        toolId,
      };
      if (options?.requestSources && options.requestSources.length > 0) {
        params.requestSources = options.requestSources;
      }
      return client.listRuns(params);
    },
    enabled: options?.enabled !== false && !!orgId && !!toolId,
  });
}
