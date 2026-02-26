"use client";

import { Button } from "@/src/components/ui/button";
import { ErrorMessage } from "@/src/components/ui/error-message";
import { UserAction } from "@/src/lib/agent/agent-types";
import { enrichDiffsWithTargets, applyDiffsToConfig } from "@/src/lib/config-diff-utils";
import { Tool, ToolCall, ToolDiff } from "@superglue/shared";
import { CheckCircle, Pencil, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DiffApprovalComponent } from "./DiffApprovalComponent";
import { DiffDisplay } from "./DiffDisplayComponent";
import { ToolCallPendingState } from "./ToolCallPendingState";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { TruncatableInstruction } from "./TruncatableInstruction";
import { useToolExecution } from "./hooks/use-tool-execution";

interface EditToolComponentProps {
  tool: ToolCall;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  bufferAction?: (action: UserAction) => void;
  onAbortStream?: () => void;
  onApplyChanges?: (config: Tool, diffs?: ToolDiff[]) => void;
  isPlayground?: boolean;
  filePayloads?: Record<string, any>;
}

export function EditToolComponent({
  tool,
  onToolUpdate,
  sendAgentRequest,
  bufferAction,
  onApplyChanges,
  filePayloads,
}: EditToolComponentProps) {
  const [currentConfig, setCurrentConfig] = useState<Tool | null>(null);
  const [hasActedOnDiffs, setHasActedOnDiffs] = useState(false);
  const [editablePayload, setEditablePayload] = useState<string>("");

  const { isRunning, runResult, manualRunLogs, executeToolConfig, handleStopExecution } =
    useToolExecution({
      tool,
      editablePayload,
      filePayloads,
    });

  const displayInstruction = tool.input?.instruction || tool.input?.fixInstructions;

  const parsedOutput = useMemo(() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
    } catch {
      return null;
    }
  }, [tool.output]);

  const isSuccess = parsedOutput?.success === true;
  const isAwaitingConfirmation = tool.status === "awaiting_confirmation";
  const isTestFailure =
    tool.status === "error" && parsedOutput?.success !== false && !!parsedOutput?.diffs?.length;
  const showDiffApproval = isAwaitingConfirmation || isTestFailure;
  const isToolRunning = tool.status === "running";
  const isToolPending = tool.status === "pending";

  const awaitingConfirmationDiffs = useMemo(() => {
    if (showDiffApproval && parsedOutput?.success === false && parsedOutput?.error) {
      return { enrichedDiffs: [], error: parsedOutput.error };
    }
    if (!showDiffApproval || !parsedOutput?.diffs || parsedOutput.diffs.length === 0) {
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
  }, [showDiffApproval, parsedOutput]);

  const completedDiffs = useMemo(() => {
    if (tool.status !== "completed" || !isSuccess) {
      return { enrichedDiffs: [], error: null };
    }
    const approvedDiffs = parsedOutput?.approvedDiffs || parsedOutput?.diffs || [];
    try {
      const enriched = enrichDiffsWithTargets(approvedDiffs, parsedOutput?.originalConfig);
      return { enrichedDiffs: enriched, error: null };
    } catch (error: any) {
      return { enrichedDiffs: [], error: error.message || "Failed to process diffs" };
    }
  }, [tool.status, isSuccess, parsedOutput]);

  useEffect(() => {
    if (parsedOutput?.config && (tool.status === "completed" || tool.status === "error")) {
      setCurrentConfig(parsedOutput.config);
    }
  }, [parsedOutput, tool.status]);

  useEffect(() => {
    if (tool.status === "completed" || tool.status === "awaiting_confirmation") {
      const initialPayload = tool.input?.payload || {};
      setEditablePayload(JSON.stringify(initialPayload, null, 2));
    }
  }, [tool.status, tool.input?.payload]);

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

      const event = result.approved ? "confirmed" : result.partial ? "partial" : "declined";
      onToolUpdate?.(tool.id, {
        status: result.approved || result.partial ? "completed" : "declined",
      });

      sendAgentRequest(undefined, {
        userActions: [
          {
            type: "tool_event",
            toolCallId: tool.id,
            toolName: "edit_tool",
            event,
            payload: {
              appliedChanges: result.approvedDiffs,
              rejectedChanges: result.rejectedDiffs,
            },
          },
        ],
      });
    },
    [sendAgentRequest, onApplyChanges, parsedOutput, tool.id, onToolUpdate],
  );

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
        onSuccess: (result) => {
          bufferAction?.({
            type: "tool_event",
            toolCallId: tool.id,
            toolName: "edit_tool",
            event: "test_changes_success",
            payload: {
              result:
                result.data !== undefined
                  ? JSON.stringify(result.data).substring(0, 500)
                  : undefined,
              appliedChanges: approvedDiffs.length,
            },
          });
        },
        onFailure: (result) => {
          if (!sendAgentRequest) return;
          onToolUpdate?.(tool.id, { status: "error" });
          sendAgentRequest(undefined, {
            userActions: [
              {
                type: "tool_event",
                toolCallId: tool.id,
                toolName: "edit_tool",
                event: "test_changes_failure",
                payload: {
                  error:
                    result.error && result.error.length > 500
                      ? `${result.error.slice(0, 500)}...`
                      : result.error,
                  appliedChanges: approvedDiffs.length,
                },
              },
            ],
          });
        },
      });
    },
    [
      parsedOutput,
      currentConfig,
      executeToolConfig,
      sendAgentRequest,
      bufferAction,
      onToolUpdate,
      tool.id,
    ],
  );

  const shouldBeOpen = !hasActedOnDiffs;

  return (
    <ToolCallWrapper
      tool={tool}
      openByDefault={shouldBeOpen}
      hideStatusIcon={false}
      manualRunLogs={manualRunLogs}
    >
      <div className="space-y-4">
        {isToolPending && <ToolCallPendingState icon={Pencil} label="Editing tool..." />}

        {isToolRunning && (
          <ToolCallPendingState icon={Pencil} label="Editing tool...">
            {displayInstruction && (
              <TruncatableInstruction
                text={displayInstruction}
                className="text-sm text-muted-foreground/70"
              />
            )}
          </ToolCallPendingState>
        )}

        {showDiffApproval && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium">Review Changes</span>
            </div>
            {displayInstruction && (
              <TruncatableInstruction
                text={displayInstruction}
                className="text-[13px] text-muted-foreground leading-relaxed"
                maxLines={1}
              />
            )}
            {awaitingConfirmationDiffs?.error ? (
              <ErrorMessage
                title="Couldn't process changes"
                message={awaitingConfirmationDiffs.error}
              />
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
                  variant="glass"
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

        {tool.status === "completed" && isSuccess && (
          <div className="space-y-3">
            {(() => {
              const rejectedCount = parsedOutput?.rejectedDiffs?.length || 0;

              if (completedDiffs?.error) {
                return (
                  <ErrorMessage title="Couldn't display changes" message={completedDiffs.error} />
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

        {((tool.status === "error" && parsedOutput?.success === false) ||
          (tool.status === "completed" && !isSuccess)) && (
          <div className="space-y-3">
            <ErrorMessage
              title="Fix encountered an issue"
              message={parsedOutput?.error || tool.error || "Unknown error"}
              truncateAt={300}
            />
            {parsedOutput?.inputSchema?.required && (
              <div className="p-3 bg-muted/50 rounded border border-border/50">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Required Inputs:
                </div>
                <div className="space-y-1">
                  {parsedOutput.inputSchema.required.map((field: string) => (
                    <div key={field} className="text-xs text-muted-foreground">
                      • <span className="font-mono">{field}</span>
                      {parsedOutput.inputSchema.properties?.[field]?.description && (
                        <span className="text-muted-foreground/70">
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
        )}
      </div>
    </ToolCallWrapper>
  );
}
