"use client";
import { useIntegrations } from "@/src/app/integrations-context";
import { useTools } from "@/src/app/tools-context";
import { type UploadedFileInfo } from '@/src/lib/file-utils';
import { buildEvolvingPayload, isAbortError } from "@/src/lib/general-utils";
import { ExecutionStep, generateDefaultFromSchema, Integration, Tool, ToolResult } from "@superglue/shared";
import { useFileUpload } from "./hooks/use-file-upload";
import { usePayloadValidation } from "./hooks/use-payload-validation";
import { useToolExecution } from "./hooks/use-tool-execution";
import { useToolData } from "./hooks/use-tool-data";
import { ToolConfigProvider, useToolConfig, ExecutionProvider, useExecution } from "./context";
import { ArchiveRestore, Check, Hammer, Loader2, Play, Square, X } from "lucide-react";
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { DeployButton } from "./deploy/DeployButton";
import { FixStepDialog } from "./dialogs/FixStepDialog";
import { FixTransformDialog } from "./dialogs/FixTransformDialog";
import { ModifyStepConfirmDialog } from "./dialogs/ModifyStepConfirmDialog";
import { FolderPicker } from "./folders/FolderPicker";
import { ToolActionsMenu } from "./ToolActionsMenu";
import { ToolBuilder, type BuildContext } from "./ToolBuilder";
import { ToolStepGallery } from "./ToolStepGallery";
import { isAbortError } from "@/src/lib/general-utils";

export interface ToolPlaygroundProps {
  id?: string;
  embedded?: boolean;
  initialTool?: Tool;
  initialPayload?: string;
  initialInstruction?: string;
  integrations?: Integration[];
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
  hideRebuildButton?: boolean;
  onRebuildStart?: () => void;
  onRebuildEnd?: () => void;
}

