"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { AgentInterface } from "./AgentInterface";

export interface AgentModalPrompt {
  userPrompt: string;
  systemPrompt: string;
  chatTitle?: string;
  chatIcon?: string;
}

interface AgentModalContextValue {
  openAgentModal: (prompt: AgentModalPrompt) => void;
  closeAgentModal: () => void;
  isAgentModalOpen: boolean;
  modalPrompt: AgentModalPrompt | null;
  registerOnClose: (cb: () => void) => () => void;
}

const AgentModalContext = createContext<AgentModalContextValue | null>(null);

export function useAgentModal() {
  const context = useContext(AgentModalContext);
  if (!context) {
    throw new Error("useAgentModal must be used within AgentModalProvider");
  }
  return context;
}

interface AgentModalProviderProps {
  children: ReactNode;
}

export function AgentModalProvider({ children }: AgentModalProviderProps) {
  const [modalPrompt, setModalPrompt] = useState<AgentModalPrompt | null>(null);
  const onCloseCallbacksRef = useRef<Set<() => void>>(new Set());
  const pathname = usePathname();

  useEffect(() => {
    if (modalPrompt !== null) {
      closeAgentModal();
    }
  }, [pathname]);

  const registerOnClose = useCallback((cb: () => void) => {
    onCloseCallbacksRef.current.add(cb);
    return () => {
      onCloseCallbacksRef.current.delete(cb);
    };
  }, []);

  const openAgentModal = useCallback((prompt: AgentModalPrompt) => {
    setModalPrompt(prompt);
  }, []);

  const closeAgentModal = useCallback(() => {
    setModalPrompt(null);
    onCloseCallbacksRef.current.forEach((cb) => cb());
  }, []);

  const isAgentModalOpen = modalPrompt !== null;

  return (
    <AgentModalContext.Provider
      value={{ openAgentModal, closeAgentModal, isAgentModalOpen, modalPrompt, registerOnClose }}
    >
      {children}
    </AgentModalContext.Provider>
  );
}

export function AgentModalContent() {
  const { modalPrompt, closeAgentModal } = useAgentModal();

  if (!modalPrompt) return null;

  return (
    <div className="absolute inset-0 z-40 bg-background">
      <Button
        variant="ghost"
        size="icon"
        onClick={closeAgentModal}
        className="absolute top-4 right-4 z-50 h-10 w-10 rounded-full bg-muted/80 hover:bg-muted"
      >
        <X className="h-5 w-5" />
      </Button>
      <AgentInterface initialPrompts={modalPrompt} />
    </div>
  );
}
