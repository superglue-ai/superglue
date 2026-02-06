import { System, SuperglueClient } from "@superglue/shared";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useConfig } from "./config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { loadFromCache, saveToCache } from "@/src/lib/cache-utils";

interface SystemsContextType {
  systems: System[];
  pendingDocIds: Set<string>;
  loading: boolean;
  isRefreshing: boolean;
  refreshSystems: () => Promise<void>;
  setPendingDocIds: (updater: (prev: Set<string>) => Set<string>) => void;
}

const SystemsContext = createContext<SystemsContextType | null>(null);

const CACHE_PREFIX = "superglue-systems-cache";

interface CachedSystems {
  systems: System[];
  pendingDocIds: string[];
  timestamp: number;
}

export function SystemsProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const [systems, setSystems] = useState<System[]>([]);
  const [pendingDocIds, setPendingDocIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshSystems = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const client = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });
      const { items } = await client.listSystems(100);
      setSystems(items);

      const pendingIds = items
        .filter((system) => system.documentationPending)
        .map((system) => system.id);
      const newPendingDocIds = new Set(pendingIds);
      setPendingDocIds(newPendingDocIds);

      const systemsForCache = items.map(({ documentation, openApiSchema, ...rest }) => rest);

      saveToCache(CACHE_PREFIX, {
        systems: systemsForCache,
        pendingDocIds: Array.from(newPendingDocIds),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error loading systems:", error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [config.superglueEndpoint]);

  useEffect(() => {
    const cachedData = loadFromCache<CachedSystems>(CACHE_PREFIX);
    if (cachedData) {
      setSystems(cachedData.systems);
      setPendingDocIds(new Set(cachedData.pendingDocIds || []));
      setLoading(false);
    } else {
      setLoading(true);
    }
    refreshSystems();
  }, [config.superglueEndpoint]);

  return (
    <SystemsContext.Provider
      value={{
        systems,
        pendingDocIds,
        loading,
        isRefreshing,
        refreshSystems,
        setPendingDocIds,
      }}
    >
      {children}
    </SystemsContext.Provider>
  );
}

export function useSystems() {
  const context = useContext(SystemsContext);
  if (!context) {
    throw new Error("useSystems must be used within a SystemsProvider");
  }
  return context;
}

export function useSystemsOptional(): SystemsContextType | null {
  return useContext(SystemsContext);
}
