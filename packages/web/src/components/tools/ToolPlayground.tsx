"use client";
import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { useTools } from "@/src/app/tools-context";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { type UploadedFileInfo } from "@/src/lib/file-utils";
import { buildStepInput, isAbortError } from "@/src/lib/general-utils";
import {
  ExecutionStep,
  generateDefaultFromSchema,
  System,
  Tool,
  ToolResult,
} from "@superglue/shared";
import { useFileUpload } from "./hooks/use-file-upload";
import { usePayloadValidation } from "./hooks/use-payload-validation";
import { useToolExecution } from "./hooks/use-tool-execution";
import { useToolData } from "./hooks/use-tool-data";
import { ToolConfigProvider, useToolConfig, ExecutionProvider, useExecution } from "./context";
import { useToast } from "@/src/hooks/use-toast";
import { ArchiveRestore, Check, Loader2, Play, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { FixStepDialog } from "./dialogs/FixStepDialog";
import { FixTransformDialog } from "./dialogs/FixTransformDialog";
import { ModifyStepConfirmDialog } from "./dialogs/ModifyStepConfirmDialog";
import { FolderPicker } from "./folders/FolderPicker";
import { ToolActionsMenu } from "./ToolActionsMenu";
import { ToolStepGallery } from "./ToolStepGallery";
import { useRightSidebar } from "@/src/components/sidebar/RightSidebarContext";

export interface ToolPlaygroundProps {
  id?: string;
  embedded?: boolean;
  initialTool?: Tool;
  initialPayload?: string;
  initialInstruction?: string;
  systems?: System[];
  onSave?: (tool: Tool, payload: Record<string, any>) => Promise<void>;
  onExecute?: (tool: Tool, result: ToolResult) => void;
  onInstructionEdit?: () => void;
  headerActions?: React.ReactNode;
  hideHeader?: boolean;
  shouldStopExecution?: boolean;
  onStopExecution?: () => void;
  uploadedFiles?: UploadedFileInfo[];
  onFilesUpload?: (files: File[]) => Promise<void>;
  onFileRemove?: (key: string) => void;
  isProcessingFiles?: boolean;
  totalFileSize?: number;
  onFilesChange?: (files: UploadedFileInfo[], payloads: Record<string, any>) => void;
  renderAgentInline?: boolean;
  initialError?: string;
}

export interface ToolPlaygroundHandle {
  executeTool: () => Promise<void>;
  saveTool: () => Promise<boolean>;
  getCurrentTool: () => Tool;
}

interface ToolPlaygroundInnerProps extends ToolPlaygroundProps {
  innerRef: React.ForwardedRef<ToolPlaygroundHandle>;
}

function ToolPlaygroundInner({
  id,
  embedded = false,
  initialTool,
  initialInstruction,
  onSave,
  onExecute,
  onInstructionEdit,
  headerActions,
  hideHeader = false,
  shouldStopExecution: externalShouldStop,
  onStopExecution,
  uploadedFiles: parentUploadedFiles,
  onFilesUpload: parentOnFilesUpload,
  onFileRemove: parentOnFileRemove,
  isProcessingFiles: parentIsProcessingFiles,
  totalFileSize: parentTotalFileSize,
  onFilesChange: parentOnFilesChange,
  renderAgentInline = false,
  initialError,
  innerRef,
}: ToolPlaygroundInnerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const config = useConfig();
  const { refreshTools } = useTools();
  const toolConfig = useToolConfig();
  const execution = useExecution();

  const {
    tool,
    steps,
    payload,
    setToolId,
    setInstruction,
    setFinalTransform,
    setInputSchema,
    setResponseSchema,
    setPayloadText,
    setUploadedFiles: setContextUploadedFiles,
    setFilePayloads: setContextFilePayloads,
    markPayloadEdited,
    setSteps,
    setFolder,
    setIsArchived,
  } = toolConfig;

  const {
    currentExecutingStepIndex: contextCurrentExecutingStepIndex,
    currentRunId,
    clearAllExecutions,
    setFinalResult,
    setTransformStatus,
    stepResultsMap,
    isExecutingTransform,
    isFixingTransform,
  } = execution;

  const toolId = tool.id;
  const folder = tool.folder;
  const isArchived = tool.isArchived;
  const { setShowAgent, agentPortalRef, AgentSidebarComponent } = useRightSidebar();

  useEffect(() => {
    if (!isArchived && !renderAgentInline && AgentSidebarComponent) {
      setShowAgent(true);
    }
    return () => setShowAgent(false);
  }, [isArchived, setShowAgent, renderAgentInline, AgentSidebarComponent]);

  const finalTransform = toolConfig.finalTransform;
  const responseSchema = toolConfig.responseSchema;
  const inputSchema = toolConfig.inputSchema;
  const instructions = tool.instruction;
  const manualPayloadText = payload.manualPayloadText;
  const hasUserEditedPayload = payload.hasUserEdited;
  const computedPayload = payload.computedPayload;

  const localFileUpload = useFileUpload({
    onPayloadTextUpdate: (updater) => setPayloadText(updater(manualPayloadText)),
    onUserEdit: markPayloadEdited,
  });

  const uploadedFiles = parentUploadedFiles ?? payload.uploadedFiles;
  const totalFileSize = parentTotalFileSize ?? localFileUpload.totalFileSize;
  const isProcessingFiles = parentIsProcessingFiles ?? localFileUpload.isProcessing;

  const parsedResponseSchema = useMemo(() => {
    if (!responseSchema) return undefined;
    try {
      return JSON.parse(responseSchema);
    } catch {
      return undefined;
    }
  }, [responseSchema]);

  const { loading, saving, justSaved, loadTool, saveTool, setLoading } = useToolData({
    id,
    initialTool,
    initialInstruction,
    embedded,
    onSave,
  });

  const [navigateToFinalSignal, setNavigateToFinalSignal] = useState<number>(0);
  const [showStepOutputSignal, setShowStepOutputSignal] = useState<number>(0);
  const [focusStepId, setFocusStepId] = useState<string | null>(null);

  type DialogState =
    | { type: "none" }
    | { type: "fixStep"; stepIndex: number }
    | { type: "fixTransform" }
    | { type: "invalidPayload" }
    | { type: "modifyStepConfirm"; stepIndex: number };

  const [activeDialog, setActiveDialog] = useState<DialogState>({ type: "none" });
  const modifyStepResolveRef = useRef<((shouldContinue: boolean) => void) | null>(null);
  const isExecutingStep = contextCurrentExecutingStepIndex;
  const hasGeneratedDefaultPayloadRef = useRef<boolean>(false);

  const { isValid: isPayloadValid } = usePayloadValidation({
    computedPayload,
    inputSchema,
    hasUserEdited: hasUserEditedPayload,
  });

  const {
    executeTool: executeToolFromHook,
    executeStepByIdx,
    executeTransform,
    handleStopExecution,
    shouldAbortRef,
  } = useToolExecution(
    { onExecute, onStopExecution, embedded },
    { setFocusStepId, setShowStepOutputSignal, setNavigateToFinalSignal },
  );

  useEffect(() => {
    const trimmed = manualPayloadText.trim();
    const isEmptyPayload = trimmed === "" || trimmed === "{}";

    if (
      !hasUserEditedPayload &&
      isEmptyPayload &&
      inputSchema &&
      !hasGeneratedDefaultPayloadRef.current
    ) {
      try {
        const payloadSchema = extractPayloadSchema(inputSchema);
        if (payloadSchema) {
          const defaultJson = generateDefaultFromSchema(payloadSchema);
          const defaultString = JSON.stringify(defaultJson, null, 2);
          setPayloadText(defaultString);
          hasGeneratedDefaultPayloadRef.current = true;
        }
      } catch {
        // Ignore
      }
    }
  }, [inputSchema, manualPayloadText, hasUserEditedPayload, setPayloadText]);

  const extractPayloadSchema = (fullInputSchema: string | null): any | null => {
    if (!fullInputSchema || fullInputSchema.trim() === "") return null;
    try {
      const parsed = JSON.parse(fullInputSchema);
      if (parsed?.properties?.payload) return parsed.properties.payload;
      return parsed;
    } catch {
      return null;
    }
  };

  const handleFilesUpload = async (files: File[]) => {
    if (parentOnFilesUpload) return parentOnFilesUpload(files);
    return localFileUpload.uploadFiles(files);
  };

  const handleFileRemove = (key: string) => {
    if (parentOnFileRemove) return parentOnFileRemove(key);
    return localFileUpload.removeFile(key);
  };

  const pendingModifyStepIndex =
    activeDialog.type === "modifyStepConfirm" ? activeDialog.stepIndex : null;

  const handleRunAllSteps = () => {
    if (!isPayloadValid) {
      setActiveDialog({ type: "invalidPayload" });
    } else {
      executeTool();
    }
  };

  const handleBeforeStepExecution = async (stepIndex: number, step: any): Promise<boolean> => {
    if (shouldAbortRef.current || externalShouldStop) return false;

    if (step.modify === true) {
      return new Promise((resolve) => {
        modifyStepResolveRef.current = resolve;
        setActiveDialog({ type: "modifyStepConfirm", stepIndex });
      });
    }
    return true;
  };

  const handleModifyStepConfirm = () => {
    setActiveDialog({ type: "none" });
    modifyStepResolveRef.current?.(true);
    modifyStepResolveRef.current = null;
  };

  const handleModifyStepCancel = () => {
    const stepIdx = pendingModifyStepIndex;
    setActiveDialog({ type: "none" });
    modifyStepResolveRef.current?.(false);
    modifyStepResolveRef.current = null;
    if (stepIdx !== null) {
      const stepId = steps[stepIdx]?.id;
      if (stepId) {
        setFocusStepId(stepId);
        setShowStepOutputSignal(Date.now());
      }
    }
  };

  const executeTool = async () => {
    await executeToolFromHook(setLoading, handleBeforeStepExecution);
  };

  const currentTool = useMemo(
    () =>
      ({
        id: toolId,
        steps,
        instruction: instructions,
        finalTransform,
        responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        folder,
        createdAt: initialTool?.createdAt,
        updatedAt: initialTool?.updatedAt,
      }) as Tool,
    [toolId, steps, instructions, finalTransform, responseSchema, inputSchema, folder, initialTool],
  );

  const getCurrentTool = useCallback(
    (): Tool =>
      ({
        id: toolId,
        steps: steps.map((step: ExecutionStep) => ({
          ...step,
          apiConfig: {
            id: step.apiConfig.id || step.id,
            ...step.apiConfig,
            pagination: step.apiConfig.pagination || null,
          },
        })),
        responseSchema: responseSchema && responseSchema.trim() ? JSON.parse(responseSchema) : null,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        finalTransform,
        instruction: instructions,
        folder,
        createdAt: initialTool?.createdAt,
        updatedAt: initialTool?.updatedAt,
      }) as Tool,
    [toolId, steps, responseSchema, inputSchema, finalTransform, instructions, folder, initialTool],
  );

  useImperativeHandle(
    innerRef,
    () => ({
      executeTool,
      saveTool,
      getCurrentTool,
    }),
    [executeTool, saveTool, getCurrentTool],
  );

  const handleStepEdit = (stepId: string, updatedStep: any, _isUserInitiated?: boolean) => {
    setSteps((prevSteps) =>
      prevSteps.map((step) =>
        step.id === stepId
          ? {
              ...updatedStep,
              apiConfig: {
                ...updatedStep.apiConfig,
                id: updatedStep.apiConfig.id || updatedStep.id,
              },
            }
          : step,
      ),
    );
  };

  const handleExecuteStep = async (idx: number): Promise<void> => {
    await executeStepByIdx(idx);
  };
  const handleExecuteStepWithLimit = async (idx: number, limit: number): Promise<void> => {
    await executeStepByIdx(idx, { limitIterations: limit });
  };

  const fixStepIndex = activeDialog.type === "fixStep" ? activeDialog.stepIndex : null;

  const handleOpenFixStepDialog = (idx: number) =>
    setActiveDialog({ type: "fixStep", stepIndex: idx });
  const handleCloseFixStepDialog = () => setActiveDialog({ type: "none" });

  const handleFixStepSuccess = (updatedStep: any) => {
    if (fixStepIndex === null) return;
    handleStepEdit(steps[fixStepIndex].id, updatedStep, true);
  };

  const handleFixStep = async (updatedInstruction: string): Promise<void> => {
    if (fixStepIndex === null) return;
    await executeStepByIdx(fixStepIndex, { selfHealing: true, updatedInstruction });
  };

  const handleExecuteTransform = async (schemaStr: string, transformStr: string): Promise<void> => {
    await executeTransform(schemaStr, transformStr);
  };

  const handleOpenFixTransformDialog = () => setActiveDialog({ type: "fixTransform" });
  const handleCloseFixTransformDialog = () => setActiveDialog({ type: "none" });

  const handleFixTransformSuccess = (newTransform: string, transformedData: any) => {
    setFinalTransform(newTransform);
    setFinalResult(transformedData, "completed");
    setNavigateToFinalSignal(Date.now());
  };

  const handleUnarchive = async () => {
    try {
      const client = createSuperglueClient(config.superglueEndpoint);
      await client.archiveWorkflow(toolId, false);
      setIsArchived(false);
      refreshTools();
    } catch (error: any) {
      console.error("Error unarchiving tool:", error);
      toast({
        title: "Error unarchiving tool",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const toolActionButtons = !embedded ? (
    <div className="flex items-center gap-1">
      <FolderPicker value={folder} onChange={(f) => setFolder(f ?? undefined)} />
      <ToolActionsMenu
        tool={currentTool}
        disabled={!toolId.trim()}
        showLabel
        onRenamed={(newId) => {
          setToolId(newId);
          refreshTools();
          router.push(`/tools/${encodeURIComponent(newId)}`);
        }}
        onArchived={() => router.push("/tools")}
        onUnarchived={() => setIsArchived(false)}
        onRestored={() => toolId && loadTool(toolId)}
      />
    </div>
  ) : null;

  const defaultHeaderActions = (
    <div className="flex items-center gap-2">
      {isArchived ? (
        <Button variant="outline" onClick={handleUnarchive} className="h-9 px-4">
          <ArchiveRestore className="h-4 w-4" />
          Unarchive
        </Button>
      ) : (
        <>
          {loading ? (
            <Button
              variant="outline"
              onClick={handleStopExecution}
              disabled={saving}
              className="h-9 px-4"
            >
              <Square className="h-4 w-4" />
              Stop Execution
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleRunAllSteps}
              disabled={
                loading || saving || isExecutingStep != null || isExecutingTransform || isArchived
              }
              className="h-9 px-4"
            >
              <Play className="h-4 w-4" />
              Run All Steps
            </Button>
          )}
          {!isArchived && (
            <Button
              variant="default"
              onClick={saveTool}
              disabled={saving || loading}
              className="h-9 px-5 w-[108px] shadow-md border border-primary/40"
            >
              {saving ? (
                "Saving..."
              ) : justSaved ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Saved
                </>
              ) : (
                "Save"
              )}
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div
      className={
        embedded
          ? renderAgentInline
            ? "w-full h-full flex"
            : "w-full h-full"
          : "pt-2 px-6 pb-6 max-w-none w-full h-screen flex flex-col"
      }
    >
      {/* Main playground content */}
      <div className={renderAgentInline ? "flex-1 flex flex-col overflow-hidden" : "contents"}>
        {!embedded && !hideHeader && (
          <div className="flex justify-end items-center mb-1 flex-shrink-0 mr-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => router.push("/tools")}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="w-full flex-1 overflow-hidden flex">
          {/* Main content area */}
          <div className="flex-1 h-full overflow-hidden">
            <div className="w-full h-full">
              <div className="h-full">
                <div className={embedded ? "h-full" : "h-full"}>
                  {loading && steps.length === 0 && !instructions ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
                      </div>
                    </div>
                  ) : (
                    <ToolStepGallery
                      onStepEdit={handleStepEdit}
                      onInstructionEdit={embedded ? onInstructionEdit : undefined}
                      onExecuteStep={handleExecuteStep}
                      onExecuteStepWithLimit={handleExecuteStepWithLimit}
                      onOpenFixStepDialog={handleOpenFixStepDialog}
                      onExecuteTransform={handleExecuteTransform}
                      onOpenFixTransformDialog={handleOpenFixTransformDialog}
                      onAbort={currentRunId ? handleStopExecution : undefined}
                      onFilesUpload={handleFilesUpload}
                      onFileRemove={handleFileRemove}
                      toolActionButtons={toolActionButtons}
                      headerActions={
                        headerActions !== undefined ? headerActions : defaultHeaderActions
                      }
                      navigateToFinalSignal={navigateToFinalSignal}
                      showStepOutputSignal={showStepOutputSignal}
                      focusStepId={focusStepId}
                      isProcessingFiles={isProcessingFiles}
                      totalFileSize={totalFileSize}
                      isPayloadValid={isPayloadValid}
                      embedded={embedded}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <AlertDialog
          open={activeDialog.type === "invalidPayload"}
          onOpenChange={(open) => !open && setActiveDialog({ type: "none" })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tool Input Does Not Match Input Schema</AlertDialogTitle>
              <AlertDialogDescription>
                Your tool input does not match the input schema. This may cause execution to fail.
                You can edit the input and schema in the Start (Tool Input) Card.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setActiveDialog({ type: "none" });
                  executeTool();
                }}
              >
                Run Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {fixStepIndex !== null && (
          <FixStepDialog
            open={activeDialog.type === "fixStep"}
            onClose={handleCloseFixStepDialog}
            step={steps[fixStepIndex]}
            stepInput={buildStepInput(
              computedPayload || {},
              steps,
              stepResultsMap,
              fixStepIndex - 1,
            )}
            systemId={steps[fixStepIndex]?.systemId}
            errorMessage={(() => {
              const result = stepResultsMap[steps[fixStepIndex]?.id];
              const msg = typeof result === "string" ? result : result?.error;
              return msg && !isAbortError(msg) ? msg : undefined;
            })()}
            onSuccess={handleFixStepSuccess}
            onAutoHeal={handleFixStep}
            onAbort={handleStopExecution}
          />
        )}

        {pendingModifyStepIndex !== null && (
          <ModifyStepConfirmDialog
            open={activeDialog.type === "modifyStepConfirm"}
            stepId={steps[pendingModifyStepIndex]?.id}
            stepName={steps[pendingModifyStepIndex]?.id}
            onConfirm={handleModifyStepConfirm}
            onCancel={handleModifyStepCancel}
          />
        )}

        <FixTransformDialog
          open={activeDialog.type === "fixTransform"}
          onClose={handleCloseFixTransformDialog}
          currentTransform={finalTransform}
          responseSchema={parsedResponseSchema}
          stepData={buildStepInput(computedPayload || {}, steps, stepResultsMap, steps.length - 1)}
          errorMessage={
            typeof stepResultsMap["__final_transform__"] === "string"
              ? stepResultsMap["__final_transform__"]
              : undefined
          }
          onSuccess={handleFixTransformSuccess}
          onLoadingChange={(loading) => {
            if (loading) {
              setTransformStatus("fixing");
            } else if (isFixingTransform) {
              setTransformStatus("idle");
            }
          }}
        />

        {/* Portal agent into sidebar (when not inline) - hideHeader since RightSidebar has tabs */}
        {!isArchived &&
          !renderAgentInline &&
          agentPortalRef &&
          AgentSidebarComponent &&
          createPortal(
            <AgentSidebarComponent className="h-full" hideHeader initialError={initialError} />,
            agentPortalRef,
          )}
      </div>

      {/* Inline agent sidebar */}
      {!isArchived && renderAgentInline && AgentSidebarComponent && (
        <div className="w-[420px] border-l border-border flex-shrink-0 h-full overflow-hidden">
          <AgentSidebarComponent className="h-full" initialError={initialError} />
        </div>
      )}
    </div>
  );
}

const ToolPlayground = forwardRef<ToolPlaygroundHandle, ToolPlaygroundProps>((props, ref) => {
  const { systems: contextSystems } = useSystems();
  const systems = props.systems || contextSystems;

  return (
    <ToolConfigProvider
      initialTool={props.initialTool}
      initialPayload={props.initialPayload}
      initialInstruction={props.initialInstruction}
      systems={systems}
      externalUploadedFiles={props.uploadedFiles}
      onExternalFilesChange={props.onFilesChange}
    >
      <ExecutionProvider>
        <ToolPlaygroundInner {...props} innerRef={ref} />
      </ExecutionProvider>
    </ToolConfigProvider>
  );
});

ToolPlayground.displayName = "ToolPlayground";
export default ToolPlayground;
