import { useCallback } from "react";
import { SuperglueClient } from "@superglue/shared";
import { EESuperglueClient } from "@/src/lib/ee-superglue-client";
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

export function useEESuperglueClient() {
  const { apiEndpoint } = useConfig();

  return useCallback(() => {
    return new EESuperglueClient({
      apiEndpoint,
      apiKey: tokenRegistry.getToken(),
      onInfrastructureError: () => connectionMonitor.onInfrastructureError(apiEndpoint),
    });
  }, [apiEndpoint]);
}
