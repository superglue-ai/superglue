"use client";

import {
  getToolContinuationMessage,
  hasConfirmedTool,
  hasDeclinedTool,
} from "@/src/lib/agent/agent-tools";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Message, ToolCall } from "@superglue/shared";
import { useCallback } from "react";
import type { AgentConfig, UseAgentToolsReturn } from "./types";

interface UseAgentToolsOptions {
  config: AgentConfig;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  messagesRef: React.MutableRefObject<Message[]>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  createStreamingAssistantMessage: (idOffset?: number) => Message;
  updateMessageWithData: (msg: Message, data: any, targetMessage: Message) => Message;
  sendChatMessage: (
    messages: Message[],
    assistantMessage: Message,
    signal?: AbortSignal,
  ) => Promise<void>;
  processStreamData: (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    currentAssistantMessage: Message,
  ) => Promise<void>;
  currentStreamControllerRef: React.MutableRefObject<AbortController | null>;
  filePayloads: Record<string, any>;
  toast: (options: { title: string; description: string; variant?: "destructive" }) => void;
  pendingSystemMessagesRef: React.MutableRefObject<string[]>;
}

export function useAgentTools({
  config,
  messages,
  setMessages,
  messagesRef,
  setIsLoading,
  createStreamingAssistantMessage,
  updateMessageWithData,
  sendChatMessage,
  processStreamData,
  currentStreamControllerRef,
  filePayloads,
  toast,
  pendingSystemMessagesRef,
}: UseAgentToolsOptions): UseAgentToolsReturn {
  const oauthEndpoint = config.oauthEndpoint || "/api/agent/oauth-continue";
  const getAuthToken = config.getAuthToken || (() => tokenRegistry.getToken());

  const handleToolInputChange = useCallback((_newInput: any) => {}, []);

  const handleToolUpdate = useCallback(
    (toolCallId: string, updates: Partial<ToolCall>) => {
      setMessages((prev) =>
        prev.map((msg) => {
          const updateTool = (tool: ToolCall): ToolCall =>
            tool.id === toolCallId ? { ...tool, ...updates } : tool;

          return {
            ...msg,
            tools: msg.tools?.map(updateTool),
            parts: msg.parts?.map((part) =>
              part.type === "tool" && part.tool ? { ...part, tool: updateTool(part.tool) } : part,
            ),
          };
        }),
      );
    },
    [setMessages],
  );

  const handleOAuthCompletion = useCallback(
    async (toolCallId: string, systemData: any) => {
      try {
        const isError = systemData?.oauthError;

        if (!isError) {
          setMessages((prev) =>
            prev.map((msg) => ({
              ...msg,
              tools: msg.tools?.map((tool) =>
                tool.id === toolCallId ? { ...tool, oauthCompleted: true } : tool,
              ),
              parts: msg.parts?.map((part) =>
                part.type === "tool" && part.tool?.id === toolCallId
                  ? { ...part, tool: { ...part.tool, oauthCompleted: true } }
                  : part,
              ),
            })),
          );
        }

        const assistantMessage = createStreamingAssistantMessage();
        setMessages((prev) => [...prev, assistantMessage]);
        setIsLoading(true);

        const controller = new AbortController();
        currentStreamControllerRef.current = controller;

        const payload: any = { messages, toolCallId, filePayloads };
        if (isError) {
          payload.error = systemData.oauthError;
          const { oauthError, ...cleanSystemData } = systemData;
          payload.systemData = cleanSystemData;
        } else {
          payload.systemData = systemData;
        }

        const response = await fetch(oauthEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Authentication failed. Please check your API key configuration.");
          }
          const error = await response.json();
          throw new Error(`HTTP error ${response.status}: ${error?.error || "Internal server error"}`);
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        await processStreamData(reader, assistantMessage);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;

        console.error("OAuth completion error:", error);
        toast({
          title: "OAuth Error",
          description:
            error instanceof Error ? error.message : "Failed to complete OAuth authentication.",
          variant: "destructive",
        });

        setMessages((prev) =>
          prev.map((msg) =>
            msg.isStreaming
              ? {
                  ...msg,
                  content:
                    "Sorry, I encountered an error during OAuth authentication. Please try again.",
                  isStreaming: false,
                }
              : msg,
          ),
        );
      } finally {
        setIsLoading(false);
        if (currentStreamControllerRef.current) {
          currentStreamControllerRef.current = null;
        }
      }
    },
    [
      messages,
      filePayloads,
      oauthEndpoint,
      getAuthToken,
      setMessages,
      setIsLoading,
      createStreamingAssistantMessage,
      processStreamData,
      currentStreamControllerRef,
      toast,
    ],
  );

  const addSystemMessage = useCallback(
    (message: string, options?: { triggerImmediateResponse?: boolean }) => {
      if (options?.triggerImmediateResponse) {
        const syntheticUserMessage: Message = {
          id: `system-${Date.now()}`,
          content: message,
          role: "user",
          timestamp: new Date(),
          isHidden: true,
        } as Message & { isHidden?: boolean };

        const assistantMessage = createStreamingAssistantMessage(1);
        setMessages((prev) => [...prev, syntheticUserMessage, assistantMessage]);
        setIsLoading(true);

        const controller = new AbortController();
        currentStreamControllerRef.current = controller;

        const messagesToSend = [...messagesRef.current, syntheticUserMessage];

        sendChatMessage(messagesToSend, assistantMessage, controller.signal)
          .catch((error) => {
            if (error instanceof Error && error.name === "AbortError") return;
            console.error("Error sending system message trigger:", error);
            toast({
              title: "Error",
              description: error instanceof Error ? error.message : "Failed to send message.",
              variant: "destructive",
            });
          })
          .finally(() => {
            setIsLoading(false);
            if (currentStreamControllerRef.current === controller) {
              currentStreamControllerRef.current = null;
            }
          });
      } else {
        pendingSystemMessagesRef.current.push(message);
      }
    },
    [
      createStreamingAssistantMessage,
      setMessages,
      setIsLoading,
      messagesRef,
      sendChatMessage,
      currentStreamControllerRef,
      toast,
    ],
  );

  const triggerStreamContinuation = useCallback(async () => {
    if (currentStreamControllerRef.current) {
      currentStreamControllerRef.current.abort();
    }

    setIsLoading(true);
    const controller = new AbortController();
    currentStreamControllerRef.current = controller;

    const currentMessages = messagesRef.current;
    const lastAssistantMessage = [...currentMessages].reverse().find((m) => m.role === "assistant");

    if (!lastAssistantMessage) {
      console.error("No assistant message found to continue");
      setIsLoading(false);
      return;
    }

    for (const part of lastAssistantMessage.parts || []) {
      if (part.type === "tool" && part.tool) {
        const toolName = part.tool.name;
        const toolOutput = part.tool.output;

        if (hasConfirmedTool(toolOutput)) {
          const message = getToolContinuationMessage(toolName, "confirmed");
          if (message) pendingSystemMessagesRef.current.push(message);
          break;
        } else if (hasDeclinedTool(toolOutput)) {
          const message = getToolContinuationMessage(toolName, "declined");
          if (message) pendingSystemMessagesRef.current.push(message);
          break;
        }
      }
    }

    setMessages((prev) =>
      prev.map((msg) => (msg.id === lastAssistantMessage.id ? { ...msg, isStreaming: true } : msg)),
    );

    try {
      await sendChatMessage(currentMessages, lastAssistantMessage, controller.signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Error continuing stream:", error);
    } finally {
      setIsLoading(false);
      if (currentStreamControllerRef.current === controller) {
        currentStreamControllerRef.current = null;
      }
    }
  }, [setIsLoading, messagesRef, setMessages, sendChatMessage, currentStreamControllerRef]);

  return {
    handleToolInputChange,
    handleToolUpdate,
    handleOAuthCompletion,
    addSystemMessage,
    triggerStreamContinuation,
  };
}
