import { useCallback } from "react";
import { SuperglueClient } from "@superglue/shared";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { connectionMonitor } from "@/src/lib/connection-monitor";

export function useSuperglueClient() {
  const { apiEndpoint } = useConfig();

  return useCallback(() => {
    return new SuperglueClient({
      apiEndpoint,
      apiKey: tokenRegistry.getToken(),
      onInfrastructureError: () => connectionMonitor.onInfrastructureError(apiEndpoint),
    });
  }, [apiEndpoint]);
}
