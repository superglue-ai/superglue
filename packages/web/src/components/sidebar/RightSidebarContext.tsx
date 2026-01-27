"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  ComponentType,
} from "react";
import { PlaygroundAgentSidebar } from "../tools/agent/PlaygroundAgentSidebar";

type SendMessageFn = (message: string) => void;

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
  registerAgentSendMessage: (fn: SendMessageFn) => void;
  sendMessageToAgent: (message: string) => void;
  setExpandSidebar: (fn: () => void) => void;
}

const RightSidebarContext = createContext<RightSidebarContextType>({
  showAgent: false,
  setShowAgent: () => {},
  agentPortalRef: null,
  setAgentPortalRef: () => {},
  AgentSidebarComponent: null,
  registerAgentSendMessage: () => {},
  sendMessageToAgent: () => {},
  setExpandSidebar: () => {},
});

export function RightSidebarProvider({ children }: { children: ReactNode }) {
  const [showAgent, setShowAgent] = useState(false);
  const [agentPortalRef, setAgentPortalRef] = useState<HTMLDivElement | null>(null);
  const agentSendMessageRef = useRef<SendMessageFn | null>(null);
  const expandSidebarRef = useRef<(() => void) | null>(null);

  const registerAgentSendMessage = useCallback((fn: SendMessageFn) => {
    agentSendMessageRef.current = fn;
  }, []);

  const setExpandSidebar = useCallback((fn: () => void) => {
    expandSidebarRef.current = fn;
  }, []);

  const sendMessageToAgent = useCallback((message: string) => {
    expandSidebarRef.current?.();
    agentSendMessageRef.current?.(message);
  }, []);

  return (
    <RightSidebarContext.Provider
      value={{
        showAgent,
        setShowAgent,
        agentPortalRef,
        setAgentPortalRef,
        AgentSidebarComponent: PlaygroundAgentSidebar,
        registerAgentSendMessage,
        sendMessageToAgent,
        setExpandSidebar,
      }}
    >
      {children}
    </RightSidebarContext.Provider>
  );
}

export const useRightSidebar = () => useContext(RightSidebarContext);
