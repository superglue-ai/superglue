import { Tool } from "@superglue/shared";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useConfig } from "./config-context";
import { loadFromCacheAsync, saveToCache } from "@/src/lib/cache-utils";
import { createSuperglueClient } from "../lib/client-utils";

interface ToolsContext {
  tools: Tool[];
  isInitiallyLoading: boolean;
  isRefreshing: boolean;
  refreshTools: () => Promise<void>;
}

export type CachedTools = {
  tools: Tool[];
  timestamp: number;
};

const CACHE_PREFIX = "superglue-tools";
const ToolsContext = createContext<ToolsContext | null>(null);

export function ToolsProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const [tools, setTools] = useState<Tool[]>([]);
  const [isInitiallyLoading, setIsInitiallyLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshTools = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const client = createSuperglueClient(config.apiEndpoint);
      const result = await client.listWorkflows(1000, 0);
      setTools(result.items);

      const toCache: CachedTools = {
        tools: result.items,
        timestamp: Date.now(),
      };

      saveToCache(CACHE_PREFIX, toCache);
    } catch (error) {
      console.error("Error loading tools:", error);
    } finally {
      setIsInitiallyLoading(false);
      setIsRefreshing(false);
    }
  }, [config.apiEndpoint, config.apiEndpoint]);

  useEffect(() => {
    const init = async () => {
      setIsInitiallyLoading(true);
      const cachedTools = await loadFromCacheAsync<CachedTools>(CACHE_PREFIX);
      if (cachedTools) {
        setTools(cachedTools.tools);
        setIsInitiallyLoading(false);
      }
      refreshTools();
    };
    init();
  }, [config.apiEndpoint]);

  const context = {
    tools,
    isInitiallyLoading,
    isRefreshing,
    refreshTools,
  };

  return <ToolsContext.Provider value={context}>{children}</ToolsContext.Provider>;
}

export function useTools(): ToolsContext {
  const context = useContext(ToolsContext);
  if (!context) {
    throw new Error("useTools must be used within an ToolsProvider.");
  }

  return context;
}

export function useToolsOptional(): ToolsContext | null {
  return useContext(ToolsContext);
}
