"use client";
import { Button } from "@/src/components/ui/button";
import { FileChip } from "@/src/components/ui/file-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/src/components/ui/popover";
import { Textarea } from "@/src/components/ui/textarea";
import { ThinkingIndicator } from "@/src/components/ui/thinking-indicator";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { cn, handleCopyCode } from "@/src/lib/general-utils";
import { formatBytes } from "@/src/lib/file-utils";
import { UserAction } from "@/src/lib/agent/agent-types";
import { ALLOWED_FILE_EXTENSIONS, Message, ToolCall } from "@superglue/shared";
import { AlertTriangle, ChevronUp, Paperclip, Pencil, Plus, Send, Square, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { AgentContextProvider, useAgentContext } from "./AgentContextProvider";
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
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center hidden lg:flex",
            message.role === "user"
              ? "bg-neutral-100 dark:bg-neutral-900"
              : "bg-white dark:bg-black",
          )}
        >
          {message.role === "user" && (
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Y</span>
          )}
          {message.role === "assistant" && (
            <img
              src="/favicon.png"
              alt="superglue"
              className="w-5 h-5 object-contain dark:invert"
            />
          )}
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
              <button
                type="button"
                onClick={() => handleEditMessage(message.id, message.content)}
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded hover:bg-muted"
                title="Edit message"
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
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
            <div className="space-y-3">
              <Textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="min-h-[72px] max-h-[200px] resize-y text-[13px] bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/30 dark:to-muted/20 backdrop-blur-sm border border-border/50 rounded-xl shadow-sm focus-visible:ring-0 px-3 py-2"
                placeholder="Edit your message..."
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => handleSaveEdit(message.id)}
                  disabled={!editingContent.trim() || isLoading}
                  className="rounded-xl"
                >
                  Save & Restart
                </Button>
                <Button
                  variant="glass"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={isLoading}
                  className="rounded-xl"
                >
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
    pendingFiles,
    sessionFiles,
    filePayloads,
    isProcessingFiles,
    isDragging,
    fileInputRef,
    handleFilesUpload,
    handlePendingFileRemove,
    handleSessionFileRemove,
    handleDrop,
    handleDragOver,
    handleDragLeave,
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
  const isResizingRef = useRef(false);
  const scrollTriggerRef = useRef<ScrollToBottomTriggerRef>(null);

  const isAnyMessageStreaming = useMemo(() => messages.some((m) => m.isStreaming), [messages]);

  const formatTimestamp = useCallback((date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      isResizingRef.current = true;
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
      setTimeout(() => {
        isResizingRef.current = false;
      }, 50);
    }
  }, [input]);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && input.length <= MAX_MESSAGE_LENGTH) {
          onSendMessage();
        }
      }
    },
    [input, onSendMessage],
  );

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
          <Button variant="glass" size="sm" onClick={clearMessages} className="h-9 px-3 rounded-xl">
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
                .filter((m) => m.role !== "system" && !(m as any).isHidden)
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

      <div
        ref={inputContainerRef}
        className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm"
      >
        <div className="mx-2 lg:mx-6 pb-4 px-4">
          <div className="max-w-7xl mx-auto">
            <div
              className={cn(
                "relative flex flex-col gap-2 rounded-2xl overflow-hidden transition-all duration-200",
                "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/30 dark:to-muted/20",
                "backdrop-blur-sm border border-border/50",
                "shadow-sm hover:shadow-md focus-within:shadow-md",
                "hover:border-border/80 focus-within:border-border/80",
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {isDragging && (
                <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-2xl z-10 flex items-center justify-center backdrop-blur-sm">
                  <div className="text-primary font-medium">Drop files here</div>
                </div>
              )}

              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 pt-3">
                  {pendingFiles.map((file) => (
                    <FileChip
                      key={file.key}
                      file={file}
                      onRemove={handlePendingFileRemove}
                      size="compact"
                      rounded="md"
                      showOriginalName={true}
                      maxWidth="300px"
                    />
                  ))}
                </div>
              )}

              <div className="relative flex items-end gap-2">
                <input
                  ref={fileInputRef as any}
                  type="file"
                  multiple
                  accept={ALLOWED_FILE_EXTENSIONS.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesUpload(Array.from(e.target.files));
                      e.target.value = "";
                    }
                  }}
                />

                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message superglue..."
                  className="flex-1 h-10 min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px] leading-[20px] py-[10px] px-4 pr-28"
                />

                <div className="absolute right-3 bottom-3 flex items-end gap-1.5">
                  <div
                    className={cn(
                      "flex items-center rounded-xl overflow-hidden",
                      "bg-gradient-to-br from-white/60 to-white/30 dark:from-white/10 dark:to-white/5",
                      "backdrop-blur-sm border border-black/5 dark:border-white/10",
                    )}
                  >
                    {sessionFiles.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className={cn(
                              "h-9 px-2 flex items-center justify-center gap-1.5",
                              "bg-gradient-to-br from-white/60 to-white/30 dark:from-white/10 dark:to-white/5",
                              "hover:from-white/80 hover:to-white/50 dark:hover:from-white/15 dark:hover:to-white/10",
                              "text-muted-foreground hover:text-foreground transition-all",
                              "border-r border-black/5 dark:border-white/10",
                            )}
                          >
                            <span className="min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
                              {sessionFiles.length}
                            </span>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className={cn(
                            "w-auto min-w-[250px] max-w-[280px] p-3",
                            "bg-gradient-to-br from-white/90 to-white/70 dark:from-neutral-900/95 dark:to-neutral-900/80",
                            "backdrop-blur-xl border border-black/10 dark:border-white/10",
                            "shadow-lg shadow-black/10 dark:shadow-black/30",
                          )}
                          align="end"
                          side="top"
                          sideOffset={8}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-foreground/70">
                              Session Files
                            </span>
                            <span className="text-xs text-muted-foreground/60">
                              {formatBytes(sessionFiles.reduce((acc, f) => acc + (f.size || 0), 0))}
                            </span>
                          </div>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5">
                            {sessionFiles.map((file) => (
                              <FileChip
                                key={file.key}
                                file={file}
                                onRemove={handleSessionFileRemove}
                                size="compact"
                                rounded="md"
                                showOriginalName={true}
                                showSize={true}
                                className="w-full"
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-9 w-9 p-0 rounded-none border-0",
                        "bg-transparent hover:bg-black/5 dark:hover:bg-white/10",
                        "text-muted-foreground hover:text-foreground transition-all",
                      )}
                      onClick={() => (fileInputRef.current as any)?.click()}
                      disabled={isProcessingFiles}
                    >
                      <Paperclip className="w-5 h-5" />
                    </Button>
                  </div>

                  <Button
                    onClick={isLoading ? handleStopStreaming : onSendMessage}
                    disabled={!isLoading && (!input.trim() || input.length > MAX_MESSAGE_LENGTH)}
                    size="sm"
                    className="h-9 w-9 p-0 rounded-xl bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground shadow-sm"
                    variant="default"
                  >
                    {isLoading ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-2 px-2 gap-2">
              <span
                className={cn(
                  "text-xs",
                  input.length > MAX_MESSAGE_LENGTH
                    ? "text-amber-600 dark:text-amber-500 font-medium"
                    : "text-muted-foreground/60",
                )}
              >
                {input.length > MAX_MESSAGE_LENGTH ? (
                  <>
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    {input.length.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()} chars
                  </>
                ) : input.length > MAX_MESSAGE_LENGTH * 0.8 ? (
                  `${input.length.toLocaleString()}/${MAX_MESSAGE_LENGTH.toLocaleString()} chars`
                ) : (
                  ""
                )}
              </span>
              <span className="text-xs text-muted-foreground/60">Press Enter to send</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
