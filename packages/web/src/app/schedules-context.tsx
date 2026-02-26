import { loadFromCacheAsync, saveToCache } from "@/src/lib/cache-utils";
import { ToolSchedule } from "@superglue/shared";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { createEESuperglueClient } from "../lib/ee-superglue-client";
import { useConfig } from "./config-context";

interface SchedulesContextType {
  schedules: ToolSchedule[];
  isInitiallyLoading: boolean;
  isRefreshing: boolean;
  refreshSchedules: () => Promise<void>;
  getSchedulesForTool: (toolId: string) => ToolSchedule[];
}

export type CachedSchedules = {
  schedules: ToolSchedule[];
  timestamp: number;
};

const CACHE_PREFIX = "superglue-schedules";
const SchedulesContext = createContext<SchedulesContextType | null>(null);

export function SchedulesProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const [schedules, setSchedules] = useState<ToolSchedule[]>([]);
  const [isInitiallyLoading, setIsInitiallyLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshSchedules = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const client = createEESuperglueClient(config.apiEndpoint);
      const result = await client.listToolSchedules();
      setSchedules(result);

      const toCache: CachedSchedules = {
        schedules: result,
        timestamp: Date.now(),
      };

      saveToCache(CACHE_PREFIX, toCache);
    } catch (error) {
      console.error("Error loading schedules:", error);
    } finally {
      setIsInitiallyLoading(false);
      setIsRefreshing(false);
    }
  }, [config.apiEndpoint, config.apiEndpoint]);

  const getSchedulesForTool = useCallback(
    (toolId: string): ToolSchedule[] => {
      return schedules.filter((s) => s.toolId === toolId);
    },
    [schedules],
  );

  useEffect(() => {
    const init = async () => {
      const cachedSchedules = await loadFromCacheAsync<CachedSchedules>(CACHE_PREFIX);
      if (cachedSchedules) {
        setSchedules(cachedSchedules.schedules);
        setIsInitiallyLoading(false);
      } else {
        setIsInitiallyLoading(true);
      }
      refreshSchedules();
    };
    init();
  }, [config.apiEndpoint, refreshSchedules]);

  const context: SchedulesContextType = {
    schedules,
    isInitiallyLoading,
    isRefreshing,
    refreshSchedules,
    getSchedulesForTool,
  };

  return <SchedulesContext.Provider value={context}>{children}</SchedulesContext.Provider>;
}

export function useSchedules(): SchedulesContextType {
  const context = useContext(SchedulesContext);
  if (!context) {
    return {
      schedules: [],
      isInitiallyLoading: false,
      isRefreshing: false,
      refreshSchedules: async () => {},
      getSchedulesForTool: () => [],
    };
  }

  return context;
}
