import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { TunnelConnection, System } from "@superglue/shared";
import { queryKeys } from "./query-keys";
import { useSuperglueClient } from "./use-client";
import { useOrg, useOrgOptional } from "@/src/app/org-context";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";

export function useInvalidateSystems() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.systems.all(orgId) }),
    [queryClient, orgId],
  );
}

function useSystemsInternal(orgId: string | undefined) {
  const createClient = useSuperglueClient();
  const { apiEndpoint } = useConfig();

  const systemsQuery = useQuery({
    queryKey: queryKeys.systems.list(orgId ?? ""),
    queryFn: async () => {
      const client = createClient();
      const { items } = await client.listSystems(100);
      return items;
    },
    enabled: !!orgId,
  });

  const tunnelsQuery = useQuery({
    queryKey: queryKeys.systems.tunnels(orgId ?? ""),
    queryFn: async () => {
      const token = tokenRegistry.getToken();
      const response = await fetch(`${apiEndpoint}/v1/tunnels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []) as TunnelConnection[];
    },
    enabled: !!orgId,
  });

  const isTunnelConnected = useCallback(
    (tunnelId: string) => (tunnelsQuery.data ?? []).some((t) => t.id === tunnelId),
    [tunnelsQuery.data],
  );

  return {
    systems: systemsQuery.data ?? [],
    loading: systemsQuery.isLoading,
    isRefreshing: systemsQuery.isRefetching,
    connectedTunnels: tunnelsQuery.data ?? [],
    isTunnelConnected,
    error: systemsQuery.error,
  };
}

export function useSystems() {
  const { orgId } = useOrg();
  return useSystemsInternal(orgId);
}

export function useSystemsOptional() {
  const org = useOrgOptional();
  const result = useSystemsInternal(org?.orgId);
  if (!org?.orgId) {
    return null;
  }
  return result;
}

export function useSystem(systemId: string, options?: { environment?: "dev" | "prod" }) {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();
  return useQuery<System | null>({
    queryKey: [...queryKeys.systems.detail(orgId, systemId), options?.environment ?? "default"],
    queryFn: async () => {
      const client = createClient();
      return client.getSystem(systemId, options);
    },
    enabled: !!orgId && !!systemId,
  });
}

export function useCreateSystem() {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, any>) => {
      const client = createClient();
      return client.createSystem(input as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systems.all(orgId) });
    },
  });
}

export function useUpdateSystem() {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
      options,
    }: {
      id: string;
      input: Record<string, any>;
      options?: { environment?: "dev" | "prod" };
    }) => {
      const client = createClient();
      return client.updateSystem(id, input as any, options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systems.all(orgId) });
    },
  });
}

export function useDeleteSystem() {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      options,
    }: {
      id: string;
      options?: { environment?: "dev" | "prod" };
    }) => {
      const client = createClient();
      return client.deleteSystem(id, options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systems.all(orgId) });
    },
  });
}
