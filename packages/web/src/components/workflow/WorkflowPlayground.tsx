"use client";
import { useConfig } from "@/src/app/config-context";
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { executeSingleStep, executeWorkflowStepByStep, type StepExecutionResult } from "@/src/lib/client-utils";
import { ExecutionStep, Integration, SuperglueClient, WorkflowResult } from "@superglue/client";
import { X } from "lucide-react";
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { WorkflowStepGallery } from "./WorkflowStepGallery";

export default function WorkflowPlayground({ id }: { id?: string; }) {
  const router = useRouter();
  const { toast } = useToast();
  const config = useConfig();
  const [workflowId, setWorkflowId] = useState("");
  const [steps, setSteps] = useState<any[]>([]);
  const [finalTransform, setFinalTransform] = useState(`(sourceData) => {
  return {
    result: sourceData
  }
}`);
  const [responseSchema, setResponseSchema] = useState<string | null>(`{"type": "object", "properties": {"result": {"type": "object"}}}`);
  const [inputSchema, setInputSchema] = useState<string | null>(`{"type": "object", "properties": {"payload": {"type": "object"}}}`);
  const [payload, setPayload] = useState<string>('{}');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [failedSteps, setFailedSteps] = useState<string[]>([]);
  const [navigateToFinalSignal, setNavigateToFinalSignal] = useState<number>(0);
  const [stepResultsMap, setStepResultsMap] = useState<Record<string, any>>({});
  const [isExecutingTransform, setIsExecutingTransform] = useState<boolean>(false);
  const [finalPreviewResult, setFinalPreviewResult] = useState<any>(null);



  const [showResponseSchemaEditor, setShowResponseSchemaEditor] = useState(false);
  const [showInputSchemaEditor, setShowInputSchemaEditor] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [instructions, setInstructions] = useState<string>('');
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(true);
  const [isExecutingStep, setIsExecutingStep] = useState<number | undefined>(undefined);

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
      setResponseSchema(workflow.responseSchema ? JSON.stringify(workflow.responseSchema, null, 2) : null);

      const inputSchemaStr = workflow.inputSchema
        ? JSON.stringify(workflow.inputSchema, null, 2)
        : `{"type": "object", "properties": {"payload": {"type": "object"}}}`;
      setInputSchema(inputSchemaStr);

      constructFromInputSchemaWithCreds(inputSchemaStr, {});

      toast({
        title: "Workflow loaded",
        description: `Loaded \"${workflow.id}\" successfully`,
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

  // Updated function that takes integration credentials as parameter
  const constructFromInputSchemaWithCreds = (schema: string | null, _integCreds: Record<string, string>) => {
    if (!schema) return;

    try {
      const parsedSchema = JSON.parse(schema);
      const defaultValues = generateDefaultFromSchema(parsedSchema);

      // Credentials handling removed

      // Handle payload from schema
      if (defaultValues.payload !== undefined && defaultValues.payload !== null) {
        setPayload(JSON.stringify(defaultValues.payload, null, 1));
      } else {
        setPayload('{}');
      }
    } catch (error) {
      console.warn('Failed to construct from input schema:', error);
    }
  };

  // Update the original function
  const constructFromInputSchema = (schema: string | null) => {
    constructFromInputSchemaWithCreds(schema, {});
  };

  useEffect(() => {
    // Load integrations on component mount
    loadIntegrations();
  }, []);

  useEffect(() => {
    if (id) {
      loadWorkflow(id);
    } else {
      // Reset to a clean slate if id is removed or not provided
      setWorkflowId("");
      setSteps([]);
      setInstructions("");
      setFinalTransform(`(sourceData) => {
  return {
    result: sourceData
  }
}`);
      setResponseSchema('{"type": "object", "properties": {"result": {"type": "object"}}}');
      const defaultInputSchema = '{"type": "object", "properties": {"payload": {"type": "object"}}}';
      setInputSchema(defaultInputSchema);
      // Construct default credentials and payload from default schema
      constructFromInputSchema(defaultInputSchema);
      setResult(null);
      setFinalPreviewResult(null);
    }
  }, [id]);

  // Effect to update payload when input schema changes (but not during workflow loading)
  useEffect(() => {
    // Only run this if we're not in the middle of loading a workflow
    if (!loading) {
      constructFromInputSchema(inputSchema);
    }
  }, [inputSchema]);

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
      const input = {
        id: workflowId,
        steps: steps.map((step: ExecutionStep) => ({
          ...step,
          apiConfig: {
            id: step.apiConfig.id || step.id,
            ...step.apiConfig,
            pagination: step.apiConfig.pagination || null
          }
        })),
        responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : null,
        finalTransform,
        instruction: instructions
      };

      const savedWorkflow = await client.upsertWorkflow(workflowId, input);

      if (!savedWorkflow) {
        throw new Error("Failed to save workflow");
      }
      setWorkflowId(savedWorkflow.id);

      toast({
        title: "Workflow saved",
        description: `"${savedWorkflow.id}" saved successfully`,
      });

      router.push(`/workflows/${savedWorkflow.id}`);
    } catch (error) {
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

  const executeWorkflow = async () => {
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

      const workflow = {
        id: workflowId,
        steps: steps,
        finalTransform,
        responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : { type: "object" },
      } as any;

      const payloadObj = JSON.parse(payload || '{}');

      const state = await executeWorkflowStepByStep(
        client,
        workflow,
        payloadObj,
        (i: number, res: StepExecutionResult) => {
          if (res.success) {
            setCompletedSteps(prev => Array.from(new Set([...prev, res.stepId])));
          } else {
            setFailedSteps(prev => Array.from(new Set([...prev, res.stepId])));
          }
        },
        selfHealingEnabled
      );

      setSteps(state.currentWorkflow.steps);

      const stepResults: Record<string, any> = state.stepResults;
      setStepResultsMap(stepResults);
      const finalData = stepResults['__final_transform__']?.data;
      setFinalPreviewResult(finalData);
      const wr: any = {
        success: state.failedSteps.length === 0,
        data: finalData,
        error: stepResults['__final_transform__']?.error,
        stepResults,
        config: {
          id: workflowId,
          steps: state.currentWorkflow.steps,
          finalTransform,
        } as any
      };
      setResult(wr);
      setFinalTransform(state.currentWorkflow.finalTransform || finalTransform);
      setCompletedSteps(state.completedSteps);
      setFailedSteps(state.failedSteps);

      if (state.failedSteps.length === 0) {
        setNavigateToFinalSignal(Date.now());
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

  // credentials helpers removed

  // credentials integration fetch removed

  return (
    <div className="p-6 max-w-none w-full">
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

      <div className="w-full">
        {/* Workflow Configuration */}
        <div className="w-full">
          {/* Steps and Schema Editors */}
          <div className="space-y-4">
            {/* Workflow Steps - response schema now integrated in final transform */}
            <div className="mb-4">
              <WorkflowStepGallery
                steps={steps}
                stepResults={stepResultsMap}
                finalTransform={finalTransform}
                finalResult={finalPreviewResult}
                responseSchema={responseSchema}
                workflowId={workflowId}
                instruction={instructions}
                onStepsChange={handleStepsChange}
                onStepEdit={handleStepEdit}
                onExecuteStep={async (idx) => {
                  try {
                    // mark testing state for indicator without freezing entire UI
                    setIsExecutingStep(idx);
                    const single = await executeSingleStep(
                      client,
                      { id: workflowId, steps } as any,
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
                }}
                onExecuteTransform={async () => {
                  try {
                    setIsExecutingTransform(true);
                    const state = await executeWorkflowStepByStep(
                      client,
                      { id: workflowId, steps, finalTransform, responseSchema: responseSchema ? JSON.parse(responseSchema) : null, inputSchema: inputSchema ? JSON.parse(inputSchema) : { type: 'object' } } as any,
                      JSON.parse(payload || '{}'),
                      undefined,
                      false
                    );
                    const ft = state.stepResults['__final_transform__'];
                    if (ft?.success) {
                      setCompletedSteps(prev => Array.from(new Set([...prev.filter(id => id !== '__final_transform__'), '__final_transform__'])));
                      setFailedSteps(prev => prev.filter(id => id !== '__final_transform__'));
                      setStepResultsMap(prev => ({ ...prev, ...state.stepResults }));
                      setFinalPreviewResult(ft.data);
                      setNavigateToFinalSignal(Date.now());
                    } else {
                      setFailedSteps(prev => Array.from(new Set([...prev.filter(id => id !== '__final_transform__'), '__final_transform__'])));
                      setCompletedSteps(prev => prev.filter(id => id !== '__final_transform__'));
                      setStepResultsMap(prev => {
                        const next = { ...prev } as Record<string, any>;
                        delete next['__final_transform__'];
                        return next;
                      });
                    }
                  } finally {
                    setIsExecutingTransform(false);
                  }
                }}
                onFinalTransformChange={setFinalTransform}
                onResponseSchemaChange={setResponseSchema}
                onPayloadChange={setPayload}
                onWorkflowIdChange={setWorkflowId}
                integrations={integrations}
                isExecuting={loading || isExecutingTransform || (isExecutingStep !== undefined)}
                isExecutingStep={isExecutingStep}
                isExecutingTransform={isExecutingTransform as any}
                completedSteps={completedSteps}
                failedSteps={failedSteps}
                readOnly={false}
                inputSchema={inputSchema}
                onInputSchemaChange={setInputSchema}
                payload={(() => {
                  try {
                    return JSON.parse(payload || '{}');
                  } catch {
                    return {};
                  }
                })()}
                headerActions={(
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 mr-2">
                      <Label htmlFor="selfHealing-top" className="text-xs flex items-center gap-1">
                        <span>Self-healing</span>
                      </Label>
                      <div className="flex items-center">
                        <Switch className="custom-switch" id="selfHealing-top" checked={selfHealingEnabled} onCheckedChange={setSelfHealingEnabled} />
                        <div className="ml-1 flex items-center">
                          <HelpTooltip text="Enable LLM-based self-healing during execution. Slower, but can auto-fix failures." />
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="success"
                      onClick={executeWorkflow}
                      disabled={loading || saving || (isExecutingStep !== undefined) || isExecutingTransform}
                      className="h-9 px-4"
                    >
                      {loading ? "Running Workflow..." : "Run Workflow"}
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
                )}
                navigateToFinalSignal={navigateToFinalSignal}
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
