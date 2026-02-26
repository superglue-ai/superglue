"use client";

import { tokenRegistry } from "@/src/lib/token-registry";
import {
  AgentRequest,
  UserAction,
  ToolEventAction,
  ToolExecutionPolicies,
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
  sessionFiles: UploadedFile[];
  filePayloads: Record<string, any>;
  toolExecutionPolicies: ToolExecutionPolicies;
  conversationIdRef: React.MutableRefObject<string | null>;
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
  sessionFiles,
  filePayloads,
  toolExecutionPolicies,
  conversationIdRef,
  toast,
}: UseAgentRequestOptions): UseAgentRequestReturn {
  const actionBufferRef = useRef<UserAction[]>([]);
  const prevFileKeysRef = useRef<string>("");
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

  const FILE_PREVIEW_MAX_CHARS = 4000;

  const buildFileStateMessage = useCallback((): Message | null => {
    const readyPending = pendingFiles.filter((f) => f.status === "ready");
    const currentFiles = [...sessionFiles, ...readyPending];
    const currentKeys = currentFiles
      .map((f) => f.key)
      .sort()
      .join(",");

    if (currentKeys === prevFileKeysRef.current) return null;

    const prevKeys = new Set(prevFileKeysRef.current.split(",").filter(Boolean));
    const currKeys = new Set(currentKeys.split(",").filter(Boolean));
    prevFileKeysRef.current = currentKeys;

    const added = currentFiles.filter((f) => !prevKeys.has(f.key));
    const removedKeys = [...prevKeys].filter((k) => !currKeys.has(k));

    const parts: string[] = ["[FILE STATE]"];

    if (added.length > 0) {
      parts.push(`Files added: ${added.map((f) => f.name).join(", ")}`);
    }
    if (removedKeys.length > 0) {
      parts.push(`Files removed: ${removedKeys.join(", ")}`);
    }

    if (currentFiles.length > 0) {
      const addedKeys = new Set(added.map((f) => f.key));
      const fileList = currentFiles
        .map((f) => {
          const tag = addedKeys.has(f.key) ? "[new]" : "[previously uploaded]";
          return `- ${f.name} (file::${f.key}) ${tag}`;
        })
        .join("\n");
      parts.push(`\nCurrent session files:\n${fileList}`);
    } else {
      parts.push("\nNo files are currently available in this session.");
    }

    if (added.length > 0) {
      const previews = added
        .map((file) => {
          const content = filePayloads[file.key];
          if (content === undefined || content === null) return null;
          let contentStr: string;
          try {
            contentStr =
              typeof content === "string" ? content : (JSON.stringify(content, null, 2) ?? "");
          } catch {
            contentStr = "[Unable to serialize]";
          }
          const truncated = truncateFileContent(contentStr, FILE_PREVIEW_MAX_CHARS).truncated;
          return `### ${file.name} (file::${file.key})\n\`\`\`\n${truncated}\n\`\`\``;
        })
        .filter(Boolean)
        .join("\n\n");

      if (previews) {
        parts.push(`\nFile content previews:\n${previews}`);
      }
    }

    return {
      id: `file-state-${Date.now()}`,
      role: "user",
      content: parts.join("\n"),
      timestamp: new Date(),
      isHidden: true,
    } as Message;
  }, [sessionFiles, pendingFiles, filePayloads]);

  const sendAgentRequest = useCallback(
    async (
      userMessage?: string,
      options?: { userActions?: UserAction[]; hiddenContext?: string; hideUserMessage?: boolean },
    ) => {
      let actionsToSend: UserAction[];
      if (options?.userActions) {
        actionsToSend = [...actionBufferRef.current.splice(0), ...options.userActions];
      } else {
        actionsToSend = actionBufferRef.current.splice(0);
      }
      const hasMessage = userMessage && userMessage.trim().length > 0;
      const hasActions = actionsToSend.length > 0;

      await Promise.resolve();

      const hiddenContext = options?.hiddenContext || config.hiddenContextBuilder?.();
      const hasHiddenContext = !!hiddenContext;
      const playgroundDraft = config.playgroundDraftBuilder?.() || undefined;

      if (!hasMessage && !hasActions && !hasHiddenContext) {
        console.warn("sendAgentRequest called with no userMessage, userActions, or hiddenContext");
        return;
      }

      const toolEventAction = actionsToSend.find(
        (a): a is ToolEventAction => a.type === "tool_event",
      );
      const resumeToolId = toolEventAction?.toolCallId;

      const shouldResume = resumeToolId && !hasMessage;

      if (currentStreamControllerRef.current && !shouldResume) {
        currentStreamControllerRef.current.abort();
        cleanupInterruptedStream("\n\n*[Response interrupted by new action]*");
      }

      if (!shouldResume) {
        setAwaitingToolsToDeclined();
      }

      const currentMessages = [...messagesRef.current];

      const fileStateMessage = buildFileStateMessage();
      if (fileStateMessage) {
        currentMessages.push(fileStateMessage);
        setMessages((prev) => [...prev, fileStateMessage]);
      }

      if (hasMessage) {
        const readyPendingFiles = pendingFiles.filter((f) => f.status === "ready");

        const userMessageObj: Message = {
          id: Date.now().toString(),
          content: userMessage!.trim(),
          role: "user",
          timestamp: new Date(),
          attachedFiles: readyPendingFiles.length > 0 ? readyPendingFiles : undefined,
          isHidden: options?.hideUserMessage,
        };
        currentMessages.push(userMessageObj);
        setMessages((prev) => [...prev, userMessageObj]);
      }

      setIsLoading(true);

      let assistantMessage: Message | null = null;
      if (shouldResume) {
        assistantMessage = findAndResumeMessageWithTool(resumeToolId);
      } else if (hasMessage || hasHiddenContext) {
        assistantMessage = createStreamingAssistantMessage(hasMessage ? 1 : 0);
        setMessages((prev) => [...prev, assistantMessage!]);
      }

      const controller = new AbortController();
      currentStreamControllerRef.current = controller;

      const request: AgentRequest = {
        agentId: config.agentId,
        messages: currentMessages,
        userMessage: hasMessage ? userMessage!.trim() : undefined,
        userActions: actionsToSend.length > 0 ? actionsToSend : undefined,
        filePayloads: buildFilePayloads(),
        hiddenContext: hiddenContext || undefined,
        toolExecutionPolicies:
          Object.keys(toolExecutionPolicies).length > 0 ? toolExecutionPolicies : undefined,
        conversationId: conversationIdRef.current ?? undefined,
        playgroundDraft,
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
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            const errorBody = await response.json();
            if (errorBody.error) {
              errorMessage = errorBody.error;
            }
          } catch {}
          throw new Error(errorMessage);
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
          title: "Connection issue",
          description:
            error instanceof Error ? error.message : "Couldn't reach the server. Please try again.",
        });

        setMessages((prev) => {
          const lastStreamingIndex = prev.findIndex((m) => m.isStreaming);
          if (lastStreamingIndex !== -1) {
            return prev.map((msg, idx) =>
              idx === lastStreamingIndex
                ? {
                    ...msg,
                    content: "I had trouble processing that request. Let me try again.",
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
      sessionFiles,
      buildFilePayloads,
      buildFileStateMessage,
      toolExecutionPolicies,
      chatEndpoint,
      getAuthToken,
      toast,
    ],
  );

  const resetFileTracking = useCallback(() => {
    prevFileKeysRef.current = "";
  }, []);

  return { sendAgentRequest, bufferAction, actionBufferRef, resetFileTracking };
}
