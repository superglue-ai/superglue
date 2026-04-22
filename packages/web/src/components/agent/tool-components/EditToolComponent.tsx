"use client";

import { useUpsertTool } from "@/src/queries/tools";
import { Button } from "@/src/components/ui/button";
import { ErrorMessage } from "@/src/components/ui/error-message";
import { FileChip } from "@/src/components/ui/file-chip";
import { enrichDiffsWithTargets, applyDiffsToConfig } from "@/src/lib/config-diff-utils";
import { findDraftInMessages } from "@/src/lib/agent/agent-context";
import { useSuperglueClient } from "@/src/queries/use-client";
import {
  createToolInteractionEntry,
  ToolMutation,
} from "@/src/lib/agent/agent-tools/tool-call-state";
import type { EditToolSaveResult } from "@/src/lib/agent/agent-types";
import { deleteAllDrafts } from "@/src/lib/storage";
import { getToolInputSchemaSections, Tool, ToolCall, ToolDiff } from "@superglue/shared";
import { CheckCircle, Pencil, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffApprovalComponent } from "./DiffApprovalComponent";
import { DiffDisplay } from "./DiffDisplayComponent";
import { ToolCallPendingState } from "./ToolCallPendingState";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { TruncatableInstruction } from "./TruncatableInstruction";
import { useToolExecution } from "./hooks/use-tool-execution";
import { useToolConfigOptional } from "@/src/components/tools/context/tool-config-context";
import { useAgentContext } from "../AgentContextProvider";

interface EditToolComponentProps {
  tool: ToolCall;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  onToolMutation?: (toolCallId: string, mutation: ToolMutation) => void;
  onAbortStream?: () => void;
  onApplyChanges?: (config: Tool, diffs?: ToolDiff[]) => void;
  isPlayground?: boolean;
  filePayloads?: Record<string, any>;
}

