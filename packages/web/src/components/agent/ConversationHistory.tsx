"use client";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { cn } from "@/src/lib/general-utils";
import { loadFromCacheAsync, saveToCache } from "@/src/lib/cache-utils";
import { Message, MessagePart } from "@superglue/shared";
import { MessagesSquare, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_CONVERSATIONS = 20;
const DEFAULT_CACHE_PREFIX = "superglue-conversations";

export type { Message, MessagePart };

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  timestamp: Date;
  sessionId?: string | null;
}

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

const generateConversationTitle = (messages: Message[]): string => {
  const firstUserMessage = messages.find((m) => m.role === "user" && getMessageContent(m));
  if (firstUserMessage) {
    const content = getMessageContent(firstUserMessage);
    return content.length > 50 ? content.substring(0, 50) + "..." : content;
  }
  return `Conversation ${new Date().toLocaleDateString()}`;
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
  const [panelPosition, setPanelPosition] = useState<{
    top: number;
    left?: number;
    right?: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const suppressNextAutoSaveForIdRef = useRef<string | null>(null);
  const PANEL_WIDTH = 360;

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
    messageList
      .map((message) => `${message.id}:${message.role}:${getMessageContent(message)}`)
      .join("|");

  // Load conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      const savedConversations = await loadConversationsFromStorage(cacheKeyPrefix);
      setConversations(savedConversations);
    };
    loadConversations();
  }, [cacheKeyPrefix]);

  // Save conversations when they change
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversationsToStorage(conversations, cacheKeyPrefix);
    }
  }, [conversations, cacheKeyPrefix]);

  // Auto-save current conversation when messages change
  useEffect(() => {
    const meaningfulMessages = messages.filter((m) => {
      const content = getMessageContent(m);
      return content && !(m.id === "1" && !content);
    });
    if (meaningfulMessages.length === 0) return;

    const title = generateConversationTitle(meaningfulMessages);
    const conversationId = currentConversationId || Date.now().toString();

    const latestMessageTimestamp = getLatestMessageTimestamp(meaningfulMessages);
    const conversationSignature = getConversationSignature(meaningfulMessages);

    const conversation: Conversation = {
      id: conversationId,
      title,
      messages: meaningfulMessages,
      timestamp: latestMessageTimestamp || new Date(),
      sessionId,
    };

    setConversations((prev) => {
      const existingIndex = prev.findIndex((c) => c.id === conversationId);
      if (existingIndex === -1) {
        return [conversation, ...prev];
      }

      const existing = prev[existingIndex];
      const existingSignature = getConversationSignature(existing.messages);
      const signatureChanged = existingSignature !== conversationSignature;
      const suppressAutoSave = suppressNextAutoSaveForIdRef.current === conversationId;
      const timestampChanged =
        conversation.timestamp.getTime() !== existing.timestamp.getTime() || signatureChanged;

      if (suppressAutoSave) {
        suppressNextAutoSaveForIdRef.current = null;
        return prev;
      }

      if (!timestampChanged && existing.title === conversation.title) {
        return prev;
      }

      const updatedConversation = {
        ...existing,
        ...conversation,
        timestamp: signatureChanged ? new Date() : conversation.timestamp,
      };

      const updated = [...prev];
      updated[existingIndex] = updatedConversation;

      if (updatedConversation.timestamp.getTime() > existing.timestamp.getTime()) {
        updated.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      }

      return updated;
    });

    if (!currentConversationId) {
      onCurrentConversationIdChange(conversationId);
    }
  }, [messages, currentConversationId, onCurrentConversationIdChange, sessionId]);

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
            {conversations.map((conversation) => (
              <div key={conversation.id} className="group">
                <Card
                  className={cn(
                    "p-2 cursor-pointer transition-colors hover:bg-muted/50",
                    currentConversationId === conversation.id && "bg-primary/10 border-primary/20",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0" onClick={() => loadConversation(conversation)}>
                      <div className="font-medium text-xs truncate">
                        {conversation.title || "Untitled conversation"}
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
            ))}

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
    const recentConversations = conversations
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
