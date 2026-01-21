"use client";

import { createContext, useContext, useState, ReactNode, ComponentType } from "react";
import { PlaygroundAgentSidebar } from "../tools/agent/PlaygroundAgentSidebar";

interface RightSidebarContextType {
  showAgent: boolean;
  setShowAgent: (show: boolean) => void;
  agentPortalRef: HTMLDivElement | null;
  setAgentPortalRef: (ref: HTMLDivElement | null) => void;
  AgentSidebarComponent: ComponentType<{
    className?: string;
    hideHeader?: boolean;
    initialError?: string;
  }> | null;
}

const RightSidebarContext = createContext<RightSidebarContextType>({
  showAgent: false,
  setShowAgent: () => {},
  agentPortalRef: null,
  setAgentPortalRef: () => {},
  AgentSidebarComponent: null,
});

export function RightSidebarProvider({ children }: { children: ReactNode }) {
  const [showAgent, setShowAgent] = useState(false);
  const [agentPortalRef, setAgentPortalRef] = useState<HTMLDivElement | null>(null);
  return (
    <RightSidebarContext.Provider
      value={{
        showAgent,
        setShowAgent,
        agentPortalRef,
        setAgentPortalRef,
        AgentSidebarComponent: PlaygroundAgentSidebar,
      }}
    >
      {children}
    </RightSidebarContext.Provider>
  );
}

export const useRightSidebar = () => useContext(RightSidebarContext);
