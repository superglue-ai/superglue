"use client";
import { useConfig } from "@/src/app/config-context";
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { executeFinalTransform, executeSingleStep, executeWorkflowStepByStep, generateUUID, type StepExecutionResult } from "@/src/lib/client-utils";
import { formatBytes, generateUniqueKey, MAX_TOTAL_FILE_SIZE, sanitizeFileName, type UploadedFileInfo } from '@/src/lib/file-utils';
import { computeStepOutput } from "@/src/lib/utils";
import { ExecutionStep, Integration, SuperglueClient, Workflow, WorkflowResult } from "@superglue/client";
import { Loader2, X } from "lucide-react";
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { WorkflowStepGallery } from "./WorkflowStepGallery";

export interface WorkflowPlaygroundProps {
  id?: string;
  embedded?: boolean;
  initialWorkflow?: Workflow;
  initialPayload?: string;
  initialInstruction?: string;
  integrations?: Integration[];
  onSave?: (workflow: Workflow) => Promise<void>;
  onExecute?: (workflow: Workflow, result: WorkflowResult) => void;
  onInstructionEdit?: () => void;
  headerActions?: React.ReactNode;
  hideHeader?: boolean;
  readOnly?: boolean;
  selfHealingEnabled?: boolean;
  onSelfHealingChange?: (enabled: boolean) => void;
  shouldStopExecution?: boolean;
  onStopExecution?: () => void;
  uploadedFiles?: UploadedFileInfo[];
  onFilesUpload?: (files: File[]) => Promise<void>;
  onFileRemove?: (key: string) => void;
  isProcessingFiles?: boolean;
  totalFileSize?: number;
  filePayloads?: Record<string, any>;
}

export interface WorkflowPlaygroundHandle {
  executeWorkflow: (opts?: { selfHealing?: boolean }) => Promise<void>;
  saveWorkflow: () => Promise<void>;
  getCurrentWorkflow: () => Workflow;
}

