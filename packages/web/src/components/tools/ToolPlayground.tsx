"use client";

import { useConfig } from "@/src/app/config-context";
import { useIntegrations } from "@/src/app/integrations-context";
import { useTools } from "@/src/app/tools-context";
import { createSuperglueClient, executeFinalTransform, executeSingleStep, executeToolStepByStep, generateUUID, type StepExecutionResult } from "@/src/lib/client-utils";
import { formatBytes, generateUniqueKey, MAX_TOTAL_FILE_SIZE_TOOLS, processAndExtractFile, sanitizeFileName, type UploadedFileInfo } from '@/src/lib/file-utils';
import { buildEvolvingPayload, computeStepOutput, computeToolPayload, removeFileKeysFromPayload, wrapLoopSelectorWithLimit } from "@/src/lib/general-utils";
import { ExecutionStep, generateDefaultFromSchema, Integration, Tool, ToolResult } from "@superglue/shared";
import { Validator } from "jsonschema";
import isEqual from "lodash.isequal";
import { Check, CloudUpload, CopyPlus, Edit2, Hammer, Loader2, Play, Trash2, X } from "lucide-react";
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/use-toast";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { ToolDeployModal } from "./deploy/ToolDeployModal";
import { DeleteConfigDialog } from "./dialogs/DeleteConfigDialog";
import { DuplicateToolDialog } from "./dialogs/DuplicateToolDialog";
import { FixStepDialog } from "./dialogs/FixStepDialog";
import { FixTransformDialog } from "./dialogs/FixTransformDialog";
import { ModifyStepConfirmDialog } from "./dialogs/ModifyStepConfirmDialog";
import { RenameToolDialog } from "./dialogs/RenameToolDialog";
import { ToolBuilder, type BuildContext } from "./ToolBuilder";
import { ToolStepGallery } from "./ToolStepGallery";

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
  filePayloads?: Record<string, any>;
  onFilesChange?: (files: UploadedFileInfo[], payloads: Record<string, any>) => void;
  saveButtonText?: string;
  hideRebuildButton?: boolean;
  userSelectedIntegrationIds?: string[];
  onRebuildStart?: () => void;
  onRebuildEnd?: () => void;
}

export interface ToolPlaygroundHandle {
  executeTool: () => Promise<void>;
  saveTool: () => Promise<boolean>;
  getCurrentTool: () => Tool;
  closeRebuild: () => void;
}

