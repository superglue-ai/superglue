"use client";
import { Button } from "@/src/components/ui/button";
import { FileChip } from "@/src/components/ui/file-chip";
import { Textarea } from "@/src/components/ui/textarea";
import { ThinkingIndicator } from "@/src/components/ui/thinking-indicator";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { cn, handleCopyCode } from "@/src/lib/general-utils";
import { UserAction } from "@/src/lib/agent/agent-types";
import { Message, ToolCall } from "@superglue/shared";
import { AlertTriangle, ChevronDown, ChevronUp, Pencil, Plus, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { AgentContextProvider, useAgentContext } from "./AgentContextProvider";
import { AgentInputArea } from "./AgentInputArea";
import { ConversationHistory } from "./ConversationHistory";
import {
  ScrollToBottomButton,
  ScrollToBottomContainer,
  ScrollToBottomTrigger,
  ScrollToBottomTriggerRef,
} from "./hooks/use-scroll-to-bottom";
import { ToolCallComponent } from "./ToolCallComponent";
import { BackgroundToolGroup, groupMessageParts } from "./tool-components";
import { AgentWelcome } from "./welcome/AgentWelcome";

const MAX_MESSAGE_LENGTH = 50000;

const MemoMessage = React.memo(
  ({
    message,
    onInputChange,
    onToolUpdate,
    sendAgentRequest,
    bufferAction,
    onAbortStream,
    editingMessageId,
    editingContent,
    setEditingContent,
    isLoading,
    formatTimestamp,
    handleEditMessage,
    handleSaveEdit,
    handleCancelEdit,
    filePayloads,
  }: {
    message: Message;
    onInputChange: (newInput: any) => void;
    onToolUpdate: (toolCallId: string, updates: Partial<ToolCall>) => void;
    sendAgentRequest?: (
      userMessage?: string,
      options?: { userActions?: UserAction[] },
    ) => Promise<void>;
    bufferAction?: (action: UserAction) => void;
    onAbortStream?: () => void;
    editingMessageId: string | null;
    editingContent: string;
    setEditingContent: (content: string) => void;
    isLoading: boolean;
    formatTimestamp: (date: Date) => string;
    handleEditMessage: (messageId: string, content: string) => void;
    handleSaveEdit: (messageId: string) => void;
    handleCancelEdit: () => void;
    filePayloads?: Record<string, any>;
  }) => {
    return (
      <div key={message.id} className={cn("flex gap-4 p-2 pt-4 rounded-xl group min-h-16")}>
        <div
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm hidden lg:flex",
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-background border-2 text-muted-foreground",
          )}
        >
          {message.role === "user" && <User size={18} />}
          {message.role === "assistant" && <BotMessageSquare size={18} />}
        </div>

        <div className="flex-1 space-y-3 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="font-medium text-base">
              {message.role === "user" ? "You" : "superglue"}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(message.timestamp)}
            </span>
            {(() => {
              const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
              const isStale = message.timestamp.getTime() < fiveMinutesAgo;

              return message.isStreaming && !isStale ? (
                <div className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              ) : null;
            })()}
            {message.role === "user" && !isLoading && (
              <Button
                size="sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2"
                onClick={() => handleEditMessage(message.id, message.content)}
              >
                <Edit2 className="w-3 h-3" />
              </Button>
            )}
          </div>

          {message.role === "user" &&
            (message as any).attachedFiles &&
            (message as any).attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {(message as any).attachedFiles.map((file: any) => (
                  <FileChip
                    key={file.key}
                    file={file}
                    size="compact"
                    rounded="md"
                    showOriginalName={true}
                    maxWidth="250px"
                  />
                ))}
              </div>
            )}

          {editingMessageId === message.id ? (
            <div className="space-y-2">
              <Textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="min-h-[48px] max-h-[120px] resize-none text-base leading-relaxed focus-visible:ring-0 focus-visible:border-ring"
                placeholder="Edit your message..."
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSaveEdit(message.id)}
                  disabled={!editingContent.trim() || isLoading}
                >
                  Save & Restart
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit} disabled={isLoading}>
                  <X className="w-2 h-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 message-content-wrapper break-words">
              {message.parts && message.parts.length > 0 ? (
                groupMessageParts(message.parts).map((grouped, idx) => {
                  if (grouped.type === "content") {
                    return (
                      <div
                        key={grouped.part.id}
                        className={cn(
                          "prose prose-sm max-w-none dark:prose-invert",
                          message.isStreaming && "streaming-message streaming-active",
                        )}
                      >
                        <Streamdown>{grouped.part.content || ""}</Streamdown>
                      </div>
                    );
                  } else if (grouped.type === "background_tools") {
                    return <BackgroundToolGroup key={`bg-${idx}`} tools={grouped.tools} />;
                  } else if (grouped.type === "tool" && grouped.part.tool) {
                    return (
                      <ToolCallComponent
                        key={grouped.part.id}
                        tool={grouped.part.tool}
                        onInputChange={onInputChange}
                        onToolUpdate={onToolUpdate}
                        sendAgentRequest={sendAgentRequest}
                        bufferAction={bufferAction}
                        onAbortStream={onAbortStream}
                        filePayloads={filePayloads}
                      />
                    );
                  }
                  return null;
                })
              ) : (
                <>
                  <div
                    className={cn(
                      "prose prose-sm max-w-none dark:prose-invert",
                      message.isStreaming && "streaming-message streaming-active",
                    )}
                  >
                    <Streamdown>{message.content}</Streamdown>
                  </div>
                  {message.tools && message.tools.length > 0 && (
                    <div className="space-y-3">
                      {message.tools.map((tool) => (
                        <ToolCallComponent
                          key={tool.id}
                          tool={tool}
                          onInputChange={onInputChange}
                          onToolUpdate={onToolUpdate}
                          sendAgentRequest={sendAgentRequest}
                          bufferAction={bufferAction}
                          onAbortStream={onAbortStream}
                          filePayloads={filePayloads}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);

interface AgentInterfaceProps {
  initialPrompts?: {
    userPrompt: string;
    systemPrompt: string;
    chatTitle?: string;
    chatIcon?: string;
  } | null;
}

export function AgentInterface({ initialPrompts }: AgentInterfaceProps = {}) {
  return (
    <AgentContextProvider initialPrompts={initialPrompts}>
      <AgentInterfaceContent
        chatTitle={initialPrompts?.chatTitle}
        chatIcon={initialPrompts?.chatIcon}
      />
    </AgentContextProvider>
  );
}

function AgentInterfaceContent({
  chatTitle: initialChatTitle,
  chatIcon: initialChatIcon,
}: {
  chatTitle?: string;
  chatIcon?: string;
}) {
  const {
    messages,
    isLoading,
    editingMessageId,
    editingContent,
    setEditingContent,
    handleEditMessage,
    handleCancelEdit,
    handleSaveEdit,
    stopStreaming,
    handleToolInputChange,
    handleToolUpdate,
    sendAgentRequest,
    bufferAction,
    abortStream,
    filePayloads,
    currentConversationId,
    setCurrentConversationId,
    loadConversation,
    startNewConversation,
    handleSendMessage,
    startTemplatePrompt,
    welcomeRef,
  } = useAgentContext();

  const [chatTitle, setChatTitle] = useState(initialChatTitle);
  const [chatIcon, setChatIcon] = useState(initialChatIcon);

  const handleConversationLoad = useCallback(
    (conversation: any) => {
      setChatTitle(undefined);
      setChatIcon(undefined);
      loadConversation(conversation);
    },
    [loadConversation],
  );

  const handleStartPrompt = useCallback(
    (
      userPrompt: string,
      hiddenContext?: string,
      options?: { hideUserMessage?: boolean; chatTitle?: string; chatIcon?: string },
    ) => {
      if (options?.chatTitle) {
        setChatTitle(options.chatTitle);
      }
      if (options?.chatIcon) {
        setChatIcon(options.chatIcon);
      }
      startTemplatePrompt(userPrompt, hiddenContext, options);
    },
    [startTemplatePrompt],
  );

  const [input, setInput] = React.useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const scrollTriggerRef = useRef<ScrollToBottomTriggerRef>(null);

  const isAnyMessageStreaming = useMemo(() => messages.some((m) => m.isStreaming), [messages]);

  const formatTimestamp = useCallback((date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, []);

  // Copy button functionality
  useEffect(() => {
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const btn = target.closest(".copy-code-btn") as HTMLButtonElement;
      if (btn?.dataset.code && !btn.disabled) {
        e.preventDefault();
        handleCopyCode(btn.dataset.code);
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Focus input when streaming completes
  useEffect(() => {
    if (messages.length > 0 && !isAnyMessageStreaming) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [messages.length, isAnyMessageStreaming]);

  // Streaming CSS styles
  useEffect(() => {
    const styleId = "streaming-text-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .streaming-message {
          opacity: 1;
          transition: opacity 0.1s ease-out;
        }
        .message-content-wrapper {
          transition: height 0.15s ease-out;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        @keyframes subtleFadeIn {
          from { opacity: 0.7; }
          to { opacity: 1; }
        }
        .streaming-active {
          animation: subtleFadeIn 0.2s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
          border: none;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.3);
          border-radius: 3px;
          border: none;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.5);
        }
        .custom-scrollbar {
          scrollbar-width: auto;
          scrollbar-color: rgba(156, 163, 175, 0.3) transparent;
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      const style = document.getElementById(styleId);
      if (style) style.remove();
    };
  }, []);

  const onSendMessage = useCallback(async () => {
    if (!input.trim() || input.length > MAX_MESSAGE_LENGTH) return;
    const content = input;
    setInput("");
    scrollTriggerRef.current?.scrollToBottom();
    await handleSendMessage(content);
  }, [input, handleSendMessage]);

  const handleStopStreaming = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  const clearMessages = useCallback(() => {
    startNewConversation();
    setChatTitle(undefined);
    setChatIcon(undefined);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [startNewConversation]);

  return (
    <div className="h-full mx-auto flex flex-col relative">
      <div className="flex items-center gap-2 p-2 relative">
        <ConversationHistory
          messages={messages}
          currentConversationId={currentConversationId}
          onConversationLoad={handleConversationLoad}
          onNewConversation={clearMessages}
          onCurrentConversationIdChange={setCurrentConversationId}
        />

        {(chatTitle || messages.length > 1 || (messages.length === 1 && messages[0].content)) && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearMessages}
            className="h-9 px-3 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-2" />
            New
          </Button>
        )}

        {chatTitle && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-xl border border-border/50">
            {chatIcon && (
              <SystemIcon
                system={{ icon: chatIcon }}
                size={18}
                className="flex-shrink-0"
                fallbackClassName="text-muted-foreground"
              />
            )}
            <span className="text-sm font-medium text-foreground/80 truncate max-w-[200px]">
              {chatTitle}
            </span>
          </div>
        )}
      </div>

      <ScrollToBottomContainer
        className="flex-1 mx-2 lg:mx-6 overflow-hidden relative"
        scrollViewClassName="custom-scrollbar"
        followButtonClassName="hidden"
        debounce={50}
      >
        <div className="space-y-2 pb-4 mx-auto max-w-7xl" data-chat-messages>
          {messages.length === 0 ? (
            <div className="w-full">
              <AgentWelcome onStartPrompt={handleStartPrompt} ref={welcomeRef} />
            </div>
          ) : (
            <>
              {messages
                .filter((m) => !(m as any).isHidden)
                .map((m) => (
                  <MemoMessage
                    key={m.id}
                    message={m}
                    onInputChange={handleToolInputChange}
                    onToolUpdate={handleToolUpdate}
                    sendAgentRequest={sendAgentRequest}
                    bufferAction={bufferAction}
                    onAbortStream={abortStream}
                    editingMessageId={editingMessageId}
                    editingContent={editingContent}
                    setEditingContent={setEditingContent}
                    isLoading={isLoading}
                    formatTimestamp={formatTimestamp}
                    handleEditMessage={handleEditMessage}
                    handleSaveEdit={handleSaveEdit}
                    handleCancelEdit={handleCancelEdit}
                    filePayloads={filePayloads}
                  />
                ))}
            </>
          )}
        </div>
        <ScrollToBottomTrigger ref={scrollTriggerRef} />
        <ScrollToBottomButton />
      </ScrollToBottomContainer>

      <AgentInputArea
        value={input}
        onChange={setInput}
        onSend={onSendMessage}
        onStop={handleStopStreaming}
        isLoading={isLoading}
        placeholder="Message superglue..."
        maxLength={MAX_MESSAGE_LENGTH}
        showCharCount
        inputContainerRef={inputContainerRef}
        inputRef={inputRef}
        scrollToBottom={() => scrollTriggerRef.current?.scrollToBottom()}
      />
    </div>
  );
}
