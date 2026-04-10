"use client";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { cn } from "@/src/lib/general-utils";
import { loadFromCacheAsync, saveToCache } from "@/src/lib/cache-utils";
import { Message, MessagePart } from "@superglue/shared";
import { MessagesSquare, Trash2, X, Loader2 } from "lucide-react";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useEESuperglueClient } from "@/src/queries/use-client";

const MAX_CONVERSATIONS = 20;
const DEFAULT_CACHE_PREFIX = "superglue-conversations";
const SUMMARY_REGEN_USER_MESSAGE_INTERVAL = 5;

export type { Message, MessagePart };

export interface Conversation {
  id: string;
  title: string;
  summary?: string;
  messages: Message[];
  timestamp: Date;
  sessionId?: string | null;
  lastSummarizedMessageCount?: number;
}

const createConversationId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const cloneConversationMessages = (messageList: Message[]): Message[] => {
  if (typeof structuredClone === "function") {
    return structuredClone(messageList);
  }

  return messageList.map((message) => ({
    ...message,
    timestamp: new Date(message.timestamp as any),
    parts:
      message.parts?.map((part) => ({
        ...part,
        tool: part.tool
          ? {
              ...part.tool,
              startTime: part.tool.startTime ? new Date(part.tool.startTime as any) : undefined,
              endTime: part.tool.endTime ? new Date(part.tool.endTime as any) : undefined,
            }
          : undefined,
      })) || undefined,
    tools: message.tools?.map((tool) => ({
      ...tool,
      startTime: tool.startTime ? new Date(tool.startTime as any) : undefined,
      endTime: tool.endTime ? new Date(tool.endTime as any) : undefined,
    })),
  }));
};

const getMessageContent = (message: Message): string => {
  if (message.content.trim()) {
    return message.content.trim();
  }
  if (message.parts) {
    // Include both content and error parts as meaningful content
    const contentParts = message.parts
      .filter((part) => part.type === "content" || part.type === "error")
      .map((part) => part.content || "")
      .join("")
      .trim();
    if (contentParts) return contentParts;
  }
  return "";
};

const serializeToolCallForPersistence = (tool: any) => ({
  id: tool.id,
  name: tool.name,
  status: tool.status,
  input: tool.input,
  output: tool.output,
  error: tool.error,
  interactionLog: tool.interactionLog,
  confirmationState: tool.confirmationState,
  confirmationData: tool.confirmationData,
});

const hasMeaningfulToolState = (message: Message): boolean => {
  const partTools =
    message.parts
      ?.filter((part) => part.type === "tool" && part.tool)
      .map((part) => serializeToolCallForPersistence(part.tool)) || [];

  const messageTools = message.tools?.map((tool) => serializeToolCallForPersistence(tool)) || [];

  return partTools.length > 0 || messageTools.length > 0;
};

const serializeMessageForSignature = (message: Message): string =>
  JSON.stringify({
    id: message.id,
    role: message.role,
    isHidden: !!message.isHidden,
    content: getMessageContent(message),
    parts:
      message.parts?.map((part) =>
        part.type === "tool" && part.tool
          ? { type: "tool", tool: serializeToolCallForPersistence(part.tool) }
          : {
              type: part.type,
              content: part.content || "",
              errorDetails: part.errorDetails,
            },
      ) || [],
    tools: message.tools?.map((tool) => serializeToolCallForPersistence(tool)) || [],
  });

const generateConversationTitle = (messages: Message[]): string => {
  const firstUserMessage = messages.find(
    (m) => m.role === "user" && !m.isHidden && getMessageContent(m),
  );
  if (firstUserMessage) {
    const content = getMessageContent(firstUserMessage);
    return content.length > 50 ? content.substring(0, 50) + "..." : content;
  }
  return `Conversation ${new Date().toLocaleDateString()}`;
};

const countVisibleUserMessages = (messages: Message[]): number =>
  messages.filter((m) => m.role === "user" && !m.isHidden && getMessageContent(m)).length;

const getVisibleMessages = (messages: Message[]): Message[] =>
  messages.filter((m) => !m.isHidden && !!getMessageContent(m));

