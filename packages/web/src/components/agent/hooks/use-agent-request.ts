"use client";

import { tokenRegistry } from "@/src/lib/token-registry";
import { AgentRequest, ToolExecutionPolicies } from "@/src/lib/agent/agent-types";
import { ExecutionFileEnvelope, Message } from "@superglue/shared";
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
  filePayloads: Record<string, ExecutionFileEnvelope>;
  toolExecutionPolicies: ToolExecutionPolicies;
  loadedSkills: string[];
  conversationIdRef: React.MutableRefObject<string | null>;
  toast: (options: { title: string; description: string; variant?: "destructive" }) => void;
}

interface FileStateSnapshot {
  files: Array<{ key: string; name: string }>;
  loadedSkills: string[];
}

function parseFileStateSnapshot(raw: string): FileStateSnapshot {
  if (!raw) {
    return { files: [], loadedSkills: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<FileStateSnapshot>;
    return {
      files: Array.isArray(parsed.files) ? parsed.files : [],
      loadedSkills: Array.isArray(parsed.loadedSkills) ? parsed.loadedSkills : [],
    };
  } catch {
    return { files: [], loadedSkills: [] };
  }
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

  const buildFilePayloads = useCallback((): Record<string, ExecutionFileEnvelope> | undefined => {
    if (Object.keys(filePayloads).length === 0) return undefined;
    return filePayloads;
  }, [filePayloads]);

  const buildFileStateMessage = useCallback((): Message | null => {
    const readyPending = pendingFiles.filter((f) => f.status === "ready");
    const currentFiles = [...sessionFiles, ...readyPending]
      .map((file) => ({ key: file.key, name: file.name }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const currentSnapshot: FileStateSnapshot = {
      files: currentFiles,
      loadedSkills: [...loadedSkills].sort(),
    };
    const currentStateKey = JSON.stringify(currentSnapshot);

    if (currentStateKey === prevFileKeysRef.current) return null;

    const prevEntries = new Map(
      parseFileStateSnapshot(prevFileKeysRef.current).files.map(
        (file) => [file.key, file.name] as const,
      ),
    );
    const currKeys = new Set(currentFiles.map((file) => file.key));
    prevFileKeysRef.current = currentStateKey;

    const added = currentFiles.filter((file) => !prevEntries.has(file.key));
    const removed = [...prevEntries.entries()]
      .filter(([key]) => !currKeys.has(key))
      .map(([, name]) => name);

    const timestamp = new Date();
    const parts: string[] = ["[SESSION STATE]", `timestamp: ${timestamp.toISOString()}`];

    if (added.length > 0) {
      parts.push(
        `changes:\n${added.map((file) => `- added file ${file.name} (file::${file.key})`).join("\n")}`,
      );
    }
    if (removed.length > 0) {
      const existingChanges = parts.find((part) => part.startsWith("changes:\n"));
      const removedLines = removed.map((name) => `- removed file ${name}`);
      if (existingChanges) {
        parts[parts.indexOf(existingChanges)] = `${existingChanges}\n${removedLines.join("\n")}`;
      } else {
        parts.push(`changes:\n${removedLines.join("\n")}`);
      }
    }

    if (currentFiles.length > 0) {
      const fileList = currentFiles.map((f) => `- ${f.name} (file::${f.key})`).join("\n");
      parts.push(`available_files:\n${fileList}`);
    } else {
      parts.push("available_files: none");
    }

    if (loadedSkills.length > 0) {
      parts.push(`loaded_skills:\n${loadedSkills.map((skill) => `- ${skill}`).join("\n")}`);
    } else {
      parts.push("loaded_skills: none");
    }

    return {
      id: `file-state-${timestamp.getTime()}`,
      role: "user",
      content: parts.join("\n"),
      timestamp,
      isHidden: true,
    } as Message;
  }, [sessionFiles, pendingFiles, loadedSkills]);

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
