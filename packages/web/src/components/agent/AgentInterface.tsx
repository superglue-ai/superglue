"use client";
import { Button } from "@/src/components/ui/button";
import { FileChip } from "@/src/components/ui/FileChip";
import { Textarea } from "@/src/components/ui/textarea";
import { cn, handleCopyCode } from "@/src/lib/general-utils";
import { ALLOWED_FILE_EXTENSIONS, Message, ToolCall } from "@superglue/shared";
import {
  AlertTriangle,
  BotMessageSquare,
  Edit2,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Square,
  User,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Streamdown } from "streamdown";
import { AgentContextProvider, useAgentContext } from "./AgentContextProvider";
import { ConversationHistory } from "./ConversationHistory";
import { ScrollToBottomButton, ScrollToBottomContainer } from "./hooks/use-scroll-to-bottom";
import { ToolCallComponent } from "./ToolCallComponent";
import { AgentWelcome } from "./welcome/AgentWelcome";

const MAX_MESSAGE_LENGTH = 50000;

const MemoMessage = React.memo(
  ({
    message,
    onInputChange,
    onOAuthComplete,
    onToolUpdate,
    onSystemMessage,
    onTriggerContinuation,
    onAbortStream,
    editingMessageId,
    editingContent,
    setEditingContent,
    isLoading,
    formatTimestamp,
    handleEditMessage,
    handleSaveEdit,
    handleCancelEdit,
  }: {
    message: Message;
    onInputChange: (newInput: any) => void;
    onOAuthComplete?: (toolCallId: string, systemData: any) => void;
    onToolUpdate: (toolCallId: string, updates: Partial<ToolCall>) => void;
    onSystemMessage?: (message: string, options?: { triggerImmediateResponse?: boolean }) => void;
    onTriggerContinuation?: () => void;
    onAbortStream?: () => void;
    editingMessageId: string | null;
    editingContent: string;
    setEditingContent: (content: string) => void;
    isLoading: boolean;
    formatTimestamp: (date: Date) => string;
    handleEditMessage: (messageId: string, content: string) => void;
    handleSaveEdit: (messageId: string) => void;
    handleCancelEdit: () => void;
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
              <div className="space-y-1.5 mb-2">
                <span className="text-xs text-muted-foreground">Files included:</span>
                <div className="flex flex-wrap gap-2">
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
              </div>
            )}

          {editingMessageId === message.id ? (
            <div className="space-y-2">
              <Textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="min-h-[48px] max-h-[120px] resize-none text-base leading-relaxed"
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
                message.parts.map((part) =>
                  part.type === "content" ? (
                    <div
                      key={part.id}
                      className={cn(
                        "prose prose-sm max-w-none dark:prose-invert",
                        message.isStreaming && "streaming-message streaming-active",
                      )}
                    >
                      <Streamdown>{part.content || ""}</Streamdown>
                    </div>
                  ) : part.type === "tool" && part.tool ? (
                    <ToolCallComponent
                      key={part.id}
                      tool={part.tool}
                      onInputChange={onInputChange}
                      onOAuthComplete={onOAuthComplete}
                      onToolUpdate={onToolUpdate}
                      onSystemMessage={onSystemMessage}
                      onTriggerContinuation={onTriggerContinuation}
                      onAbortStream={onAbortStream}
                    />
                  ) : null,
                )
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
                          onOAuthComplete={onOAuthComplete}
                          onToolUpdate={onToolUpdate}
                          onSystemMessage={onSystemMessage}
                          onTriggerContinuation={onTriggerContinuation}
                          onAbortStream={onAbortStream}
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
  discoveryPrompts?: { userPrompt: string; systemPrompt: string } | null;
}

export function AgentInterface({ discoveryPrompts }: AgentInterfaceProps = {}) {
  return (
    <AgentContextProvider discoveryPrompts={discoveryPrompts}>
      <AgentInterfaceContent />
    </AgentContextProvider>
  );
}

function AgentInterfaceContent() {
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
    handleOAuthCompletion,
    addSystemMessage,
    triggerStreamContinuation,
    abortStream,
    uploadedFiles,
    isProcessingFiles,
    isDragging,
    fileInputRef,
    handleFilesUpload,
    handleFileRemove,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    currentConversationId,
    setCurrentConversationId,
    loadConversation,
    startNewConversation,
    handleSendMessage,
    startExamplePrompt,
    welcomeRef,
  } = useAgentContext();

  const [input, setInput] = React.useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

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
  }, [startNewConversation]);

  return (
    <div className="h-full mx-auto flex flex-col relative">
      <div className="flex gap-2 p-2">
        <ConversationHistory
          messages={messages}
          currentConversationId={currentConversationId}
          onConversationLoad={loadConversation}
          onNewConversation={startNewConversation}
          onCurrentConversationIdChange={setCurrentConversationId}
        />

        {(messages.length > 1 || (messages.length === 1 && messages[0].content)) && (
          <Button variant="outline" size="sm" onClick={clearMessages}>
            <Plus className="w-4 h-4 mr-2" />
            New
          </Button>
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
              <AgentWelcome onStartPrompt={startExamplePrompt} ref={welcomeRef} />
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
                    onOAuthComplete={handleOAuthCompletion}
                    onToolUpdate={handleToolUpdate}
                    onSystemMessage={addSystemMessage}
                    onTriggerContinuation={triggerStreamContinuation}
                    onAbortStream={abortStream}
                    editingMessageId={editingMessageId}
                    editingContent={editingContent}
                    setEditingContent={setEditingContent}
                    isLoading={isLoading}
                    formatTimestamp={formatTimestamp}
                    handleEditMessage={handleEditMessage}
                    handleSaveEdit={handleSaveEdit}
                    handleCancelEdit={handleCancelEdit}
                  />
                ))}
            </>
          )}
        </div>
        <ScrollToBottomButton />
      </ScrollToBottomContainer>

      <div
        ref={inputContainerRef}
        className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm"
      >
        <div className="mx-2 lg:mx-6 pb-4 px-4">
          <div className="max-w-7xl mx-auto">
            <div
              className="relative flex flex-col gap-2 bg-background dark:bg-neutral-900/90 border border-border/40 dark:border-neutral-700/60 rounded-3xl overflow-hidden shadow-lg dark:shadow-2xl dark:shadow-black/50 hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-black/60 transition-shadow duration-200 focus-within:shadow-xl dark:focus-within:shadow-2xl dark:focus-within:shadow-black/60 focus-within:border-border/60 dark:focus-within:border-neutral-600"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {isDragging && (
                <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-3xl z-10 flex items-center justify-center backdrop-blur-sm">
                  <div className="text-primary font-medium">Drop files here</div>
                </div>
              )}

              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 pt-3">
                  {uploadedFiles.map((file) => (
                    <FileChip
                      key={file.key}
                      file={file}
                      onRemove={handleFileRemove}
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 rounded-xl hover:bg-muted/90 bg-muted dark:bg-neutral-800 border-2 border-border dark:border-white/30 shadow-sm"
                    onClick={() => (fileInputRef.current as any)?.click()}
                    disabled={isProcessingFiles}
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>

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
              <span className="text-xs text-muted-foreground/60">
                Press Enter to send • Shift+Enter for new line
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
