import { System, SuperglueClient } from "@superglue/shared";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useConfig } from "./config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { loadFromCache, saveToCache } from "@/src/lib/cache-utils";

interface SystemsContextType {
  systems: System[];
  loading: boolean;
  isRefreshing: boolean;
  refreshSystems: () => Promise<void>;
}

const SystemsContext = createContext<SystemsContextType | null>(null);

const CACHE_PREFIX = "superglue-systems-cache";

interface CachedSystems {
  systems: System[];
  timestamp: number;
}

export function SystemsProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const [systems, setSystems] = useState<System[]>([]);
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

      saveToCache(CACHE_PREFIX, {
        systems: items,
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
    const init = async () => {
      const cachedData = await loadFromCacheAsync<CachedSystems>(CACHE_PREFIX);
      if (cachedData) {
        setSystems(cachedData.systems);
        setLoading(false);
      } else {
        setLoading(true);
      }
      refreshSystems();
    };
    init();
  }, [config.superglueEndpoint, config.apiEndpoint]);

  return (
    <SystemsContext.Provider
      value={{
        systems,
        loading,
        isRefreshing,
        refreshSystems,
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
