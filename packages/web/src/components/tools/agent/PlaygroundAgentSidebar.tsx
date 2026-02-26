"use client";

import { Button } from "@/src/components/ui/button";
import { FileChip } from "@/src/components/ui/file-chip";
import { Textarea } from "@/src/components/ui/textarea";
import { ThinkingIndicator } from "@/src/components/ui/thinking-indicator";
import {
  formatPlaygroundHiddenContext,
  formatSystemHiddenContext,
} from "@/src/lib/agent/agent-context";
import { cn } from "@/src/lib/general-utils";
import {
  Tool,
  ToolStep,
  ToolDiff,
  RequestStepConfig,
  isRequestConfig,
  safeStringify,
} from "@superglue/shared";
import { MessagesSquare, Pencil, Plus, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { AgentContextProvider, useAgentContext } from "../../agent/AgentContextProvider";
import { AgentInputArea } from "../../agent/AgentInputArea";
import { AgentCapabilities } from "../../agent/AgentCapabilities";
import { ConversationHistory } from "../../agent/ConversationHistory";
import type { AgentConfig } from "../../agent/hooks/types";
import { AgentType } from "@/src/lib/agent/registry/agents";
import { DraftLookup, PlaygroundToolContext } from "@/src/lib/agent/agent-types";
import { useSystems } from "@/src/app/systems-context";
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

function buildToolPlaygroundContext(
  toolConfig: ReturnType<typeof useToolConfig>,
  executionSummary: string,
  initialError?: string,
): PlaygroundToolContext {
  const { tool, steps, outputTransform, inputSchema, outputSchema, payload } = toolConfig;
  const systemIds = [
    ...new Set(
      steps
        .map((s: ToolStep) =>
          s.config && isRequestConfig(s.config)
            ? (s.config as RequestStepConfig).systemId
            : undefined,
        )
        .filter(Boolean),
    ),
  ] as string[];

  return {
    toolId: tool.id,
    instruction: tool.instruction,
    steps: steps.map((step: ToolStep) => ({
      ...step,
    })),
    outputTransform,
    inputSchema: inputSchema && inputSchema.trim() ? inputSchema : null,
    outputSchema: outputSchema && outputSchema.trim() ? outputSchema : null,
    systemIds,
    executionSummary,
    initialError,
    currentPayload: safeStringify(payload.computedPayload || {}, 2),
  };
}

interface PlaygroundAgentContentProps {
  hideHeader?: boolean;
  mode: PlaygroundMode;
  agentType: AgentType;
  cacheKeyPrefix: string;
  onApplyChanges?: (newConfig: Tool, diffs?: ToolDiff[]) => void;
  onApplyPayload?: (newPayload: string) => void;
  currentPlaygroundState?: Partial<PlaygroundToolContext>;
}

function PlaygroundAgentContent({
  hideHeader = false,
  mode,
  agentType,
  cacheKeyPrefix,
  onApplyChanges,
  onApplyPayload,
  currentPlaygroundState,
}: PlaygroundAgentContentProps) {
  const initialError = currentPlaygroundState?.initialError;
  const currentPayload = currentPlaygroundState?.currentPayload;

  const {
    messages,
    isLoading,
    handleSendMessage,
    stopStreaming,
    handleToolInputChange,
    handleToolUpdate,
    sendAgentRequest,
    bufferAction,
    filePayloads,
    currentConversationId,
    setCurrentConversationId,
    sessionId,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoFixedRef = useRef(false);
  const scrollTriggerRef = useRef<ScrollToBottomTriggerRef>(null);

  // Register the setInput function to paste message into input field and select it
  useEffect(() => {
    registerSetAgentInput((message: string) => {
      setInputValue(message);
      setIsHighlighted(true);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.style.height = "auto";
          inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
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

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    scrollTriggerRef.current?.scrollToBottom();
    handleSendMessage(inputValue.trim());
    setInputValue("");
    setIsHighlighted(false);
  }, [inputValue, isLoading, handleSendMessage]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasMessages = messages.some((m) => m.role !== "system" && !(m as any).isHidden);
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
          <AgentCapabilities agentType={agentType} compact triggerClassName="h-7 w-7" />
          <ConversationHistory
            messages={messages}
            currentConversationId={currentConversationId}
            sessionId={sessionId}
            onConversationLoad={loadConversation}
            onCurrentConversationIdChange={setCurrentConversationId}
            cacheKeyPrefix={cacheKeyPrefix}
          />
          {(messages.length > 1 || (messages.length === 1 && messages[0].content)) && (
            <Button variant="glass" size="sm" onClick={startNewConversation} className="h-8 px-2">
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
              <div className="h-10 w-10 rounded-full bg-white dark:bg-black flex items-center justify-center mb-3">
                <img
                  src="/favicon.png"
                  alt="superglue"
                  className="w-5 h-5 object-contain dark:invert"
                />
              </div>
              <p className="text-sm text-muted-foreground">{emptyStateText.title}</p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-[240px]">
                {emptyStateText.hint}
              </p>
            </div>
          )}

          {messages
            .filter((m) => m.role !== "system" && !(m as any).isHidden)
            .map((message) => (
              <div key={message.id} className="p-2 pt-3 rounded-xl group min-h-12">
                <div className="space-y-2 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
                        message.role === "user"
                          ? "bg-neutral-100 dark:bg-neutral-900"
                          : "bg-white dark:bg-black",
                      )}
                    >
                      {message.role === "user" ? (
                        <span className="text-[9px] font-semibold text-neutral-900 dark:text-neutral-100">
                          Y
                        </span>
                      ) : (
                        <img
                          src="/favicon.png"
                          alt="superglue"
                          className="w-3 h-3 object-contain dark:invert"
                        />
                      )}
                    </div>
                    <span className="font-medium text-sm">
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
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {(message as any).attachedFiles.map((file: any) => (
                          <FileChip
                            key={file.key}
                            file={file}
                            size="compact"
                            rounded="md"
                            showOriginalName={true}
                            maxWidth="200px"
                          />
                        ))}
                      </div>
                    )}

                  {editingMessageId === message.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="min-h-[48px] max-h-[120px] resize-y text-sm bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/30 dark:to-muted/20 backdrop-blur-sm border border-border/50 rounded-lg shadow-sm focus-visible:ring-0 px-3 py-2"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="glass"
                          size="sm"
                          onClick={() => handleSaveEdit(message.id)}
                          disabled={!editingContent.trim() || isLoading}
                          className="rounded-lg text-xs h-7"
                        >
                          Save & Restart
                        </Button>
                        <Button
                          variant="glass"
                          size="sm"
                          onClick={handleCancelEdit}
                          disabled={isLoading}
                          className="rounded-lg text-xs h-7"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 message-content-wrapper break-words">
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
                                filePayloads={filePayloads}
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
        <AgentInputArea
          value={inputValue}
          onChange={(v) => {
            setInputValue(v);
            setIsHighlighted(false);
          }}
          onSend={handleSend}
          onStop={stopStreaming}
          isLoading={isLoading}
          placeholder="Message superglue..."
          maxLength={MAX_MESSAGE_LENGTH}
          compact
          inputRef={inputRef}
          inputClassName={cn(
            isHighlighted &&
              "!ring-1 ring-amber-500 border-amber-500 shadow-lg shadow-amber-500/30",
          )}
          scrollToBottom={() => scrollTriggerRef.current?.scrollToBottom()}
        />
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

      const stepsAreDifferent = (a: ToolStep, b: ToolStep): boolean => {
        const aSystemId =
          a.config && isRequestConfig(a.config)
            ? (a.config as RequestStepConfig).systemId
            : undefined;
        const bSystemId =
          b.config && isRequestConfig(b.config)
            ? (b.config as RequestStepConfig).systemId
            : undefined;
        return (
          a.id !== b.id ||
          aSystemId !== bSystemId ||
          a.dataSelector !== b.dataSelector ||
          JSON.stringify(a.config) !== JSON.stringify(b.config)
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
          })),
        );
      }

      const outputTransformChanged =
        newConfig.outputTransform !== undefined &&
        newConfig.outputTransform !== toolConfig.outputTransform;

      if (newConfig.outputTransform !== undefined) {
        toolConfig.setOutputTransform(newConfig.outputTransform);
      }

      if (newConfig.instruction !== undefined) {
        toolConfig.setInstruction(newConfig.instruction || "");
      }

      if (newConfig.outputSchema !== undefined) {
        const schemaValue = newConfig.outputSchema
          ? typeof newConfig.outputSchema === "string"
            ? newConfig.outputSchema
            : JSON.stringify(newConfig.outputSchema, null, 2)
          : "";
        toolConfig.setOutputSchema(schemaValue);
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
      } else if (outputTransformChanged) {
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

  // Build current draft config that updates whenever toolConfig changes
  const currentPlaygroundState = useMemo<PlaygroundToolContext>(
    () => buildToolPlaygroundContext(toolConfig, "", initialError),
    [toolConfig, initialError],
  );

  const hiddenContextBuilderRef = useRef<() => string>(() => "");
  const prevStateHashRef = useRef<string | null>(null);
  hiddenContextBuilderRef.current = () => {
    const { payload } = toolConfig;
    const uploadedFiles = payload.uploadedFiles.map((f) => ({
      name: f.name,
      key: f.key,
      status: f.status,
    }));
    const mergedPayload =
      uploadedFiles.length > 0 ? safeStringify(payload.computedPayload, 2) : undefined;

    const stepMeta = toolConfig.steps.map((step: ToolStep) => {
      const reqConfig =
        step.config && isRequestConfig(step.config)
          ? (step.config as RequestStepConfig)
          : undefined;
      return {
        id: step.id,
        systemId: reqConfig?.systemId,
        method: reqConfig?.method,
        status: execution.getStepStatus(step.id),
      };
    });

    let inputSchemaFields: string[] = [];
    try {
      const parsed =
        typeof toolConfig.inputSchema === "string"
          ? JSON.parse(toolConfig.inputSchema)
          : toolConfig.inputSchema;
      if (parsed?.properties?.payload?.properties) {
        inputSchemaFields = Object.keys(parsed.properties.payload.properties);
      } else if (parsed?.properties) {
        inputSchemaFields = Object.keys(parsed.properties);
      }
    } catch {}

    let outputSchemaFieldCount = 0;
    try {
      const parsed =
        typeof toolConfig.outputSchema === "string"
          ? JSON.parse(toolConfig.outputSchema)
          : toolConfig.outputSchema;
      if (parsed?.properties) {
        outputSchemaFieldCount = Object.keys(parsed.properties).length;
      }
    } catch {}

    const hashInput = safeStringify({
      steps: stepMeta,
      outputTransform: toolConfig.outputTransform,
      inputSchema: toolConfig.inputSchema,
      outputSchema: toolConfig.outputSchema,
      instruction: toolConfig.tool.instruction,
      responseFilters: toolConfig.responseFilters,
      transformStatus: execution.transformStatus,
      payload: toolConfig.payload.manualPayloadText,
      uploadedFiles,
      mergedPayload,
    });

    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0;
    }
    const hashStr = String(hash);

    if (prevStateHashRef.current !== null && prevStateHashRef.current === hashStr) {
      return "";
    }
    prevStateHashRef.current = hashStr;

    return formatPlaygroundHiddenContext({
      toolId: toolConfig.tool.id,
      instruction: toolConfig.tool.instruction,
      steps: stepMeta,
      hasOutputTransform: !!toolConfig.outputTransform,
      hasResponseFilters: (toolConfig.responseFilters?.length ?? 0) > 0,
      inputSchemaFields,
      outputSchemaFieldCount,
      transformStatus: execution.transformStatus,
      currentPayload: safeStringify(payload.computedPayload || {}, 2),
      uploadedFiles: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      mergedPayload,
    });
  };

  const playgroundDraftBuilderRef = useRef<() => DraftLookup | null>(() => null);
  playgroundDraftBuilderRef.current = () => {
    const ctx = buildToolPlaygroundContext(toolConfig, "", initialError);
    if (!ctx.toolId || !ctx.steps || ctx.steps.length === 0) {
      return null;
    }

    const executionResults: Record<string, { status: string; result?: string; error?: string }> =
      {};
    for (const step of ctx.steps) {
      const stepStatus = execution.getStepStatus(step.id);
      const stepResult = execution.getStepResult(step.id);
      const stepError = execution.getStepError(step.id);
      if (stepStatus !== "pending") {
        const entry: { status: string; result?: string; error?: string } = { status: stepStatus };
        if (stepResult !== null) {
          const resultStr =
            typeof stepResult === "string" ? stepResult : safeStringify(stepResult, 2);
          entry.result = resultStr.length > 5000 ? resultStr.substring(0, 5000) + "..." : resultStr;
        }
        if (stepError) {
          entry.error = stepError.length > 500 ? stepError.substring(0, 500) + "..." : stepError;
        }
        executionResults[step.id] = entry;
      }
    }

    return {
      config: {
        id: ctx.toolId,
        instruction: ctx.instruction,
        steps: ctx.steps,
        outputTransform: ctx.outputTransform,
        inputSchema: ctx.inputSchema ?? undefined,
        outputSchema: ctx.outputSchema ?? undefined,
      },
      systemIds: ctx.systemIds || [],
      instruction: ctx.instruction || "",
      executionResults: Object.keys(executionResults).length > 0 ? executionResults : undefined,
    };
  };

  const agentConfig = useMemo<AgentConfig>(() => {
    return {
      agentId: AgentType.PLAYGROUND,
      hiddenContextBuilder: () => hiddenContextBuilderRef.current(),
      playgroundDraftBuilder: () => playgroundDraftBuilderRef.current?.() ?? null,
    };
  }, []);

  return (
    <div className={cn("h-full", className)}>
      <AgentContextProvider config={agentConfig}>
        <PlaygroundAgentContent
          hideHeader={hideHeader}
          mode="tool"
          agentType={AgentType.PLAYGROUND}
          cacheKeyPrefix={`superglue-playground-${toolId}`}
          onApplyChanges={handleApplyChanges}
          onApplyPayload={handleApplyPayload}
          currentPlaygroundState={currentPlaygroundState}
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
  const { refreshSystems } = useSystems();

  const hiddenContextBuilderRef = useRef<() => string>(() => "");
  hiddenContextBuilderRef.current = () => {
    return JSON.stringify({
      display: formatSystemHiddenContext(systemConfig),
    });
  };

  const onToolComplete = useCallback(
    (toolName: string, _toolId: string, output: any) => {
      if ((toolName === "edit_system" || toolName === "create_system") && output?.success) {
        refreshSystems();
      }
    },
    [refreshSystems],
  );

  const agentConfig = useMemo<AgentConfig>(() => {
    return {
      agentId: AgentType.SYSTEM_PLAYGROUND,
      hiddenContextBuilder: () => hiddenContextBuilderRef.current(),
      onToolComplete,
    };
  }, [onToolComplete]);

  return (
    <div className={cn("h-full", className)}>
      <AgentContextProvider config={agentConfig}>
        <PlaygroundAgentContent
          hideHeader={hideHeader}
          mode="system"
          agentType={AgentType.SYSTEM_PLAYGROUND}
          cacheKeyPrefix={`superglue-system-${systemConfig.systemId || "new"}`}
          currentPlaygroundState={initialError ? { initialError } : undefined}
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
