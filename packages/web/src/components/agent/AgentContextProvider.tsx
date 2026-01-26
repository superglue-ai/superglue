"use client";

import { useToast } from "@/src/hooks/use-toast";
import type { Message, ToolCall } from "@superglue/shared";
import { UserAction, ToolExecutionPolicies } from "@/src/lib/agent/agent-types";
import { AgentType } from "@/src/lib/agent/registry/agents";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Conversation } from "./ConversationHistory";
import { useAgentConversation } from "./hooks/use-agent-conversation";
import { useAgentFileUpload } from "./hooks/use-agent-file-upload";
import { useAgentMessages } from "./hooks/use-agent-messages";
import { useAgentStreaming } from "./hooks/use-agent-streaming";
import { useAgentTools } from "./hooks/use-agent-tools";
import type { AgentConfig, UploadedFile } from "./hooks/types";
import type { AgentWelcomeRef } from "./welcome/AgentWelcome";

export interface AgentContextValue {
  // Messages
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  createStreamingAssistantMessage: (idOffset?: number) => Message;

  // Editing
  editingMessageId: string | null;
  editingContent: string;
  setEditingContent: React.Dispatch<React.SetStateAction<string>>;
  handleEditMessage: (messageId: string, content: string) => void;
  handleCancelEdit: () => void;
  handleSaveEdit: (messageId: string) => Promise<void>;

  // Streaming
  sendChatMessage: (
    messages: Message[],
    assistantMessage: Message,
    signal?: AbortSignal,
  ) => Promise<void>;
  abortStream: () => void;
  stopStreaming: () => void;
  currentStreamControllerRef: React.MutableRefObject<AbortController | null>;
  cleanupInterruptedStream: (interruptionMessage: string) => void;

  // Tools
  handleToolInputChange: (newInput: any) => void;
  handleToolUpdate: (toolCallId: string, updates: Partial<ToolCall>) => void;
  handleOAuthCompletion: (toolCallId: string, systemData: any) => Promise<void>;
  addSystemMessage: (message: string, options?: { triggerImmediateResponse?: boolean }) => void;
  triggerStreamContinuation: () => Promise<void>;

  // Files
  uploadedFiles: UploadedFile[];
  filePayloads: Record<string, any>;
  isProcessingFiles: boolean;
  isDragging: boolean;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFilesUpload: (files: File[]) => Promise<void>;
  handleFileRemove: (key: string) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;

  // Conversation
  currentConversationId: string | null;
  setCurrentConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  sessionId: string | null;
  loadConversation: (conversation: Conversation) => void;
  startNewConversation: () => void;

  // Actions
  handleSendMessage: (content: string, attachedFiles?: UploadedFile[]) => Promise<void>;
  startExamplePrompt: (userPrompt: string, systemPrompt?: string) => void;

  // Refs
  welcomeRef: React.RefObject<AgentWelcomeRef>;
  messagesRef: React.MutableRefObject<Message[]>;

  // Config
  config: AgentConfig;

  // Tool policies
  toolExecutionPolicies: ToolExecutionPolicies;
  setToolPolicy: (toolName: string, policy: Record<string, any>) => void;
  getToolPolicy: (toolName: string) => Record<string, any> | undefined;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgentContext(): AgentContextValue {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgentContext must be used within an AgentContextProvider");
  }
  return context;
}

interface AgentContextProviderProps {
  children: React.ReactNode;
  config?: AgentConfig;
  discoveryPrompts?: { userPrompt: string; systemPrompt: string } | null;
}

