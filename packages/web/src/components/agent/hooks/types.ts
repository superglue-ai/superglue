import { Message, ToolCall } from "@superglue/shared";
import { Conversation } from "../ConversationHistory";
import { ToolSet } from "@/src/lib/agent/agent-client";

export interface UploadedFile {
  name: string;
  size: number;
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
}

export interface UseAgentStreamingReturn {
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
  abortStream: () => void;
  startDrip: (assistantMessageId: string) => void;
  stopDrip: () => void;
  streamDripBufferRef: React.MutableRefObject<string>;
}

export interface UseAgentToolsReturn {
  handleToolInputChange: (newInput: any) => void;
  handleToolUpdate: (toolCallId: string, updates: Partial<ToolCall>) => void;
  handleOAuthCompletion: (toolCallId: string, systemData: any) => Promise<void>;
  addSystemMessage: (message: string, options?: { triggerImmediateResponse?: boolean }) => void;
  triggerStreamContinuation: () => Promise<void>;
}

export interface UseAgentFileUploadReturn {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  filePayloads: Record<string, any>;
  setFilePayloads: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  isProcessingFiles: boolean;
  isDragging: boolean;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFilesUpload: (files: File[]) => Promise<void>;
  handleFileRemove: (key: string) => void;
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

export interface PlaygroundToolContext {
  toolId: string;
  instruction: string;
  steps: any[];
  finalTransform: string;
  inputSchema: string | null;
  responseSchema: string | null;
  systemIds: string[];
  executionSummary: string;
  initialError?: string;
  currentPayload?: string;
}

export interface AgentConfig {
  chatEndpoint?: string;
  oauthEndpoint?: string;
  getAuthToken?: () => string;
  toolSet?: ToolSet;
  onBeforeMessage?: (messages: Message[]) => Message[];
  playgroundContext?: PlaygroundToolContext;
}
