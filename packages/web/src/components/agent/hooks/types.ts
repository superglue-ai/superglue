import { ExecutionFileEnvelope, Message, ToolCall } from "@superglue/shared";
import { Conversation } from "../ConversationHistory";
import { AgentType } from "@/src/lib/agent/registries/agent-registry";
import {
  DraftLookup,
  ExecutionMode,
  SystemPlaygroundContext,
  AccessRulesContext,
} from "@/src/lib/agent/agent-types";
import { ToolMutation } from "@/src/lib/agent/agent-tools/tool-call-state";
import type { StreamState } from "./use-agent-streaming";

export interface ToolConfirmationMetadata {
  executionMode: ExecutionMode;
}

export interface UploadedFile {
  name: string;
  size: number;
  originalSize?: number;
  contentType?: string;
  key: string;
  status: "processing" | "ready" | "error";
  error?: string;
}

export interface UseAgentMessagesReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  messagesRef: React.MutableRefObject<Message[]>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  createStreamingAssistantMessage: (idOffset?: number) => Message;
  updateMessageWithData: (msg: Message, data: any, targetMessage: Message) => Message;
  setAwaitingToolsToDeclined: () => void;
  cleanupInterruptedStream: (interruptionMessage: string) => void;
  editingMessageId: string | null;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  editingContent: string;
  setEditingContent: React.Dispatch<React.SetStateAction<string>>;
  handleEditMessage: (messageId: string, content: string) => void;
  handleCancelEdit: () => void;
  findAndResumeMessageWithTool: (toolCallId: string) => Message | null;
}

export interface UseAgentStreamingReturn {
  processStreamData: (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    currentAssistantMessage: Message | null,
    createMessageIfNeeded: () => Message,
  ) => Promise<void>;
  currentStreamControllerRef: React.MutableRefObject<AbortController | null>;
  streamStateRef: React.MutableRefObject<StreamState>;
  abortStream: () => void;
  startDrip: (assistantMessageId: string) => void;
  stopDrip: () => void;
  streamDripBufferRef: React.MutableRefObject<string>;
}

export interface UseAgentToolsReturn {
  handleToolInputChange: (newInput: any) => void;
  handleToolUpdate: (toolCallId: string, updates: Partial<ToolCall>) => void;
  handleToolMutation: (toolCallId: string, mutation: ToolMutation) => void;
}

export interface UseAgentRequestReturn {
  sendAgentRequest: (
    userMessage?: string,
    options?: {
      hiddenStarterMessage?: string;
      hideUserMessage?: boolean;
      resumeToolCallId?: string;
    },
  ) => Promise<void>;
  resetFileTracking: () => void;
}

export interface UseAgentFileUploadReturn {
  pendingFiles: UploadedFile[];
  sessionFiles: UploadedFile[];
  filePayloads: Record<string, ExecutionFileEnvelope>;
  setFilePayloads: React.Dispatch<React.SetStateAction<Record<string, ExecutionFileEnvelope>>>;
  isProcessingFiles: boolean;
  isDragging: boolean;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFilesUpload: (files: File[]) => Promise<void>;
  handlePendingFileRemove: (key: string) => void;
  handleSessionFileRemove: (key: string) => void;
  commitPendingFiles: () => void;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  clearFiles: () => void;
}

export interface UseAgentConversationReturn {
  currentConversationId: string | null;
  setCurrentConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  sessionId: string | null;
  loadConversation: (conversation: Conversation) => void;
  startNewConversation: () => void;
}

export interface AgentConfig {
  agentId: AgentType;
  initialMessages?: Message[];
  chatEndpoint?: string;
  getAuthToken?: () => string;
  onToolComplete?: (toolName: string, toolId: string, output: any) => void;
  playgroundDraftBuilder?: () => DraftLookup | null;
  systemPlaygroundContextBuilder?: () => SystemPlaygroundContext | null;
  accessRulesContextBuilder?: () => AccessRulesContext | null;
}
