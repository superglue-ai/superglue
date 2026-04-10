"use client";

import { tokenRegistry } from "@/src/lib/token-registry";
import { AgentRequest, ToolExecutionPolicies } from "@/src/lib/agent/agent-types";
import { truncateFileContent } from "@/src/lib/file-utils";
import { Message } from "@superglue/shared";
import { useCallback, useRef } from "react";
import type { AgentConfig, UploadedFile, UseAgentRequestReturn } from "./types";
import type { StreamState } from "./use-agent-streaming";

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
  streamStateRef: React.MutableRefObject<StreamState>;
  uploadedFiles: UploadedFile[];
  pendingFiles: UploadedFile[];
  sessionFiles: UploadedFile[];
  filePayloads: Record<string, any>;
  toolExecutionPolicies: ToolExecutionPolicies;
  loadedSkills: string[];
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
  streamStateRef,
  uploadedFiles,
  pendingFiles,
  sessionFiles,
  filePayloads,
  toolExecutionPolicies,
  loadedSkills,
  conversationIdRef,
  toast,
}: UseAgentRequestOptions): UseAgentRequestReturn {
  const prevFileKeysRef = useRef<string>("");
  const chatEndpoint = config.chatEndpoint || "/api/agent/chat";
  const getAuthToken = config.getAuthToken || (() => tokenRegistry.getToken());

  const buildHiddenStarterMessage = useCallback((content: string): Message => {
    return {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? `hidden-${crypto.randomUUID()}`
          : `hidden-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      content,
      role: "user",
      timestamp: new Date(),
      isHidden: true,
    };
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
            contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);
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
      options?: {
        hiddenStarterMessage?: string;
        hideUserMessage?: boolean;
        resumeToolCallId?: string;
      },
    ) => {
      const hasMessage = userMessage && userMessage.trim().length > 0;

      await Promise.resolve();

      const hiddenStarterMessage = options?.hiddenStarterMessage?.trim();
      const hasHiddenStarterMessage = !!hiddenStarterMessage;
      const resumeToolCallId = options?.resumeToolCallId;
      const shouldResume = !!resumeToolCallId && !hasMessage;
      const playgroundDraft = config.playgroundDraftBuilder?.() || undefined;
      const systemPlaygroundContext = config.systemPlaygroundContextBuilder?.() || undefined;
      const accessRulesContext = config.accessRulesContextBuilder?.() || undefined;

      if (!hasMessage && !hasHiddenStarterMessage && !shouldResume) {
        console.warn(
          "sendAgentRequest called with no userMessage, hidden starter message, or resumeToolCallId",
        );
        return;
      }

      const currentState = streamStateRef.current;

      if (shouldResume) {
        if (currentState !== "paused") {
          console.warn(
            `[StreamGuard] Dropping resume (toolCallId=${resumeToolCallId}): stream is "${currentState}", not "paused"`,
          );
          return;
        }
      } else if (currentState === "streaming") {
        currentStreamControllerRef.current?.abort();
        cleanupInterruptedStream("\n\n*[Response interrupted by new action]*");
      }

      streamStateRef.current = "streaming";

      if (!shouldResume) {
        setAwaitingToolsToDeclined();
      }

      const currentMessages = [...messagesRef.current];
      let visibleUserMessageId: string | undefined;

      const fileStateMessage = buildFileStateMessage();
      if (fileStateMessage) {
        currentMessages.push(fileStateMessage);
        setMessages((prev) => [...prev, fileStateMessage]);
      }

      if (hiddenStarterMessage) {
        const hiddenMessage = buildHiddenStarterMessage(hiddenStarterMessage);
        currentMessages.push(hiddenMessage);
        setMessages((prev) => [...prev, hiddenMessage]);
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
        if (!options?.hideUserMessage) visibleUserMessageId = userMessageObj.id;
        currentMessages.push(userMessageObj);
        setMessages((prev) => [...prev, userMessageObj]);
      }

      setIsLoading(true);

      let assistantMessage: Message | null = null;
      if (shouldResume) {
        assistantMessage = findAndResumeMessageWithTool(resumeToolCallId);
      } else if (hasMessage || hasHiddenStarterMessage) {
        assistantMessage = createStreamingAssistantMessage(hasMessage ? 1 : 0);
        setMessages((prev) => [...prev, assistantMessage!]);
      }

      const controller = new AbortController();
      currentStreamControllerRef.current = controller;

      const request: AgentRequest = {
        agentId: config.agentId,
        messages: currentMessages,
        userMessage: hasMessage ? userMessage!.trim() : undefined,
        visibleUserMessageId,
        filePayloads: buildFilePayloads(),
        resumeToolCallId: shouldResume ? resumeToolCallId : undefined,
        toolExecutionPolicies:
          Object.keys(toolExecutionPolicies).length > 0 ? toolExecutionPolicies : undefined,
        conversationId: conversationIdRef.current ?? undefined,
        loadedSkills: loadedSkills.length > 0 ? loadedSkills : undefined,
        playgroundDraft,
        systemPlaygroundContext,
        accessRulesContext,
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
        const isOwner = currentStreamControllerRef.current === controller;
        if (isOwner) {
          if (streamStateRef.current === "streaming") {
            streamStateRef.current = "idle";
          }
          setIsLoading(false);
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
      streamStateRef,
      uploadedFiles,
      pendingFiles,
      sessionFiles,
      buildFilePayloads,
      buildHiddenStarterMessage,
      buildFileStateMessage,
      toolExecutionPolicies,
      loadedSkills,
      chatEndpoint,
      getAuthToken,
      toast,
    ],
  );

  const resetFileTracking = useCallback(() => {
    prevFileKeysRef.current = "";
  }, []);

  return { sendAgentRequest, resetFileTracking };
}
