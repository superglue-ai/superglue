import { useQuery } from "@tanstack/react-query";
import { useEESuperglueClient } from "./use-client";
import { queryKeys } from "./query-keys";
import { hasResolvedOrgId } from "@/src/app/org-context";

export function useOrgProfileQuery(orgId: string | undefined, token: string | null) {
  const createClient = useEESuperglueClient();

  return useQuery({
    queryKey: [...queryKeys.org.me(orgId ?? ""), token ?? ""],
    queryFn: () => createClient().getMe(),
    enabled: hasResolvedOrgId(orgId) && !!token,
  });
}