const ToolPlayground = forwardRef<ToolPlaygroundHandle, ToolPlaygroundProps>(({
  id,
  embedded = false,
  initialTool,
  initialPayload,
  initialInstruction,
  integrations: providedIntegrations,
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
  filePayloads: parentFilePayloads,
  onFilesChange: parentOnFilesChange,
  saveButtonText = "Save",
  hideRebuildButton = false,
  userSelectedIntegrationIds = [],
  onRebuildStart,
  onRebuildEnd
}, ref) => {
  const router = useRouter();
  const { toast } = useToast();
  const config = useConfig();
  const { integrations: contextIntegrations } = useIntegrations();
  const [toolId, setToolId] = useState(initialTool?.id || "");
  const [steps, setSteps] = useState<any[]>(initialTool?.steps || []);
  const [finalTransform, setFinalTransform] = useState(initialTool?.finalTransform || `(sourceData) => {
  return sourceData;
}`);
  const [responseSchema, setResponseSchema] = useState<string>(
    initialTool?.responseSchema ? JSON.stringify(initialTool.responseSchema, null, 2) : ''
  );
  const [inputSchema, setInputSchema] = useState<string | null>(
    initialTool?.inputSchema
      ? JSON.stringify(initialTool.inputSchema, null, 2)
      : null
  );
  
  // Payload state: separate manual input from computed execution payload
  const [manualPayloadText, setManualPayloadText] = useState<string>(initialPayload || '{}');
  
  // File upload state - use parent's if provided (embedded), otherwise use local
  const [localUploadedFiles, setLocalUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [localTotalFileSize, setLocalTotalFileSize] = useState(0);
  const [localIsProcessingFiles, setLocalIsProcessingFiles] = useState(false);
  const [localFilePayloads, setLocalFilePayloads] = useState<Record<string, any>>({});

  // Use parent state if available, otherwise use local state
  const uploadedFiles = parentUploadedFiles || localUploadedFiles;
  const totalFileSize = parentTotalFileSize ?? localTotalFileSize;
  const isProcessingFiles = parentIsProcessingFiles ?? localIsProcessingFiles;
  const filePayloads = parentFilePayloads || localFilePayloads;
  
  // Computed payload: merge manual + file payloads (execution-ready)
  const computedPayload = useMemo(() => 
    computeToolPayload(manualPayloadText, filePayloads),
    [manualPayloadText, filePayloads]
  );
  
  const parsedResponseSchema = useMemo(() => {
    if (!responseSchema) return undefined;
    try {
      return JSON.parse(responseSchema);
    } catch (error) {
      console.error('Failed to parse response schema:', error);
      return undefined;
    }
  }, [responseSchema]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [failedSteps, setFailedSteps] = useState<string[]>([]);
  const [navigateToFinalSignal, setNavigateToFinalSignal] = useState<number>(0);
  const [showStepOutputSignal, setShowStepOutputSignal] = useState<number>(0);
  const [focusStepId, setFocusStepId] = useState<string | null>(null);
  const [stepResultsMap, setStepResultsMap] = useState<Record<string, any>>({});
  const [finalPreviewResult, setFinalPreviewResult] = useState<any>(null);
  // Track last user-edited step and previous step hashes to drive robust cascades
  const lastUserEditedStepIdRef = useRef<string | null>(null);
  const prevStepHashesRef = useRef<string[]>([]);

  const integrations = providedIntegrations || contextIntegrations;
  const [instructions, setInstructions] = useState<string>(initialInstruction || '');

  useEffect(() => {
    if (embedded && initialInstruction !== undefined) {
      setInstructions(initialInstruction);
    }
  }, [embedded, initialInstruction]);
  const [isExecutingStep, setIsExecutingStep] = useState<number | undefined>(undefined);
  const [currentExecutingStepIndex, setCurrentExecutingStepIndex] = useState<number | undefined>(undefined);
  const [showFixStepDialog, setShowFixStepDialog] = useState(false);
  const [fixStepIndex, setFixStepIndex] = useState<number | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [isRunningTransform, setIsRunningTransform] = useState(false);
  const [isFixingTransform, setIsFixingTransform] = useState(false);
  const [showFixTransformDialog, setShowFixTransformDialog] = useState(false);
  // Computed: any transform execution in progress
  const isExecutingTransform = isRunningTransform || isFixingTransform;
  // Single source of truth for stopping across modes (embedded/standalone)
  const stopSignalRef = useRef<boolean>(false);
  const [isPayloadValid, setIsPayloadValid] = useState<boolean>(true);
  const [hasUserEditedPayload, setHasUserEditedPayload] = useState<boolean>(false);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasGeneratedDefaultPayloadRef = useRef<boolean>(false);
  const [showToolBuilder, setShowToolBuilder] = useState(false);
  const [showInvalidPayloadDialog, setShowInvalidPayloadDialog] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showModifyStepConfirm, setShowModifyStepConfirm] = useState(false);
  const [pendingModifyStepIndex, setPendingModifyStepIndex] = useState<number | null>(null);
  const modifyStepResolveRef = useRef<((shouldContinue: boolean) => void) | null>(null);
  
  // Tool action dialogs (rename, duplicate, delete)
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { refreshTools } = useTools();

  // Generate default payload once when schema is available if payload is empty
  useEffect(() => {
    const trimmed = manualPayloadText.trim();
    const isEmptyPayload = trimmed === '' || trimmed === '{}';
    
    if (!hasUserEditedPayload && isEmptyPayload && inputSchema && !hasGeneratedDefaultPayloadRef.current) {
      try {
        const payloadSchema = extractPayloadSchema(inputSchema);
        if (payloadSchema) {
          const defaultJson = generateDefaultFromSchema(payloadSchema);
          const defaultString = JSON.stringify(defaultJson, null, 2);
          setManualPayloadText(defaultString);
          hasGeneratedDefaultPayloadRef.current = true;
        }
      } catch (e) {
        console.error('Failed to generate default from schema:', e);
      }
    }
  }, [inputSchema, manualPayloadText, hasUserEditedPayload]);

  // Track latest external stop signal (embedded mode) in the single ref
  useEffect(() => {
    if (embedded) {
      stopSignalRef.current = !!externalShouldStop;
    }
  }, [externalShouldStop]);

  const handleStopExecution = () => {
    if (embedded && onStopExecution) {
      // Set stop signal immediately in embedded mode too
      stopSignalRef.current = true;
      onStopExecution();
    } else {
      stopSignalRef.current = true;
      setIsStopping(true);
      toast({
        title: "Stopping tool",
        description: "Tool will stop after the current step completes",
      });
    }
  };

  useImperativeHandle(ref, () => ({
    executeTool,
    saveTool,
    getCurrentTool: () => ({
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
      instruction: instructions
    }),
    closeRebuild: () => {
      setShowToolBuilder(false);
      onRebuildEnd?.();
    }
  }), [toolId, steps, responseSchema, inputSchema, finalTransform, instructions, onRebuildEnd]);
  
  const extractIntegrationIds = (steps: ExecutionStep[]): string[] => {
    return Array.from(new Set(
      steps.map(s => s.integrationId).filter(Boolean) as string[]
    ));
  };

  const getMergedIntegrationIds = (): string[] => {
    const integrationsFromSteps = extractIntegrationIds(steps);
    const integrationsFromCreateStepper = userSelectedIntegrationIds || [];
    return Array.from(new Set([...integrationsFromSteps, ...integrationsFromCreateStepper]));
  };

  const handleToolRebuilt = (tool: Tool, context: BuildContext) => {
    setToolId(tool.id);
    setSteps(tool.steps?.map(step => ({
      ...step,
      apiConfig: { ...step.apiConfig, id: step.apiConfig.id || step.id }
    })) || []);
    setFinalTransform(tool.finalTransform || finalTransform);
    setResponseSchema(tool.responseSchema ? JSON.stringify(tool.responseSchema, null, 2) : '');
    setInputSchema(tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : null);
    setInstructions(context.instruction);
    setManualPayloadText(context.payload);
    
    // Update local file state
    setLocalUploadedFiles(context.uploadedFiles);
    setLocalFilePayloads(context.filePayloads);
    setLocalTotalFileSize(context.uploadedFiles.reduce((sum, f) => sum + f.size, 0));
    
    // Notify parent of file changes if callback provided
    if (parentOnFilesChange) {
      parentOnFilesChange(context.uploadedFiles, context.filePayloads);
    }
    
    // Clear execution state since tool changed
    setCompletedSteps([]);
    setFailedSteps([]);
    setStepResultsMap({});
    setFinalPreviewResult(null);
    
    setShowToolBuilder(false);
    onRebuildEnd?.();
  };

  // Extract payload schema from full input schema
  const extractPayloadSchema = (fullInputSchema: string | null): any | null => {
    if (!fullInputSchema || fullInputSchema.trim() === '') {
      return null;
    }
    try {
      const parsed = JSON.parse(fullInputSchema);
      if (parsed && typeof parsed === 'object' && parsed.properties && parsed.properties.payload) {
        return parsed.properties.payload;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  };

  // Simplified validation: validates the computed payload against input schema
  const validateComputedPayload = (payload: any, schemaText: string | null, userHasEdited: boolean): boolean => {
    const payloadSchema = extractPayloadSchema(schemaText);

    // Empty/disabled schema → always valid (no payload required)
    if (!payloadSchema || Object.keys(payloadSchema).length === 0) {
      return true;
    }

    try {
      const validator = new Validator();
      const result = validator.validate(payload, payloadSchema);
      
      if (!result.valid) {
        return false;
      }
      
      // If user hasn't edited yet, check if payload matches default (require edit)
      if (!userHasEdited) {
        try {
          const generatedDefault = generateDefaultFromSchema(payloadSchema);
          // If default is {} (empty object), no user edit required
          if (Object.keys(generatedDefault).length === 0 && typeof generatedDefault === 'object') {
            return true;
          }
          if (isEqual(payload, generatedDefault)) {
            return false;
          }
        } catch (e) {
          // Can't generate default, we rely on schema validation
        }
      }
      
      return true;
    } catch (e) {
      return false;
    }
  };

  // Debounced validation effect using computed payload
  useEffect(() => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = setTimeout(() => {
      const isValid = validateComputedPayload(computedPayload, inputSchema, hasUserEditedPayload);
      setIsPayloadValid(isValid);
    }, 300);

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [computedPayload, inputSchema, hasUserEditedPayload]);

  // Unified file upload handlers
  const handleFilesUpload = async (files: File[]) => {
    // Use parent handler if available, otherwise handle locally
    if (parentOnFilesUpload) {
      return parentOnFilesUpload(files);
    }

    const currentFiles = parentUploadedFiles || localUploadedFiles;
    const currentSize = parentTotalFileSize ?? localTotalFileSize;
    const currentPayloads = parentFilePayloads || localFilePayloads;
    
    const setProcessing = parentIsProcessingFiles !== undefined ? () => {} : setLocalIsProcessingFiles;
    
    setProcessing(true);
    setHasUserEditedPayload(true);

    try {
      const newSize = files.reduce((sum, f) => sum + f.size, 0);
      if (currentSize + newSize > MAX_TOTAL_FILE_SIZE_TOOLS) {
        toast({
          title: 'Size limit exceeded',
          description: `Total file size cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE_TOOLS)}`,
          variant: 'destructive'
        });
        return;
      }

      const existingKeys = currentFiles.map(f => f.key);
      const newFiles: UploadedFileInfo[] = [];
      const newPayloads: Record<string, any> = { ...currentPayloads };
      const keysToRemove: string[] = [];

      // Process all files without intermediate state updates
      for (const file of files) {
        try {
          const baseKey = sanitizeFileName(file.name, { removeExtension: true, lowercase: false });
          const key = generateUniqueKey(baseKey, [...existingKeys, ...newFiles.map(f => f.key)]);

          const fileInfo: UploadedFileInfo = {
            name: file.name,
            size: file.size,
            key,
            status: 'processing'
          };
          newFiles.push(fileInfo);
          existingKeys.push(key);

          const client = createSuperglueClient(config.superglueEndpoint);
          const parsedData = await processAndExtractFile(file, client);

          newPayloads[key] = parsedData;
          fileInfo.status = 'ready';
          keysToRemove.push(key);

        } catch (error: any) {
          const fileInfo = newFiles.find(f => f.name === file.name);
          if (fileInfo) {
            fileInfo.status = 'error';
            fileInfo.error = error.message;
          }

          toast({
            title: 'File processing failed',
            description: `Failed to parse ${file.name}: ${error.message}`,
            variant: 'destructive'
          });
        }
      }

      // Single state update after all files processed
      const finalFiles = [...currentFiles, ...newFiles];
      const newTotalSize = finalFiles.reduce((sum, f) => sum + f.size, 0);
      
      if (parentOnFilesChange) {
        parentOnFilesChange(finalFiles, newPayloads);
      } else {
        setLocalUploadedFiles(finalFiles);
        setLocalFilePayloads(newPayloads);
        setLocalTotalFileSize(newTotalSize);
      }
      
      // Remove file keys from manual payload text (once, after all processing)
      if (keysToRemove.length > 0) {
        setManualPayloadText(prev => removeFileKeysFromPayload(prev, keysToRemove));
      }

    } finally {
      setProcessing(false);
    }
  };

  const handleFileRemove = (key: string) => {
    // Use parent handler if available
    if (parentOnFileRemove) {
      return parentOnFileRemove(key);
    }

    // Determine which state to use
    const currentFiles = parentUploadedFiles || localUploadedFiles;
    const currentPayloads = parentFilePayloads || localFilePayloads;
    
    const fileToRemove = currentFiles.find(f => f.key === key);
    if (!fileToRemove) return;

    const newFiles = currentFiles.filter(f => f.key !== key);
    const newPayloads = { ...currentPayloads };
    delete newPayloads[key];

    if (parentOnFilesChange) {
      parentOnFilesChange(newFiles, newPayloads);
    } else {
      setLocalUploadedFiles(newFiles);
      setLocalFilePayloads(newPayloads);
      setLocalTotalFileSize(prev => Math.max(0, prev - (fileToRemove.size || 0)));
    }
    
    // Don't modify manual payload text - leave user's JSON as-is
  };

  const loadTool = async (idToLoad: string) => {
    try {
      if (!idToLoad) return;
      setLoading(true);
      const client = createSuperglueClient(config.superglueEndpoint);
      const tool = await client.getWorkflow(idToLoad);
      if (!tool) {
        throw new Error(`Tool with ID "${idToLoad}" not found.`);
      }
      setToolId(tool.id || '');
      setSteps(tool?.steps?.map(step => ({ ...step, apiConfig: { ...step.apiConfig, id: step.apiConfig.id || step.id } })) || []);
      setFinalTransform(tool.finalTransform || `(sourceData) => {
        return {
          result: sourceData
        }
      }`);

      setInstructions(tool.instruction || '');
      setResponseSchema(tool.responseSchema ? JSON.stringify(tool.responseSchema, null, 2) : '');

      setInputSchema(tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : null);
      // Don't modify payload when loading a tool - keep existing manual payload
    } catch (error: any) {
      console.error("Error loading tool:", error);
      toast({
        title: "Error loading tool",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const [lastToolId, setLastToolId] = useState<string | undefined>(initialTool?.id);

  useEffect(() => {
    if (initialTool && initialTool.id !== lastToolId) {
      setToolId(initialTool.id || '');
      setSteps(initialTool.steps?.map(step => ({
        ...step,
        apiConfig: { ...step.apiConfig, id: step.apiConfig.id || step.id }
      })) || []);
      setFinalTransform(initialTool.finalTransform || `(sourceData) => {
  return {
    result: sourceData
  }
}`);
      const schemaString = initialTool.responseSchema ? JSON.stringify(initialTool.responseSchema, null, 2) : '';
      setResponseSchema(schemaString);
      setInputSchema(initialTool.inputSchema ? JSON.stringify(initialTool.inputSchema, null, 2) : null);
      setInstructions(initialInstruction || initialTool.instruction || '');
      setLastToolId(initialTool.id);
    }
  }, [initialTool, embedded, lastToolId, initialInstruction]);

  useEffect(() => {
    if (!embedded && id) {
      loadTool(id);
    } else if (!embedded && !id && !initialTool) {
      setToolId("");
      setSteps([]);
      setInstructions("");
      setFinalTransform(`(sourceData) => {
  return {
    result: sourceData
  }
}`);
      setResponseSchema('');
      setInputSchema(null);
      setManualPayloadText('{}');
      setFinalPreviewResult(null);
    }
  }, [id, embedded, initialTool]);


  const saveTool = async (): Promise<boolean> => {
    try {
      try {
        JSON.parse(responseSchema || '{}');
      } catch (e) {
        throw new Error("Invalid response schema JSON");
      }
      try {
        JSON.parse(inputSchema || '{}');
      } catch (e) {
        throw new Error("Invalid input schema JSON");
      }

      if (!toolId.trim()) {
        setToolId(`wf-${Date.now()}`);
      }
      setSaving(true);

      // Always use the current steps (which include any self-healed updates)
      const stepsToSave = steps;

      const toolToSave: Tool = {
        id: toolId,
        // Save the self-healed steps if they exist (from a successful run with self-healing enabled)
        steps: stepsToSave.map((step: ExecutionStep) => ({
          ...step,
          apiConfig: {
            id: step.apiConfig.id || step.id,
            ...step.apiConfig,
            pagination: step.apiConfig.pagination || null
          }
        })),
        // Only save responseSchema if it's explicitly enabled (non-empty string)
        responseSchema: responseSchema && responseSchema.trim() ? JSON.parse(responseSchema) : null,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        finalTransform,
        instruction: instructions
      } as any;

      // In embedded mode, use the provided onSave callback
      if (embedded && onSave) {
        await onSave(toolToSave, computedPayload);
      } else {
        // In standalone mode, save to backend
        const client = createSuperglueClient(config.superglueEndpoint);
        const savedTool = await client.upsertWorkflow(toolId, toolToSave as any);

        if (!savedTool) {
          throw new Error("Failed to save tool");
        }
        setToolId(savedTool.id);
        setFinalTransform(savedTool.finalTransform);
        setSteps(savedTool.steps);
      }

      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      return true;
    } catch (error: any) {
      console.error("Error saving tool:", error);
      toast({
        title: "Error saving tool",
        description: error.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleRunAllSteps = () => {
    if (!isPayloadValid) {
      setShowInvalidPayloadDialog(true);
    } else {
      executeTool();
    }
  };

  const handleBeforeStepExecution = async (stepIndex: number, step: any): Promise<boolean> => {
    // Check if this step has the modify flag
    if (step.modify === true) {
      // Show confirmation dialog and wait for user response
      return new Promise((resolve) => {
        modifyStepResolveRef.current = resolve;
        setPendingModifyStepIndex(stepIndex);
        setShowModifyStepConfirm(true);
      });
    }
    return true;
  };

  const handleModifyStepConfirm = () => {
    setShowModifyStepConfirm(false);
    setPendingModifyStepIndex(null);
    if (modifyStepResolveRef.current) {
      modifyStepResolveRef.current(true);
      modifyStepResolveRef.current = null;
    }
  };

  const handleModifyStepCancel = () => {
    setShowModifyStepConfirm(false);
    if (modifyStepResolveRef.current) {
      modifyStepResolveRef.current(false);
      modifyStepResolveRef.current = null;
    }
    // Focus on the step that was about to be executed
    if (pendingModifyStepIndex !== null) {
      const stepId = steps[pendingModifyStepIndex]?.id;
      if (stepId) {
        setFocusStepId(stepId);
        setShowStepOutputSignal(Date.now());
      }
    }
    setPendingModifyStepIndex(null);
  };

  const executeTool = async () => {
    setLoading(true);
    // Fully clear any stale stop signals from a previous run (both modes)
    stopSignalRef.current = false;
    setIsStopping(false);
    setCompletedSteps([]);
    setFailedSteps([]);
    setFinalPreviewResult(null);
    setStepResultsMap({});
    setFocusStepId(null);

    try {
      JSON.parse(responseSchema || '{}');
      JSON.parse(inputSchema || '{}');

      // Always use the current steps for execution
      const executionSteps = steps;
      const currentResponseSchema = responseSchema && responseSchema.trim() ? JSON.parse(responseSchema) : null;
      // Auto-repair disabled for "Run All Steps" - individual steps and final transform still support it
      const effectiveSelfHealing = false;

      const tool = {
        id: toolId,
        steps: executionSteps,
        finalTransform,
        responseSchema: currentResponseSchema,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
      } as any;

      // Store original steps to compare against self-healed result
      const originalStepsJson = JSON.stringify(executionSteps);

      // Use computed payload for execution (already merged manual + files)
      setCurrentExecutingStepIndex(0);

      const client = createSuperglueClient(config.superglueEndpoint);
      const state = await executeToolStepByStep(
        client,
        tool,
        computedPayload,
        (i: number, res: StepExecutionResult) => {
          if (i < tool.steps.length - 1) {
            setCurrentExecutingStepIndex(i + 1);
          } else {
            setCurrentExecutingStepIndex(tool.steps.length);
          }

          if (res.success) {
            setCompletedSteps(prev => Array.from(new Set([...prev, res.stepId])));
          } else {
            setFailedSteps(prev => Array.from(new Set([...prev, res.stepId])));
          }
          try {
            const normalized = computeStepOutput(res);
            setStepResultsMap(prev => ({ ...prev, [res.stepId]: normalized.output }));
          } catch { }
        },
        effectiveSelfHealing,
        () => stopSignalRef.current,
        handleBeforeStepExecution
      );

      // Always update steps with returned configuration (API may normalize/update even without self-healing)
      if (state.currentTool.steps) {
        const returnedStepsJson = JSON.stringify(state.currentTool.steps);
        if (originalStepsJson !== returnedStepsJson) {
          setSteps(state.currentTool.steps);
          // Only show toast if self-healing was enabled (otherwise it's likely just normalization)
          if (effectiveSelfHealing) {
            toast({
              title: "Tool configuration updated",
              description: "auto-repair has modified the tool configuration to fix issues.",
            });
          }
        }
      }

      const stepDataMap: Record<string, any> = {};
      Object.entries(state.stepResults).forEach(([stepId, res]) => {
        const normalized = computeStepOutput(res as StepExecutionResult);
        stepDataMap[stepId] = normalized.output;
      });
      setStepResultsMap(stepDataMap);

      const finalData = state.stepResults['__final_transform__']?.data;
      setFinalPreviewResult(finalData);

      const wr: ToolResult = {
        id: generateUUID(),
        success: state.failedSteps.length === 0,
        data: finalData,
        error: state.stepResults['__final_transform__']?.error,
        startedAt: new Date(),
        completedAt: new Date(),
        stepResults: Object.entries(state.stepResults)
          .filter(([key]) => key !== '__final_transform__')
          .map(([stepId, result]: [string, StepExecutionResult]) => ({
            stepId,
            success: result.success,
            data: result.data,
            error: result.error
          })),
        config: {
          id: toolId,
          steps: state.currentTool.steps,
          finalTransform: state.currentTool.finalTransform || finalTransform,
        } as any
      };

      // Update finalTransform if it was wrapped or self-healed by backend
      if (state.currentTool.finalTransform && state.currentTool.finalTransform !== finalTransform) {
        setFinalTransform(state.currentTool.finalTransform);
      }
      setCompletedSteps(state.completedSteps);
      setFailedSteps(state.failedSteps);

      if (state.failedSteps.length === 0 && !state.interrupted) {
        setNavigateToFinalSignal(Date.now());
      } else {
        const firstFailed = state.failedSteps[0];
        if (firstFailed) {
          setFocusStepId(firstFailed);
          setShowStepOutputSignal(Date.now());
        }
      }

      if (onExecute) {
        const executedTool = {
          id: toolId,
          steps: executionSteps,
          finalTransform: state.currentTool.finalTransform || finalTransform,
          responseSchema: currentResponseSchema,
          inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
          instruction: instructions
        } as Tool;
        onExecute(executedTool, wr);
      }
    } catch (error: any) {
      console.error("Error executing tool:", error);
      toast({
        title: "Error executing tool",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsStopping(false);
      setCurrentExecutingStepIndex(undefined);
      // Ensure stop signal is reset after a run finishes/interrupted
      stopSignalRef.current = false;
    }
  };

  const handleStepsChange = (newSteps: any[]) => {
    setSteps(newSteps);
  };

  const handleStepEdit = (stepId: string, updatedStep: any, isUserInitiated: boolean = false) => {
    // No-op guard: avoid cascades if nothing actually changed
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx !== -1) {
      const current = steps[idx];
      const currHash = hashStepConfig(current);
      const nextHash = hashStepConfig(updatedStep);
      if (currHash === nextHash) return;
    }

    // Update the steps immediately
    setSteps(prevSteps =>
      prevSteps.map(step => (step.id === stepId ? {
        ...updatedStep,
        apiConfig: { ...updatedStep.apiConfig, id: updatedStep.apiConfig.id || updatedStep.id }
      } : step))
    );

    // Mark which step was edited by the user (used by steps effect to cascade resets)
    if (isUserInitiated) {
      lastUserEditedStepIdRef.current = stepId;
    }
  };

  // Compute a stable hash for a step's configuration that affects execution
  const hashStepConfig = (s: any): string => {
    try {
      const exec = {
        id: s.id,
        executionMode: s.executionMode,
        loopSelector: s.loopSelector,
        integrationId: s.integrationId,
        apiConfig: s.apiConfig,
      };
      return JSON.stringify(exec);
    } catch {
      return '';
    }
  };

  // Drive cascading resets off of the source-of-truth: steps changes
  useEffect(() => {
    const currentHashes = steps.map(hashStepConfig);
    const prevHashes = prevStepHashesRef.current;

    // Only cascade when the edited step itself changed
    if (lastUserEditedStepIdRef.current) {
      const editedId = lastUserEditedStepIdRef.current;
      const idxOfEdited = steps.findIndex(s => s.id === editedId);
      if (idxOfEdited !== -1 && prevHashes[idxOfEdited] !== currentHashes[idxOfEdited]) {
        const stepsToReset = steps.slice(idxOfEdited).map(s => s.id);

        setCompletedSteps(prev => prev.filter(id => !stepsToReset.includes(id) && id !== '__final_transform__'));
        setFailedSteps(prev => prev.filter(id => !stepsToReset.includes(id) && id !== '__final_transform__'));
        setStepResultsMap(prev => {
          const next = { ...prev } as Record<string, any>;
          stepsToReset.forEach(id => delete next[id]);
          delete next['__final_transform__'];
          return next;
        });
        setFinalPreviewResult(null);
      }
      // Clear marker regardless to avoid stale cascades
      lastUserEditedStepIdRef.current = null;
    }

    // Update previous hashes after processing
    prevStepHashesRef.current = currentHashes;
  }, [steps]);

  const executeStepByIdx = async (idx: number, limitIterations?: number) => {
    try {
      setIsExecutingStep(idx);
      const client = createSuperglueClient(config.superglueEndpoint);
      
      // If limit is specified, wrap loopSelector temporarily for this execution only
      const originalLoopSelector = steps[idx]?.loopSelector;
      const stepToExecute = limitIterations && originalLoopSelector
        ? { ...steps[idx], loopSelector: wrapLoopSelectorWithLimit(originalLoopSelector, limitIterations) }
        : steps[idx];

      const single = await executeSingleStep(
        {
          client,
          step: stepToExecute,
          toolId,
          payload: computedPayload,
          previousResults: stepResultsMap,
          selfHealing: false
        }
      );
      
      const sid = steps[idx].id;
      const normalized = computeStepOutput(single);
      const isFailure = !single.success;

      if (single.updatedStep) {
        setSteps(prevSteps =>
          prevSteps.map((step, i) => {
            if (i !== idx) return step;
            const updated = single.updatedStep;
            // If we used limitIterations, the backend wrapped our temporary limit wrapper
            // So restore the original loopSelector (backend will wrap it properly on next real execution)
            if (limitIterations && originalLoopSelector) {
              return { ...updated, loopSelector: originalLoopSelector };
            }
            // Otherwise use the backend's wrapped version (it ensured arrow function format)
            return updated;
          })
        );
      }

      if (isFailure) {
        setFailedSteps(prev => Array.from(new Set([...prev.filter(id => id !== sid), sid])));
        setCompletedSteps(prev => prev.filter(id => id !== sid));
      } else {
        setCompletedSteps(prev => Array.from(new Set([...prev.filter(id => id !== sid), sid])));
        setFailedSteps(prev => prev.filter(id => id !== sid));
      }
      setStepResultsMap(prev => ({ ...prev, [sid]: normalized.output }));
      setFocusStepId(sid);
      setShowStepOutputSignal(Date.now());
    } finally {
      setIsExecutingStep(undefined);
    }
  };

  const handleExecuteStep = async (idx: number) => {
    await executeStepByIdx(idx);
  };

  const handleExecuteStepWithLimit = async (idx: number, limit: number) => {
    await executeStepByIdx(idx, limit);
  };

  const handleOpenFixStepDialog = (idx: number) => {
    setFixStepIndex(idx);
    setShowFixStepDialog(true);
  };

  const handleCloseFixStepDialog = () => {
    setShowFixStepDialog(false);
    setFixStepIndex(null);
  };

  const handleFixStepSuccess = (updatedStep: any) => {
    if (fixStepIndex === null) return;

    const step = steps[fixStepIndex];
    
    console.log('[ToolPlayground] handleFixStepSuccess received:', updatedStep);
    
    // updatedStep now contains the full step with both apiConfig and loopSelector updated
    handleStepEdit(step.id, updatedStep, true);
  };

  const handleAutoHealStep = async (updatedInstruction: string) => {
    if (fixStepIndex === null) return;
    
    try {
      setIsExecutingStep(fixStepIndex);
      const client = createSuperglueClient(config.superglueEndpoint);

      const updatedSteps = updatedInstruction
        ? steps.map((step, i) => 
            i === fixStepIndex 
              ? { ...step, apiConfig: { ...step.apiConfig, instruction: updatedInstruction } }
              : step
          )
        : steps;

      const single = await executeSingleStep(
        {
          client,
          step: updatedSteps[fixStepIndex],
          toolId,
          payload: computedPayload,
          previousResults: stepResultsMap,
          selfHealing: true
        }
      );

      const sid = steps[fixStepIndex].id;
      const normalized = computeStepOutput(single);
      const isFailure = !single.success;

      if (single.updatedStep) {
        setSteps(prevSteps =>
          prevSteps.map((step, i) => i === fixStepIndex ? single.updatedStep : step)
        );
        
        toast({
          title: "Step fixed",
          description: "The step configuration has been updated and executed successfully.",
        });
      }

      if (isFailure) {
        setFailedSteps(prev => Array.from(new Set([...prev.filter(id => id !== sid), sid])));
        setCompletedSteps(prev => prev.filter(id => id !== sid));
        throw new Error(single.error || 'Failed to fix step');
      } else {
        setCompletedSteps(prev => Array.from(new Set([...prev.filter(id => id !== sid), sid])));
        setFailedSteps(prev => prev.filter(id => id !== sid));
      }
      setStepResultsMap(prev => ({ ...prev, [sid]: normalized.output }));
      setFocusStepId(sid);
      setShowStepOutputSignal(Date.now());
    } finally {
      setIsExecutingStep(undefined);
    }
  };

  const handleExecuteTransform = async (schemaStr: string, transformStr: string, selfHealing: boolean = false) => {
    try {
      if (selfHealing) {
        setIsFixingTransform(true);
      } else {
        setIsRunningTransform(true);
      }

      // Build the payload with all step results
      const stepData: Record<string, any> = {};
      Object.entries(stepResultsMap).forEach(([stepId, result]) => {
        if (stepId !== '__final_transform__') {
          stepData[stepId] = result;
        }
      });
      const parsedResponseSchema = schemaStr && schemaStr.trim() ? JSON.parse(schemaStr) : null;
      const client = createSuperglueClient(config.superglueEndpoint);
      const result = await executeFinalTransform(
        client,
        toolId || 'test',
        transformStr || finalTransform,
        parsedResponseSchema,
        inputSchema ? JSON.parse(inputSchema) : null,
        computedPayload,
        stepData,
        selfHealing
      );

      if (result.success) {
        setCompletedSteps(prev => Array.from(new Set([...prev.filter(id => id !== '__final_transform__'), '__final_transform__'])));
        setFailedSteps(prev => prev.filter(id => id !== '__final_transform__'));
        setStepResultsMap(prev => ({ ...prev, ['__final_transform__']: result.data }));
        setFinalPreviewResult(result.data);
        setNavigateToFinalSignal(Date.now());

        // Update transform if it was wrapped or self-healed by backend
        if (result.updatedTransform && result.updatedTransform !== (transformStr || finalTransform)) {
          setFinalTransform(result.updatedTransform);
          if (selfHealing) {
            toast({
              title: "Transform code updated",
              description: "auto-repair has modified the transform code to fix issues.",
            });
          }
        }
      } else {
        setFailedSteps(prev => Array.from(new Set([...prev.filter(id => id !== '__final_transform__'), '__final_transform__'])));
        setCompletedSteps(prev => prev.filter(id => id !== '__final_transform__'));
        // Store error message for display
        setStepResultsMap(prev => ({
          ...prev,
          ['__final_transform__']: result.error || 'Transform execution failed'
        }));
      }
    } finally {
      if (selfHealing) {
        setIsFixingTransform(false);
      } else {
        setIsRunningTransform(false);
      }
    }
  };

  const handleOpenFixTransformDialog = () => {
    setShowFixTransformDialog(true);
  };

  const handleCloseFixTransformDialog = () => {
    setShowFixTransformDialog(false);
  };

  const handleFixTransformSuccess = (newTransform: string, transformedData: any) => {
    setFinalTransform(newTransform);
    setCompletedSteps(prev => Array.from(new Set([...prev.filter(id => id !== '__final_transform__'), '__final_transform__'])));
    setFailedSteps(prev => prev.filter(id => id !== '__final_transform__'));
    setStepResultsMap(prev => ({ ...prev, __final_transform__: transformedData }));
    setFinalPreviewResult(transformedData);
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

  const currentTool = useMemo(() => ({
    id: toolId,
    steps,
    instruction: instructions,
    finalTransform,
    responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
    inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
    createdAt: initialTool?.createdAt,
    updatedAt: initialTool?.updatedAt
  } as Tool), [toolId, steps, instructions, finalTransform, responseSchema, inputSchema, initialTool]);

  // Tool action buttons next to the name
  const toolActionButtons = !embedded ? (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowRenameDialog(true)}
              disabled={!toolId.trim()}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Rename Tool</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowDuplicateDialog(true)}
              disabled={!toolId.trim()}
            >
              <CopyPlus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Duplicate Tool</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowDeleteDialog(true)}
              disabled={!toolId.trim()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Delete Tool</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  ) : null;

  // Default header actions for standalone mode
  const defaultHeaderActions = (
    <div className="flex items-center gap-2">
      {loading ? (
        <Button
          variant="destructive"
          onClick={handleStopExecution}
          disabled={saving || (isExecutingStep !== undefined) || isExecutingTransform || isStopping}
          className="h-9 px-4"
        >
          {isStopping ? "Stopping..." : "Stop Execution"}
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={handleRunAllSteps}
          disabled={loading || saving || (isExecutingStep !== undefined) || isExecutingTransform}
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
      {!embedded && (
        <Button
          variant="outline"
          onClick={async () => {
            await saveTool();
            setShowDeployModal(true);
          }}
          className="h-9 px-5"
          disabled={saving || loading}
        >
          <CloudUpload className="h-4 w-4" />
          Deploy
        </Button>
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
        ) : saveButtonText}
      </Button>
    </div>
  );

  if (showToolBuilder) {
    // Extract just the payload schema (what user sees in input card), not the full input schema
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
          initialIntegrationIds={getMergedIntegrationIds()}
          initialInstruction={instructions}
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
        <>
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
        </>
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
                  steps={steps}
                  stepResults={stepResultsMap}
                  finalTransform={finalTransform}
                  finalResult={finalPreviewResult}
                  responseSchema={responseSchema}
                  toolId={toolId}
                  instruction={instructions}
                  onStepsChange={handleStepsChange}
                  onStepEdit={handleStepEdit}
                  onExecuteStep={handleExecuteStep}
                  onExecuteStepWithLimit={handleExecuteStepWithLimit}
                  onOpenFixStepDialog={handleOpenFixStepDialog}
                  onExecuteTransform={handleExecuteTransform}
                  onOpenFixTransformDialog={handleOpenFixTransformDialog}
                  onFinalTransformChange={setFinalTransform}
                  onResponseSchemaChange={setResponseSchema}
                  onPayloadChange={setManualPayloadText}
                  onInstructionEdit={embedded ? onInstructionEdit : undefined}
                  toolActionButtons={toolActionButtons}
                  integrations={integrations}
                  isExecuting={loading}
                  isExecutingStep={isExecutingStep}
                  isRunningTransform={isRunningTransform}
                  isFixingTransform={isFixingTransform}
                  currentExecutingStepIndex={currentExecutingStepIndex}
                  completedSteps={completedSteps}
                  failedSteps={failedSteps}
                  inputSchema={inputSchema}
                  onInputSchemaChange={(v) => setInputSchema(v)}
                  payloadText={manualPayloadText}
                  computedPayload={computedPayload}
                  headerActions={headerActions !== undefined ? headerActions : defaultHeaderActions}
                  navigateToFinalSignal={navigateToFinalSignal}
                  showStepOutputSignal={showStepOutputSignal}
                  focusStepId={focusStepId}
                  uploadedFiles={uploadedFiles}
                  onFilesUpload={handleFilesUpload}
                  onFileRemove={handleFileRemove}
                  isProcessingFiles={isProcessingFiles}
                  totalFileSize={totalFileSize}
                  filePayloads={filePayloads}
                  isPayloadValid={isPayloadValid}
                  onPayloadUserEdit={() => setHasUserEditedPayload(true)}
                  embedded={embedded}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showInvalidPayloadDialog} onOpenChange={setShowInvalidPayloadDialog}>
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
              setShowInvalidPayloadDialog(false);
              executeTool();
            }}>
              Run Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {fixStepIndex !== null && (
        <FixStepDialog
          open={showFixStepDialog}
          onClose={handleCloseFixStepDialog}
          step={steps[fixStepIndex]}
          stepInput={buildEvolvingPayload(computedPayload || {}, steps, stepResultsMap, fixStepIndex - 1)}
          integrationId={steps[fixStepIndex]?.integrationId}
          errorMessage={
            typeof stepResultsMap[steps[fixStepIndex]?.id] === 'string'
              ? stepResultsMap[steps[fixStepIndex]?.id]
              : stepResultsMap[steps[fixStepIndex]?.id]?.error
          }
          onSuccess={handleFixStepSuccess}
          onAutoHeal={handleAutoHealStep}
        />
      )}

      {pendingModifyStepIndex !== null && (
        <ModifyStepConfirmDialog
          open={showModifyStepConfirm}
          stepId={steps[pendingModifyStepIndex]?.id}
          stepName={steps[pendingModifyStepIndex]?.name}
          onConfirm={handleModifyStepConfirm}
          onCancel={handleModifyStepCancel}
        />
      )}

      <ToolDeployModal
        currentTool={{
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
          instruction: instructions
        }}
        payload={computedPayload}
        isOpen={showDeployModal}
        onClose={() => setShowDeployModal(false)}
      />

      <RenameToolDialog
        tool={currentTool}
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onRenamed={handleRenamed}
      />

      <DuplicateToolDialog
        tool={currentTool}
        isOpen={showDuplicateDialog}
        onClose={() => setShowDuplicateDialog(false)}
        onDuplicated={handleDuplicated}
      />

      <DeleteConfigDialog
        config={{ ...currentTool, type: 'tool' } as any}
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onDeleted={handleDeleted}
      />

      <FixTransformDialog
        open={showFixTransformDialog}
        onClose={handleCloseFixTransformDialog}
        currentTransform={finalTransform}
        responseSchema={parsedResponseSchema}
        stepData={Object.entries(stepResultsMap)
          .filter(([key]) => key !== '__final_transform__')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})}
        errorMessage={
          typeof stepResultsMap['__final_transform__'] === 'string'
            ? stepResultsMap['__final_transform__']
            : undefined
        }
        onSuccess={handleFixTransformSuccess}
        onLoadingChange={setIsFixingTransform}
      />
    </div>
  );
});

ToolPlayground.displayName = 'ToolPlayground';

export default ToolPlayground;