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
import { useAgentRequest } from "./hooks/use-agent-request";
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
  abortStream: () => void;
  stopStreaming: () => void;
  currentStreamControllerRef: React.MutableRefObject<AbortController | null>;
  cleanupInterruptedStream: (interruptionMessage: string) => void;

  // Tools
  handleToolInputChange: (newInput: any) => void;
  handleToolUpdate: (toolCallId: string, updates: Partial<ToolCall>) => void;

  // Request
  sendAgentRequest: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  bufferAction: (action: UserAction) => void;

  // Files
  pendingFiles: UploadedFile[];
  sessionFiles: UploadedFile[];
  filePayloads: Record<string, any>;
  isProcessingFiles: boolean;
  isDragging: boolean;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFilesUpload: (files: File[]) => Promise<void>;
  handlePendingFileRemove: (key: string) => void;
  handleSessionFileRemove: (key: string) => void;
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
  startTemplatePrompt: (userPrompt: string, hiddenContext?: string) => void;

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
  config?: Partial<AgentConfig>;
  discoveryPrompts?: { userPrompt: string; systemPrompt: string } | null;
}

const DEFAULT_CONFIG: AgentConfig = {
  agentId: AgentType.MAIN,
};

export function AgentContextProvider({
  children,
  config: configProp,
  discoveryPrompts,
}: AgentContextProviderProps) {
  const config: AgentConfig = { ...DEFAULT_CONFIG, ...configProp };
  const { toast } = useToast();
  const welcomeRef = useRef<AgentWelcomeRef>(null);

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
  const tempStreaming = useAgentStreaming({
    config,
    setMessages: () => {},
    updateMessageWithData: () => ({}) as Message,
    updateToolCompletion: () => {},
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
  });

  // Tools hook
  const toolsHook = useAgentTools({
    setMessages: messagesHook.setMessages,
  });

  // Request hook - the main way to send requests
  const allUploadedFiles = [...fileUpload.sessionFiles, ...fileUpload.pendingFiles];
  const requestHook = useAgentRequest({
    config,
    messagesRef: messagesHook.messagesRef,
    setMessages: messagesHook.setMessages,
    setIsLoading: messagesHook.setIsLoading,
    createStreamingAssistantMessage: messagesHook.createStreamingAssistantMessage,
    cleanupInterruptedStream: messagesHook.cleanupInterruptedStream,
    setAwaitingToolsToDeclined: messagesHook.setAwaitingToolsToDeclined,
    findAndResumeMessageWithTool: messagesHook.findAndResumeMessageWithTool,
    processStreamData: streamingHook.processStreamData,
    currentStreamControllerRef: streamingHook.currentStreamControllerRef,
    uploadedFiles: allUploadedFiles,
    pendingFiles: fileUpload.pendingFiles,
    filePayloads: fileUpload.filePayloads,
    toolExecutionPolicies,
    toast,
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

      const truncatedMessages = messagesHook.messages.slice(0, messageIndex);
      messagesHook.messagesRef.current = truncatedMessages;
      messagesHook.setMessages(truncatedMessages);
      messagesHook.setEditingMessageId(null);

      const editedContent = messagesHook.editingContent.trim();
      messagesHook.setEditingContent("");
      fileUpload.clearFiles();

      await requestHook.sendAgentRequest(editedContent);
    },
    [messagesHook, fileUpload, requestHook],
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      const MAX_MESSAGE_LENGTH = 50000;
      if (!content.trim() || content.length > MAX_MESSAGE_LENGTH) return;
      fileUpload.commitPendingFiles();
      await requestHook.sendAgentRequest(content);
    },
    [requestHook, fileUpload],
  );

  const startTemplatePrompt = useCallback(
    (userPrompt: string, hiddenContext?: string) => {
      requestHook.sendAgentRequest(userPrompt, { hiddenContext });
    },
    [requestHook],
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
      startTemplatePrompt(discoveryPrompts.userPrompt, discoveryPrompts.systemPrompt);
    }
  }, [discoveryPrompts, messagesHook.messages.length, startTemplatePrompt]);

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
      abortStream: streamingHook.abortStream,
      stopStreaming,
      currentStreamControllerRef: streamingHook.currentStreamControllerRef,
      cleanupInterruptedStream: messagesHook.cleanupInterruptedStream,

      // Tools
      handleToolInputChange: toolsHook.handleToolInputChange,
      handleToolUpdate: toolsHook.handleToolUpdate,

      // Request
      sendAgentRequest: requestHook.sendAgentRequest,
      bufferAction: requestHook.bufferAction,

      // Files
      pendingFiles: fileUpload.pendingFiles,
      sessionFiles: fileUpload.sessionFiles,
      filePayloads: fileUpload.filePayloads,
      isProcessingFiles: fileUpload.isProcessingFiles,
      isDragging: fileUpload.isDragging,
      setIsDragging: fileUpload.setIsDragging,
      fileInputRef: fileUpload.fileInputRef,
      handleFilesUpload: fileUpload.handleFilesUpload,
      handlePendingFileRemove: fileUpload.handlePendingFileRemove,
      handleSessionFileRemove: fileUpload.handleSessionFileRemove,
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
      startTemplatePrompt,

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
      requestHook,
      conversationHook,
      handleSaveEdit,
      stopStreaming,
      handleSendMessage,
      startTemplatePrompt,
      config,
      toolExecutionPolicies,
      setToolPolicy,
      getToolPolicy,
    ],
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}
