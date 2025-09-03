"use client";
import { useConfig } from "@/src/app/config-context";
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { executeFinalTransform, executeSingleStep, executeWorkflowStepByStep, type StepExecutionResult } from "@/src/lib/client-utils";
import { ExecutionStep, Integration, SuperglueClient, Workflow, WorkflowResult } from "@superglue/client";
import { X } from "lucide-react";
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
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
  onSelfHealingChange
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
      : `{"type": "object", "properties": {"payload": {"type": "object"}}}`
  );
  const [payload, setPayload] = useState<string>(initialPayload || '{}');

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
  const [stepResultsMap, setStepResultsMap] = useState<Record<string, any>>({});
  const [isExecutingTransform, setIsExecutingTransform] = useState<boolean>(false);
  const [finalPreviewResult, setFinalPreviewResult] = useState<any>(null);

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

  const generateDefaultFromSchema = (schema: any): any => {
    if (!schema || typeof schema !== 'object') return {};

    if (schema.type === 'object' && schema.properties) {
      const result: any = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        result[key] = generateDefaultFromSchema(propSchema);
      }
      return result;
    }

    if (schema.type === 'array') {
      return [];
    }

    if (schema.type === 'string') {
      return schema.default || '';
    }

    if (schema.type === 'number' || schema.type === 'integer') {
      return schema.default || 0;
    }

    if (schema.type === 'boolean') {
      return schema.default || false;
    }

    return schema.default || null;
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

      const inputSchemaStr = workflow.inputSchema
        ? JSON.stringify(workflow.inputSchema, null, 2)
        : `{"type": "object", "properties": {"payload": {"type": "object"}}}`;
      setInputSchema(inputSchemaStr);

      constructFromInputSchemaWithCreds(inputSchemaStr, {});

      toast({
        title: "Workflow loaded",
        description: `Loaded "${workflow.id}" successfully`,
      });
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

  const constructFromInputSchemaWithCreds = (schema: string | null, _integCreds: Record<string, string>) => {
    if (!schema) return;

    try {
      const parsedSchema = JSON.parse(schema);
      const defaultValues = generateDefaultFromSchema(parsedSchema);

      if (defaultValues.payload !== undefined && defaultValues.payload !== null) {
        setPayload(JSON.stringify(defaultValues.payload, null, 1));
      } else {
        setPayload('{}');
      }
    } catch (error) {
      console.warn('Failed to construct from input schema:', error);
    }
  };

  const constructFromInputSchema = (schema: string | null) => {
    constructFromInputSchemaWithCreds(schema, {});
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
      if (embedded) {
        setResponseSchema('');  // Always disabled in create stepper
      } else {
        setResponseSchema(initialWorkflow.responseSchema ? JSON.stringify(initialWorkflow.responseSchema, null, 2) : '');
      }
      setInputSchema(initialWorkflow.inputSchema ? JSON.stringify(initialWorkflow.inputSchema, null, 2) : `{"type": "object", "properties": {"payload": {"type": "object"}}}`);
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
      const defaultInputSchema = '{"type": "object", "properties": {"payload": {"type": "object"}}}';
      setInputSchema(defaultInputSchema);
      // Construct default credentials and payload from default schema
      constructFromInputSchema(defaultInputSchema);
      setResult(null);
      setFinalPreviewResult(null);
    }
  }, [id, embedded, initialWorkflow]);

  // Effect to update payload when input schema changes (but not during workflow loading)
  useEffect(() => {
    // Only run this if we're not in the middle of loading a workflow and not in embedded mode with initial payload
    if (!loading && !initialPayload) {
      constructFromInputSchema(inputSchema);
    }
  }, [inputSchema, loading, initialPayload]);

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

        router.push(`/workflows/${savedWorkflow.id}`);
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
    setCompletedSteps([]);
    setFailedSteps([]);
    setResult(null);
    setFinalPreviewResult(null);
    setStepResultsMap({});
    setError(null);

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
        inputSchema: inputSchema ? JSON.parse(inputSchema) : { type: "object" },
      } as any;

      // Store original steps to compare against self-healed result
      const originalStepsJson = JSON.stringify(executionSteps);

      const payloadObj = JSON.parse(payload || '{}');
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
        },
        effectiveSelfHealing
      );

      // Update steps with self-healed configuration if self-healing made changes
      if (effectiveSelfHealing && state.currentWorkflow.steps) {
        const healedStepsJson = JSON.stringify(state.currentWorkflow.steps);
        if (originalStepsJson !== healedStepsJson) {
          setSteps(state.currentWorkflow.steps);
          toast({
            title: "Workflow configuration updated",
            description: "Self-healing has modified the workflow configuration to fix issues.",
          });
        }
      }

      const stepDataMap: Record<string, any> = {};
      Object.entries(state.stepResults).forEach(([stepId, result]) => {
        stepDataMap[stepId] = result.data;
      });
      setStepResultsMap(stepDataMap);

      const finalData = state.stepResults['__final_transform__']?.data;
      setFinalPreviewResult(finalData);
      const wr: WorkflowResult = {
        id: crypto.randomUUID(),
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

      if (state.failedSteps.length === 0) {
        setNavigateToFinalSignal(Date.now());
      }

      if (onExecute) {
        const executedWorkflow = {
          id: workflowId,
          steps: executionSteps,
          finalTransform: state.currentWorkflow.finalTransform || finalTransform,
          responseSchema: currentResponseSchema,
          inputSchema: inputSchema ? JSON.parse(inputSchema) : { type: "object" },
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
      setCurrentExecutingStepIndex(undefined);
    }
  };

  const handleStepsChange = (newSteps: any[]) => {
    setSteps(newSteps);
  };

  const handleStepEdit = (stepId: string, updatedStep: any) => {
    setSteps(prevSteps =>
      prevSteps.map(step => (step.id === stepId ? { ...updatedStep, apiConfig: { ...updatedStep.apiConfig, id: updatedStep.apiConfig.id || updatedStep.id } } : step))
    );

    // Find the index of the edited step
    const stepIndex = steps.findIndex(s => s.id === stepId);
    if (stepIndex !== -1) {
      // Reset completion status for edited step and all subsequent steps
      const stepsToReset = steps.slice(stepIndex).map(s => s.id);

      // Clear both completed and failed states
      setCompletedSteps(prev => prev.filter(id => !stepsToReset.includes(id)));
      setFailedSteps(prev => prev.filter(id => !stepsToReset.includes(id)));

      // Clear execution results for reset steps
      setStepResultsMap(prev => {
        const next = { ...prev } as Record<string, any>;
        stepsToReset.forEach(id => delete next[id]);
        // Also clear final transform if it exists
        delete next['__final_transform__'];
        return next;
      });

      // Reset final transform states
      setFinalPreviewResult(null);
    }
  };

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
      if (single.success) {
        setCompletedSteps(prev => Array.from(new Set([...prev.filter(id => id !== sid), sid])));
        setFailedSteps(prev => prev.filter(id => id !== sid));
        setStepResultsMap(prev => ({ ...prev, [sid]: single.data }));
        // Trigger output panel display
        setShowStepOutputSignal(Date.now());
      } else {
        setFailedSteps(prev => Array.from(new Set([...prev.filter(id => id !== sid), sid])));
        setCompletedSteps(prev => prev.filter(id => id !== sid));
        // Store error message in step results for display
        setStepResultsMap(prev => ({
          ...prev,
          [sid]: single.error || 'Step execution failed'
        }));
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

      const result = await executeFinalTransform(
        client,
        workflowId || 'test',
        transformStr || finalTransform,
        parsedResponseSchema,
        inputSchema ? JSON.parse(inputSchema) : null,
        JSON.parse(payload || '{}'),
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
      <Button
        variant="success"
        onClick={() => executeWorkflow()}
        disabled={loading || saving || (isExecutingStep !== undefined) || isExecutingTransform}
        className="h-9 px-4"
      >
        {loading ? "Testing Workflow..." : "Test Workflow"}
      </Button>
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
          <h1 className="text-2xl font-bold mb-3 flex-shrink-0">Workflows</h1>
        </>
      )}

      <div className="w-full">
        {/* Workflow Configuration */}
        <div className="w-full">
          {/* Steps and Schema Editors */}
          <div className="space-y-4">
            {/* Workflow Steps - response schema now integrated in final transform */}
            <div className={embedded ? "" : "mb-4"}>
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
                onInstructionEdit={embedded ? onInstructionEdit : undefined} // Only show edit button in embedded mode
                integrations={integrations}
                isExecuting={loading}
                isExecutingStep={isExecutingStep}
                isExecutingTransform={isExecutingTransform as any}
                currentExecutingStepIndex={currentExecutingStepIndex}
                completedSteps={completedSteps}
                failedSteps={failedSteps}
                readOnly={readOnly}
                inputSchema={inputSchema}
                onInputSchemaChange={setInputSchema}
                payload={(() => {
                  try {
                    return JSON.parse(payload || '{}');
                  } catch {
                    return {};
                  }
                })()}
                headerActions={headerActions || (!embedded ? defaultHeaderActions : undefined)}
                navigateToFinalSignal={navigateToFinalSignal}
                showStepOutputSignal={showStepOutputSignal}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

WorkflowPlayground.displayName = 'WorkflowPlayground';

export default WorkflowPlayground;