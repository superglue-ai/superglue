import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { useEESuperglueClient } from "./use-client";
import { hasResolvedOrgId, useOrg } from "@/src/app/org-context";
import type { ApiKey } from "@/src/lib/ee-superglue-client";

export function useApiKeys() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();

  return useQuery<ApiKey[]>({
    queryKey: queryKeys.apiKeys.list(orgId),
    queryFn: async () => {
      const client = createClient();
      return client.listApiKeys();
    },
    enabled: hasResolvedOrgId(orgId),
  });
}

export function useCreateApiKey() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (options?: {
      mode?: "frontend" | "backend";
      userId?: string | null;
      permissions?: Record<string, any>;
    }) => {
      const client = createClient();
      return client.createApiKey(options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(orgId) });
    },
  });
}

export function useDeleteApiKey() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const client = createClient();
      return client.deleteApiKey(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all(orgId) });
    },
  });
}
