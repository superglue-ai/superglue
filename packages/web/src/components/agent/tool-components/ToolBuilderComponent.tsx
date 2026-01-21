"use client";

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { SaveToolDialog } from "@/src/components/tools/dialogs/SaveToolDialog";
import ToolPlayground, { type ToolPlaygroundHandle } from "@/src/components/tools/ToolPlayground";
import { Button } from "@/src/components/ui/button";
import { EDIT_TOOL_CONFIRMATION } from "@/src/lib/agent/agent-tools";
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
  Edit2,
  Hammer,
  Loader2,
  Play,
  Save,
  Square,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JsonCodeEditor } from "../../editors/JsonCodeEditor";
import { DeployButton } from "../../tools/deploy/DeployButton";
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
  onSystemMessage?: (message: string, options?: { triggerImmediateResponse?: boolean }) => void;
  onTriggerContinuation?: () => void;
  onAbortStream?: () => void;
  onApplyChanges?: (config: Tool, diffs?: ToolDiff[]) => void;
  isPlayground?: boolean;
  currentPayload?: string;
}

export function ToolBuilderComponent({
  tool,
  mode,
  onSystemMessage,
  onToolUpdate,
  onTriggerContinuation,
  onAbortStream,
  onApplyChanges,
  isPlayground = false,
  currentPayload,
}: ToolBuilderComponentProps) {
  const config = useConfig();
  const { refreshTools } = useTools();
  const editorRef = useRef<ToolPlaygroundHandle | null>(null);

  // UI state
  const [showEditor, setShowEditor] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Tool state
  const [currentConfig, setCurrentConfig] = useState<any>(null);
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

  // Payload editor state
  const [editablePayload, setEditablePayload] = useState<string>("");
  const [payloadError, setPayloadError] = useState<string | null>(null);

  // Abort state
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

  // Initialize editable payload when tool completes
  useEffect(() => {
    if (tool.status === "completed" && (mode === "build" || mode === "fix")) {
      const initialPayload = tool.input?.payload || {};
      setEditablePayload(JSON.stringify(initialPayload, null, 2));
    }
  }, [tool.status, mode, tool.input?.payload]);

  // Cleanup log subscription on unmount
  useEffect(() => {
    return () => {
      if (logSubscriptionRef.current) {
        logSubscriptionRef.current.unsubscribe();
        logSubscriptionRef.current = null;
      }
    };
  }, []);

  const isSuccess = parsedOutput?.success === true;

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

  const handleRunTool = async () => {
    if (!currentConfig) return;

    const runId = generateUUID();
    currentRunIdRef.current = runId;
    setIsRunning(true);
    setRunResult(null);
    setManualRunLogs([]);

    // Notify agent that user is running the tool
    onSystemMessage?.(
      `[USER ACTION] User clicked "Run Tool" for tool "${currentConfig.id}". Executing now...`,
      { triggerImmediateResponse: false },
    );

    const client = new SuperglueClient({
      endpoint: config.superglueEndpoint,
      apiKey: tokenRegistry.getToken(),
    });

    // Subscribe to logs for this specific run
    try {
      const subscription = await client.subscribeToLogs({
        traceId: runId,
        onLog: (log) => {
          setManualRunLogs((prev) => [...prev, { message: log.message, timestamp: log.timestamp }]);
        },
        includeDebug: true,
      });
      logSubscriptionRef.current = subscription;
    } catch (e) {
      console.warn("Could not subscribe to logs:", e);
    }

    // Parse payload - in playground mode prefer currentPayload prop, else use local editablePayload
    let runPayload = tool.input?.payload || {};
    try {
      const payloadSource = isPlayground && currentPayload ? currentPayload : editablePayload;
      if (payloadSource.trim()) {
        runPayload = JSON.parse(payloadSource);
      }
    } catch {
      // Keep original payload if parsing fails
    }

    try {
      const result = await client.executeWorkflow({
        tool: currentConfig,
        payload: runPayload,
        runId,
        traceId: runId,
      });

      setRunResult({
        success: result.success,
        data: result.data,
        error: result.error,
      });

      if (result.success) {
        // Notify agent of success
        onSystemMessage?.(
          `[USER ACTION] Tool "${currentConfig.id}" executed successfully. Result: ${JSON.stringify(result.data).substring(0, 500)}`,
          { triggerImmediateResponse: false },
        );
      } else {
        // Notify agent of failure
        onSystemMessage?.(
          `[USER ACTION] Tool "${currentConfig.id}" execution failed. Error: ${result.error}`,
          { triggerImmediateResponse: false },
        );
      }
    } catch (error: any) {
      setRunResult({
        success: false,
        error: error.message || "Execution failed",
      });
      // Notify agent of error
      onSystemMessage?.(
        `[USER ACTION] Tool "${currentConfig.id}" execution failed with error: ${error.message}`,
        { triggerImmediateResponse: false },
      );
    } finally {
      currentRunIdRef.current = null;
      setIsRunning(false);
      // Clean up log subscription
      if (logSubscriptionRef.current) {
        setTimeout(() => {
          logSubscriptionRef.current?.unsubscribe();
          logSubscriptionRef.current = null;
        }, 500);
      }
    }
  };

  const handleToolSaved = (savedTool: any) => {
    setCurrentConfig(savedTool);
    setToolSaved(true);
    refreshTools();
    onSystemMessage?.(`[SYSTEM] Tool "${savedTool.id}" saved.`, {
      triggerImmediateResponse: false,
    });
  };

  // Running state (build/fix in progress, or run_tool executing)
  const isToolRunning = tool.status === "running";
  const isToolPending = tool.status === "pending";
  const isAwaitingConfirmation = tool.status === "awaiting_confirmation" && mode === "fix";

  const handleDiffApprovalComplete = useCallback(
    (result: {
      approved: boolean;
      partial: boolean;
      approvedDiffs: ToolDiff[];
      rejectedDiffs: ToolDiff[];
    }) => {
      if (!onToolUpdate || !onTriggerContinuation) return;

      setHasActedOnDiffs(true);
      onAbortStream?.();

      // Apply only the approved diffs to the original config (partial application)
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

      const confirmationState = result.approved
        ? EDIT_TOOL_CONFIRMATION.APPROVED
        : result.partial
          ? EDIT_TOOL_CONFIRMATION.PARTIAL
          : EDIT_TOOL_CONFIRMATION.REJECTED;

      onToolUpdate(tool.id, {
        output: JSON.stringify({
          ...parsedOutput,
          confirmationState,
          approvedDiffs: result.approvedDiffs,
          rejectedDiffs: result.rejectedDiffs,
        }),
        status: result.approved || result.partial ? "completed" : "declined",
      });

      setTimeout(() => {
        onTriggerContinuation();
      }, 100);
    },
    [onToolUpdate, onTriggerContinuation, onAbortStream, onApplyChanges, parsedOutput, tool.id],
  );

  // Handler for testing with approved diffs before final approval
  const handleRunWithApprovedDiffs = useCallback(
    async (approvedDiffs: ToolDiff[]) => {
      const originalConfig = parsedOutput?.originalConfig;
      if (!originalConfig || approvedDiffs.length === 0) return;

      // Apply approved diffs to the original config to create test config
      const testConfig = applyDiffsToConfig(originalConfig, approvedDiffs);

      const runId = generateUUID();
      currentRunIdRef.current = runId;
      setIsRunning(true);
      setRunResult(null);
      setManualRunLogs([]);

      onSystemMessage?.(
        `[USER ACTION] User clicked "Test ${approvedDiffs.length} change${approvedDiffs.length !== 1 ? "s" : ""}" for tool "${testConfig.id}". Testing proposed changes before approval...`,
        { triggerImmediateResponse: false },
      );

      const client = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
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

      // Parse payload - in playground mode prefer currentPayload prop, else use local editablePayload
      let runPayload = tool.input?.payload || {};
      try {
        const payloadSource = isPlayground && currentPayload ? currentPayload : editablePayload;
        if (payloadSource.trim()) {
          runPayload = JSON.parse(payloadSource);
        }
      } catch {
        // Keep original payload if parsing fails
      }

      try {
        const result = await client.executeWorkflow({
          tool: testConfig,
          payload: runPayload,
          runId,
          traceId: runId,
        });

        setRunResult({
          success: result.success,
          data: result.data,
          error: result.error,
        });

        if (result.success) {
          onSystemMessage?.(
            `[USER ACTION] Test run for tool "${testConfig.id}" succeeded. Changes can now be applied with confidence.`,
            { triggerImmediateResponse: false },
          );
        } else {
          onSystemMessage?.(
            `[USER ACTION] Test run for tool "${testConfig.id}" failed. Error: ${result.error}. User may want to adjust their diff selections.`,
            { triggerImmediateResponse: false },
          );
        }
      } catch (error: any) {
        setRunResult({
          success: false,
          error: error.message || "Execution failed",
        });
        onSystemMessage?.(
          `[USER ACTION] Test run for tool "${testConfig.id}" failed with error: ${error.message}`,
          { triggerImmediateResponse: false },
        );
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
      parsedOutput,
      config.superglueEndpoint,
      tool.input?.payload,
      editablePayload,
      isPlayground,
      currentPayload,
      onSystemMessage,
    ],
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
            {parsedOutput?.diffs && parsedOutput.diffs.length > 0 ? (
              <div>
                <DiffApprovalComponent
                  enrichedDiffs={enrichDiffsWithTargets(
                    parsedOutput.diffs,
                    parsedOutput?.originalConfig,
                  )}
                  onComplete={handleDiffApprovalComplete}
                  onRunWithDiffs={handleRunWithApprovedDiffs}
                  onAbortTest={handleStopExecution}
                  isRunning={isRunning}
                  testLogs={manualRunLogs}
                  testResult={runResult}
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
                  const approvedDiffs = parsedOutput?.approvedDiffs || parsedOutput?.diffs || [];
                  const enrichedDiffs = enrichDiffsWithTargets(
                    approvedDiffs,
                    parsedOutput?.originalConfig,
                  );
                  const rejectedCount = parsedOutput?.rejectedDiffs?.length || 0;
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium">Tool Edited Successfully</span>
                        {enrichedDiffs.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {enrichedDiffs.length} change{enrichedDiffs.length !== 1 ? "s" : ""}{" "}
                            applied
                            {rejectedCount > 0 && `, ${rejectedCount} rejected`}
                          </span>
                        )}
                      </div>
                      {enrichedDiffs.length > 0 && <DiffDisplay enrichedDiffs={enrichedDiffs} />}
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

            {mode === "build" && currentConfig && !isPlayground && (
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
                        onClick={handleRunTool}
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
                <Button
                  variant="outline"
                  onClick={() => setShowEditor(true)}
                  disabled={isRunning}
                  className="h-9 px-3 text-sm font-medium hidden md:flex"
                >
                  <Edit2 className="w-4 h-4 mr-1.5" />
                  Edit
                </Button>
                {/* Save: default if run succeeded, outline otherwise */}
                {!toolSaved ? (
                  <Button
                    variant={runResult?.success ? "default" : "outline"}
                    onClick={() => setShowSaveDialog(true)}
                    disabled={isRunning}
                    className="h-9 px-3 text-sm font-medium hidden md:flex"
                  >
                    <Save className="w-4 h-4 mr-1.5" />
                    Save
                  </Button>
                ) : (
                  <DeployButton
                    tool={currentConfig}
                    payload={tool.input?.payload || {}}
                    disabled={isRunning}
                    className="h-9 px-3 text-sm font-medium hidden md:flex"
                  />
                )}
                {/* Request Fix: shown if run failed */}
                {runResult && !runResult.success && !isRunning && !fixRequested && (
                  <Button
                    variant="default"
                    onClick={() => {
                      setFixRequested(true);
                      const configSummary = currentConfig
                        ? JSON.stringify(
                            {
                              id: currentConfig.id,
                              instruction: currentConfig.instruction,
                              steps: currentConfig.steps,
                              responseSchema: currentConfig.responseSchema,
                              systemIds: currentConfig.systemIds,
                            },
                            null,
                            2,
                          )
                        : "unknown";
                      const draftId = parsedOutput?.draftId;
                      const idParam = draftId
                        ? `draftId "${draftId}"`
                        : `toolId "${currentConfig?.id}"`;
                      const idInfo = draftId
                        ? `Draft ID: ${draftId}`
                        : `Tool ID: ${currentConfig?.id}`;
                      const truncatedError =
                        runResult.error && runResult.error.length > 500
                          ? `${runResult.error.slice(0, 500)}...`
                          : runResult.error;
                      onSystemMessage?.(
                        `[USER ACTION] User clicked "Request Fix" for tool "${currentConfig?.id}". The tool execution failed with error: ${truncatedError}\n\n${idInfo}\n\nCurrent tool configuration:\n${configSummary}\n\nPlease fix this tool using edit_tool with ${idParam}.`,
                        { triggerImmediateResponse: true },
                      );
                    }}
                    className="h-9 px-3 text-sm font-medium"
                  >
                    <Wrench className="w-4 h-4 mr-1.5" />
                    Request Fix
                  </Button>
                )}
              </div>
            )}

            {/* Editor Modal with inline agent sidebar */}
            {showEditor && currentConfig && (
              <div className="fixed left-0 lg:left-48 right-0 top-0 bottom-0 z-[100] bg-background dark:bg-neutral-940 flex flex-col animate-in zoom-in-95 duration-200 !mt-0">
                <div className="flex-none px-6 pt-4 pb-2">
                  <div className="flex items-center justify-end">
                    <Button variant="ghost" size="icon" onClick={() => setShowEditor(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden px-6 pb-6">
                  <ToolPlayground
                    ref={editorRef}
                    embedded
                    renderAgentInline
                    initialTool={currentConfig}
                    initialPayload={JSON.stringify(tool.input?.payload || {})}
                    initialInstruction={currentConfig?.instruction}
                    initialError={runResult && !runResult.success ? runResult.error : undefined}
                    onSave={async (wf) => {
                      const client = new SuperglueClient({
                        endpoint: config.superglueEndpoint,
                        apiKey: tokenRegistry.getToken(),
                      });
                      const saved = await client.upsertWorkflow(wf.id, wf);
                      setCurrentConfig(saved);
                      setToolSaved(true);
                      setShowEditor(false);
                      refreshTools();
                    }}
                  />
                </div>
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
