"use client";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { ThinkingIndicator } from "@/src/components/ui/thinking-indicator";
import {
  formatPlaygroundRuntimeContext,
  formatSystemRuntimeContext,
  SystemPlaygroundContextData,
} from "@/src/lib/agent/agent-context";
import { cn } from "@/src/lib/general-utils";
import { Tool, ExecutionStep, ToolDiff } from "@superglue/shared";
import { BotMessageSquare, Edit2, MessagesSquare, Send, Square, User, Plus, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { AgentContextProvider, useAgentContext } from "../../agent/AgentContextProvider";
import { ConversationHistory } from "../../agent/ConversationHistory";
import type { AgentConfig, PlaygroundToolContext } from "../../agent/hooks/types";
import { AgentType } from "@/src/lib/agent/registry/agents";
import {
  ScrollToBottomButton,
  ScrollToBottomContainer,
  ScrollToBottomTrigger,
  ScrollToBottomTriggerRef,
} from "../../agent/hooks/use-scroll-to-bottom";
import { ToolCallComponent } from "../../agent/ToolCallComponent";
import { BackgroundToolGroup, groupMessageParts } from "../../agent/tool-components";
import { useToolConfig } from "../context/tool-config-context";
import { useExecution } from "../context/tool-execution-context";
import { useRightSidebar } from "../../sidebar/RightSidebarContext";
import type { SystemContextForAgent } from "../../systems/context/types";

const MAX_MESSAGE_LENGTH = 50000;

export type PlaygroundMode = "tool" | "system";

export type SystemConfigForAgent = SystemContextForAgent;

interface PlaygroundAgentSidebarProps {
  className?: string;
  hideHeader?: boolean;
  initialError?: string;
  mode?: PlaygroundMode;
  systemConfig?: SystemContextForAgent;
}

function buildPlaygroundContext(
  toolConfig: ReturnType<typeof useToolConfig>,
  executionSummary: string,
  initialError?: string,
): PlaygroundToolContext {
  const { tool, steps, finalTransform, inputSchema, responseSchema, payload } = toolConfig;
  const systemIds = [
    ...new Set(steps.map((s: ExecutionStep) => s.systemId).filter(Boolean)),
  ] as string[];

  return {
    toolId: tool.id,
    instruction: tool.instruction,
    steps: steps.map((step: ExecutionStep) => ({
      ...step,
      apiConfig: {
        ...step.apiConfig,
        id: step.apiConfig?.id || step.id,
      },
    })),
    finalTransform,
    inputSchema,
    responseSchema,
    systemIds,
    executionSummary,
    initialError,
    currentPayload: JSON.stringify(payload.computedPayload || {}, null, 2),
  };
}

interface PlaygroundAgentContentProps {
  toolId?: string;
  systemId?: string;
  hideHeader?: boolean;
  initialError?: string;
  mode: PlaygroundMode;
  cacheKeyPrefix: string;
  onApplyChanges?: (newConfig: Tool, diffs?: ToolDiff[]) => void;
  onApplyPayload?: (newPayload: string) => void;
  currentPayload?: string;
}

function PlaygroundAgentContent({
  toolId,
  systemId,
  hideHeader = false,
  initialError,
  mode,
  cacheKeyPrefix,
  onApplyChanges,
  onApplyPayload,
  currentPayload,
}: PlaygroundAgentContentProps) {
  const {
    messages,
    isLoading,
    handleSendMessage,
    stopStreaming,
    handleToolInputChange,
    handleToolUpdate,
    sendAgentRequest,
    bufferAction,
    currentConversationId,
    setCurrentConversationId,
    loadConversation,
    startNewConversation,
    editingMessageId,
    editingContent,
    setEditingContent,
    handleEditMessage,
    handleCancelEdit,
    handleSaveEdit,
  } = useAgentContext();

  const { registerSetAgentInput, registerResetAgentChat } = useRightSidebar();
  const [inputValue, setInputValue] = useState("");
  const [isHighlighted, setIsHighlighted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoFixedRef = useRef(false);
  const scrollTriggerRef = useRef<ScrollToBottomTriggerRef>(null);

  // Register the setInput function to paste message into input field and select it
  useEffect(() => {
    registerSetAgentInput((message: string) => {
      setInputValue(message);
      setIsHighlighted(true);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
      }, 0);
    });
  }, [registerSetAgentInput]);

  // Register the reset chat function so it can be called from outside (Cmd+L)
  useEffect(() => {
    registerResetAgentChat(startNewConversation);
  }, [registerResetAgentChat, startNewConversation]);

  useEffect(() => {
    if (initialError && !hasAutoFixedRef.current && !isLoading && messages.length === 0) {
      hasAutoFixedRef.current = true;
      const truncatedError =
        initialError.length > 500 ? `${initialError.slice(0, 500)}...` : initialError;
      const errorMessage =
        mode === "tool"
          ? `The tool execution failed with the following error:\n\n${truncatedError}\n\nPlease analyze this error and fix the tool configuration.`
          : `The system test failed with the following error:\n\n${truncatedError}\n\nPlease analyze this error and help fix the configuration.`;
      handleSendMessage(errorMessage);
    }
  }, [initialError, isLoading, messages.length, handleSendMessage, mode]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (inputValue.trim() && !isLoading) {
        scrollTriggerRef.current?.scrollToBottom();
        handleSendMessage(inputValue.trim());
        setInputValue("");
        setIsHighlighted(false);
        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      }
    },
    [inputValue, isLoading, handleSendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasMessages = messages.length > 0;
  const emptyStateText =
    mode === "tool"
      ? {
          title: "Ask superglue to edit your tool",
          hint: 'e.g. "Add a filter to step getUsers to retrieve only active users"',
        }
      : {
          title: "Ask superglue to help with your system",
          hint: 'e.g. "Test my API credentials" or "Help me debug authentication"',
        };

  return (
    <div className="flex flex-col h-full bg-background">
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 overflow-visible relative z-10",
          !hideHeader && "bg-muted/30 border-b",
        )}
      >
        {!hideHeader && (
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <MessagesSquare className="h-3.5 w-3.5" />
            Agent
          </div>
        )}
        <div className={cn("flex items-center gap-1 relative", hideHeader && "ml-auto")}>
          <ConversationHistory
            messages={messages}
            currentConversationId={currentConversationId}
            onConversationLoad={loadConversation}
            onNewConversation={startNewConversation}
            onCurrentConversationIdChange={setCurrentConversationId}
            cacheKeyPrefix={cacheKeyPrefix}
          />
          {(messages.length > 1 || (messages.length === 1 && messages[0].content)) && (
            <Button variant="ghost" size="sm" onClick={startNewConversation} className="h-8 px-2">
              <Plus className="w-3 h-3 mr-1" />
              New
            </Button>
          )}
        </div>
      </div>

      <ScrollToBottomContainer
        className="flex-1 overflow-hidden relative"
        scrollViewClassName="overflow-x-hidden scrollbar-hidden"
        followButtonClassName="hidden"
        debounce={50}
      >
        <div className="p-4 space-y-4">
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <BotMessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">{emptyStateText.title}</p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-[240px]">
                {emptyStateText.hint}
              </p>
            </div>
          )}

          {messages
            .filter((m) => !(m as any).isHidden)
            .map((message) => (
              <div key={message.id} className="space-y-1 group">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {message.role === "user" ? <User size={14} /> : <BotMessageSquare size={14} />}
                  </div>
                  <span className="text-sm font-medium">
                    {message.role === "user" ? "You" : "superglue"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(message.timestamp)}
                  </span>
                  {(() => {
                    const hasContent =
                      message.content?.trim() ||
                      message.parts?.some((p) => p.type === "content" && p.content?.trim());
                    return message.isStreaming && !hasContent ? <ThinkingIndicator /> : null;
                  })()}
                  {message.role === "user" && !isLoading && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 p-3"
                      onClick={() => handleEditMessage(message.id, message.content)}
                    >
                      <Edit2 className="w-0.5 h-0.5" />
                    </Button>
                  )}
                </div>

                {editingMessageId === message.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      className="min-h-[48px] max-h-[120px] resize-none text-sm focus-visible:ring-0 focus-visible:border-ring"
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelEdit}
                        disabled={isLoading}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {message.parts && message.parts.length > 0 ? (
                      groupMessageParts(message.parts).map((grouped, idx) => {
                        if (grouped.type === "content") {
                          return (
                            <div
                              key={grouped.part.id}
                              className={cn(
                                "prose prose-sm max-w-none dark:prose-invert text-sm",
                                message.isStreaming && "streaming-message",
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
                              key={grouped.part.tool.id}
                              tool={grouped.part.tool}
                              onInputChange={handleToolInputChange}
                              onToolUpdate={handleToolUpdate}
                              sendAgentRequest={sendAgentRequest}
                              bufferAction={bufferAction}
                              onAbortStream={stopStreaming}
                              onApplyChanges={onApplyChanges}
                              onApplyPayload={onApplyPayload}
                              currentPayload={currentPayload}
                              isPlayground={mode === "tool"}
                            />
                          );
                        }
                        return null;
                      })
                    ) : (
                      <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
                        <Streamdown>{message.content}</Streamdown>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
        <ScrollToBottomTrigger ref={scrollTriggerRef} />
        <ScrollToBottomButton
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50"
          buttonClassName="h-8 w-8 p-0 rounded-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 border-2 border-green-400 dark:border-green-500 shadow-lg hover:shadow-xl transition-all duration-200"
          iconClassName="w-4 h-4 text-white"
        />
      </ScrollToBottomContainer>

      <div className="p-3">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setIsHighlighted(false);
              // Auto-resize textarea
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message superglue..."
            className={cn(
              "min-h-[36px] max-h-[200px] resize-none text-sm py-2 transition-all",
              isHighlighted &&
                "ring-1 ring-amber-500 border-amber-500 shadow-lg shadow-amber-500/30 focus-visible:ring-1 focus-visible:ring-amber-500",
            )}
            rows={1}
            disabled={isLoading}
            maxLength={MAX_MESSAGE_LENGTH}
          />
          <Button
            type={isLoading ? "button" : "submit"}
            size="icon"
            disabled={!isLoading && !inputValue.trim()}
            onClick={isLoading ? stopStreaming : undefined}
            className="h-[36px] w-[36px] shrink-0"
          >
            {isLoading ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

function ToolPlaygroundAgentSidebar({
  className,
  hideHeader,
  initialError,
}: Omit<PlaygroundAgentSidebarProps, "mode" | "systemConfig">) {
  const toolConfig = useToolConfig();
  const execution = useExecution();
  const toolId = toolConfig.tool.id;

  const handleApplyChanges = useCallback(
    (newConfig: Tool, _diffs?: ToolDiff[]) => {
      execution.skipNextHashInvalidation();

      const stepsAreDifferent = (a: ExecutionStep, b: ExecutionStep): boolean => {
        return (
          a.id !== b.id ||
          a.systemId !== b.systemId ||
          a.executionMode !== b.executionMode ||
          a.loopSelector !== b.loopSelector ||
          JSON.stringify(a.apiConfig) !== JSON.stringify(b.apiConfig)
        );
      };

      let firstChangedStepIndex: number | null = null;
      if (newConfig.steps) {
        const oldSteps = toolConfig.steps;
        const newSteps = newConfig.steps;
        const maxLen = Math.max(oldSteps.length, newSteps.length);

        for (let i = 0; i < maxLen; i++) {
          const oldStep = oldSteps[i];
          const newStep = newSteps[i];
          if (!oldStep || !newStep || stepsAreDifferent(oldStep, newStep)) {
            firstChangedStepIndex = i;
            break;
          }
        }

        toolConfig.setSteps(
          newSteps.map((step) => ({
            ...step,
            apiConfig: { ...step.apiConfig, id: step.apiConfig?.id || step.id },
          })),
        );
      }

      const finalTransformChanged =
        newConfig.finalTransform !== undefined &&
        newConfig.finalTransform !== toolConfig.finalTransform;

      if (newConfig.finalTransform !== undefined) {
        toolConfig.setFinalTransform(newConfig.finalTransform);
      }

      if (newConfig.responseSchema !== undefined) {
        const schemaValue = newConfig.responseSchema
          ? typeof newConfig.responseSchema === "string"
            ? newConfig.responseSchema
            : JSON.stringify(newConfig.responseSchema, null, 2)
          : "";
        toolConfig.setResponseSchema(schemaValue);
      }

      if (newConfig.inputSchema !== undefined) {
        const schemaValue = newConfig.inputSchema
          ? typeof newConfig.inputSchema === "string"
            ? newConfig.inputSchema
            : JSON.stringify(newConfig.inputSchema, null, 2)
          : null;
        toolConfig.setInputSchema(schemaValue);
      }

      if (firstChangedStepIndex !== null) {
        execution.clearExecutionsFrom(firstChangedStepIndex);
      } else if (finalTransformChanged) {
        execution.clearFinalResult();
      }
    },
    [toolConfig, execution],
  );

  const handleApplyPayload = useCallback(
    (newPayload: string) => {
      toolConfig.setPayloadText(newPayload);
    },
    [toolConfig],
  );

  const currentPayload = JSON.stringify(toolConfig.payload.computedPayload || {}, null, 2);

  const hiddenContextBuilder = useCallback(() => {
    const executionSummary = execution.getExecutionStateSummary();
    const ctx = buildPlaygroundContext(toolConfig, executionSummary, initialError);
    const { payload } = toolConfig;
    const uploadedFiles = payload.uploadedFiles.map((f) => ({
      name: f.name,
      key: f.key,
      status: f.status,
    }));
    const mergedPayload =
      uploadedFiles.length > 0 ? JSON.stringify(payload.computedPayload, null, 2) : undefined;

    return formatPlaygroundRuntimeContext({
      toolId: ctx.toolId,
      instruction: ctx.instruction,
      stepsCount: ctx.steps.length,
      currentPayload: ctx.currentPayload || "{}",
      executionSummary: ctx.executionSummary,
      uploadedFiles: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      mergedPayload,
    });
  }, [toolConfig, execution, initialError]);

  const agentConfig = useMemo<AgentConfig>(() => {
    const ctx = buildPlaygroundContext(
      toolConfig,
      execution.getExecutionStateSummary(),
      initialError,
    );
    return {
      agentId: AgentType.PLAYGROUND,
      hiddenContextBuilder,
      agentParams: {
        playgroundToolConfig: {
          toolId: ctx.toolId,
          instruction: ctx.instruction,
          steps: ctx.steps,
          finalTransform: ctx.finalTransform,
          inputSchema: ctx.inputSchema,
          responseSchema: ctx.responseSchema,
          systemIds: ctx.systemIds,
        },
      },
    };
  }, [toolConfig, execution, initialError, hiddenContextBuilder]);

  return (
    <div className={cn("h-full", className)}>
      <AgentContextProvider config={agentConfig}>
        <PlaygroundAgentContent
          toolId={toolId}
          hideHeader={hideHeader}
          initialError={initialError}
          mode="tool"
          cacheKeyPrefix={`superglue-playground-${toolId}`}
          onApplyChanges={handleApplyChanges}
          onApplyPayload={handleApplyPayload}
          currentPayload={currentPayload}
        />
      </AgentContextProvider>
    </div>
  );
}

function SystemPlaygroundAgentSidebar({
  className,
  hideHeader,
  initialError,
  systemConfig,
}: Omit<PlaygroundAgentSidebarProps, "mode"> & { systemConfig: SystemContextForAgent }) {
  const hiddenContextBuilder = useCallback(() => {
    return formatSystemRuntimeContext(systemConfig);
  }, [systemConfig]);

  const agentConfig = useMemo<AgentConfig>(() => {
    return {
      agentId: AgentType.SYSTEM_PLAYGROUND,
      hiddenContextBuilder,
      agentParams: {
        systemConfig: {
          id: systemConfig.systemId,
          url: systemConfig.url,
          templateName: systemConfig.templateName,
        },
      },
    };
  }, [systemConfig, hiddenContextBuilder]);

  return (
    <div className={cn("h-full", className)}>
      <AgentContextProvider config={agentConfig}>
        <PlaygroundAgentContent
          systemId={systemConfig.systemId}
          hideHeader={hideHeader}
          initialError={initialError}
          mode="system"
          cacheKeyPrefix={`superglue-system-${systemConfig.systemId || "new"}`}
        />
      </AgentContextProvider>
    </div>
  );
}

export function PlaygroundAgentSidebar({
  className,
  hideHeader,
  initialError,
  mode = "tool",
  systemConfig,
}: PlaygroundAgentSidebarProps) {
  if (mode === "system" && systemConfig) {
    return (
      <SystemPlaygroundAgentSidebar
        className={className}
        hideHeader={hideHeader}
        initialError={initialError}
        systemConfig={systemConfig}
      />
    );
  }

  return (
    <ToolPlaygroundAgentSidebar
      className={className}
      hideHeader={hideHeader}
      initialError={initialError}
    />
  );
}