const WorkflowPlayground = forwardRef<WorkflowPlaygroundHandle, WorkflowPlaygroundProps>(({
  id,
  embedded = false,
  initialWorkflow,
  initialPayload,
  initialInstruction,
  integrations: providedIntegrations,
  onSave,
  onExecute,
  onInstructionEdit,
  headerActions,
  hideHeader = false,
  readOnly = false,
  selfHealingEnabled: externalSelfHealingEnabled,
  onSelfHealingChange,
  shouldStopExecution: externalShouldStop,
  onStopExecution,
  uploadedFiles: parentUploadedFiles,
  onFilesUpload: parentOnFilesUpload,
  onFileRemove: parentOnFileRemove,
  isProcessingFiles: parentIsProcessingFiles,
  totalFileSize: parentTotalFileSize,
  filePayloads: parentFilePayloads
}, ref) => {
  const router = useRouter();
  const { toast } = useToast();
  const config = useConfig();
  const [workflowId, setWorkflowId] = useState(initialWorkflow?.id || "");
  const [steps, setSteps] = useState<any[]>(initialWorkflow?.steps || []);
  const [finalTransform, setFinalTransform] = useState(initialWorkflow?.finalTransform || `(sourceData) => {
  return {
    result: sourceData
  }
}`);
  const [responseSchema, setResponseSchema] = useState<string>(
    initialWorkflow?.responseSchema ? JSON.stringify(initialWorkflow.responseSchema, null, 2) : ''
  );
  const [inputSchema, setInputSchema] = useState<string | null>(
    initialWorkflow?.inputSchema
      ? JSON.stringify(initialWorkflow.inputSchema, null, 2)
      : null
  );
  const [payload, setPayload] = useState<string>(initialPayload || '{}');

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

  useEffect(() => {
    if (initialPayload !== undefined) {
      setPayload(initialPayload);
    }
  }, [initialPayload]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [failedSteps, setFailedSteps] = useState<string[]>([]);
  const [navigateToFinalSignal, setNavigateToFinalSignal] = useState<number>(0);
  const [showStepOutputSignal, setShowStepOutputSignal] = useState<number>(0);
  const [focusStepId, setFocusStepId] = useState<string | null>(null);
  const [stepResultsMap, setStepResultsMap] = useState<Record<string, any>>({});
  const [isExecutingTransform, setIsExecutingTransform] = useState<boolean>(false);
  const [finalPreviewResult, setFinalPreviewResult] = useState<any>(null);
  // Track last user-edited step and previous step hashes to drive robust cascades
  const lastUserEditedStepIdRef = useRef<string | null>(null);
  const prevStepHashesRef = useRef<string[]>([]);

  const [integrations, setIntegrations] = useState<Integration[]>(providedIntegrations || []);
  const [instructions, setInstructions] = useState<string>(initialInstruction || '');

  useEffect(() => {
    if (embedded && initialInstruction !== undefined) {
      setInstructions(initialInstruction);
    }
  }, [embedded, initialInstruction]);
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(externalSelfHealingEnabled ?? true);
  const [isExecutingStep, setIsExecutingStep] = useState<number | undefined>(undefined);
  const [currentExecutingStepIndex, setCurrentExecutingStepIndex] = useState<number | undefined>(undefined);
  const [isStopping, setIsStopping] = useState(false);
  // Single source of truth for stopping across modes (embedded/standalone)
  const stopSignalRef = useRef<boolean>(false);

  useEffect(() => {
    if (externalSelfHealingEnabled !== undefined) {
      setSelfHealingEnabled(externalSelfHealingEnabled);
    }
  }, [externalSelfHealingEnabled]);

  const handleSelfHealingChange = (enabled: boolean) => {
    setSelfHealingEnabled(enabled);
    if (onSelfHealingChange) {
      onSelfHealingChange(enabled);
    }
  };

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
        title: "Stopping workflow",
        description: "Workflow will stop after the current step completes",
      });
    }
  };

  useImperativeHandle(ref, () => ({
    executeWorkflow,
    saveWorkflow,
    getCurrentWorkflow: () => ({
      id: workflowId,
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
    })
  }), [workflowId, steps, responseSchema, inputSchema, finalTransform, instructions]);

  const client = useMemo(() => new SuperglueClient({
    endpoint: config.superglueEndpoint,
    apiKey: config.superglueApiKey,
  }), [config.superglueEndpoint, config.superglueApiKey]);

  // Unified file upload handlers
  const handleFilesUpload = async (files: File[]) => {
    // Use parent handler if available, otherwise handle locally
    if (parentOnFilesUpload) {
      return parentOnFilesUpload(files);
    }

    // Local handling for non-embedded mode
    setLocalIsProcessingFiles(true);

    try {
      const newSize = files.reduce((sum, f) => sum + f.size, 0);
      if (localTotalFileSize + newSize > MAX_TOTAL_FILE_SIZE) {
        toast({
          title: 'Size limit exceeded',
          description: `Total file size cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE)}`,
          variant: 'destructive'
        });
        return;
      }

      const existingKeys = localUploadedFiles.map(f => f.key);
      const newFiles: UploadedFileInfo[] = [];

      for (const file of files) {
        try {
          const baseKey = sanitizeFileName(file.name);
          const key = generateUniqueKey(baseKey, [...existingKeys, ...newFiles.map(f => f.key)]);

          const fileInfo: UploadedFileInfo = {
            name: file.name,
            size: file.size,
            key,
            status: 'processing'
          };
          newFiles.push(fileInfo);
          setLocalUploadedFiles(prev => [...prev, fileInfo]);

          const extractResult = await client.extract({
            file: file
          });

          if (!extractResult.success) {
            throw new Error(extractResult.error || 'Failed to extract data');
          }
          const parsedData = extractResult.data;
          setLocalFilePayloads(prev => ({ ...prev, [key]: parsedData }));
          existingKeys.push(key);

          setLocalUploadedFiles(prev => prev.map(f =>
            f.key === key ? { ...f, status: 'ready' } : f
          ));

        } catch (error: any) {
          const fileInfo = newFiles.find(f => f.name === file.name);
          if (fileInfo) {
            setLocalUploadedFiles(prev => prev.map(f =>
              f.key === fileInfo.key
                ? { ...f, status: 'error', error: error.message }
                : f
            ));
          }

          toast({
            title: 'File processing failed',
            description: `Failed to parse ${file.name}: ${error.message}`,
            variant: 'destructive'
          });
        }
      }
      setLocalTotalFileSize(prev => prev + newSize);

    } finally {
      setLocalIsProcessingFiles(false);
    }
  };

  const handleFileRemove = (key: string) => {
    // Use parent handler if available
    if (parentOnFileRemove) {
      return parentOnFileRemove(key);
    }

    // Local handling
    const fileToRemove = localUploadedFiles.find(f => f.key === key);
    if (!fileToRemove) return;

    setLocalFilePayloads(prev => {
      const newPayloads = { ...prev };
      delete newPayloads[key];
      return newPayloads;
    });
    setLocalUploadedFiles(prev => prev.filter(f => f.key !== key));
    setLocalTotalFileSize(prev => Math.max(0, prev - fileToRemove.size));
  };


  const loadIntegrations = async () => {
    if (providedIntegrations) return;

    try {
      setLoading(true);
      const result = await client.listIntegrations(100, 0);
      setIntegrations(result.items);
      return result.items;
    } catch (error: any) {
      console.error("Error loading integrations:", error);
      toast({
        title: "Error loading integrations",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadWorkflow = async (idToLoad: string) => {
    try {
      if (!idToLoad) return;
      setLoading(true);
      setResult(null);
      const workflow = await client.getWorkflow(idToLoad);
      if (!workflow) {
        throw new Error(`Workflow with ID "${idToLoad}" not found.`);
      }
      setWorkflowId(workflow.id || '');
      setSteps(workflow?.steps?.map(step => ({ ...step, apiConfig: { ...step.apiConfig, id: step.apiConfig.id || step.id } })) || []);
      setFinalTransform(workflow.finalTransform || `(sourceData) => {
        return {
          result: sourceData
        }
      }`);

      setInstructions(workflow.instruction || '');
      setResponseSchema(workflow.responseSchema ? JSON.stringify(workflow.responseSchema, null, 2) : '');

      setInputSchema(workflow.inputSchema ? JSON.stringify(workflow.inputSchema, null, 2) : null);
      // Don't modify payload when loading a workflow - keep existing or use empty object
    } catch (error: any) {
      console.error("Error loading workflow:", error);
      toast({
        title: "Error loading workflow",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (!embedded && !providedIntegrations) {
      loadIntegrations();
    }
  }, [embedded, providedIntegrations]);

  useEffect(() => {
    if (providedIntegrations) {
      setIntegrations(providedIntegrations);
    }
  }, [providedIntegrations]);

  const [lastWorkflowId, setLastWorkflowId] = useState<string | undefined>(initialWorkflow?.id);

  useEffect(() => {
    if (initialWorkflow && initialWorkflow.id !== lastWorkflowId) {
      setWorkflowId(initialWorkflow.id || '');
      setSteps(initialWorkflow.steps?.map(step => ({
        ...step,
        apiConfig: { ...step.apiConfig, id: step.apiConfig.id || step.id }
      })) || []);
      setFinalTransform(initialWorkflow.finalTransform || `(sourceData) => {
  return {
    result: sourceData
  }
}`);
      const schemaString = initialWorkflow.responseSchema ? JSON.stringify(initialWorkflow.responseSchema, null, 2) : '';
      setResponseSchema(schemaString);
      setInputSchema(initialWorkflow.inputSchema ? JSON.stringify(initialWorkflow.inputSchema, null, 2) : null);
      setInstructions(initialInstruction || initialWorkflow.instruction || '');
      setLastWorkflowId(initialWorkflow.id);
    }
  }, [initialWorkflow, embedded, lastWorkflowId, initialInstruction]);

  useEffect(() => {
    if (!embedded && id) {
      loadWorkflow(id);
    } else if (!embedded && !id && !initialWorkflow) {
      setWorkflowId("");
      setSteps([]);
      setInstructions("");
      setFinalTransform(`(sourceData) => {
  return {
    result: sourceData
  }
}`);
      setResponseSchema('');
      setInputSchema(null);
      setPayload('{}');
      setResult(null);
      setFinalPreviewResult(null);
    }
  }, [id, embedded, initialWorkflow]);


  const saveWorkflow = async () => {
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

      if (!workflowId.trim()) {
        setWorkflowId(`wf-${Date.now()}`);
      }
      setSaving(true);

      // Always use the current steps (which include any self-healed updates)
      const stepsToSave = steps;

      const workflowToSave: Workflow = {
        id: workflowId,
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
        await onSave(workflowToSave);
      } else {
        // In standalone mode, save to backend
        const savedWorkflow = await client.upsertWorkflow(workflowId, workflowToSave as any);

        if (!savedWorkflow) {
          throw new Error("Failed to save workflow");
        }
        setWorkflowId(savedWorkflow.id);

        toast({
          title: "Workflow saved",
          description: `"${savedWorkflow.id}" saved successfully`,
        });
      }
    } catch (error: any) {
      console.error("Error saving workflow:", error);
      toast({
        title: "Error saving workflow",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const executeWorkflow = async (opts?: { selfHealing?: boolean }) => {
    setLoading(true);
    // Fully clear any stale stop signals from a previous run (both modes)
    stopSignalRef.current = false;
    setIsStopping(false);
    setCompletedSteps([]);
    setFailedSteps([]);
    setResult(null);
    setFinalPreviewResult(null);
    setStepResultsMap({});
    setError(null);
    setFocusStepId(null);

    try {
      JSON.parse(responseSchema || '{}');
      JSON.parse(inputSchema || '{}');

      // Always use the current steps for execution
      const executionSteps = steps;
      const currentResponseSchema = responseSchema && responseSchema.trim() ? JSON.parse(responseSchema) : null;
      const effectiveSelfHealing = opts?.selfHealing ?? selfHealingEnabled;

      const workflow = {
        id: workflowId,
        steps: executionSteps,
        finalTransform,
        responseSchema: currentResponseSchema,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
      } as any;

      // Store original steps to compare against self-healed result
      const originalStepsJson = JSON.stringify(executionSteps);

      // Merge manual payload with file payloads for execution
      const manualPayload = JSON.parse(payload || '{}');
      const payloadObj = { ...manualPayload, ...filePayloads };
      setCurrentExecutingStepIndex(0);

      const state = await executeWorkflowStepByStep(
        client,
        workflow,
        payloadObj,
        (i: number, res: StepExecutionResult) => {
          if (i < workflow.steps.length - 1) {
            setCurrentExecutingStepIndex(i + 1);
          } else {
            setCurrentExecutingStepIndex(workflow.steps.length);
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
        () => stopSignalRef.current
      );

      if (state.interrupted) {
        toast({
          title: "Workflow interrupted",
          description: `Stopped at step ${Math.min(state.currentStepIndex + 1, workflow.steps.length)} (${workflow.steps[state.currentStepIndex]?.id || 'n/a'})`,
        });
      }

      // Always update steps with returned configuration (API may normalize/update even without self-healing)
      if (state.currentWorkflow.steps) {
        const returnedStepsJson = JSON.stringify(state.currentWorkflow.steps);
        if (originalStepsJson !== returnedStepsJson) {
          setSteps(state.currentWorkflow.steps);
          // Only show toast if self-healing was enabled (otherwise it's likely just normalization)
          if (effectiveSelfHealing) {
            toast({
              title: "Workflow configuration updated",
              description: "Self-healing has modified the workflow configuration to fix issues.",
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
      
      const wr: WorkflowResult = {
        id: generateUUID(),
        success: state.failedSteps.length === 0,
        data: finalData,
        error: state.stepResults['__final_transform__']?.error,
        startedAt: new Date(),
        completedAt: new Date(),
        stepResults: Object.entries(state.stepResults)
          .filter(([key]) => key !== '__final_transform__')
          .map(([stepId, result]) => ({
            stepId,
            success: result.success || !result.error,
            data: result.data || result,
            error: result.error
          })),
        config: {
          id: workflowId,
          steps: state.currentWorkflow.steps,
          finalTransform: state.currentWorkflow.finalTransform || finalTransform,
        } as any
      };
      setResult(wr);

      // Update finalTransform with the self-healed version if it was modified
      if (state.currentWorkflow.finalTransform && effectiveSelfHealing) {
        setFinalTransform(state.currentWorkflow.finalTransform);
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
          const err = (state.stepResults[firstFailed] as any)?.error || 'Step execution failed';
          toast({
            title: "Step failed",
            description: `${firstFailed}: ${typeof err === 'string' ? err : 'Execution error'}`,
            variant: "destructive"
          });
        }
      }

      if (onExecute) {
        const executedWorkflow = {
          id: workflowId,
          steps: executionSteps,
          finalTransform: state.currentWorkflow.finalTransform || finalTransform,
          responseSchema: currentResponseSchema,
          inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
          instruction: instructions
        } as Workflow;
        onExecute(executedWorkflow, wr);
      }
    } catch (error: any) {
      console.error("Error executing workflow:", error);
      toast({
        title: "Error executing workflow",
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
        loopMaxIters: s.loopMaxIters,
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
        // Reset ONLY the edited step and final transform; keep prior failures/outputs for other steps
        const editedOnly = steps[idxOfEdited]?.id;
        setCompletedSteps(prev => prev.filter(id => id !== editedOnly && id !== '__final_transform__'));
        setFailedSteps(prev => prev.filter(id => id !== editedOnly && id !== '__final_transform__'));
        setStepResultsMap(prev => {
          const next = { ...prev } as Record<string, any>;
          if (editedOnly) delete next[editedOnly];
          delete next['__final_transform__'];
          return next;
        });
        setFinalPreviewResult(null);
        setResult(null);
      }
      // Clear marker regardless to avoid stale cascades
      lastUserEditedStepIdRef.current = null;
    }

    // Update previous hashes after processing
    prevStepHashesRef.current = currentHashes;
  }, [steps]);

  const handleExecuteStep = async (idx: number) => {
    try {
      // mark testing state for indicator without freezing entire UI
      setIsExecutingStep(idx);
      const single = await executeSingleStep(
        client,
        {
          id: workflowId,
          steps
        } as any,
        idx,
        JSON.parse(payload || '{}'),
        stepResultsMap,  // Pass accumulated results
        false
      );
      const sid = steps[idx].id;
      const normalized = computeStepOutput(single);
      const isFailure = !single.success;

      // Update step configuration if API returned changes
      if (single.updatedStep) {
        setSteps(prevSteps =>
          prevSteps.map((step, i) => i === idx ? single.updatedStep : step)
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
      if (isFailure) {
        toast({
          title: "Step failed",
          description: `${sid}: ${single.error || 'Execution error'}`,
          variant: "destructive"
        });
      }
    } finally {
      setIsExecutingStep(undefined);
    }
  };

  const handleExecuteTransform = async (schemaStr: string, transformStr: string) => {
    try {
      setIsExecutingTransform(true);

      // Build the payload with all step results
      const stepData: Record<string, any> = {};
      Object.entries(stepResultsMap).forEach(([stepId, result]) => {
        if (stepId !== '__final_transform__') {
          stepData[stepId] = result?.data !== undefined ? result.data : result;
        }
      });
      const parsedResponseSchema = schemaStr && schemaStr.trim() ? JSON.parse(schemaStr) : null;
      const manualPayload = JSON.parse(payload || '{}');
      const fullPayload = { ...manualPayload, ...filePayloads };

      const result = await executeFinalTransform(
        client,
        workflowId || 'test',
        transformStr || finalTransform,
        parsedResponseSchema,
        inputSchema ? JSON.parse(inputSchema) : null,
        fullPayload,
        stepData,
        false
      );

      if (result.success) {
        setCompletedSteps(prev => Array.from(new Set([...prev.filter(id => id !== '__final_transform__'), '__final_transform__'])));
        setFailedSteps(prev => prev.filter(id => id !== '__final_transform__'));
        setStepResultsMap(prev => ({ ...prev, ['__final_transform__']: result.data }));
        setFinalPreviewResult(result.data);
        setNavigateToFinalSignal(Date.now());
        toast({
          title: "Transform executed successfully",
          description: "Final transform completed",
        });
      } else {
        setFailedSteps(prev => Array.from(new Set([...prev.filter(id => id !== '__final_transform__'), '__final_transform__'])));
        setCompletedSteps(prev => prev.filter(id => id !== '__final_transform__'));
        // Store error message for display
        setStepResultsMap(prev => ({
          ...prev,
          ['__final_transform__']: result.error || 'Transform execution failed'
        }));
        toast({
          title: "Transform execution failed",
          description: result.error || "Failed to execute final transform",
          variant: "destructive",
        });
      }
    } finally {
      setIsExecutingTransform(false);
    }
  };

  // Default header actions for standalone mode
  const defaultHeaderActions = (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 mr-2">
        <Label htmlFor="selfHealing-top" className="text-xs flex items-center gap-1">
          <span>Self-healing</span>
        </Label>
        <div className="flex items-center">
          <Switch className="custom-switch" id="selfHealing-top" checked={selfHealingEnabled} onCheckedChange={handleSelfHealingChange} />
          <div className="ml-1 flex items-center">
            <HelpTooltip text="Enable self-healing during execution. Slower, but can auto-fix failures in workflow steps and transformation code." />
          </div>
        </div>
      </div>
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
          variant="success"
          onClick={() => executeWorkflow()}
          disabled={loading || saving || (isExecutingStep !== undefined) || isExecutingTransform}
          className="h-9 px-4"
        >
          Test Workflow
        </Button>
      )}
      <Button
        variant="default"
        onClick={saveWorkflow}
        disabled={saving || loading}
        className="h-9 px-5 shadow-md border border-primary/40"
      >
        {saving ? "Saving Workflow..." : "Save Workflow"}
      </Button>
    </div>
  );

  return (
    <div className={embedded ? "w-full" : "p-6 max-w-none w-full"} style={{ scrollbarGutter: 'stable both-edges' }}>
      {!embedded && !hideHeader && (
        <>
          <div className="flex justify-end items-center mb-2">
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
          <h1 className="text-2xl font-bold mb-3 flex-shrink-0">Workflows</h1>
        </>
      )}

      <div className="w-full overflow-y-auto pr-4" style={{ maxHeight: 'calc(100vh - 140px)', scrollbarGutter: 'stable both-edges' }}>
        <div className="w-full">
          <div className="space-y-4">
            <div className={embedded ? "" : "mb-4"}>
              {loading && steps.length === 0 && !instructions ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-foreground" />
                  </div>
                </div>
              ) : (
                <WorkflowStepGallery
                  steps={steps}
                  stepResults={stepResultsMap}
                  finalTransform={finalTransform}
                  finalResult={result?.data}
                  transformResult={finalPreviewResult}
                  responseSchema={responseSchema}
                  workflowId={workflowId}
                  instruction={instructions}
                  onStepsChange={handleStepsChange}
                  onStepEdit={handleStepEdit}
                  onExecuteStep={handleExecuteStep}
                  onExecuteTransform={handleExecuteTransform}
                  onFinalTransformChange={setFinalTransform}
                  onResponseSchemaChange={setResponseSchema}
                  onPayloadChange={setPayload}
                  onWorkflowIdChange={setWorkflowId}
                  onInstructionEdit={embedded ? onInstructionEdit : undefined}
                  integrations={integrations}
                  isExecuting={loading}
                  isExecutingStep={isExecutingStep}
                  isExecutingTransform={isExecutingTransform as any}
                  currentExecutingStepIndex={currentExecutingStepIndex}
                  completedSteps={completedSteps}
                  failedSteps={failedSteps}
                  readOnly={readOnly}
                  inputSchema={inputSchema}
                  onInputSchemaChange={(v) => setInputSchema(v)}
                  payloadText={payload}
                  headerActions={headerActions || (!embedded ? defaultHeaderActions : undefined)}
                  navigateToFinalSignal={navigateToFinalSignal}
                  showStepOutputSignal={showStepOutputSignal}
                  focusStepId={focusStepId}
                  uploadedFiles={uploadedFiles}
                  onFilesUpload={handleFilesUpload}
                  onFileRemove={handleFileRemove}
                  isProcessingFiles={isProcessingFiles}
                  totalFileSize={totalFileSize}
                  filePayloads={filePayloads}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

WorkflowPlayground.displayName = 'WorkflowPlayground';

export default WorkflowPlayground;