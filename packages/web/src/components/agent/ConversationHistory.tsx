"use client";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { cn } from "@/src/lib/general-utils";
import { loadFromCache, saveToCache } from "@/src/lib/cache-utils";
import { History, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_CONVERSATIONS = 20;
const DEFAULT_CACHE_PREFIX = "superglue-conversations";

export interface MessagePart {
  type: "content" | "tool";
  content?: string;
  tool?: any;
  id: string;
}

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: Date;
  tools?: any[];
  parts?: MessagePart[];
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  timestamp: Date;
}

const getMessageContent = (message: Message): string => {
  if (message.content.trim()) {
    return message.content.trim();
  }
  if (message.parts) {
    return message.parts
      .filter((part) => part.type === "content")
      .map((part) => part.content || "")
      .join("")
      .trim();
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
  onConversationLoad: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onCurrentConversationIdChange: (id: string | null) => void;
  cacheKeyPrefix?: string;
}

export function ConversationHistory({
  messages,
  currentConversationId,
  onConversationLoad,
  onNewConversation,
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
  const PANEL_WIDTH = 320;

  // Load conversations on mount
  useEffect(() => {
    const savedConversations = loadConversationsFromStorage(cacheKeyPrefix);
    setConversations(savedConversations);
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

    const conversation: Conversation = {
      id: conversationId,
      title,
      messages: meaningfulMessages,
      timestamp: new Date(),
    };

    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== conversationId);
      return [conversation, ...filtered];
    });

    if (!currentConversationId) {
      onCurrentConversationIdChange(conversationId);
    }
  }, [messages, currentConversationId, onCurrentConversationIdChange]);

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
    onConversationLoad(conversation);
    setShowHistory(false);
  };

  const deleteConversation = (conversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (currentConversationId === conversationId) {
      onCurrentConversationIdChange(null);
    }
  };

  const startNewConversation = () => {
    onNewConversation();
    setShowHistory(false);
  };

  const renderHistoryPanel = () => {
    if (!showHistory || !panelPosition) return null;

    return (
      <div
        className="fixed z-[100] w-80 bg-background border rounded-lg shadow-lg flex flex-col"
        style={{
          maxHeight: "400px",
          top: panelPosition.top,
          ...(panelPosition.left !== undefined
            ? { left: panelPosition.left }
            : { right: panelPosition.right }),
        }}
        data-history-panel
      >
        <div className="p-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Conversation History</h3>
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
            <Button
              variant="outline"
              className="w-full justify-start h-auto p-2 text-xs"
              onClick={startNewConversation}
            >
              <Plus className="w-3 h-3 mr-2" />
              New Conversation
            </Button>

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
                      <div className="font-medium text-xs truncate">{conversation.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {conversation.timestamp.toLocaleDateString()}
                      </div>
                    </div>
                    {currentConversationId !== conversation.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conversation.id);
                        }}
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              </div>
            ))}

            {conversations.length === 0 && (
              <div className="text-center text-muted-foreground py-6">
                <History className="w-6 h-6 mx-auto mb-2 opacity-50" />
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
      >
        <History className="w-4 h-4 mr-2" />
        History
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

const loadConversationsFromStorage = (cacheKeyPrefix: string): Conversation[] => {
  try {
    const cached = loadFromCache<Conversation[]>(cacheKeyPrefix);
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
