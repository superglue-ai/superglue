"use client";
import { useConfig } from "@/src/app/config-context";
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { useFileUpload } from '@/src/hooks/use-file-upload';
import { executeFinalTransform, executeSingleStep, executeToolStepByStep, generateUUID, type StepExecutionResult } from "@/src/lib/client-utils";
import { type UploadedFileInfo } from '@/src/lib/file-utils';
import { computeStepOutput } from "@/src/lib/utils";
import { ExecutionStep, Integration, SuperglueClient, Workflow as Tool, WorkflowResult as ToolResult } from "@superglue/client";
import { Loader2, X } from "lucide-react";
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { ToolStepGallery } from "./ToolStepGallery";

export interface ToolPlaygroundProps {
  id?: string;
  embedded?: boolean;
  initialTool?: Tool;
  initialPayload?: string;
  initialInstruction?: string;
  integrations?: Integration[];
  onSave?: (tool: Tool) => Promise<void>;
  onExecute?: (tool: Tool, result: ToolResult) => void;
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

export interface ToolPlaygroundHandle {
  executeTool: (opts?: { selfHealing?: boolean }) => Promise<void>;
  saveTool: () => Promise<void>;
  getCurrentTool: () => Tool;
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
  const [toolId, setToolId] = useState(initialTool?.id || "");
  const [steps, setSteps] = useState<any[]>(initialTool?.steps || []);
  const [finalTransform, setFinalTransform] = useState(initialTool?.finalTransform || `(sourceData) => {
  return {
    result: sourceData
  }
}`);
  const [responseSchema, setResponseSchema] = useState<string>(
    initialTool?.responseSchema ? JSON.stringify(initialTool.responseSchema, null, 2) : ''
  );
  const [inputSchema, setInputSchema] = useState<string | null>(
    initialTool?.inputSchema
      ? JSON.stringify(initialTool.inputSchema, null, 2)
      : null
  );
  const [payload, setPayload] = useState<string>(initialPayload || '{}');

