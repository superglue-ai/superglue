"use client";

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { SaveToolDialog } from "@/src/components/tools/dialogs/SaveToolDialog";
import { Button } from "@/src/components/ui/button";
import { UserAction } from "@/src/lib/agent/agent-types";
import { resolveFileReferences, validateFileReferences } from "@/src/lib/agent/agent-helpers";
import {
  abortExecution,
  createSuperglueClient,
  generateUUID,
  shouldDebounceAbort,
} from "@/src/lib/client-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { SuperglueClient, Tool, ToolCall } from "@superglue/shared";
import {
  CheckCircle,
  ChevronDown,
  Hammer,
  Loader2,
  Play,
  Save,
  Square,
  Wrench,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JsonCodeEditor } from "../../editors/JsonCodeEditor";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../../ui/dropdown-menu";
import { DiffApprovalComponent } from "./DiffApprovalComponent";
import { DiffDisplay, ToolDiff } from "./DiffDisplayComponent";
import { enrichDiffsWithTargets, applyDiffsToConfig } from "@/src/lib/config-diff-utils";
import { ToolCallToolDisplay } from "./ToolComponentDisplay";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { TruncatableInstruction } from "./TruncatableInstruction";

type ToolMode = "build" | "fix" | "run";

interface ToolBuilderComponentProps {
  tool: ToolCall;
  mode: ToolMode;
  onInputChange: (newInput: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  bufferAction?: (action: UserAction) => void;
  onAbortStream?: () => void;
  onApplyChanges?: (config: Tool, diffs?: ToolDiff[]) => void;
  isPlayground?: boolean;
  currentPayload?: string;
  filePayloads?: Record<string, any>;
}

export function ToolBuilderComponent({
  tool,
  mode,
  onToolUpdate,
  sendAgentRequest,
  bufferAction,
  onAbortStream,
  onApplyChanges,
  isPlayground = false,
  currentPayload,
  filePayloads,
}: ToolBuilderComponentProps) {
  const config = useConfig();
  const { refreshTools } = useTools();

  // UI state
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Tool state
  const [currentConfig, setCurrentConfig] = useState<Tool | null>(null);
  const [toolSaved, setToolSaved] = useState(false);

  // Run state
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    success: boolean;
    data?: any;
    error?: string;
  } | null>(null);
  const [manualRunLogs, setManualRunLogs] = useState<Array<{ message: string; timestamp: Date }>>(
    [],
  );
  const [fixRequested, setFixRequested] = useState(false);
  const [hasActedOnDiffs, setHasActedOnDiffs] = useState(false);

