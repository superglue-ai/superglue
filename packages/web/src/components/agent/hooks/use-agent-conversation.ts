"use client";

import { Message } from "@superglue/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation } from "../ConversationHistory";
import type { UseAgentConversationReturn } from "./types";
import type { AgentWelcomeRef } from "../welcome/AgentWelcome";

interface UseAgentConversationOptions {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  clearFiles: () => void;
  welcomeRef?: React.RefObject<AgentWelcomeRef>;
}

export function useAgentConversation({
  setMessages,
  setIsLoading,
  clearFiles,
  welcomeRef,
}: UseAgentConversationOptions): UseAgentConversationReturn {
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(`session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }, []);

  const loadConversation = useCallback(
    (conversation: Conversation) => {
      const cleanedMessages = conversation.messages.map((msg) => ({
        ...msg,
        isStreaming: false,
        tools: msg.tools?.map((tool) =>
          tool.status === "running" || tool.status === "pending"
            ? { ...tool, status: "stopped" as const, endTime: tool.endTime || new Date() }
            : tool,
        ),
        parts: msg.parts?.map((part) =>
          part.type === "tool" &&
          part.tool &&
          (part.tool.status === "running" || part.tool.status === "pending")
            ? {
                ...part,
                tool: {
                  ...part.tool,
                  status: "stopped" as const,
                  endTime: part.tool.endTime || new Date(),
                },
              }
            : part,
        ),
      }));

      setMessages(cleanedMessages);
      setCurrentConversationId(conversation.id);
      welcomeRef?.current?.cleanup();
      clearFiles();
      setIsLoading(false);
    },
    [setMessages, setIsLoading, clearFiles, welcomeRef],
  );

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    welcomeRef?.current?.cleanup();
    setIsLoading(false);
    clearFiles();
  }, [setMessages, setIsLoading, clearFiles, welcomeRef]);

  return {
    currentConversationId,
    setCurrentConversationId,
    sessionId,
    loadConversation,
    startNewConversation,
  };
}
