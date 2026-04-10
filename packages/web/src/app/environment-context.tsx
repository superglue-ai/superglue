"use client";
import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useConfig } from "./config-context";
import { useOrgOptional } from "./org-context";
import { tokenRegistry } from "../lib/token-registry";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type ExecutionMode = "dev" | "prod";

interface EnvironmentContextValue {
  mode: ExecutionMode;
  setMode: (mode: ExecutionMode) => void;
  hasMultiEnvSystems: boolean;
  isLoading: boolean;
  refreshHasMultiEnvSystems: () => void;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

const BASE_STORAGE_KEY = "superglue-environment-mode";
const MULTI_ENV_KEY = "multi-env-systems";

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const org = useOrgOptional();
  const orgId = org?.orgId;
  const storageKey = orgId ? `${BASE_STORAGE_KEY}:${orgId}` : BASE_STORAGE_KEY;
  const [mode, setModeState] = useState<ExecutionMode>("prod");
  const queryClient = useQueryClient();

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "dev" || stored === "prod") {
      setModeState(stored);
    } else if (stored === "development") {
      setModeState("dev");
      localStorage.setItem(storageKey, "dev");
    } else if (stored === "production") {
      setModeState("prod");
      localStorage.setItem(storageKey, "prod");
    }
  }, [storageKey]);

  const setMode = useCallback(
    (newMode: ExecutionMode) => {
      setModeState(newMode);
      localStorage.setItem(storageKey, newMode);
    },
    [storageKey],
  );

  const multiEnvQuery = useQuery({
    queryKey: [MULTI_ENV_KEY, orgId],
    queryFn: async () => {
      const token = tokenRegistry.getToken();
      const response = await fetch(`${config.apiEndpoint}/v1/systems/has-multi-env`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.hasMultiEnvSystems || false;
    },
    enabled: !!config.apiEndpoint,
    staleTime: 60_000,
  });

  const refreshHasMultiEnvSystems = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [MULTI_ENV_KEY, orgId] });
  }, [queryClient, orgId]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      hasMultiEnvSystems: multiEnvQuery.data ?? false,
      isLoading: multiEnvQuery.isLoading,
      refreshHasMultiEnvSystems,
    }),
    [mode, setMode, multiEnvQuery.data, multiEnvQuery.isLoading, refreshHasMultiEnvSystems],
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error("useEnvironment must be used within an EnvironmentProvider");
  }
  return context;
}
