"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
  ComponentType,
} from "react";
import { PlaygroundAgentSidebar } from "../tools/agent/PlaygroundAgentSidebar";

type SetInputFn = (message: string) => void;
type ResetChatFn = () => void;

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
  registerSetAgentInput: (fn: SetInputFn) => void;
  sendMessageToAgent: (message: string) => void;
  registerSetSidebarExpanded: (fn: (expanded: boolean) => void) => void;
  registerResetAgentChat: (fn: ResetChatFn) => void;
  agentMode: PlaygroundMode;
  setAgentMode: (mode: PlaygroundMode) => void;
  systemConfig: SystemConfigForAgent | undefined;
  setSystemConfig: (config: SystemConfigForAgent | undefined) => void;
  savedTool: Tool | null;
  setSavedTool: (tool: Tool | null) => void;
  playgroundTool: Tool | null;
  setPlaygroundTool: (tool: Tool | null) => void;
  onRestoreDraft?: (draft: ToolDraft) => void;
  setOnRestoreDraft: (fn: ((draft: ToolDraft) => void) | undefined) => void;
}

const RightSidebarContext = createContext<RightSidebarContextType>({
  showAgent: false,
  setShowAgent: () => {},
  agentPortalRef: null,
  setAgentPortalRef: () => {},
  AgentSidebarComponent: null,
  registerSetAgentInput: () => {},
  sendMessageToAgent: () => {},
  registerSetSidebarExpanded: () => {},
  registerResetAgentChat: () => {},
  agentMode: "tool",
  setAgentMode: () => {},
  systemConfig: undefined,
  setSystemConfig: () => {},
  savedTool: null,
  setSavedTool: () => {},
  playgroundTool: null,
  setPlaygroundTool: () => {},
  onRestoreDraft: undefined,
  setOnRestoreDraft: () => {},
});

export function RightSidebarProvider({ children }: { children: ReactNode }) {
  const [showAgent, setShowAgent] = useState(false);
  const [agentPortalRef, setAgentPortalRef] = useState<HTMLDivElement | null>(null);
  const [sidebarExpanded, setSidebarExpandedState] = useState(false);
  const [agentMode, setAgentMode] = useState<PlaygroundMode>("tool");
  const [systemConfig, setSystemConfig] = useState<SystemConfigForAgent | undefined>(undefined);
  const [savedTool, setSavedTool] = useState<Tool | null>(null);
  const [playgroundTool, setPlaygroundTool] = useState<Tool | null>(null);
  const onRestoreDraftRef = useRef<((draft: ToolDraft) => void) | null>(null);
  const setAgentInputRef = useRef<SetInputFn | null>(null);
  const setSidebarExpandedRef = useRef<((expanded: boolean) => void) | null>(null);
  const resetAgentChatRef = useRef<ResetChatFn | null>(null);

  // Cmd+L (Mac) / Ctrl+L (Windows/Linux) to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        setSidebarExpandedRef.current?.(!sidebarExpanded);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarExpanded]);

  const registerSetAgentInput = useCallback((fn: SetInputFn) => {
    setAgentInputRef.current = fn;
  }, []);

  const registerSetSidebarExpanded = useCallback((fn: (expanded: boolean) => void) => {
    setSidebarExpandedRef.current = (expanded: boolean) => {
      setSidebarExpandedState(expanded);
      fn(expanded);
    };
  }, []);

  const registerResetAgentChat = useCallback((fn: ResetChatFn) => {
    resetAgentChatRef.current = fn;
  }, []);

  const sendMessageToAgent = useCallback((message: string) => {
    setSidebarExpandedRef.current?.(true);
    setAgentInputRef.current?.(message);
  }, []);

  return (
    <RightSidebarContext.Provider
      value={{
        showAgent,
        setShowAgent,
        agentPortalRef,
        setAgentPortalRef,
        AgentSidebarComponent: PlaygroundAgentSidebar,
        registerSetAgentInput,
        sendMessageToAgent,
        registerSetSidebarExpanded,
        registerResetAgentChat,
        agentMode,
        setAgentMode,
        systemConfig,
        setSystemConfig,
        savedTool,
        setSavedTool,
        playgroundTool,
        setPlaygroundTool,
        onRestoreDraft,
        setOnRestoreDraft,
      }}
    >
      {children}
    </RightSidebarContext.Provider>
  );
}

export const useRightSidebar = () => useContext(RightSidebarContext);
