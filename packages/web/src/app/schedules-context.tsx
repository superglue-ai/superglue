import { ToolSchedule } from "@superglue/shared";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useConfig } from "./config-context";
import { loadFromCache, saveToCache } from "@/src/lib/cache-utils";
import { createSuperglueClient } from "../lib/client-utils";

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
      const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
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
  }, [config.superglueEndpoint, config.apiEndpoint]);

  const getSchedulesForTool = useCallback(
    (toolId: string): ToolSchedule[] => {
      return schedules.filter((s) => s.toolId === toolId);
    },
    [schedules],
  );

  useEffect(() => {
    const cachedSchedules = loadFromCache<CachedSchedules>(CACHE_PREFIX);
    if (cachedSchedules) {
      setSchedules(cachedSchedules.schedules);
      setIsInitiallyLoading(false);
    } else {
      setIsInitiallyLoading(true);
    }

    refreshSchedules();
  }, [config.superglueEndpoint, refreshSchedules]);

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
    throw new Error("useSchedules must be used within a SchedulesProvider.");
  }

  return context;
}
