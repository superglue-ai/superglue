"use client";

import { createContext, useContext, ReactNode, ComponentType } from "react";

interface RightSidebarContextType {
  showAgent: boolean;
  setShowAgent: (show: boolean) => void;
  agentPortalRef: HTMLDivElement | null;
  setAgentPortalRef: (ref: HTMLDivElement | null) => void;
  AgentSidebarComponent: ComponentType<{ className?: string }> | null;
}

const RightSidebarContext = createContext<RightSidebarContextType>({
  showAgent: false,
  setShowAgent: () => {},
  agentPortalRef: null,
  setAgentPortalRef: () => {},
  AgentSidebarComponent: null,
});

export function RightSidebarProvider({ children }: { children: ReactNode }) {
  return (
    <RightSidebarContext.Provider
      value={{
        showAgent: false,
        setShowAgent: () => {},
        agentPortalRef: null,
        setAgentPortalRef: () => {},
        AgentSidebarComponent: null,
      }}
    >
      {children}
    </RightSidebarContext.Provider>
  );
}

export const useRightSidebar = () => useContext(RightSidebarContext);