const getMeaningfulMessages = (messages: Message[]): Message[] =>
  messages.filter((m) => {
    const content = getMessageContent(m);
    return (content || hasMeaningfulToolState(m)) && !(m.id === "1" && !content);
  });

const buildSummaryConversationText = (messages: Message[]): string =>
  messages
    .slice(0, 6)
    .map((m) => {
      const content = getMessageContent(m);
      const role = m.role === "user" ? "User" : "Assistant";
      const truncated = content.length > 300 ? content.slice(0, 300) + "..." : content;
      return `${role}: ${truncated}`;
    })
    .join("\n\n")
    .slice(0, 2000);

const shouldPersistConversationMessages = (
  existingConversation: Conversation | undefined,
  userMessageCount: number,
  hasStreamingMessages: boolean,
): boolean => {
  if (!existingConversation) return true;
  if (!hasStreamingMessages) return true;
  return userMessageCount !== countVisibleUserMessages(existingConversation.messages);
};

const shouldRefreshConversationSummary = ({
  existingConversation,
  userMessageCount,
  hasStreamingMessages,
  hasAssistantContent,
}: {
  existingConversation?: Conversation;
  userMessageCount: number;
  hasStreamingMessages: boolean;
  hasAssistantContent: boolean;
}): boolean => {
  if (hasStreamingMessages || !hasAssistantContent || userMessageCount < 1) {
    return false;
  }

  if (!existingConversation?.summary) {
    return true;
  }

  const lastSummarizedMessageCount = existingConversation.lastSummarizedMessageCount || 0;
  return userMessageCount - lastSummarizedMessageCount >= SUMMARY_REGEN_USER_MESSAGE_INTERVAL;
};