export function AgentContextProvider({
  children,
  config = {},
  discoveryPrompts,
}: AgentContextProviderProps) {
  const { toast } = useToast();
  const welcomeRef = useRef<AgentWelcomeRef>(null);
  const pendingSystemMessagesRef = useRef<string[]>([]);

  const [toolExecutionPolicies, setToolExecutionPolicies] = useState<ToolExecutionPolicies>({});

  const setToolPolicy = useCallback((toolName: string, policy: Record<string, any>) => {
    setToolExecutionPolicies((prev) => ({
      ...prev,
      [toolName]: { ...prev[toolName], ...policy },
    }));
  }, []);

  const getToolPolicy = useCallback(
    (toolName: string) => {
      return toolExecutionPolicies[toolName];
    },
    [toolExecutionPolicies],
  );

  // File upload hook (independent, no dependencies)
  const fileUpload = useAgentFileUpload({ toast });

  // We need to create a temporary streaming hook first to get stopDrip and streamDripBufferRef
  // These refs are stable across renders so this is safe
  const tempStreaming = useAgentStreaming({
    config,
    setMessages: () => {},
    updateMessageWithData: () => ({}) as Message,
    updateToolCompletion: () => {},
    uploadedFiles: fileUpload.uploadedFiles,
    filePayloads: fileUpload.filePayloads,
    pendingSystemMessagesRef,
  });

  // Messages hook needs streaming functions for drip animation
  const messagesHook = useAgentMessages(tempStreaming.stopDrip, tempStreaming.streamDripBufferRef);

  // Create updateToolCompletion at provider level (breaks circular dependency)
  const updateToolCompletion = useCallback(
    (toolCallId: string, data: any) => {
      messagesHook.setMessages((prev) => {
        let updated = false;
        return prev.map((msg) => {
          if (updated) return msg;
          const hasThisTool =
            msg.tools?.some((t) => t.id === toolCallId) ||
            msg.parts?.some((p) => p.type === "tool" && p.tool?.id === toolCallId);
          if (hasThisTool) {
            updated = true;
            return messagesHook.updateMessageWithData(msg, data, msg);
          }
          return msg;
        });
      });
    },
    [messagesHook.setMessages, messagesHook.updateMessageWithData],
  );

  // Now create the final streaming hook with all dependencies
  const streamingHook = useAgentStreaming({
    config,
    setMessages: messagesHook.setMessages,
    updateMessageWithData: messagesHook.updateMessageWithData,
    updateToolCompletion,
    uploadedFiles: fileUpload.uploadedFiles,
    filePayloads: fileUpload.filePayloads,
    pendingSystemMessagesRef,
  });

  // Tools hook - now uses the properly configured streaming hook
  const toolsHook = useAgentTools({
    config,
    messages: messagesHook.messages,
    setMessages: messagesHook.setMessages,
    messagesRef: messagesHook.messagesRef,
    setIsLoading: messagesHook.setIsLoading,
    createStreamingAssistantMessage: messagesHook.createStreamingAssistantMessage,
    updateMessageWithData: messagesHook.updateMessageWithData,
    sendChatMessage: streamingHook.sendChatMessage,
    processStreamData: streamingHook.processStreamData,
    currentStreamControllerRef: streamingHook.currentStreamControllerRef,
    filePayloads: fileUpload.filePayloads,
    toolExecutionPolicies,
    toast,
    pendingSystemMessagesRef,
  });

  // Conversation hook
  const conversationHook = useAgentConversation({
    setMessages: messagesHook.setMessages,
    setIsLoading: messagesHook.setIsLoading,
    clearFiles: fileUpload.clearFiles,
    welcomeRef,
  });

  // Composed actions
  const stopStreaming = useCallback(() => {
    if (streamingHook.currentStreamControllerRef.current) {
      streamingHook.currentStreamControllerRef.current.abort();
      messagesHook.cleanupInterruptedStream("\n\n*[Response stopped]*");
      messagesHook.setIsLoading(false);
    }
  }, [streamingHook.currentStreamControllerRef, messagesHook]);

  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      const MAX_MESSAGE_LENGTH = 50000;
      if (
        !messagesHook.editingContent.trim() ||
        messagesHook.editingContent.length > MAX_MESSAGE_LENGTH
      )
        return;

      const messageIndex = messagesHook.messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      const updatedMessages = [...messagesHook.messages];
      const { attachedFiles, ...messageWithoutFiles } = updatedMessages[messageIndex] as any;
      updatedMessages[messageIndex] = {
        ...messageWithoutFiles,
        content: messagesHook.editingContent.trim(),
        timestamp: new Date(),
      };

      const truncatedMessages = updatedMessages.slice(0, messageIndex + 1);

      messagesHook.setMessages(truncatedMessages);
      messagesHook.setEditingMessageId(null);
      messagesHook.setEditingContent("");
      fileUpload.clearFiles();
      messagesHook.setIsLoading(true);

      const assistantMessage = messagesHook.createStreamingAssistantMessage();
      messagesHook.setMessages((prev) => [...prev, assistantMessage]);

      try {
        await streamingHook.sendChatMessage(truncatedMessages, assistantMessage);
      } catch (error) {
        console.error("Error re-running conversation:", error);
        toast({
          title: "Error",
          description: "Failed to restart conversation from edited message.",
          variant: "destructive",
        });

        messagesHook.setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? {
                  ...msg,
                  content:
                    "Sorry, I encountered an error restarting the conversation. Please try again.",
                  isStreaming: false,
                }
              : msg,
          ),
        );
      } finally {
        messagesHook.setIsLoading(false);
      }
    },
    [messagesHook, fileUpload, streamingHook, toast],
  );

  const handleSendMessage = useCallback(
    async (content: string, attachedFiles?: UploadedFile[]) => {
      const MAX_MESSAGE_LENGTH = 50000;
      if (!content.trim() || content.length > MAX_MESSAGE_LENGTH) return;

      if (streamingHook.currentStreamControllerRef.current) {
        streamingHook.currentStreamControllerRef.current.abort();
        messagesHook.cleanupInterruptedStream("\n\n*[Response interrupted by new message]*");
      }

      messagesHook.setAwaitingToolsToDeclined();

      const filesToAttach =
        attachedFiles || fileUpload.uploadedFiles.filter((f) => f.status === "ready");

      const userMessage: Message = {
        id: Date.now().toString(),
        content: content.trim(),
        role: "user",
        timestamp: new Date(),
        attachedFiles: filesToAttach.length > 0 ? filesToAttach : undefined,
      };

      const assistantMessage = messagesHook.createStreamingAssistantMessage(1);
      const messagesToSend = [...messagesHook.messages, userMessage];

      messagesHook.setMessages((prev) => [...prev, userMessage, assistantMessage]);
      fileUpload.clearFiles();
      messagesHook.setIsLoading(true);

      const controller = new AbortController();
      streamingHook.currentStreamControllerRef.current = controller;

      try {
        await streamingHook.sendChatMessage(messagesToSend, assistantMessage, controller.signal);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;

        console.error("Error sending message:", error);
        toast({
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to send message. Please try again.",
          variant: "destructive",
        });
      } finally {
        messagesHook.setIsLoading(false);
        if (streamingHook.currentStreamControllerRef.current === controller) {
          streamingHook.currentStreamControllerRef.current = null;
        }
      }
    },
    [messagesHook, fileUpload, streamingHook, toast],
  );

  const startExamplePrompt = useCallback(
    (userPrompt: string, systemPrompt?: string) => {
      if (streamingHook.currentStreamControllerRef.current) {
        streamingHook.currentStreamControllerRef.current.abort();
        messagesHook.cleanupInterruptedStream("\n\n*[Response interrupted by new message]*");
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        content: userPrompt.trim(),
        role: "user",
        timestamp: new Date(),
      };

      messagesHook.setMessages((prev) => [...prev, userMessage]);
      messagesHook.setIsLoading(true);

      const assistantMessage = messagesHook.createStreamingAssistantMessage(1);
      messagesHook.setMessages((prev) => [...prev, assistantMessage]);

      const controller = new AbortController();
      streamingHook.currentStreamControllerRef.current = controller;

      const messagesToSend: Message[] = [...messagesHook.messages];
      if (systemPrompt) {
        messagesToSend.push({
          id: `system-${Date.now()}`,
          content: systemPrompt,
          role: "system",
          timestamp: new Date(),
        });
      }
      messagesToSend.push({
        id: Date.now().toString(),
        content: userPrompt.trim(),
        role: "user",
        timestamp: new Date(),
      });

      streamingHook
        .sendChatMessage(messagesToSend, assistantMessage, controller.signal)
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") return;

          console.error("Error sending message:", error);
          toast({
            title: "Error",
            description:
              error instanceof Error ? error.message : "Failed to send message. Please try again.",
            variant: "destructive",
          });
        })
        .finally(() => {
          messagesHook.setIsLoading(false);
          if (streamingHook.currentStreamControllerRef.current === controller) {
            streamingHook.currentStreamControllerRef.current = null;
          }
        });
    },
    [messagesHook, streamingHook, toast],
  );

  // Auto-trigger discovery prompts when provided via props (only once)
  const hasTriggeredDiscoveryRef = useRef(false);
  useEffect(() => {
    if (
      discoveryPrompts &&
      messagesHook.messages.length === 0 &&
      !hasTriggeredDiscoveryRef.current
    ) {
      hasTriggeredDiscoveryRef.current = true;
      startExamplePrompt(discoveryPrompts.userPrompt, discoveryPrompts.systemPrompt);
    }
  }, [discoveryPrompts, messagesHook.messages.length, startExamplePrompt]);

  const value = useMemo<AgentContextValue>(
    () => ({
      // Messages
      messages: messagesHook.messages,
      setMessages: messagesHook.setMessages,
      isLoading: messagesHook.isLoading,
      setIsLoading: messagesHook.setIsLoading,
      createStreamingAssistantMessage: messagesHook.createStreamingAssistantMessage,

      // Editing
      editingMessageId: messagesHook.editingMessageId,
      editingContent: messagesHook.editingContent,
      setEditingContent: messagesHook.setEditingContent,
      handleEditMessage: messagesHook.handleEditMessage,
      handleCancelEdit: messagesHook.handleCancelEdit,
      handleSaveEdit,

      // Streaming
      sendChatMessage: streamingHook.sendChatMessage,
      abortStream: streamingHook.abortStream,
      stopStreaming,
      currentStreamControllerRef: streamingHook.currentStreamControllerRef,
      cleanupInterruptedStream: messagesHook.cleanupInterruptedStream,

      // Tools
      handleToolInputChange: toolsHook.handleToolInputChange,
      handleToolUpdate: toolsHook.handleToolUpdate,
      handleOAuthCompletion: toolsHook.handleOAuthCompletion,
      addSystemMessage: toolsHook.addSystemMessage,
      triggerStreamContinuation: toolsHook.triggerStreamContinuation,

      // Files
      uploadedFiles: fileUpload.uploadedFiles,
      filePayloads: fileUpload.filePayloads,
      isProcessingFiles: fileUpload.isProcessingFiles,
      isDragging: fileUpload.isDragging,
      setIsDragging: fileUpload.setIsDragging,
      fileInputRef: fileUpload.fileInputRef,
      handleFilesUpload: fileUpload.handleFilesUpload,
      handleFileRemove: fileUpload.handleFileRemove,
      handleDrop: fileUpload.handleDrop,
      handleDragOver: fileUpload.handleDragOver,
      handleDragLeave: fileUpload.handleDragLeave,

      // Conversation
      currentConversationId: conversationHook.currentConversationId,
      setCurrentConversationId: conversationHook.setCurrentConversationId,
      sessionId: conversationHook.sessionId,
      loadConversation: conversationHook.loadConversation,
      startNewConversation: conversationHook.startNewConversation,

      // Actions
      handleSendMessage,
      startExamplePrompt,

      // Refs
      welcomeRef,
      messagesRef: messagesHook.messagesRef,

      // Config
      config,

      // Tool policies
      toolExecutionPolicies,
      setToolPolicy,
      getToolPolicy,
    }),
    [
      messagesHook,
      fileUpload,
      streamingHook,
      toolsHook,
      conversationHook,
      handleSaveEdit,
      stopStreaming,
      handleSendMessage,
      startExamplePrompt,
      config,
      toolExecutionPolicies,
      setToolPolicy,
      getToolPolicy,
    ],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}
