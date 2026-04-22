import { useQuery } from "@tanstack/react-query";
import { useEESuperglueClient } from "./use-client";
import { queryKeys } from "./query-keys";
import { hasResolvedOrgId } from "@/src/app/org-context";

export interface BillingStatus {
  isPro: boolean;
}

export function useOrgProfileQuery(orgId: string | undefined, token: string | null) {
  const createClient = useEESuperglueClient();

  return useQuery({
    queryKey: [...queryKeys.org.me(orgId ?? ""), token ?? ""],
    queryFn: () => createClient().getMe(),
    enabled: hasResolvedOrgId(orgId) && !!token,
  });
}

export function useBillingStatusQuery(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.org.billing(userId ?? ""),
    queryFn: async (): Promise<BillingStatus> => {
      const response = await fetch(`https://billing.superglue.cloud/v1/billing/status/${userId}`);
      if (!response.ok) {
        throw new Error(`Billing API returned ${response.status}`);
      }

      const status = await response.json();
      return { isPro: status.status === "active" };
    },
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