const upsertConversation = ({
  previousConversations,
  conversationId,
  title,
  messages,
  latestMessageTimestamp,
  sessionId,
}: {
  previousConversations: Conversation[];
  conversationId: string;
  title: string;
  messages: Message[];
  latestMessageTimestamp: Date | null;
  sessionId?: string | null;
}): Conversation[] => {
  const existingIndex = previousConversations.findIndex((c) => c.id === conversationId);
  const snapshotMessages = cloneConversationMessages(messages);

  if (existingIndex === -1) {
    const newConversation: Conversation = {
      id: conversationId,
      title,
      messages: snapshotMessages,
      timestamp: latestMessageTimestamp || new Date(),
      sessionId,
    };
    return [newConversation, ...previousConversations];
  }

  const existing = previousConversations[existingIndex];
  const nextSignature = snapshotMessages
    .map((message) => serializeMessageForSignature(message))
    .join("|");
  const existingSignature = existing.messages
    .map((message) => serializeMessageForSignature(message))
    .join("|");
  const signatureChanged = existingSignature !== nextSignature;
  const timestampChanged =
    latestMessageTimestamp?.getTime() !== existing.timestamp.getTime() || signatureChanged;
  const sessionChanged = existing.sessionId !== sessionId;

  if (!timestampChanged && existing.title === title && !sessionChanged) {
    return previousConversations;
  }

  const updatedConversation: Conversation = {
    ...existing,
    title,
    messages: snapshotMessages,
    timestamp: signatureChanged ? new Date() : latestMessageTimestamp || existing.timestamp,
    sessionId,
    summary: existing.summary,
    lastSummarizedMessageCount: existing.lastSummarizedMessageCount,
  };

  const updated = [...previousConversations];
  updated[existingIndex] = updatedConversation;

  if (updatedConversation.timestamp.getTime() > existing.timestamp.getTime()) {
    updated.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  return updated;
};

interface ConversationHistoryProps {
  messages: Message[];
  currentConversationId: string | null;
  sessionId?: string | null;
  onConversationLoad: (conversation: Conversation) => void;
  onCurrentConversationIdChange: (id: string | null) => void;
  cacheKeyPrefix?: string;
}

export function ConversationHistory({
  messages,
  currentConversationId,
  sessionId,
  onConversationLoad,
  onCurrentConversationIdChange,
  cacheKeyPrefix = DEFAULT_CACHE_PREFIX,
}: ConversationHistoryProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [generatingSummaryFor, setGeneratingSummaryFor] = useState<string | null>(null);
  const [panelPosition, setPanelPosition] = useState<{
    top: number;
    left?: number;
    right?: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const pendingConversationIdRef = useRef<string | null>(null);
  const generatingSummaryForRef = useRef<string | null>(null);
  const suppressNextAutoSaveForIdRef = useRef<string | null>(null);
  const summaryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PANEL_WIDTH = 360;
  const createClient = useEESuperglueClient();

  // Generate summary for a conversation and save it
  const generateAndSaveSummary = useCallback(
    async (conversationId: string, messageList: Message[]) => {
      if (generatingSummaryForRef.current === conversationId) return;

      // Get first few messages (both user and assistant) for context
      const visibleMessages = getVisibleMessages(messageList);
      if (visibleMessages.length === 0) return;

      const conversationText = buildSummaryConversationText(visibleMessages);

      if (conversationText.length < 20) return;

      // Count user messages for tracking
      const userMessageCount = visibleMessages.filter((m) => m.role === "user").length;

      generatingSummaryForRef.current = conversationId;
      startTransition(() => setGeneratingSummaryFor(conversationId));

      try {
        const client = createClient();
        const result = await client.summarize(
          `Write a 4-6 word title for this conversation. Focus on the USER's goal and what was actually built/done. Ignore assistant disclaimers or meta-commentary. Use imperative verbs (Build, List, Run, Authorize, Configure, ...). Be specific about the system/tool involved. No quotes, no periods.\n\nExamples:\n- Build Gmail email fetcher tool\n- Set up Jira OAuth connection\n- Fix API pagination bug\n- List Shopify orders via REST\n\nConversation:\n${conversationText}`,
        );
        const summary = result.summary?.replace(/^["']|["']$/g, "").trim();

        // Only update if we got a valid summary
        if (summary && summary.length > 0) {
          startTransition(() =>
            setConversations((prev) =>
              prev.map((conv) =>
                conv.id === conversationId
                  ? { ...conv, summary, lastSummarizedMessageCount: userMessageCount }
                  : conv,
              ),
            ),
          );
        }
      } catch (error) {
        // Silently fail - we'll just use the default title
      } finally {
        generatingSummaryForRef.current = null;
        startTransition(() =>
          setGeneratingSummaryFor((current) => (current === conversationId ? null : current)),
        );
      }
    },
    [createClient],
  );

  const formatShortRelativeTime = (date: Date) => {
    const now = Date.now();
    const secondsAgo = Math.max(0, Math.floor((now - date.getTime()) / 1000));

    if (secondsAgo < 60) return "now";
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h`;
    if (secondsAgo < 604800) return `${Math.floor(secondsAgo / 86400)}d`;
    if (secondsAgo < 2629800) return `${Math.floor(secondsAgo / 604800)}w`;
    if (secondsAgo < 31557600) return `${Math.floor(secondsAgo / 2629800)}mo`;
    return `${Math.floor(secondsAgo / 31557600)}y`;
  };

  const getLatestMessageTimestamp = (messageList: Message[]) => {
    const timestamps = messageList
      .map((message) => message.timestamp)
      .filter(Boolean)
      .map((timestamp) => new Date(timestamp as any).getTime());
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps));
  };

  const getConversationSignature = (messageList: Message[]) =>
    messageList.map((message) => serializeMessageForSignature(message)).join("|");

  // Load conversations on mount
  const [hasLoaded, setHasLoaded] = useState(false);
  useEffect(() => {
    const loadConversations = async () => {
      const savedConversations = await loadConversationsFromStorage(cacheKeyPrefix);
      setConversations(savedConversations);
      setHasLoaded(true);
    };
    loadConversations();
  }, [cacheKeyPrefix]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    pendingConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    return () => {
      if (summaryDebounceRef.current) {
        clearTimeout(summaryDebounceRef.current);
        summaryDebounceRef.current = null;
      }
    };
  }, []);

  // Save conversations when they change (only after initial load)
  useEffect(() => {
    if (!hasLoaded) return;
    saveConversationsToStorage(conversations, cacheKeyPrefix);
  }, [conversations, cacheKeyPrefix, hasLoaded]);

  // Auto-save current conversation when messages change
  useEffect(() => {
    const meaningfulMessages = getMeaningfulMessages(messages);
    if (meaningfulMessages.length === 0) return;

    const hasStreamingMessages = messages.some((m) => m.isStreaming);
    const title = generateConversationTitle(meaningfulMessages);
    const conversationId =
      currentConversationId || pendingConversationIdRef.current || createConversationId();
    pendingConversationIdRef.current = conversationId;

    const latestMessageTimestamp = getLatestMessageTimestamp(meaningfulMessages);
    const hasAssistantContent = meaningfulMessages.some(
      (m) => m.role === "assistant" && !m.isHidden && !!getMessageContent(m),
    );

    // Count user messages for summary tracking
    const userMessageCount = countVisibleUserMessages(meaningfulMessages);
    const existingConversation = conversationsRef.current.find((c) => c.id === conversationId);
    const shouldPersistMessages = shouldPersistConversationMessages(
      existingConversation,
      userMessageCount,
      hasStreamingMessages,
    );

    if (suppressNextAutoSaveForIdRef.current === conversationId) {
      suppressNextAutoSaveForIdRef.current = null;
      return;
    }

    if (shouldPersistMessages) {
      startTransition(() =>
        setConversations((prev) =>
          upsertConversation({
            previousConversations: prev,
            conversationId,
            title,
            messages: meaningfulMessages,
            latestMessageTimestamp,
            sessionId,
          }),
        ),
      );
    }

    const shouldGenerateSummary = shouldRefreshConversationSummary({
      existingConversation,
      userMessageCount,
      hasStreamingMessages,
      hasAssistantContent,
    });

    if (summaryDebounceRef.current) {
      clearTimeout(summaryDebounceRef.current);
      summaryDebounceRef.current = null;
    }

    if (shouldGenerateSummary) {
      const id = conversationId;
      const msgs = meaningfulMessages;
      summaryDebounceRef.current = setTimeout(() => {
        summaryDebounceRef.current = null;
        generateAndSaveSummary(id, msgs);
      }, 1500);
    }

    if (!currentConversationId) {
      onCurrentConversationIdChange(conversationId);
    }
  }, [
    messages,
    currentConversationId,
    onCurrentConversationIdChange,
    sessionId,
    generateAndSaveSummary,
  ]);

  useEffect(() => {
    if (showHistory && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 16;
      const maxPanelHeight = 400;

      const rightEdgeIfRightAligned = viewportWidth - rect.right;
      const leftEdgeIfRightAligned = viewportWidth - rightEdgeIfRightAligned - PANEL_WIDTH;
      const wouldOverflowLeft = leftEdgeIfRightAligned < padding;

      let top = rect.bottom + 4;
      if (top + maxPanelHeight > viewportHeight - padding) {
        top = Math.max(padding, viewportHeight - maxPanelHeight - padding);
      }

      if (wouldOverflowLeft) {
        const left = Math.max(padding, rect.left);
        const adjustedLeft =
          left + PANEL_WIDTH > viewportWidth - padding
            ? viewportWidth - PANEL_WIDTH - padding
            : left;
        setPanelPosition({ top, left: adjustedLeft });
      } else {
        setPanelPosition({ top, right: Math.max(padding, rightEdgeIfRightAligned) });
      }
    }
  }, [showHistory]);

  // Handle click outside to close history panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const historyPanel = document.querySelector("[data-history-panel]");
      const historyButton = buttonRef.current;

      if (
        showHistory &&
        historyPanel &&
        !historyPanel.contains(target) &&
        !historyButton?.contains(target)
      ) {
        setShowHistory(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showHistory]);

  const loadConversation = (conversation: Conversation) => {
    suppressNextAutoSaveForIdRef.current = conversation.id;
    onConversationLoad(conversation);
    setShowHistory(false);
  };

  const deleteConversation = (conversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (currentConversationId === conversationId) {
      onCurrentConversationIdChange(null);
    }
  };

  const renderHistoryPanel = () => {
    if (!showHistory || !panelPosition) return null;

    return (
      <div
        className="fixed z-[100] w-[360px] rounded-xl border border-border/50 bg-muted/30 backdrop-blur shadow-xl ring-1 ring-white/10 dark:ring-black/20 flex flex-col overflow-hidden"
        style={{
          maxHeight: "400px",
          top: panelPosition.top,
          ...(panelPosition.left !== undefined
            ? { left: panelPosition.left }
            : { right: panelPosition.right }),
        }}
        data-history-panel
      >
        <div className="p-3 border-b border-border/40 bg-muted/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Past Chats</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(false)}
              className="h-6 w-6 p-0"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40">
          <div className="space-y-2">
            {conversations.map((conversation) => {
              const displayTitle =
                conversation.summary || conversation.title || "Untitled conversation";
              const isLoadingSummary = generatingSummaryFor === conversation.id;

              return (
                <div key={conversation.id} className="group">
                  <Card
                    className={cn(
                      "p-2 cursor-pointer transition-colors hover:bg-muted/50",
                      currentConversationId === conversation.id &&
                        "bg-primary/10 border-primary/20",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="flex-1 min-w-0"
                        onClick={() => loadConversation(conversation)}
                      >
                        <div className="font-medium text-xs truncate flex items-center gap-1.5">
                          {isLoadingSummary && (
                            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />
                          )}
                          <span className={cn(isLoadingSummary && "text-muted-foreground")}>
                            {displayTitle}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "mt-0.5 text-[10px] text-muted-foreground/40 font-mono truncate",
                            !conversation.sessionId && "invisible",
                          )}
                          title={conversation.sessionId ? `Session: ${conversation.sessionId}` : ""}
                        >
                          {conversation.sessionId || "session"}
                        </div>
                      </div>
                      <div className="relative h-6 w-6 flex-shrink-0">
                        <div
                          className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground/80 transition-opacity group-hover:opacity-0"
                          title={conversation.timestamp.toLocaleString()}
                        >
                          {formatShortRelativeTime(conversation.timestamp)}
                        </div>
                        {currentConversationId !== conversation.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 flex items-center justify-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteConversation(conversation.id);
                            }}
                          >
                            <Trash2 className="w-2 h-2" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}

            {conversations.length === 0 && (
              <div className="text-center text-muted-foreground py-6">
                <MessagesSquare className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No conversations yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="glass"
        size="sm"
        onClick={() => setShowHistory(true)}
        data-history-button
        className="h-9 px-3 rounded-xl"
      >
        <MessagesSquare className="w-4 h-4 mr-2" />
        Past Chats
      </Button>
      {renderHistoryPanel()}
    </div>
  );
}

const saveConversationsToStorage = (conversations: Conversation[], cacheKeyPrefix: string) => {
  try {
    const recentConversations = [...conversations]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_CONVERSATIONS);

    saveToCache(cacheKeyPrefix, recentConversations);
  } catch (error) {
    console.error("Failed to save conversations:", error);
  }
};

const loadConversationsFromStorage = async (cacheKeyPrefix: string): Promise<Conversation[]> => {
  try {
    const cached = await loadFromCacheAsync<Conversation[]>(cacheKeyPrefix);
    if (!cached) return [];

    return cached.map((conv: any) => ({
      ...conv,
      timestamp: new Date(conv.timestamp),
      messages: conv.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
        startTime: msg.startTime ? new Date(msg.startTime) : undefined,
        endTime: msg.endTime ? new Date(msg.endTime) : undefined,
        parts:
          msg.parts?.map((part: any) => ({
            ...part,
            tool: part.tool
              ? {
                  ...part.tool,
                  startTime: part.tool.startTime ? new Date(part.tool.startTime) : undefined,
                  endTime: part.tool.endTime ? new Date(part.tool.endTime) : undefined,
                }
              : undefined,
          })) || undefined,
        tools: msg.tools?.map((tool: any) => ({
          ...tool,
          startTime: tool.startTime ? new Date(tool.startTime) : undefined,
          endTime: tool.endTime ? new Date(tool.endTime) : undefined,
        })),
      })),
    }));
  } catch (error) {
    console.error("Failed to load conversations:", error);
    return [];
  }
};