export function EditToolComponent({
  tool,
  onToolUpdate,
  onToolMutation,
  onApplyChanges,
  isPlayground,
  filePayloads,
}: EditToolComponentProps) {
  const toolConfigCtx = useToolConfigOptional();
  const { messages, sendAgentRequest } = useAgentContext();
  const createClient = useSuperglueClient();
  const upsertTool = useUpsertTool();

  const playgroundDraftConfig = useMemo<Tool | undefined>(() => {
    if (!toolConfigCtx) return undefined;
    return {
      id: toolConfigCtx.tool.id,
      instruction: toolConfigCtx.tool.instruction || "",
      steps: toolConfigCtx.steps,
      outputTransform: toolConfigCtx.outputTransform,
      inputSchema: toolConfigCtx.inputSchema ?? undefined,
      outputSchema: toolConfigCtx.outputSchema ?? undefined,
      folder: toolConfigCtx.tool.folder,
      archived: toolConfigCtx.tool.isArchived,
      responseFilters:
        toolConfigCtx.tool.responseFilters.length > 0
          ? toolConfigCtx.tool.responseFilters
          : undefined,
    } as Tool;
  }, [
    toolConfigCtx?.tool.id,
    toolConfigCtx?.tool.instruction,
    toolConfigCtx?.tool.folder,
    toolConfigCtx?.tool.isArchived,
    toolConfigCtx?.tool.responseFilters,
    toolConfigCtx?.steps,
    toolConfigCtx?.outputTransform,
    toolConfigCtx?.inputSchema,
    toolConfigCtx?.outputSchema,
  ]);

  const [currentConfig, setCurrentConfig] = useState<Tool | null>(null);
  const [hasActedOnDiffs, setHasActedOnDiffs] = useState(false);
  const [editablePayload, setEditablePayload] = useState<string>("");
  const [approvalAction, setApprovalAction] = useState<"accept" | "accept_and_save" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedToolId, setSavedToolId] = useState<string | null>(null);

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

  const parsedOutputRef = useRef(parsedOutput);
  parsedOutputRef.current = parsedOutput;

  const targetDraftId = parsedOutput?.draftId || tool.input?.draftId;
  const targetToolId = parsedOutput?.toolId || tool.input?.toolId;
  const targetsCurrentPlaygroundTool = Boolean(
    playgroundDraftConfig &&
    (targetDraftId === "playground-draft" || targetToolId === playgroundDraftConfig.id),
  );

  const resolveOriginalConfigSync = useCallback((): Tool | undefined => {
    if (targetsCurrentPlaygroundTool && playgroundDraftConfig) {
      return playgroundDraftConfig;
    }

    if (targetDraftId && targetDraftId !== "playground-draft") {
      const draft = findDraftInMessages(messages, targetDraftId);
      if (draft?.config) return draft.config as Tool;
    }

    if (parsedOutput?.originalConfig) {
      return parsedOutput.originalConfig as Tool;
    }

    return undefined;
  }, [messages, playgroundDraftConfig, targetDraftId, targetsCurrentPlaygroundTool, parsedOutput]);

  const resolveOriginalConfigAsync = useCallback(async (): Promise<Tool | undefined> => {
    const sync = resolveOriginalConfigSync();
    if (sync) return sync;

    if (targetToolId) {
      try {
        const client = createClient();
        const fetched = await client.getWorkflow(targetToolId);
        if (fetched) return fetched;
      } catch {}
    }

    return undefined;
  }, [resolveOriginalConfigSync, createClient, targetToolId]);

  const isSuccess = parsedOutput?.success === true;
  const isSavingAcceptedChanges = approvalAction === "accept_and_save";
  const isAwaitingConfirmation = tool.status === "awaiting_confirmation";
  const showDiffApproval = isAwaitingConfirmation && !isSavingAcceptedChanges;
  const isToolRunning = tool.status === "running" || isSavingAcceptedChanges;
  const isToolPending = tool.status === "pending";
  const defaultSaveOnAccept = parsedOutput?.defaultSaveOnAccept ?? isPlayground;
  const allowDraftOnlyAccept =
    parsedOutput?.allowDraftOnlyAccept ?? (isPlayground && targetsCurrentPlaygroundTool);
  const requiredInputs = useMemo(() => {
    const sections = getToolInputSchemaSections(parsedOutput?.inputSchema);
    return {
      payload: Array.isArray(sections.payloadSchema?.required)
        ? sections.payloadSchema.required
        : [],
      files: Array.isArray(sections.filesSchema?.required) ? sections.filesSchema.required : [],
      payloadProperties: sections.payloadSchema?.properties || {},
      fileProperties: sections.filesSchema?.properties || {},
    };
  }, [parsedOutput?.inputSchema]);
  const inputFileChips = useMemo(() => {
    const files = tool.input?.files;
    if (!files || typeof files !== "object") {
      return [];
    }
    return Object.entries(files).map(([alias, value]) => ({
      name:
        typeof value === "object" &&
        value !== null &&
        "filename" in value &&
        typeof (value as { filename: string }).filename === "string"
          ? (value as { filename: string }).filename
          : typeof value === "string"
            ? value
            : alias,
      key: alias,
      status: "ready" as const,
    }));
  }, [tool.input?.files]);

  const awaitingConfirmationDiffs = useMemo(() => {
    if (showDiffApproval && parsedOutput?.success === false && parsedOutput?.error) {
      return { enrichedDiffs: [], error: parsedOutput.error };
    }
    if (!showDiffApproval || !parsedOutput?.diffs || parsedOutput.diffs.length === 0) {
      return { enrichedDiffs: [], error: null };
    }
    try {
      const origConfig = resolveOriginalConfigSync();
      const enriched = enrichDiffsWithTargets(parsedOutput.diffs, origConfig);
      return { enrichedDiffs: enriched, error: null };
    } catch (error: any) {
      return {
        enrichedDiffs: [],
        error: error.message || "Failed to enrich diffs with target information",
      };
    }
  }, [showDiffApproval, parsedOutput, resolveOriginalConfigSync]);

  const completedDiffs = useMemo(() => {
    if (tool.status !== "completed" || !isSuccess) {
      return { enrichedDiffs: [], error: null };
    }
    const approvedDiffs = parsedOutput?.approvedDiffs || parsedOutput?.diffs || [];
    try {
      const origConfig = resolveOriginalConfigSync();
      const enriched = enrichDiffsWithTargets(approvedDiffs, origConfig);
      return { enrichedDiffs: enriched, error: null };
    } catch (error: any) {
      return { enrichedDiffs: [], error: error.message || "Failed to process diffs" };
    }
  }, [tool.status, isSuccess, parsedOutput, resolveOriginalConfigSync]);

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

  const syncSavedToolState = useCallback(
    async (savedTool: Tool, options?: { syncToPlayground?: boolean }) => {
      setCurrentConfig(savedTool);
      setSavedToolId(savedTool.id);

      const draftCleanupResult = await Promise.allSettled([deleteAllDrafts(savedTool.id)]);

      if (draftCleanupResult[0].status === "rejected") {
        console.warn("Failed to delete drafts after accept & save:", draftCleanupResult[0].reason);
      }

      if (!options?.syncToPlayground || !toolConfigCtx) {
        return;
      }

      if (savedTool.id !== toolConfigCtx.tool.id) {
        toolConfigCtx.setToolId(savedTool.id);
      }

      queueMicrotask(() => {
        toolConfigCtx.markCurrentStateAsBaseline();
        toolConfigCtx.setUnsavedChangesSuppressed(false);
      });
    },
    [toolConfigCtx],
  );

  const persistToolConfig = useCallback(
    async (toolToSave: Tool, options?: { syncToPlayground?: boolean }) => {
      const savedTool = await upsertTool.mutateAsync({
        id: toolToSave.id,
        input: toolToSave,
      });
      if (!savedTool) {
        throw new Error("Failed to save tool");
      }

      await syncSavedToolState(savedTool, options);
      return savedTool;
    },
    [upsertTool, syncSavedToolState],
  );

  const handleDiffApprovalComplete = useCallback(
    async (result: {
      approved: boolean;
      partial: boolean;
      approvedDiffs: ToolDiff[];
      rejectedDiffs: ToolDiff[];
      saveAfterAccept?: boolean;
    }) => {
      if (!sendAgentRequest || approvalAction) return;

      const saveAfterAccept =
        (result.approved || result.partial) &&
        result.approvedDiffs.length > 0 &&
        (result.saveAfterAccept === true || !allowDraftOnlyAccept);
      const syncToPlayground = targetsCurrentPlaygroundTool;

      if (saveAfterAccept && syncToPlayground && toolConfigCtx) {
        toolConfigCtx.setUnsavedChangesSuppressed(true);
      }

      setHasActedOnDiffs(true);
      setSaveError(null);
      setSavedToolId(null);
      setApprovalAction(saveAfterAccept ? "accept_and_save" : "accept");

      let effectiveSaveResult: EditToolSaveResult = undefined;

      try {
        let nextConfig: Tool | null = null;

        if ((result.approved || result.partial) && result.approvedDiffs.length > 0) {
          const originalConfig = await resolveOriginalConfigAsync();
          if (originalConfig) {
            nextConfig = applyDiffsToConfig(originalConfig, result.approvedDiffs);
            setCurrentConfig(nextConfig);
            if (syncToPlayground) {
              onApplyChanges?.(nextConfig, result.approvedDiffs);
            }
          }
        }

        if (saveAfterAccept && (result.approved || result.partial)) {
          if (!nextConfig) {
            effectiveSaveResult = {
              success: false,
              error: "Could not resolve the edited tool configuration to save.",
            };
            setSaveError(effectiveSaveResult.error);
            if (syncToPlayground) {
              toolConfigCtx?.setUnsavedChangesSuppressed(false);
            }
          } else {
            try {
              const savedTool = await persistToolConfig(nextConfig, { syncToPlayground });
              effectiveSaveResult = {
                success: true,
                toolId: savedTool.id,
              };
            } catch (error: any) {
              effectiveSaveResult = {
                success: false,
                error: error?.message || "Failed to save tool",
              };
              setSaveError(effectiveSaveResult.error);
              if (syncToPlayground) {
                toolConfigCtx?.setUnsavedChangesSuppressed(false);
              }
            }
          }
        }

        const persistence =
          result.approved || result.partial
            ? saveAfterAccept && effectiveSaveResult?.success === true
              ? "saved"
              : "draft_only"
            : undefined;
        const event = result.approved
          ? "user_confirmed_proposed_changes"
          : result.partial
            ? "user_partially_approved_proposed_changes"
            : "user_declined_proposed_changes";
        const confirmationState = result.approved
          ? "confirmed"
          : result.partial
            ? "partial"
            : "declined";
        onToolUpdate?.(tool.id, {
          status: result.approved || result.partial ? "completed" : "declined",
        });
        onToolMutation?.(tool.id, {
          interactionEntry: createToolInteractionEntry(event, {
            approvedCount: result.approvedDiffs.length,
            rejectedCount: result.rejectedDiffs.length,
            ...(persistence ? { persistence } : {}),
            ...(effectiveSaveResult?.success === false
              ? { saveError: effectiveSaveResult.error }
              : {}),
          }),
          confirmationState,
          confirmationData: {
            appliedChanges: result.approvedDiffs,
            rejectedChanges: result.rejectedDiffs,
            ...(effectiveSaveResult ? { saveResult: effectiveSaveResult } : {}),
          },
        });

        setApprovalAction(null);
        await sendAgentRequest(undefined, {
          resumeToolCallId: tool.id,
        });
      } finally {
        if (syncToPlayground && (!saveAfterAccept || !effectiveSaveResult?.success)) {
          toolConfigCtx?.setUnsavedChangesSuppressed(false);
        }
        setApprovalAction(null);
      }
    },
    [
      approvalAction,
      allowDraftOnlyAccept,
      persistToolConfig,
      sendAgentRequest,
      onApplyChanges,
      resolveOriginalConfigAsync,
      targetsCurrentPlaygroundTool,
      tool.id,
      onToolMutation,
      onToolUpdate,
      toolConfigCtx,
    ],
  );

  const handleRunWithApprovedDiffs = useCallback(
    async (approvedDiffs: ToolDiff[], overridePayload?: Record<string, any>) => {
      if (approvedDiffs.length === 0) return;

      const originalConfig = await resolveOriginalConfigAsync();
      if (!originalConfig) return;

      const testConfig = applyDiffsToConfig(originalConfig, approvedDiffs);
      const toolId = currentConfig?.id || originalConfig?.id;

      executeToolConfig({
        toolConfig: testConfig,
        overridePayload,
        onSuccess: (result) => {
          onToolMutation?.(tool.id, {
            interactionEntry: createToolInteractionEntry(
              "user_tested_proposed_changes_successfully",
              {
                appliedChangesCount: approvedDiffs.length,
                ...(result.data !== undefined
                  ? { resultPreview: JSON.stringify(result.data).substring(0, 500) }
                  : {}),
              },
            ),
          });
        },
        onFailure: (result) => {
          onToolMutation?.(tool.id, {
            interactionEntry: createToolInteractionEntry(
              "user_tested_proposed_changes_with_failure",
              {
                appliedChangesCount: approvedDiffs.length,
                ...(result.error
                  ? {
                      error:
                        result.error.length > 500
                          ? `${result.error.slice(0, 500)}...`
                          : result.error,
                    }
                  : {}),
              },
            ),
          });
          if (!sendAgentRequest) return;
          sendAgentRequest(undefined, { resumeToolCallId: tool.id });
        },
      });
    },
    [
      resolveOriginalConfigAsync,
      currentConfig,
      executeToolConfig,
      sendAgentRequest,
      onToolMutation,
      tool.id,
    ],
  );

  const shouldBeOpen = !hasActedOnDiffs || isSavingAcceptedChanges;
  const statusOverride = isSavingAcceptedChanges ? "running" : null;

  return (
    <ToolCallWrapper
      tool={tool}
      openByDefault={shouldBeOpen}
      hideStatusIcon={false}
      statusOverride={statusOverride}
      manualRunLogs={manualRunLogs}
    >
      <div className="space-y-4">
        {isToolPending && <ToolCallPendingState icon={Pencil} label="Editing tool..." />}

        {isToolRunning && (
          <ToolCallPendingState
            icon={Pencil}
            label={isSavingAcceptedChanges ? "Saving tool..." : "Editing tool..."}
          >
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
            {inputFileChips.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">File Inputs</div>
                {inputFileChips.map((file) => (
                  <FileChip
                    key={file.key}
                    file={file}
                    size="default"
                    rounded="md"
                    showOriginalName={true}
                    showKey={true}
                  />
                ))}
              </div>
            )}
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
            {!parsedOutput ? (
              <ErrorMessage
                title="Failed to load edit results"
                message="The tool output could not be parsed. This may happen when the output is too large."
              />
            ) : awaitingConfirmationDiffs?.error ? (
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
                  isSubmitting={approvalAction !== null}
                  submitMode={approvalAction}
                  defaultSaveOnAccept={defaultSaveOnAccept}
                  allowDraftOnlyAccept={allowDraftOnlyAccept}
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
            {(saveError || parsedOutput?.saveError) && (
              <ErrorMessage
                title="Changes applied, but save failed"
                message={saveError || parsedOutput?.saveError}
                truncateAt={300}
              />
            )}
            {(() => {
              const rejectedCount = parsedOutput?.rejectedDiffs?.length || 0;
              const effectiveSavedToolId =
                parsedOutput?.persistence === "saved" ? parsedOutput?.toolId || savedToolId : null;

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
                  {effectiveSavedToolId && (
                    <div className="text-xs text-muted-foreground">
                      Saved as <span className="font-mono">{effectiveSavedToolId}</span>.
                    </div>
                  )}
                  {!effectiveSavedToolId && parsedOutput?.persistence === "draft_only" && (
                    <div className="text-xs text-muted-foreground">
                      Changes kept in the draft only. Tool is not saved yet.
                    </div>
                  )}
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
            {(requiredInputs.payload.length > 0 || requiredInputs.files.length > 0) && (
              <div className="p-3 bg-muted/50 rounded border border-border/50">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Required Inputs:
                </div>
                <div className="space-y-1">
                  {requiredInputs.payload.map((field: string) => (
                    <div key={field} className="text-xs text-muted-foreground">
                      • <span className="font-mono">payload.{field}</span>
                      {requiredInputs.payloadProperties?.[field]?.description && (
                        <span className="text-muted-foreground/70">
                          {" — "}
                          {requiredInputs.payloadProperties[field].description}
                        </span>
                      )}
                    </div>
                  ))}
                  {requiredInputs.files.map((field: string) => (
                    <div key={field} className="text-xs text-muted-foreground">
                      • <span className="font-mono">files.{field}</span>
                      {requiredInputs.fileProperties?.[field]?.description && (
                        <span className="text-muted-foreground/70">
                          {" — "}
                          {requiredInputs.fileProperties[field].description}
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
