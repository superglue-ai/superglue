"use client";

import { tokenRegistry } from "@/src/lib/token-registry";
import {
  AgentRequest,
  UserAction,
  ToolConfirmationAction,
  ToolExecutionFeedback,
  FileUploadAction,
} from "@/src/lib/agent/agent-types";
import { truncateFileContent } from "@/src/lib/file-utils";
import { Message } from "@superglue/shared";
import { useCallback, useRef } from "react";
import type { AgentConfig, UploadedFile, UseAgentRequestReturn } from "./types";

interface UseAgentRequestOptions {
  config: AgentConfig;
  messagesRef: React.MutableRefObject<Message[]>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  createStreamingAssistantMessage: (idOffset?: number) => Message;
  cleanupInterruptedStream: (interruptionMessage: string) => void;
  setAwaitingToolsToDeclined: () => void;
  findAndResumeMessageWithTool: (toolCallId: string) => Message | null;
  processStreamData: (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    currentAssistantMessage: Message | null,
    createMessageIfNeeded: () => Message,
  ) => Promise<void>;
  currentStreamControllerRef: React.MutableRefObject<AbortController | null>;
  uploadedFiles: UploadedFile[];
  pendingFiles: UploadedFile[];
  filePayloads: Record<string, any>;
  toast: (options: { title: string; description: string; variant?: "destructive" }) => void;
}

