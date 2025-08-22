"use client";
import { useConfig } from "@/src/app/config-context";
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import JsonSchemaEditor from "@/src/components/utils/JsonSchemaEditor";
import { cn } from "@/src/lib/utils";
import { ExecutionStep, Integration, SelfHealingMode, SuperglueClient, WorkflowResult } from "@superglue/client";
import { ChevronRight, Database, X } from "lucide-react";
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter } from "../ui/card";
import { Input } from "../ui/input";
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



  const [showResponseSchemaEditor, setShowResponseSchemaEditor] = useState(false);
  const [showInputSchemaEditor, setShowInputSchemaEditor] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [instructions, setInstructions] = useState<string>('');
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(false);

  const client = useMemo(() => new SuperglueClient({
    endpoint: config.superglueEndpoint,
    apiKey: config.superglueApiKey,
  }), [config.superglueEndpoint, config.superglueApiKey]);

  const updateWorkflowId = (id: string) => {
    const sanitizedId = id
      .replace(/ /g, "-") // Replace spaces with hyphens
      .replace(/[^a-zA-Z0-9-]/g, ""); // Remove special characters
    setWorkflowId(sanitizedId);
  };

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
      updateWorkflowId(workflow.id || '');
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
      updateWorkflowId("");
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
    }
  }, [id]);

  // Effect to update payload when input schema changes (but not during workflow loading)
  useEffect(() => {
    // Only run this if we're not in the middle of loading a workflow
    if (!loading) {
      constructFromInputSchema(inputSchema);
    }
  }, [inputSchema]);

  // Removed integration credentials effect

  const fillDogExample = () => {
    updateWorkflowId("Dog Breed Workflow");
    setInstructions("This workflow fetches all dog breeds and gets random images for the first 5 breeds");
    setSteps(
      [
        {
          id: "getAllBreeds",
          apiConfig: {
            id: "getAllBreeds",
            urlPath: "/breeds/list/all",
            instruction: "Get all dog breeds",
            urlHost: "https://dog.ceo/api",
            method: "GET",
          },
          executionMode: "DIRECT",
          inputMapping: "$",
          responseMapping: "$keys($.message)",
        },
        {
          id: "getBreedImage",
          apiConfig: {
            id: "getBreedImage",
            urlPath: "/breed/{currentItem}/images/random",
            instruction: "Get a random image for a specific dog breed",
            urlHost: "https://dog.ceo/api",
            method: "GET",
          },
          executionMode: "LOOP",
          loopSelector: "getAllBreeds",
          loopMaxIters: 5,
          inputMapping: "$",
          responseMapping: "$",
        },
      ]
    );
    setFinalTransform(`(sourceData) => {
  return {
    result: sourceData
  }
}`);
    setResponseSchema(`{"type": "object", "properties": {"result": {"type": "array", "items": {"type": "object", "properties": {"breed": {"type": "string"}, "image": {"type": "string"}}}}}}`);
    setInputSchema(`{"type": "object", "properties": {"payload": {"type": "object"}, "credentials": {"type": "object"}}}`);
    toast({
      title: "Example loaded",
      description: "Dog breed example has been loaded",
    });
  };

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
        updateWorkflowId(`wf-${Date.now()}`);
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
      updateWorkflowId(savedWorkflow.id);

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
    setResult(null);
    setError(null);

    try {
      // Validate JSON before execution
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
      const workflowResult = await client.executeWorkflow({
        workflow: {
          id: workflowId,
          steps: steps,
          integrationIds: [],
          responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
          inputSchema: inputSchema ? JSON.parse(inputSchema) : { type: "object" },
          finalTransform: finalTransform,
        },
        payload: JSON.parse(payload || '{}'),
        options: {
          testMode: selfHealingEnabled,
          selfHealing: selfHealingEnabled ? SelfHealingMode.ENABLED : SelfHealingMode.DISABLED
        }
      });

      if (workflowResult.error) {
        throw new Error(workflowResult.error || "Workflow execution failed without a specific error message.");
      }

      setResult(workflowResult);
      setSteps(workflowResult.config.steps);
      setFinalTransform(workflowResult.config.finalTransform);
    } catch (error) {
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
        <Card className="flex flex-col min-h-[80vh]">
          <CardContent className="p-4 overflow-auto flex-grow">
            {/* Workflow name and example/load buttons */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="workflowId">Workflow ID</Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="workflowId"
                  value={workflowId}
                  onChange={(e) => updateWorkflowId(e.target.value)}
                  placeholder="Enter workflow ID to load or save"
                  className="flex-grow"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadWorkflow(workflowId)}
                  disabled={loading || saving || !workflowId}
                  className="flex-shrink-0"
                >
                  {loading && !saving ? "Loading..." : "Load"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fillDogExample}
                  disabled={loading || saving}
                  className="flex-shrink-0"
                >
                  Example
                </Button>
              </div>
            </div>

            {/* Workflow Instructions */}
            <div className="mb-4">
              <Label htmlFor="instructions">Workflow Instructions</Label>
              <HelpTooltip text="Describe what this workflow does and how it should behave. This helps with documentation and AI assistance." />
              <div className="font-mono text-sm text-foreground rounded py-1 mt-1 break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                {instructions || <span className="italic text-muted-foreground">No instructions provided</span>}
              </div>
            </div>

            {/* Payload removed - now handled in workflow steps */}

            {/* Steps and Schema Editors */}
            <div className="space-y-3 flex flex-col flex-grow">
              {/* Workflow Steps - response schema now integrated in final transform */}
              <div className="mb-4">
                <WorkflowStepGallery
                  steps={steps}
                  stepResults={result?.stepResults || {}}
                  finalTransform={finalTransform}
                  finalResult={result?.data}
                  responseSchema={responseSchema}
                  onStepsChange={handleStepsChange}
                  onStepEdit={handleStepEdit}
                  onFinalTransformChange={setFinalTransform}
                  onResponseSchemaChange={setResponseSchema}
                  onPayloadChange={setPayload}
                  integrations={integrations}
                  isExecuting={loading}
                  readOnly={false}
                  payload={(() => {
                    try {
                      return JSON.parse(payload || '{}');
                    } catch {
                      return {};
                    }
                  })()}
                />
              </div>

              {/* Input Schema Toggle */}
              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setShowInputSchemaEditor((v) => !v)}
                role="button"
                tabIndex={0}
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showInputSchemaEditor && "rotate-90"
                  )}
                  aria-hidden="true"
                />
                <Database className="h-4 w-4" />
                <span className="font-medium text-sm">Input Schema Editor</span>
                <HelpTooltip text="Define the expected structure of input data (payload and credentials) that your workflow accepts. This validates and documents the required input format." />
              </div>
              {showInputSchemaEditor && (
                <div className="mt-2 mb-4">
                  <JsonSchemaEditor
                    isOptional={true}
                    value={inputSchema}
                    onChange={setInputSchema}
                  />
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex p-3 flex-shrink-0 border-t">
            <div className="flex items-center gap-2 w-full flex-wrap">
              <Button
                variant="outline"
                onClick={saveWorkflow}
                disabled={saving || loading}
                className="flex-1"
              >
                {saving ? "Saving..." : "Save Workflow"}
              </Button>
              <Button
                variant="success"
                onClick={executeWorkflow}
                disabled={loading || saving}
                className="flex-1"
              >
                {loading ? "Running..." : "Run Workflow"}
              </Button>
              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor="selfHealing" className="text-xs flex items-center gap-1">
                  <span>Self-healing</span>
                </Label>
                <Switch className="custom-switch" id="selfHealing" checked={selfHealingEnabled} onCheckedChange={setSelfHealingEnabled} />
                <sup className="leading-none"><HelpTooltip text="Enable LLM-based self-healing during execution. Slower, but can auto-fix failures." /></sup>
              </div>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
