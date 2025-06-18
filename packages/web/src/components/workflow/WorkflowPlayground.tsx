"use client";
import { useConfig } from "@/src/app/config-context";
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import JsonSchemaEditor from "@/src/components/utils/JsonSchemaEditor";
import { parseCredentialsHelper, removeNullUndefined } from "@/src/lib/client-utils";
import { cn } from "@/src/lib/utils";
import { ExecutionStep, SuperglueClient, Workflow, WorkflowResult } from "@superglue/client";
import { flattenAndNamespaceWorkflowCredentials } from "@superglue/shared/utils";
import { ChevronRight, X } from "lucide-react";
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { WorkflowResultsView } from "./WorkflowResultsView";
import { WorkflowStepsView } from "./WorkflowStepsView";

const inputErrorStyles = "border-red-500 focus-visible:ring-red-500";

export default function WorkflowPlayground({ id }: { id?: string }) {
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
  const [credentials, setCredentials] = useState<string>('');
  const [payload, setPayload] = useState<string>('{}');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'results' | 'transform' | 'final' | 'instructions'>("final");
  const [integrationCredentials, setIntegrationCredentials] = useState<Record<string, string>>({});
  const [showSteps, setShowSteps] = useState(false);
  const [showSchemaEditor, setShowSchemaEditor] = useState(false);
  const [loadedWorkflow, setLoadedWorkflow] = useState<Workflow | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
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

  const loadWorkflow = async (idToLoad: string) => {
    try {
      if (!idToLoad) return;
      setLoading(true);
      setResult(null);
      const workflow = await client.getWorkflow(idToLoad);
      if (!workflow) {
        throw new Error(`Workflow with ID "${idToLoad}" not found.`);
      }

      const cleanedWorkflow = removeNullUndefined(workflow);
      setLoadedWorkflow(cleanedWorkflow);
      updateWorkflowId(cleanedWorkflow.id || '');
      setSteps(cleanedWorkflow.steps || []);
      setFinalTransform(cleanedWorkflow.finalTransform || `(sourceData) => {
  return {
    result: sourceData
  }
}`);

      // Handle response schema
      setResponseSchema(cleanedWorkflow.responseSchema ? JSON.stringify(cleanedWorkflow.responseSchema) : null);

      // Handle credentials - only if integrationIds exist
      if (cleanedWorkflow.integrationIds?.length > 0) {
        try {
          const integrations = await Promise.all(
            cleanedWorkflow.integrationIds.map(id => client.getIntegration(id))
          );

          // Flatten and namespace integration credentials
          const flattenedCreds = flattenAndNamespaceWorkflowCredentials(
            integrations.filter(Boolean)
          );

          setIntegrationCredentials(flattenedCreds);
          setCredentials(JSON.stringify(flattenedCreds, null, 2));
          setValidationErrors(prev => ({ ...prev, credentials: false }));
        } catch (error) {
          console.warn('Failed to load integration credentials:', error);
          setCredentials('{}');
          setValidationErrors(prev => ({ ...prev, credentials: false }));
        }
      } else {
        setCredentials('{}');
        setValidationErrors(prev => ({ ...prev, credentials: false }));
      }

      // Handle payload - only if inputSchema exists
      if (cleanedWorkflow.inputSchema) {
        try {
          const defaultValues = generateDefaultFromSchema(cleanedWorkflow.inputSchema);
          if (defaultValues.payload !== undefined) {
            setPayload(JSON.stringify(defaultValues.payload));
          } else {
            setPayload('{}');
          }
        } catch (error) {
          console.warn('Failed to generate payload from schema:', error);
          setPayload('{}');
        }
      } else {
        setPayload('{}');
      }

      toast({
        title: "Workflow loaded",
        description: `Loaded "${cleanedWorkflow.id}" successfully`,
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

  useEffect(() => {
    if (id) {
      loadWorkflow(id);
    } else {
      // Reset to a clean slate if id is removed or not provided
      updateWorkflowId("");
      setSteps([]);
      setFinalTransform(`(sourceData) => {
  return {
    result: sourceData
  }
}`);
      setResponseSchema('{"type": "object", "properties": {"result": {"type": "object"}}}');
      setCredentials("");
      setPayload("{}");
      setResult(null);
    }
  }, [id]);

  const fillDogExample = () => {
    updateWorkflowId("Dog Breed Workflow");
    setSteps(
      [
        {
          id: "getAllBreeds",
          apiConfig: {
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
    setFinalTransform(`$.getBreedImage.(
  {"breed": currentItem, "image": message.data}
)`);
    setResponseSchema(`{"type": "object", "properties": {"result": {"type": "array", "items": {"type": "object", "properties": {"breed": {"type": "string"}, "image": {"type": "string"}}}}}}`);

    toast({
      title: "Example loaded",
      description: "Dog breed example has been loaded",
    });
  };

  const saveWorkflow = async () => {
    try {
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
        finalTransform
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

  const validateJson = (json: string, field: string): boolean => {
    try {
      JSON.parse(json);
      setValidationErrors(prev => ({ ...prev, [field]: false }));
      return true;
    } catch (e) {
      setValidationErrors(prev => ({ ...prev, [field]: true }));
      return false;
    }
  };

  const executeWorkflow = async () => {
    if (!loadedWorkflow) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      // Validate JSON before execution
      try {
        JSON.parse(credentials);
      } catch (e) {
        throw new Error("Invalid credentials JSON format");
      }

      const workflowResult = await client.executeWorkflow({
        workflow: {
          id: loadedWorkflow.id,
          steps: loadedWorkflow.steps,
          responseSchema: loadedWorkflow.responseSchema,
          finalTransform: loadedWorkflow.finalTransform,
          inputSchema: loadedWorkflow.inputSchema,
          instruction: loadedWorkflow.instruction
        },
        payload: JSON.parse(payload || '{}'),
        credentials: JSON.parse(credentials)
      });

      if (workflowResult.error) {
        throw new Error(workflowResult.error || "Workflow execution failed without a specific error message.");
      }

      setResult(workflowResult);
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
      prevSteps.map(step => (step.id === stepId ? updatedStep : step))
    );
  };

  const isCredentialsEmpty = () => {
    if (!credentials || credentials.trim() === '') return true;

    try {
      const parsed = JSON.parse(credentials);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.keys(parsed).length === 0 ||
          Object.values(parsed).every(value =>
            value === '' || value === null || value === undefined
          );
      }
    } catch {
      // If it's not valid JSON, treat as string
      return credentials.trim() === '';
    }

    return false;
  };

  const fetchAndFlattenIntegrationCredentials = async (integrationIds: string[]) => {
    if (!integrationIds || integrationIds.length === 0) return;
    const creds = flattenAndNamespaceWorkflowCredentials(
      integrationIds.map(id => ({ id, credentials: {} }))
    );
    setIntegrationCredentials(creds);
    setCredentials(JSON.stringify(creds, null, 2)); // Prefill credentials input
  };

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column - Workflow Configuration */}
        <Card className="flex flex-col">
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

            {/* Credentials Input */}
            <div className="mb-4">
              <Label htmlFor="credentials">Credentials</Label>
              <HelpTooltip text='API keys or tokens needed for this workflow. Enter without any prefix like Bearer. If you need to add new credentials keys to the JSON, go back and add them to your integrations or add them to the workflow variables.' />
              <div className="w-full max-w-full">
                <Input
                  value={credentials}
                  onChange={(e) => {
                    setCredentials(e.target.value);
                    try {
                      JSON.parse(e.target.value);
                      setValidationErrors(prev => ({ ...prev, credentials: false }));
                    } catch (e) {
                      setValidationErrors(prev => ({ ...prev, credentials: true }));
                    }
                  }}
                  placeholder="Enter credentials"
                  className="min-h-10 font-mono text-xs"
                />
              </div>
              {(() => {
                try {
                  const creds = JSON.parse(credentials);
                  if (!creds || Object.keys(creds).length === 0) {
                    return (
                      <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mt-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        No credentials added
                      </div>
                    );
                  }
                  return null;
                } catch {
                  return (
                    <div className="text-xs text-red-600 flex items-center gap-1.5 bg-red-500/10 py-1 px-2 rounded mt-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Invalid JSON format
                    </div>
                  );
                }
              })()}
            </div>

            {/* Payload Input */}
            <div className="mb-4">
              <Label htmlFor="payload">Workflow Variables</Label>
              <HelpTooltip text="Dynamic variables for the workflow as a JSON object. These are equivalent to your workflow's initial payload and can be referenced in the entire config." />
              <div className="w-full max-w-full">
                <Input
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  placeholder="Enter payload"
                  className="min-h-10 font-mono text-xs"
                />
              </div>
              {(() => {
                try {
                  const parsed = JSON.parse(payload || '{}');
                  if (!parsed || Object.keys(parsed).length === 0) {
                    return (
                      <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mt-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        No variables added
                      </div>
                    );
                  }
                  return null;
                } catch {
                  return (
                    <div className="text-xs text-red-600 flex items-center gap-1.5 bg-red-500/10 py-1 px-2 rounded mt-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Invalid JSON format
                    </div>
                  );
                }
              })()}
            </div>

            {/* Steps and Final Transform */}
            <div className="space-y-3 flex flex-col flex-grow">
              {/* Steps Toggle */}
              <div className="flex flex-col gap-2">
                <div
                  className="flex items-center gap-2 cursor-pointer select-none"
                  onClick={() => setShowSteps((v) => !v)}
                  role="button"
                  tabIndex={0}
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform",
                      showSteps && "rotate-90"
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-sm">Workflow Steps</span>
                </div>
                {showSteps && (
                  <div className="flex-1 min-h-0 bg-background mb-2">
                    <WorkflowStepsView
                      steps={steps}
                      onStepsChange={handleStepsChange}
                      onStepEdit={handleStepEdit}
                    />
                  </div>
                )}
                {/* Schema Toggle */}
                <div
                  className="flex items-center gap-2 cursor-pointer select-none"
                  onClick={() => setShowSchemaEditor((v) => !v)}
                  role="button"
                  tabIndex={0}
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform",
                      showSchemaEditor && "rotate-90"
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-sm">Response Schema Editor</span>
                </div>
                {showSchemaEditor && (
                  <div className="bg-background mt-2 mb-4">
                    <JsonSchemaEditor
                      isOptional={true}
                      value={responseSchema}
                      onChange={setResponseSchema}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex gap-2 p-3 flex-shrink-0 border-t">
            <Button
              variant="outline"
              onClick={saveWorkflow}
              disabled={saving || loading}
              className="w-full"
            >
              {saving ? "Saving..." : "Save Workflow"}
            </Button>
            <Button
              variant="success"
              onClick={executeWorkflow}
              disabled={loading || saving}
              className="w-full"
            >
              {loading ? "Running..." : "Run Workflow"}
            </Button>
          </CardFooter>
        </Card>

        {/* Right Column - Results */}
        <Card className="flex flex-col">
          <WorkflowResultsView
            activeTab={activeResultTab}
            setActiveTab={setActiveResultTab}
            showInstructionsTab={true}
            currentWorkflow={{
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
              finalTransform
            }}
            credentials={parseCredentialsHelper(credentials)}
            payload={(() => {
              try {
                return JSON.parse(payload || '{}');
              } catch {
                return {};
              }
            })()}
            executionResult={result}
            finalTransform={finalTransform}
            setFinalTransform={setFinalTransform}
            finalResult={result?.data}
            isExecuting={loading}
            executionError={result?.error || null}
          />
        </Card>
      </div>
    </div>
  );
}
