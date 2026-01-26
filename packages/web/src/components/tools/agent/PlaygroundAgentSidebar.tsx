"use client";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/lib/general-utils";
import { Tool, ExecutionStep, ToolDiff } from "@superglue/shared";
import {
  BotMessageSquare,
  Loader2,
  MessagesSquare,
  Send,
  Sparkles,
  Square,
  User,
  Plus,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { AgentContextProvider, useAgentContext } from "../../agent/AgentContextProvider";
import { ConversationHistory } from "../../agent/ConversationHistory";
import type { AgentConfig, PlaygroundToolContext } from "../../agent/hooks/types";
import {
  ScrollToBottomButton,
  ScrollToBottomContainer,
} from "../../agent/hooks/use-scroll-to-bottom";
import { ToolCallComponent } from "../../agent/ToolCallComponent";
import { useToolConfig } from "../context/tool-config-context";
import { useExecution } from "../context/tool-execution-context";

const MAX_MESSAGE_LENGTH = 50000;

interface PlaygroundAgentSidebarProps {
  className?: string;
  hideHeader?: boolean;
  initialError?: string;
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
    currentPayload: payload.manualPayloadText || "{}",
  };
}

interface PlaygroundAgentContentProps {
  toolId: string;
  hideHeader?: boolean;
  initialError?: string;
}

function PlaygroundAgentContent({
  toolId,
  hideHeader = false,
  initialError,
}: PlaygroundAgentContentProps) {
  const {
    messages,
    isLoading,
    handleSendMessage,
    stopStreaming,
    handleToolInputChange,
    handleToolUpdate,
    addSystemMessage,
    triggerStreamContinuation,
    currentConversationId,
    setCurrentConversationId,
    loadConversation,
    startNewConversation,
  } = useAgentContext();

  const toolConfig = useToolConfig();
  const execution = useExecution();
  const cacheKeyPrefix = `superglue-playground-${toolId}`;
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoFixedRef = useRef(false);

  // Auto-send fix request when there's an initial error
  useEffect(() => {
    if (initialError && !hasAutoFixedRef.current && !isLoading && messages.length === 0) {
      hasAutoFixedRef.current = true;
      const truncatedError =
        initialError.length > 500 ? `${initialError.slice(0, 500)}...` : initialError;
      handleSendMessage(
        `The tool execution failed with the following error:\n\n${truncatedError}\n\nPlease analyze this error and fix the tool configuration.`,
      );
    }
  }, [initialError, isLoading, messages.length, handleSendMessage]);

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

  const currentPayload = toolConfig.payload.manualPayloadText || "{}";

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (inputValue.trim() && !isLoading) {
        handleSendMessage(inputValue.trim());
        setInputValue("");
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

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header - only show "Agent" label when not in tabbed sidebar, but always show conversation controls */}
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

      {/* Messages Area */}
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
              <p className="text-sm text-muted-foreground">Ask superglue to edit your tool</p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-[240px]">
                e.g. &quot;Add a filter to step getUsers to retrieve only active users&quot;
              </p>
            </div>
          )}

          {messages
            .filter((m) => !(m as any).isHidden)
            .map((message) => (
              <div key={message.id} className="space-y-1">
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
                  {message.isStreaming && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                </div>

                <div className="space-y-2">
                  {message.parts && message.parts.length > 0 ? (
                    message.parts.map((part) =>
                      part.type === "content" ? (
                        <div
                          key={part.id}
                          className={cn(
                            "prose prose-sm max-w-none dark:prose-invert text-sm",
                            message.isStreaming && "streaming-message",
                          )}
                        >
                          <Streamdown>{part.content || ""}</Streamdown>
                        </div>
                      ) : part.type === "tool" && part.tool ? (
                        <ToolCallComponent
                          key={part.tool.id}
                          tool={part.tool}
                          onInputChange={handleToolInputChange}
                          onToolUpdate={handleToolUpdate}
                          onSystemMessage={addSystemMessage}
                          onTriggerContinuation={triggerStreamContinuation}
                          onAbortStream={stopStreaming}
                          onApplyChanges={handleApplyChanges}
                          onApplyPayload={handleApplyPayload}
                          currentPayload={currentPayload}
                          isPlayground={true}
                        />
                      ) : null,
                    )
                  ) : (
                    <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
                      <Streamdown>{message.content}</Streamdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
        <ScrollToBottomButton
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50"
          buttonClassName="h-8 w-8 p-0 rounded-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 border-2 border-green-400 dark:border-green-500 shadow-lg hover:shadow-xl transition-all duration-200"
          iconClassName="w-4 h-4 text-white"
        />
      </ScrollToBottomContainer>

      {/* Input Area */}
      <div className="p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message superglue..."
            className="min-h-[36px] max-h-[96px] resize-none text-sm py-2"
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

export function PlaygroundAgentSidebar({
  className,
  hideHeader,
  initialError,
}: PlaygroundAgentSidebarProps) {
  const toolConfig = useToolConfig();
  const execution = useExecution();
  const toolId = toolConfig.tool.id;

  const agentConfig = useMemo<AgentConfig>(() => {
    const executionSummary = execution.getExecutionStateSummary();
    return {
      toolSet: "playground",
      playgroundContext: buildPlaygroundContext(toolConfig, executionSummary, initialError),
    };
  }, [toolConfig, execution, initialError]);

  return (
    <div className={cn("h-full", className)}>
      <AgentContextProvider config={agentConfig}>
        <PlaygroundAgentContent
          toolId={toolId}
          hideHeader={hideHeader}
          initialError={initialError}
        />
      </AgentContextProvider>
    </div>
  );
}