export function useAgentRequest({
  config,
  messagesRef,
  setMessages,
  setIsLoading,
  createStreamingAssistantMessage,
  cleanupInterruptedStream,
  setAwaitingToolsToDeclined,
  findAndResumeMessageWithTool,
  processStreamData,
  currentStreamControllerRef,
  uploadedFiles,
  pendingFiles,
  filePayloads,
  toast,
}: UseAgentRequestOptions): UseAgentRequestReturn {
  const actionBufferRef = useRef<UserAction[]>([]);
  const chatEndpoint = config.chatEndpoint || "/api/agent/chat";
  const getAuthToken = config.getAuthToken || (() => tokenRegistry.getToken());

  const bufferAction = useCallback((action: UserAction) => {
    actionBufferRef.current.push(action);
  }, []);

  const buildFilePayloads = useCallback(():
    | Record<string, { name: string; content: any }>
    | undefined => {
    if (Object.keys(filePayloads).length === 0) return undefined;

    const result: Record<string, { name: string; content: any }> = {};
    for (const [key, content] of Object.entries(filePayloads)) {
      const file = uploadedFiles.find((f) => f.key === key);
      const fileName = file?.name || key;
      result[key] = { name: fileName, content };
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [uploadedFiles, filePayloads]);

  const buildFileUploadAction = useCallback((): FileUploadAction | undefined => {
    if (Object.keys(filePayloads).length === 0) return undefined;

    const FILE_PREVIEW_MAX_CHARS = 2000;

    const files = Object.entries(filePayloads).map(([key, content]) => {
      const file = uploadedFiles.find((f) => f.key === key);
      const fileName = file?.name || key;

      let contentStr: string;
      try {
        contentStr =
          typeof content === "string" ? content : (JSON.stringify(content, null, 2) ?? "");
      } catch {
        contentStr = "[Unable to serialize]";
      }

      return {
        key,
        name: fileName,
        contentPreview: truncateFileContent(contentStr, FILE_PREVIEW_MAX_CHARS).truncated,
      };
    });

    return files.length > 0 ? { type: "file_upload" as const, files } : undefined;
  }, [uploadedFiles, filePayloads]);

  const sendAgentRequest = useCallback(
    async (
      userMessage?: string,
      options?: { userActions?: UserAction[]; hiddenContext?: string },
    ) => {
      let actionsToSend: UserAction[];
      if (options?.userActions) {
        // Merge buffered actions with explicit actions (buffered first to preserve chronological order)
        actionsToSend = [...actionBufferRef.current.splice(0), ...options.userActions];
      } else {
        actionsToSend = actionBufferRef.current.splice(0);
      }
      const hasMessage = userMessage && userMessage.trim().length > 0;
      const hasActions = actionsToSend.length > 0;

      if (!hasMessage && !hasActions) {
        console.warn("sendAgentRequest called with no userMessage or userActions");
        return;
      }

      const confirmationAction = actionsToSend.find(
        (a): a is ToolConfirmationAction => a.type === "tool_confirmation",
      );
      const feedbackAction = actionsToSend.find(
        (a): a is ToolExecutionFeedback => a.type === "tool_execution_feedback",
      );
      const resumeToolId = confirmationAction?.toolCallId || feedbackAction?.toolCallId;

      const shouldResume = resumeToolId && !hasMessage;

      if (currentStreamControllerRef.current && !shouldResume) {
        currentStreamControllerRef.current.abort();
        cleanupInterruptedStream("\n\n*[Response interrupted by new action]*");
      }

      if (!shouldResume) {
        setAwaitingToolsToDeclined();
      }

      const currentMessages = [...messagesRef.current];

      if (hasMessage) {
        const readyPendingFiles = pendingFiles.filter((f) => f.status === "ready");
        const userMessageObj: Message = {
          id: Date.now().toString(),
          content: userMessage!.trim(),
          role: "user",
          timestamp: new Date(),
          attachedFiles: readyPendingFiles.length > 0 ? readyPendingFiles : undefined,
        };
        currentMessages.push(userMessageObj);
        setMessages((prev) => [...prev, userMessageObj]);
      }

      setIsLoading(true);

      let assistantMessage: Message | null = null;
      if (hasMessage) {
        assistantMessage = createStreamingAssistantMessage(1);
        setMessages((prev) => [...prev, assistantMessage!]);
      } else if (shouldResume) {
        assistantMessage = findAndResumeMessageWithTool(resumeToolId);
      }

      const controller = new AbortController();
      currentStreamControllerRef.current = controller;

      const hiddenContext = options?.hiddenContext || config.hiddenContextBuilder?.();

      const fileUploadAction = buildFileUploadAction();
      const allActions = fileUploadAction ? [...actionsToSend, fileUploadAction] : actionsToSend;

      const request: AgentRequest = {
        agentId: config.agentId,
        messages: currentMessages,
        userMessage: hasMessage ? userMessage!.trim() : undefined,
        userActions: allActions.length > 0 ? allActions : undefined,
        filePayloads: buildFilePayloads(),
        hiddenContext,
        agentParams: config.agentParams,
      };

      try {
        const response = await fetch(chatEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Authentication failed. Please check your API key configuration.");
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        await processStreamData(reader, assistantMessage, () => createStreamingAssistantMessage(0));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;

        console.error("Error sending agent request:", error);
        toast({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to send request. Please try again.",
          variant: "destructive",
        });

        setMessages((prev) => {
          const lastStreamingIndex = prev.findIndex((m) => m.isStreaming);
          if (lastStreamingIndex !== -1) {
            return prev.map((msg, idx) =>
              idx === lastStreamingIndex
                ? {
                    ...msg,
                    content: "Sorry, I encountered an error. Please try again.",
                    isStreaming: false,
                  }
                : msg,
            );
          }
          return [
            ...prev,
            {
              id: Date.now().toString(),
              content: "Sorry, I encountered an error. Please try again.",
              role: "assistant",
              timestamp: new Date(),
              isStreaming: false,
            } as Message,
          ];
        });
      } finally {
        setIsLoading(false);
        if (currentStreamControllerRef.current === controller) {
          currentStreamControllerRef.current = null;
        }
      }
    },
    [
      config,
      messagesRef,
      setMessages,
      setIsLoading,
      createStreamingAssistantMessage,
      cleanupInterruptedStream,
      setAwaitingToolsToDeclined,
      findAndResumeMessageWithTool,
      processStreamData,
      currentStreamControllerRef,
      uploadedFiles,
      pendingFiles,
      buildFilePayloads,
      buildFileUploadAction,
      chatEndpoint,
      getAuthToken,
      toast,
    ],
  );

  return { sendAgentRequest, bufferAction, actionBufferRef };
}
