"use client";

import { ToolCall } from "@superglue/shared";
import { useCallback } from "react";
import type { UseAgentToolsReturn } from "./types";
import {
  mutateToolCallInMessages,
  ToolMutation,
} from "@/src/lib/agent/agent-tools/tool-call-state";

interface UseAgentToolsOptions {
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  messagesRef: React.MutableRefObject<any[]>;
}

export function useAgentTools({
  setMessages,
  messagesRef,
}: UseAgentToolsOptions): UseAgentToolsReturn {
  const handleToolInputChange = useCallback((_newInput: any) => {}, []);

  const handleToolMutation = useCallback(
    (toolCallId: string, mutation: ToolMutation) => {
      const nextMessages = mutateToolCallInMessages(messagesRef.current, toolCallId, mutation);
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
    },
    [messagesRef, setMessages],
  );

  const handleToolUpdate = useCallback(
    (toolCallId: string, updates: Partial<ToolCall>) => {
      handleToolMutation(toolCallId, updates);
    },
    [handleToolMutation],
  );

  return {
    handleToolInputChange,
    handleToolUpdate,
    handleToolMutation,
  };
}