export interface ToolPlaygroundHandle {
  executeTool: () => Promise<void>;
  saveTool: () => Promise<boolean>;
  getCurrentTool: () => Tool;
  closeRebuild: () => void;
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
  hideRebuildButton = false,
  onRebuildStart,
  onRebuildEnd,
  innerRef,
}: ToolPlaygroundInnerProps) {
  const router = useRouter();
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
<<<<<<< HEAD
    getStepResultsMap,
    incrementSourceDataVersion,
    isExecutingTransform,
  } = execution;
  
  const toolId = tool.id;
  const folder = tool.folder;
  const isArchived = tool.isArchived;
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
  
  const {
    loading,
    saving,
    justSaved,
    saveTool,
    setLoading,
  } = useToolData({
    id,
    initialTool,
    initialInstruction,
    embedded,
    onSave,
  });
  
  const [navigateToFinalSignal, setNavigateToFinalSignal] = useState<number>(0);
  const [showStepOutputSignal, setShowStepOutputSignal] = useState<number>(0);
  const [focusStepId, setFocusStepId] = useState<string | null>(null);

  useEffect(() => {
    incrementSourceDataVersion();
  }, [stepExecutions, computedPayload, incrementSourceDataVersion]);

  const stepResultsMap = getStepResultsMap();

  type DialogState = 
    | { type: 'none' }
    | { type: 'fixStep'; stepIndex: number }
    | { type: 'fixTransform' }
    | { type: 'invalidPayload' }
    | { type: 'modifyStepConfirm'; stepIndex: number };

  const [activeDialog, setActiveDialog] = useState<DialogState>({ type: 'none' });
  const modifyStepResolveRef = useRef<((shouldContinue: boolean) => void) | null>(null);
  const isExecutingStep = contextCurrentExecutingStepIndex;
  const hasGeneratedDefaultPayloadRef = useRef<boolean>(false);
  
  const { isValid: isPayloadValid } = usePayloadValidation({
    computedPayload,
    inputSchema,
    hasUserEdited: hasUserEditedPayload,
  });
  const [showToolBuilder, setShowToolBuilder] = useState(false);
  
  const {
    executeTool: executeToolFromHook,
    executeStepByIdx,
    executeTransform,
    handleStopExecution,
    shouldAbortRef,
  } = useToolExecution(
    { onExecute, onStopExecution, embedded },
    { setFocusStepId, setShowStepOutputSignal, setNavigateToFinalSignal }
  );

  useEffect(() => {
    const trimmed = manualPayloadText.trim();
    const isEmptyPayload = trimmed === '' || trimmed === '{}';
    
    if (!hasUserEditedPayload && isEmptyPayload && inputSchema && !hasGeneratedDefaultPayloadRef.current) {
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

  const extractIntegrationIds = (steps: ExecutionStep[]): string[] => {
    return Array.from(new Set(
      steps.map(s => s.integrationId).filter(Boolean) as string[]
    ));
  };

  const handleToolRebuilt = (rebuiltTool: Tool, context: BuildContext) => {
    setToolId(rebuiltTool.id);
    setFolder(rebuiltTool.folder);
    setSteps(rebuiltTool.steps?.map(step => ({
      ...step,
      apiConfig: { ...step.apiConfig, id: step.apiConfig.id || step.id }
    })) || []);
    setFinalTransform(rebuiltTool.finalTransform || finalTransform);
    setResponseSchema(rebuiltTool.responseSchema ? JSON.stringify(rebuiltTool.responseSchema, null, 2) : '');
    setInputSchema(rebuiltTool.inputSchema ? JSON.stringify(rebuiltTool.inputSchema, null, 2) : null);
    setInstruction(context.instruction);
    setPayloadText(context.payload);
    
    setContextUploadedFiles(context.uploadedFiles);
    setContextFilePayloads(context.filePayloads);
    
    if (parentOnFilesChange) {
      parentOnFilesChange(context.uploadedFiles, context.filePayloads);
    }
    
    clearAllExecutions();
    
    setShowToolBuilder(false);
    onRebuildEnd?.();
  };

  const extractPayloadSchema = (fullInputSchema: string | null): any | null => {
    if (!fullInputSchema || fullInputSchema.trim() === '') return null;
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

  const pendingModifyStepIndex = activeDialog.type === 'modifyStepConfirm' ? activeDialog.stepIndex : null;

  const handleRunAllSteps = () => {
    if (!isPayloadValid) {
      setActiveDialog({ type: 'invalidPayload' });
    } else {
      executeTool();
    }
  };

  const handleBeforeStepExecution = async (stepIndex: number, step: any): Promise<boolean> => {
    if (shouldAbortRef.current || externalShouldStop) return false;
    
    if (step.modify === true) {
      return new Promise((resolve) => {
        modifyStepResolveRef.current = resolve;
        setActiveDialog({ type: 'modifyStepConfirm', stepIndex });
      });
    }
    return true;
  };

  const handleModifyStepConfirm = () => {
    setActiveDialog({ type: 'none' });
    modifyStepResolveRef.current?.(true);
    modifyStepResolveRef.current = null;
  };

  const handleModifyStepCancel = () => {
    const stepIdx = pendingModifyStepIndex;
    setActiveDialog({ type: 'none' });
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

  const currentTool = useMemo(() => ({
    id: toolId,
    steps,
    instruction: instructions,
    finalTransform,
    responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
    inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
    folder,
    createdAt: initialTool?.createdAt,
    updatedAt: initialTool?.updatedAt
  } as Tool), [toolId, steps, instructions, finalTransform, responseSchema, inputSchema, folder, initialTool]);

  const getCurrentTool = useCallback((): Tool => ({
    id: toolId,
    steps: steps.map((step: ExecutionStep) => ({
      ...step,
      apiConfig: {
        id: step.apiConfig.id || step.id,
        ...step.apiConfig,
        pagination: step.apiConfig.pagination || null
      }
    })),
    responseSchema: responseSchema && responseSchema.trim() ? JSON.parse(responseSchema) : null,
    inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
    finalTransform,
    instruction: instructions,
    createdAt: initialTool?.createdAt,
    updatedAt: initialTool?.updatedAt
  } as Tool), [toolId, steps, responseSchema, inputSchema, finalTransform, instructions, initialTool]);

  useImperativeHandle(innerRef, () => ({
    executeTool,
    saveTool,
    getCurrentTool,
    closeRebuild: () => {
      setShowToolBuilder(false);
      onRebuildEnd?.();
    }
  }), [onRebuildEnd, executeTool, saveTool, getCurrentTool]);

  const handleStepEdit = (stepId: string, updatedStep: any, _isUserInitiated?: boolean) => {
    setSteps(steps.map(step => (step.id === stepId ? {
      ...updatedStep,
      apiConfig: { ...updatedStep.apiConfig, id: updatedStep.apiConfig.id || updatedStep.id }
    } : step)));
  };

  const handleExecuteStep = async (idx: number): Promise<void> => { await executeStepByIdx(idx); };
  const handleExecuteStepWithLimit = async (idx: number, limit: number): Promise<void> => { await executeStepByIdx(idx, { limitIterations: limit }); };

  const fixStepIndex = activeDialog.type === 'fixStep' ? activeDialog.stepIndex : null;

  const handleOpenFixStepDialog = (idx: number) => setActiveDialog({ type: 'fixStep', stepIndex: idx });
  const handleCloseFixStepDialog = () => setActiveDialog({ type: 'none' });

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

  const handleOpenFixTransformDialog = () => setActiveDialog({ type: 'fixTransform' });
  const handleCloseFixTransformDialog = () => setActiveDialog({ type: 'none' });

  const handleFixTransformSuccess = (newTransform: string, transformedData: any) => {
    setFinalTransform(newTransform);
    setFinalResult(transformedData, 'completed');
    setNavigateToFinalSignal(Date.now());
  };

  // Tool action handlers
  const handleRenamed = (newId: string) => {
    setToolId(newId);
    refreshTools();
    router.push(`/tools/${encodeURIComponent(newId)}`);
  };

  const handleDuplicated = (newId: string) => {
    refreshTools();
    router.push(`/tools/${encodeURIComponent(newId)}`);
  };

  const handleDeleted = () => {
    router.push('/configs');
  };

  const toolActionButtons = !embedded ? (
    <div className="flex items-center gap-1">
      <FolderPicker
        value={folder}
        onChange={(f) => setFolder(f ?? undefined)}
      />
      <ToolActionsMenu
        tool={currentTool}
        disabled={!toolId.trim()}
        showLabel
        onRenamed={(newId) => {
          setToolId(newId);
          router.push(`/tools/${encodeURIComponent(newId)}`);
        }}
        onArchived={() => router.push('/configs')}
        onUnarchived={() => setIsArchived(false)}
      />
    </div>
  ) : null;

  const defaultHeaderActions = (
    <div className="flex items-center gap-2">
      {isArchived ? (
        <Button
          variant="outline"
          onClick={handleUnarchive}
          className="h-9 px-4"
        >
          <ArchiveRestore className="h-4 w-4" />
          Unarchive
        </Button>
      ) : (
        <>
          {loading ? (
            <Button
              variant="outline"
              onClick={handleStopExecution}
              disabled={saving || (isExecutingStep != null) || isExecutingTransform}
              className="h-9 px-4"
            >
              <Square className="h-4 w-4" />
              Stop Execution
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleRunAllSteps}
              disabled={loading || saving || (isExecutingStep != null) || isExecutingTransform}
              className="h-9 px-4"
            >
              <Play className="h-4 w-4" />
              Run all Steps
            </Button>
          )}
          {!hideRebuildButton && (
            <Button
              variant="outline"
              onClick={() => {
                onRebuildStart?.();
                setShowToolBuilder(true);
              }}
              className="h-9 px-5"
            >
              <Hammer className="h-4 w-4" />
              Rebuild
            </Button>
          )}
          {!embedded && toolId && (
            <DeployButton
              tool={currentTool}
              payload={computedPayload}
              onBeforeOpen={saveTool}
              size="default"
              className="h-9 px-5"
              disabled={saving || loading}
            />
          )}
          <Button
            variant="default"
            onClick={saveTool}
            disabled={saving || loading}
            className="h-9 px-5 w-[108px] shadow-md border border-primary/40"
          >
            {saving ? "Saving..." : justSaved ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" />
                Saved
              </>
            ) : "Save"}
          </Button>
        </>
      )}
    </div>
  );

  if (showToolBuilder) {
    const payloadSchema = extractPayloadSchema(inputSchema);
    const payloadSchemaString = payloadSchema ? JSON.stringify(payloadSchema, null, 2) : null;

    return (
      <div className={embedded ? "w-full h-full" : "pt-2 px-6 pb-6 max-w-none w-full h-screen flex flex-col"}>
        {!embedded && !hideHeader && (
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Edit & Rebuild Tool</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowToolBuilder(false);
                onRebuildEnd?.();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <ToolBuilder
            initialView="instructions"
            initialIntegrationIds={extractIntegrationIds(steps)}
            initialInstruction={tool.instruction}
            initialPayload={manualPayloadText}
            initialResponseSchema={responseSchema}
            initialInputSchema={payloadSchemaString}
            initialFiles={uploadedFiles}
            onToolBuilt={handleToolRebuilt}
            onCancel={() => setShowToolBuilder(false)}
            mode="rebuild"
          />
        </div>
      </div>
    );
  }
  
  return (
    <div className={embedded ? "w-full h-full" : "pt-2 px-6 pb-6 max-w-none w-full h-screen flex flex-col"}>
      {!embedded && !hideHeader && (
        <div className="flex justify-end items-center mb-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => router.push('/configs')}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="w-full flex-1 overflow-hidden">
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
                  headerActions={headerActions !== undefined ? headerActions : defaultHeaderActions}
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

      <AlertDialog open={activeDialog.type === 'invalidPayload'} onOpenChange={(open) => !open && setActiveDialog({ type: 'none' })}>
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
            <AlertDialogAction onClick={() => {
              setActiveDialog({ type: 'none' });
              executeTool();
            }}>
              Run Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {fixStepIndex !== null && (
        <FixStepDialog
          open={activeDialog.type === 'fixStep'}
          onClose={handleCloseFixStepDialog}
          step={steps[fixStepIndex]}
          stepInput={buildStepInput(computedPayload || {}, steps, stepResultsMap, fixStepIndex - 1)}
          integrationId={steps[fixStepIndex]?.integrationId}
          errorMessage={(() => {
            const result = stepResultsMap[steps[fixStepIndex]?.id];
            const msg = typeof result === 'string' ? result : result?.error;
            return msg && !isAbortError(msg) ? msg : undefined;
          })()}
          onSuccess={handleFixStepSuccess}
          onAutoHeal={handleFixStep}
          onAbort={handleStopExecution}
        />
      )}

      {pendingModifyStepIndex !== null && (
        <ModifyStepConfirmDialog
          open={activeDialog.type === 'modifyStepConfirm'}
          stepId={steps[pendingModifyStepIndex]?.id}
          stepName={steps[pendingModifyStepIndex]?.id}
          onConfirm={handleModifyStepConfirm}
          onCancel={handleModifyStepCancel}
        />
      )}

      <ToolDeployModal
        currentTool={getCurrentTool()}
        payload={computedPayload}
        isOpen={activeDialog.type === 'deploy'}
        onClose={() => setActiveDialog({ type: 'none' })}
      />

      <RenameToolDialog
        tool={getCurrentTool()}
        isOpen={activeDialog.type === 'rename'}
        onClose={() => setActiveDialog({ type: 'none' })}
        onRenamed={handleRenamed}
      />

      <DuplicateToolDialog
        tool={getCurrentTool()}
        isOpen={activeDialog.type === 'duplicate'}
        onClose={() => setActiveDialog({ type: 'none' })}
        onDuplicated={handleDuplicated}
      />

      <DeleteConfigDialog
        config={{ ...getCurrentTool(), type: 'tool' } as any}
        isOpen={activeDialog.type === 'delete'}
        onClose={() => setActiveDialog({ type: 'none' })}
        onDeleted={handleDeleted}
      />

      <FixTransformDialog
        open={activeDialog.type === 'fixTransform'}
        onClose={handleCloseFixTransformDialog}
        currentTransform={finalTransform}
        responseSchema={parsedResponseSchema}
        stepData={buildStepInput(computedPayload || {}, steps, stepResultsMap, steps.length - 1)}
        errorMessage={
          typeof stepResultsMap['__final_transform__'] === 'string'
            ? stepResultsMap['__final_transform__']
            : undefined
        }
        onSuccess={handleFixTransformSuccess}
        onLoadingChange={(loading) => setTransformStatus(loading ? 'fixing' : 'idle')}
      />
    </div>
  );
}

const ToolPlayground = forwardRef<ToolPlaygroundHandle, ToolPlaygroundProps>((props, ref) => {
  const { integrations: contextIntegrations } = useIntegrations();
  const integrations = props.integrations || contextIntegrations;
  
  return (
    <ToolConfigProvider
      initialTool={props.initialTool}
      initialPayload={props.initialPayload}
      initialInstruction={props.initialInstruction}
      integrations={integrations}
      externalUploadedFiles={props.uploadedFiles}
      onExternalFilesChange={props.onFilesChange}
    >
      <ExecutionProvider>
        <ToolPlaygroundInner {...props} innerRef={ref} />
      </ExecutionProvider>
    </ToolConfigProvider>
  );
});

ToolPlayground.displayName = 'ToolPlayground';
export default ToolPlayground;