  const [editablePayload, setEditablePayload] = useState<string>("");
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const currentRunIdRef = useRef<string | null>(null);
  const lastAbortTimeRef = useRef<number>(0);
  const logSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  const parsedOutput = useMemo(() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
    } catch {
      return null;
    }
  }, [tool.output]);

  const isSuccess = parsedOutput?.success === true;
  const isAwaitingConfirmation = tool.status === "awaiting_confirmation" && mode === "fix";

  // Enrich diffs for awaiting confirmation state
  const awaitingConfirmationDiffs = useMemo(() => {
    if (!isAwaitingConfirmation || !parsedOutput?.diffs || parsedOutput.diffs.length === 0) {
      return { enrichedDiffs: [], error: null };
    }
    try {
      const enriched = enrichDiffsWithTargets(parsedOutput.diffs, parsedOutput?.originalConfig);
      return { enrichedDiffs: enriched, error: null };
    } catch (error: any) {
      return {
        enrichedDiffs: [],
        error: error.message || "Failed to enrich diffs with target information",
      };
    }
  }, [isAwaitingConfirmation, parsedOutput]);

  // Enrich diffs for completed state
  const completedDiffs = useMemo(() => {
    if (tool.status !== "completed" || !isSuccess || mode !== "fix") {
      return { enrichedDiffs: [], error: null };
    }
    const approvedDiffs = parsedOutput?.approvedDiffs || parsedOutput?.diffs || [];
    try {
      const enriched = enrichDiffsWithTargets(approvedDiffs, parsedOutput?.originalConfig);
      return { enrichedDiffs: enriched, error: null };
    } catch (error: any) {
      return { enrichedDiffs: [], error: error.message || "Failed to process diffs" };
    }
  }, [tool.status, isSuccess, mode, parsedOutput]);

  useEffect(() => {
    if (parsedOutput?.config && tool.status === "completed") {
      setCurrentConfig(parsedOutput.config);
    }
    // For run mode, also set results from output
    if (mode === "run" && tool.status === "completed" && parsedOutput) {
      setRunResult({
        success: parsedOutput.success,
        data: parsedOutput.data,
        error: parsedOutput.error,
      });
    }
  }, [parsedOutput, tool.status, mode]);

  // Initialize editable payload when tool completes or is awaiting confirmation (for edit_tool)
  useEffect(() => {
    if (
      (tool.status === "completed" || tool.status === "awaiting_confirmation") &&
      (mode === "build" || mode === "fix")
    ) {
      const initialPayload =
        isPlayground && currentPayload
          ? (() => {
              try {
                return JSON.parse(currentPayload);
              } catch {
                return {};
              }
            })()
          : tool.input?.payload || {};
      setEditablePayload(JSON.stringify(initialPayload, null, 2));
    }
  }, [tool.status, mode, tool.input?.payload, isPlayground, currentPayload]);

  // Cleanup log subscription on unmount
  useEffect(() => {
    return () => {
      if (logSubscriptionRef.current) {
        logSubscriptionRef.current.unsubscribe();
        logSubscriptionRef.current = null;
      }
    };
  }, []);

  // Mode-specific labels and icons
  const modeConfig = {
    build: { label: "Building Tool", icon: Hammer, actionLabel: "Building" },
    fix: { label: "Editing Tool", icon: Wrench, actionLabel: "Applying edit" },
    run: { label: "Running Tool", icon: Play, actionLabel: "Executing" },
  };

  const { label: modeLabel, icon: ModeIcon, actionLabel } = modeConfig[mode];

  const handleStopExecution = async () => {
    if (shouldDebounceAbort(lastAbortTimeRef.current)) return;
    if (!currentRunIdRef.current) return;

    lastAbortTimeRef.current = Date.now();
    const client = createSuperglueClient(config.superglueEndpoint);
    const success = await abortExecution(client, currentRunIdRef.current);

    if (success) {
      currentRunIdRef.current = null;
      setIsRunning(false);
      setRunResult(null);
    }
  };

  // Unified tool execution function
  const executeToolConfig = useCallback(
    async (options: {
      toolConfig: Tool;
      appliedChangesCount?: number;
      overridePayload?: Record<string, any>;
      toolNameForFeedback: string;
      toolIdForFeedback?: string;
    }) => {
      const {
        toolConfig,
        appliedChangesCount = 0,
        overridePayload,
        toolNameForFeedback,
        toolIdForFeedback,
      } = options;

      const runId = generateUUID();
      currentRunIdRef.current = runId;
      setIsRunning(true);
      setRunResult(null);
      setManualRunLogs([]);

      const client = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

      try {
        const subscription = await client.subscribeToLogs({
          traceId: runId,
          onLog: (log) => {
            setManualRunLogs((prev) => [
              ...prev,
              { message: log.message, timestamp: log.timestamp },
            ]);
          },
          includeDebug: true,
        });
        logSubscriptionRef.current = subscription;
      } catch (e) {
        console.warn("Could not subscribe to logs:", e);
      }

      const cleanup = () => {
        currentRunIdRef.current = null;
        setIsRunning(false);
        if (logSubscriptionRef.current) {
          logSubscriptionRef.current.unsubscribe();
          logSubscriptionRef.current = null;
        }
      };

      const bufferFailure = (errorMsg: string) => {
        if (bufferAction) {
          bufferAction({
            type: "tool_execution_feedback",
            toolCallId: tool.id,
            toolName: toolNameForFeedback,
            feedback: "manual_run_failure",
            data: {
              toolId: toolIdForFeedback,
              error: errorMsg,
              appliedChanges: appliedChangesCount,
            },
          });
        }
      };

      // Parse payload - in playground mode prefer the payload prop from tool input UI, else use the tool input payload
      let runPayload = overridePayload || tool.input?.payload || {};
      if (!overridePayload) {
        try {
          const payloadSource = isPlayground && currentPayload ? currentPayload : editablePayload;
          if (payloadSource.trim()) {
            runPayload = JSON.parse(payloadSource);
          }
        } catch {}
      }

      // Validate file references
      const validation = validateFileReferences(runPayload, filePayloads || {});
      if (validation.valid === false) {
        const errorMsg = `Missing files: ${validation.missingFiles.join(", ")}. ${validation.availableKeys.length > 0 ? `Available: ${validation.availableKeys.join(", ")}` : "No files uploaded in this session."}`;
        setRunResult({ success: false, error: errorMsg });
        cleanup();
        bufferFailure(errorMsg);
        return;
      }

      // Resolve file references
      if (filePayloads && Object.keys(filePayloads).length > 0) {
        try {
          runPayload = resolveFileReferences(runPayload, filePayloads);
        } catch (error: any) {
          const errorMsg = error.message || "Failed to resolve file references";
          setRunResult({ success: false, error: errorMsg });
          cleanup();
          bufferFailure(errorMsg);
          return;
        }
      }

      // Execute
      try {
        console.log("[ToolBuilderComponent] Executing workflow:", {
          toolConfigId: toolConfig?.id,
          hasToolConfig: !!toolConfig,
          runId,
        });
        const result = await client.executeWorkflow({
          tool: toolConfig,
          payload: runPayload,
          runId,
          traceId: runId,
        });
        console.log("[ToolBuilderComponent] executeWorkflow result:", {
          success: result.success,
          hasData: !!result.data,
          error: result.error,
          hasConfig: !!result.config,
          configId: result.config?.id,
        });

        setRunResult({
          success: result.success,
          data: result.data,
          error: result.error,
        });

        if (bufferAction) {
          const feedbackType = result.success ? "manual_run_success" : "manual_run_failure";
          const truncatedResult =
            result.data !== undefined ? JSON.stringify(result.data).substring(0, 500) : undefined;
          const truncatedError =
            result.error && result.error.length > 500
              ? `${result.error.slice(0, 500)}...`
              : result.error;

          bufferAction({
            type: "tool_execution_feedback",
            toolCallId: tool.id,
            toolName: toolNameForFeedback,
            feedback: feedbackType,
            data: {
              toolId: toolIdForFeedback,
              result: result.success ? truncatedResult : undefined,
              error: truncatedError,
              appliedChanges: appliedChangesCount,
            },
          });
        }
      } catch (error: any) {
        console.error("[ToolBuilderComponent] executeWorkflow error:", error);
        console.error("[ToolBuilderComponent] error stack:", error.stack);
        const errorMsg = error.message || "Execution failed";
        setRunResult({ success: false, error: errorMsg });
        bufferFailure(errorMsg);
      } finally {
        currentRunIdRef.current = null;
        setIsRunning(false);
        if (logSubscriptionRef.current) {
          setTimeout(() => {
            logSubscriptionRef.current?.unsubscribe();
            logSubscriptionRef.current = null;
          }, 500);
        }
      }
    },
    [
      config.superglueEndpoint,
      config.apiEndpoint,
      filePayloads,
      tool.input?.payload,
      tool.id,
      editablePayload,
      isPlayground,
      currentPayload,
      bufferAction,
    ],
  );

  const handleRunTool = useCallback(() => {
    if (!currentConfig) return;
    executeToolConfig({
      toolConfig: currentConfig,
      toolNameForFeedback: currentConfig?.id || "draft",
      toolIdForFeedback: currentConfig?.id,
    });
  }, [currentConfig, executeToolConfig]);

  const handleToolSaved = (savedTool: any) => {
    setCurrentConfig(savedTool);
    setToolSaved(true);
    refreshTools();
  };

  // Running state (build/fix in progress, or run_tool executing)
  const isToolRunning = tool.status === "running";
  const isToolPending = tool.status === "pending";

  const handleDiffApprovalComplete = useCallback(
    (result: {
      approved: boolean;
      partial: boolean;
      approvedDiffs: ToolDiff[];
      rejectedDiffs: ToolDiff[];
    }) => {
      if (!sendAgentRequest) return;

      setHasActedOnDiffs(true);

      const originalConfig = parsedOutput?.originalConfig;
      if (
        (result.approved || result.partial) &&
        result.approvedDiffs.length > 0 &&
        originalConfig
      ) {
        const newConfig = applyDiffsToConfig(originalConfig, result.approvedDiffs);
        setCurrentConfig(newConfig);
        onApplyChanges?.(newConfig, result.approvedDiffs);
      }

      const action = result.approved ? "confirmed" : result.partial ? "partial" : "declined";
      onToolUpdate?.(tool.id, {
        status: result.approved || result.partial ? "completed" : "declined",
      });

      sendAgentRequest(undefined, {
        userActions: [
          {
            type: "tool_confirmation",
            toolCallId: tool.id,
            toolName: "edit_tool",
            action,
            data: {
              appliedChanges: result.approvedDiffs,
              rejectedChanges: result.rejectedDiffs,
            },
          },
        ],
      });
    },
    [sendAgentRequest, onApplyChanges, parsedOutput, tool.id, onToolUpdate],
  );

  // Handler for testing with approved diffs before final approval
  const handleRunWithApprovedDiffs = useCallback(
    (approvedDiffs: ToolDiff[], overridePayload?: Record<string, any>) => {
      const originalConfig = parsedOutput?.originalConfig;
      if (!originalConfig || approvedDiffs.length === 0) return;

      const testConfig = applyDiffsToConfig(originalConfig, approvedDiffs);
      const toolId = currentConfig?.id || originalConfig?.id;

      executeToolConfig({
        toolConfig: testConfig,
        appliedChangesCount: approvedDiffs.length,
        overridePayload,
        toolNameForFeedback: toolId || "draft",
        toolIdForFeedback: toolId,
      });
    },
    [parsedOutput, currentConfig, executeToolConfig],
  );

  // Compute status override for manual runs (after build/fix is complete)
  const statusOverride = (() => {
    // Only override if original tool call is completed
    if (tool.status !== "completed") return null;
    // Show running status during manual execution
    if (isRunning) return "running" as const;
    // Manual run result doesn't affect overall status - build succeeded
    // Run errors are shown in the output section, not the status
    return null;
  })();

  const shouldBeOpen = !hasActedOnDiffs;

  return (
    <ToolCallWrapper
      tool={tool}
      openByDefault={shouldBeOpen}
      hideStatusIcon={isToolPending}
      statusOverride={statusOverride}
      manualRunLogs={manualRunLogs}
    >
      <div className="space-y-4">
        {/* Pending state - show inputs as they're being written */}
        {isToolPending && (
          <div className="bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-gray-500 dark:text-gray-400 animate-spin" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {tool.input ? "Preparing tool..." : "Writing tool inputs..."}
              </span>
            </div>
            {tool.input && (
              <pre className="mt-2 text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-hidden">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Running/Building/Fixing indicator */}
        {isToolRunning && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div
              className={`flex items-center gap-2 ${mode === "build" && tool.input?.instruction ? "mb-2" : ""}`}
            >
              <ModeIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                {modeLabel}...
              </span>
            </div>
            {mode === "build" && tool.input?.instruction && (
              <TruncatableInstruction
                text={tool.input.instruction}
                className="text-sm text-blue-700 dark:text-blue-300"
              />
            )}
          </div>
        )}

        {/* Awaiting confirmation state for fix mode */}
        {isAwaitingConfirmation && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium">Review Changes</span>
            </div>
            {awaitingConfirmationDiffs?.error ? (
              <div className="flex items-start gap-3 p-3 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-200/60 dark:border-red-900/40">
                <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-red-700 dark:text-red-300">
                    Failed to Process Changes
                  </div>
                  <div className="text-sm text-red-600/80 dark:text-red-400/80 break-words mt-1">
                    {awaitingConfirmationDiffs.error}
                  </div>
                </div>
              </div>
            ) : awaitingConfirmationDiffs?.enrichedDiffs?.length > 0 ? (
              <div>
                <DiffApprovalComponent
                  enrichedDiffs={awaitingConfirmationDiffs.enrichedDiffs}
                  onComplete={handleDiffApprovalComplete}
                  onRunWithDiffs={handleRunWithApprovedDiffs}
                  onAbortTest={handleStopExecution}
                  isRunning={isRunning}
                  testLogs={manualRunLogs}
                  testResult={runResult}
                  initialPayload={editablePayload}
                />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                No changes to review.
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-3"
                  onClick={() =>
                    handleDiffApprovalComplete({
                      approved: true,
                      partial: false,
                      approvedDiffs: [],
                      rejectedDiffs: [],
                    })
                  }
                >
                  Continue
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Completed state */}
        {tool.status === "completed" && isSuccess && (
          <>
            {/* Success banner for fix mode */}
            {mode === "fix" && (
              <div className="space-y-3">
                {(() => {
                  const rejectedCount = parsedOutput?.rejectedDiffs?.length || 0;

                  if (completedDiffs?.error) {
                    return (
                      <div className="flex items-start gap-3 p-3 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-200/60 dark:border-red-900/40">
                        <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-red-700 dark:text-red-300">
                            Failed to Display Changes
                          </div>
                          <div className="text-sm text-red-600/80 dark:text-red-400/80 break-words mt-1">
                            {completedDiffs.error}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium">Tool Edited Successfully</span>
                        {completedDiffs?.enrichedDiffs?.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {completedDiffs.enrichedDiffs.length} change
                            {completedDiffs.enrichedDiffs.length !== 1 ? "s" : ""} applied
                            {rejectedCount > 0 && `, ${rejectedCount} rejected`}
                          </span>
                        )}
                      </div>
                      {completedDiffs?.enrichedDiffs?.length > 0 && (
                        <DiffDisplay enrichedDiffs={completedDiffs.enrichedDiffs} />
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Tool display */}
            {currentConfig && (
              <ToolCallToolDisplay
                toolId={currentConfig.id}
                tool={currentConfig}
                payload={tool.input?.payload}
                output={runResult?.success ? runResult.data : undefined}
                showOutput={!!runResult?.success}
                showToolSteps={mode === "build"}
                showPayload={mode === "run"}
              />
            )}

            {/* Run results - only show errors */}
            {runResult && !runResult.success && runResult.error && (
              <div className="flex items-start gap-3 p-3 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-200/60 dark:border-red-900/40">
                <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-red-700 dark:text-red-300">
                    Execution Failed
                  </div>
                  <div className="text-sm text-red-600/80 dark:text-red-400/80 break-words mt-1">
                    {runResult.error.length > 300
                      ? `${runResult.error.slice(0, 300)}...`
                      : runResult.error}
                  </div>
                </div>
              </div>
            )}

            {(mode === "build" || mode === "fix") && currentConfig && !isPlayground && (
              <div className="flex gap-2 flex-wrap">
                {/* Run/Stop Tool button with payload dropdown */}
                {isRunning ? (
                  <Button
                    variant="outline"
                    onClick={handleStopExecution}
                    className="h-9 px-3 text-sm font-medium"
                  >
                    <Square className="w-4 h-4 mr-1.5" />
                    Stop
                  </Button>
                ) : (
                  <DropdownMenu>
                    <div className="flex">
                      <Button
                        variant={!runResult ? "default" : "outline"}
                        onClick={() => handleRunTool()}
                        className="h-9 px-3 text-sm font-medium rounded-r-none"
                      >
                        <Play className="w-4 h-4 mr-1.5" />
                        Run Tool
                      </Button>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={!runResult ? "default" : "outline"}
                          className="h-9 px-2 text-sm font-medium rounded-l-none border-l-0"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </div>
                    <DropdownMenuContent align="start" className="w-[400px] p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Test Payload</span>
                          {payloadError && (
                            <span className="text-xs text-red-500">(Invalid JSON)</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Edit the payload to test with different inputs.
                        </p>
                        <JsonCodeEditor
                          value={editablePayload}
                          onChange={(val) => {
                            setEditablePayload(val || "");
                            try {
                              if (val?.trim()) {
                                JSON.parse(val);
                                setPayloadError(null);
                              } else {
                                setPayloadError(null);
                              }
                            } catch (e) {
                              setPayloadError((e as Error).message);
                            }
                          }}
                          readOnly={false}
                          maxHeight="200px"
                          resizable={true}
                          showValidation={true}
                        />
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {/* Save: default if run succeeded, outline otherwise */}
                <Button
                  variant={runResult?.success ? "default" : "outline"}
                  onClick={() => setShowSaveDialog(true)}
                  disabled={isRunning || toolSaved}
                  className="h-9 px-3 text-sm font-medium hidden md:flex"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  {toolSaved ? "Saved" : "Save"}
                </Button>
                {/* Request Fix: shown if run failed */}
                {runResult && !runResult.success && !isRunning && !fixRequested && (
                  <Button
                    variant="default"
                    onClick={() => {
                      setFixRequested(true);
                      const truncatedError =
                        runResult.error && runResult.error.length > 500
                          ? `${runResult.error.slice(0, 500)}...`
                          : runResult.error;
                      sendAgentRequest?.(undefined, {
                        userActions: [
                          {
                            type: "tool_execution_feedback",
                            toolCallId: tool.id,
                            toolName: "run_tool",
                            feedback: "request_fix",
                            data: truncatedError,
                          },
                        ],
                      });
                    }}
                    className="h-9 px-3 text-sm font-medium"
                  >
                    <Wrench className="w-4 h-4 mr-1.5" />
                    Request Fix
                  </Button>
                )}
              </div>
            )}

            {/* Save Dialog */}
            <SaveToolDialog
              tool={currentConfig}
              isOpen={showSaveDialog}
              onClose={() => setShowSaveDialog(false)}
              onSaved={handleToolSaved}
            />
          </>
        )}

        {/* Error state */}
        {(tool.status === "error" || (tool.status === "completed" && !isSuccess)) && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-red-50/50 dark:bg-red-950/20 rounded-lg border border-red-200/60 dark:border-red-900/40">
              <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-red-700 dark:text-red-300">
                  {mode === "build"
                    ? "Build Failed"
                    : mode === "fix"
                      ? "Fix Failed"
                      : "Execution Failed"}
                </div>
                <div className="text-sm text-red-600/80 dark:text-red-400/80 break-words mt-1">
                  {(() => {
                    const error = parsedOutput?.error || tool.error || "Unknown error";
                    return error.length > 300 ? `${error.slice(0, 300)}...` : error;
                  })()}
                </div>
                {/* Show required inputs if missing */}
                {parsedOutput?.inputSchema?.required && (
                  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                    <div className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
                      Required Inputs:
                    </div>
                    <div className="space-y-1">
                      {parsedOutput.inputSchema.required.map((field: string) => (
                        <div key={field} className="text-xs text-amber-700 dark:text-amber-300">
                          • <span className="font-mono">{field}</span>
                          {parsedOutput.inputSchema.properties?.[field]?.description && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {" — "}
                              {parsedOutput.inputSchema.properties[field].description}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}