  useEffect(() => {
    if (initialPayload !== undefined) {
      setPayload(initialPayload);
    }
  }, [initialPayload]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
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
  const [isFixingWorkflow, setIsFixingWorkflow] = useState<number | undefined>(undefined);
  const [stepSelfHealingEnabled, setStepSelfHealingEnabled] = useState(false);
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
        ...(step.apiConfig ? {
          apiConfig: {
            id: step.apiConfig.id || step.id,
            ...step.apiConfig,
            pagination: step.apiConfig.pagination || null
          }
        } : {}),
        ...(step.codeConfig ? {
          codeConfig: {
            ...step.codeConfig
          }
        } : {})
      })),
      responseSchema: responseSchema && responseSchema.trim() ? JSON.parse(responseSchema) : null,
      inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
      finalTransform,
      instruction: instructions
    })
  }), [toolId, steps, responseSchema, inputSchema, finalTransform, instructions]);

  const client = useMemo(() => new SuperglueClient({
    endpoint: config.superglueEndpoint,
    apiKey: config.superglueApiKey,
  }), [config.superglueEndpoint, config.superglueApiKey]);

  // File upload hook for local (non-embedded) mode
  const localFileUpload = useFileUpload(client);

  // Use parent state if available (embedded), otherwise use local state
  const uploadedFiles = parentUploadedFiles || localFileUpload.uploadedFiles;
  const totalFileSize = parentTotalFileSize ?? localFileUpload.totalFileSize;
  const isProcessingFiles = parentIsProcessingFiles ?? localFileUpload.isProcessingFiles;
  const filePayloads = parentFilePayloads || localFileUpload.filePayloads;

  // Unified file upload handlers
  const handleFilesUpload = async (files: File[]) => {
    // Use parent handler if available, otherwise use local hook
    if (parentOnFilesUpload) {
      return parentOnFilesUpload(files);
    }
    return localFileUpload.handleFilesUpload(files);
  };

  const handleFileRemove = (key: string) => {
    // Use parent handler if available, otherwise use local hook
    if (parentOnFileRemove) {
      return parentOnFileRemove(key);
    }
    return localFileUpload.handleFileRemove(key);
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

  const loadTool = async (idToLoad: string) => {
    try {
      if (!idToLoad) return;
      setLoading(true);
      setResult(null);
      const tool = await client.getWorkflow(idToLoad);
      if (!tool) {
        throw new Error(`Tool with ID "${idToLoad}" not found.`);
      }
      setToolId(tool.id || '');
      setSteps(tool?.steps?.map(step => {
        return {
          ...step,
          ...(step.apiConfig ? { apiConfig: { ...step.apiConfig, id: step.apiConfig.id || step.id } } : {}),
          ...(step.codeConfig ? { codeConfig: { ...step.codeConfig } } : {})
        };
      }) || []);
      setFinalTransform(tool.finalTransform || `(sourceData) => {
        return {
          result: sourceData
        }
      }`);

      setInstructions(tool.instruction || '');
      setResponseSchema(tool.responseSchema ? JSON.stringify(tool.responseSchema, null, 2) : '');

      setInputSchema(tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : null);
      // Don't modify payload when loading a tool - keep existing or use empty object
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

  const [lastToolId, setLastToolId] = useState<string | undefined>(initialTool?.id);

  useEffect(() => {
    if (initialTool && initialTool.id !== lastToolId) {
      setToolId(initialTool.id || '');
      setSteps(initialTool.steps?.map(step => {
        return {
          ...step,
          ...(step.apiConfig ? { apiConfig: { ...step.apiConfig, id: step.apiConfig.id || step.id } } : {}),
          ...(step.codeConfig ? { codeConfig: { ...step.codeConfig } } : {})
        };
      }) || []);
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
      setPayload('{}');
      setResult(null);
      setFinalPreviewResult(null);
    }
  }, [id, embedded, initialTool]);


  const saveTool = async () => {
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
          ...(step.apiConfig ? {
            apiConfig: {
              id: step.apiConfig.id || step.id,
              ...step.apiConfig,
              pagination: step.apiConfig.pagination || null
            }
          } : {}),
          ...(step.codeConfig ? {
            codeConfig: {
              ...step.codeConfig
            }
          } : {})
        })),
        // Only save responseSchema if it's explicitly enabled (non-empty string)
        responseSchema: responseSchema && responseSchema.trim() ? JSON.parse(responseSchema) : null,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        finalTransform,
        instruction: instructions
      } as any;

      // In embedded mode, use the provided onSave callback
      if (embedded && onSave) {
        await onSave(toolToSave);
      } else {
        // In standalone mode, save to backend
        const savedTool = await client.upsertWorkflow(toolId, toolToSave as any);

        if (!savedTool) {
          throw new Error("Failed to save tool");
        }
        setToolId(savedTool.id);

        toast({
          title: "Tool saved",
          description: `"${savedTool.id}" saved successfully`,
        });
      }
    } catch (error: any) {
      console.error("Error saving tool:", error);
      toast({
        title: "Error saving tool",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const executeTool = async (opts?: { selfHealing?: boolean }) => {
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

      const tool = {
        id: toolId,
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

      const state = await executeToolStepByStep(
        client,
        tool,
        payloadObj,
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
        () => stopSignalRef.current
      );

      if (state.interrupted) {
        toast({
          title: "Tool interrupted",
          description: `Stopped at step ${Math.min(state.currentStepIndex + 1, tool.steps.length)} (${tool.steps[state.currentStepIndex]?.id || 'n/a'})`,
        });
      }

      // Always update steps with returned configuration (API may normalize/update even without self-healing)
      if (state.currentTool.steps) {
        const returnedStepsJson = JSON.stringify(state.currentTool.steps);
        if (originalStepsJson !== returnedStepsJson) {
          setSteps(state.currentTool.steps);
          // Only show toast if self-healing was enabled (otherwise it's likely just normalization)
          if (effectiveSelfHealing) {
            toast({
              title: "Tool configuration updated",
              description: "Self-healing has modified the tool configuration to fix issues.",
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
            success: result.success || !result.error,
            data: result.data || result,
            error: result.error
          })),
        config: {
          id: toolId,
          steps: state.currentTool.steps,
          finalTransform:   state.currentTool.finalTransform || finalTransform,
        } as any
      };
      setResult(wr);

      // Update finalTransform with the self-healed version if it was modified
      if (state.currentTool.finalTransform && effectiveSelfHealing) {
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
          const err = (state.stepResults[firstFailed] as any)?.error || 'Step execution failed';
          toast({
            title: "Step failed",
            description: `${firstFailed}: ${typeof err === 'string' ? err : 'Execution error'}`,
            variant: "destructive"
          });
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
        ...(updatedStep.apiConfig ? { apiConfig: { ...updatedStep.apiConfig, id: updatedStep.apiConfig.id || updatedStep.id } } : {}),
        ...(updatedStep.codeConfig ? { codeConfig: { ...updatedStep.codeConfig } } : {})
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
        codeConfig: s.codeConfig,
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
        setResult(null);
      }
      // Clear marker regardless to avoid stale cascades
      lastUserEditedStepIdRef.current = null;
    }

    // Update previous hashes after processing
    prevStepHashesRef.current = currentHashes;
  }, [steps]);

  const executeStepByIdx = async (idx: number, selfHealing: boolean = false) => {
    try {
      setIsExecutingStep(idx);
      const single = await executeSingleStep(
        client,
        {
          id: toolId,
          steps
        } as any,
        idx,
        JSON.parse(payload || '{}'),
        stepResultsMap,  // Pass accumulated results
        selfHealing
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
  const handleExecuteStep = async (idx: number) => {
    await executeStepByIdx(idx, false);
  };

  const handleFixStep = async (idx: number) => {
    await executeStepByIdx(idx, true);
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
        toolId || 'test',
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
            <HelpTooltip text="Enable self-healing during execution. Slower, but can auto-fix failures in tool steps and transformation code." />
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
          onClick={() => executeTool()}
          disabled={loading || saving || (isExecutingStep !== undefined) || isExecutingTransform}
          className="h-9 px-4"
        >
          Test Tool
        </Button>
      )}
      <Button
        variant="default"
        onClick={saveTool}
        disabled={saving || loading}
        className="h-9 px-5 shadow-md border border-primary/40"
      >
        {saving ? "Saving Tool..." : "Save Tool"}
      </Button>
    </div>
  );

  return (
    <div className={embedded ? "w-full" : "p-6 max-w-none w-full"}>
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
          <h1 className="text-2xl font-bold mb-3 flex-shrink-0">Run and Edit Tool</h1>
        </>
      )}

      <div className="w-full overflow-y-auto pr-4">
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
                <ToolStepGallery
                  steps={steps}
                  stepResults={stepResultsMap}
                  finalTransform={finalTransform}
                  finalResult={result?.data}
                  transformResult={finalPreviewResult}
                  responseSchema={responseSchema}
                  toolId={toolId}
                  instruction={instructions}
                  onStepsChange={handleStepsChange}
                  onStepEdit={handleStepEdit}
                  onExecuteStep={handleExecuteStep}
                  onFixStep={handleFixStep}
                  onExecuteTransform={handleExecuteTransform}
                  onFinalTransformChange={setFinalTransform}
                  onResponseSchemaChange={setResponseSchema}
                  onPayloadChange={setPayload}
                  onToolIdChange={setToolId}
                  onInstructionEdit={embedded ? onInstructionEdit : undefined}
                  integrations={integrations}
                  isExecuting={loading}
                  isExecutingStep={isExecutingStep}
                  isFixingWorkflow={isFixingWorkflow}
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
                  stepSelfHealingEnabled={stepSelfHealingEnabled}
                  onStepSelfHealingChange={setStepSelfHealingEnabled}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

ToolPlayground.displayName = 'ToolPlayground';

export default ToolPlayground;