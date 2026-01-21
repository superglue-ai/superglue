import { ToolSchedule } from "@superglue/shared";
import { createContext, ReactNode, useContext } from "react";

interface SchedulesContextType {
  schedules: ToolSchedule[];
  isInitiallyLoading: boolean;
  isRefreshing: boolean;
  refreshSchedules: () => Promise<void>;
  getSchedulesForTool: (toolId: string) => ToolSchedule[];
}

const SchedulesContext = createContext<SchedulesContextType | null>(null);

export function SchedulesProvider({ children }: { children: ReactNode; }) {
  const context: SchedulesContextType = {
    schedules: [],
    isInitiallyLoading: false,
    isRefreshing: false,
    refreshSchedules: async () => { },
    getSchedulesForTool: () => [],
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
