"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { useConfig } from "@/src/app/config-context";
import { useSearchParams, useRouter } from 'next/navigation';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { ExecutionStep, WorkflowResult } from "@superglue/client";
import { SuperglueClient } from "@superglue/client";
import { parseCredentialsHelper, removeNullUndefined } from "@/src/lib/client-utils";
import { WorkflowStepsView } from "./WorkflowStepsView";
import { WorkflowResultsView } from "./WorkflowResultsView";
import JsonSchemaEditor from "@/src/components/utils/JsonSchemaEditor";

export default function WorkflowPlayground({ id }: { id?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const config = useConfig();
  const [workflowId, setWorkflowId] = useState("");
  const [steps, setSteps] = useState<any[]>([]);
  const [finalTransform, setFinalTransform] = useState(`{
  "result": $
}`);
  const [responseSchema, setResponseSchema] = useState<string | null>(`{"type": "object", "properties": {"result": {"type": "object"}}}`);
  const [credentials, setCredentials] = useState("");
  const [payload, setPayload] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'results' | 'transform' | 'final'>("final");
  
  const updateWorkflowId = (id: string) => {
    const sanitizedId = id
      .replace(/ /g, "-") // Replace spaces with hyphens
      .replace(/[^a-zA-Z0-9-]/g, ""); // Remove special characters
    setWorkflowId(sanitizedId);
  };
  
  const loadWorkflow = async (idToLoad: string) => {
    try {
      if (!idToLoad) return;

      setLoading(true);
      setResult(null);
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
      });
      const workflow = await superglueClient.getWorkflow(idToLoad);
      if (!workflow) {
        throw new Error(`Workflow with ID "${idToLoad}" not found.`);
      }
      console.log(workflow);
      const cleanedWorkflow = removeNullUndefined(workflow);
      updateWorkflowId(cleanedWorkflow.id || '');
      setSteps(cleanedWorkflow.steps || []);
      setFinalTransform(cleanedWorkflow.finalTransform || `{\n  "result": $\n}`);
      
      if (cleanedWorkflow.responseSchema === null || cleanedWorkflow.responseSchema === undefined) {
        setResponseSchema(null);
      } else {
        setResponseSchema(JSON.stringify(cleanedWorkflow.responseSchema));
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
      // Reset state, keeping the attempted ID in the input field for convenience
      setSteps([]);
      setFinalTransform(`{\n  "result": $\n}`);
      setResponseSchema('{"type": "object", "properties": {"result": {"type": "object"}}}'); // Default back to an enabled schema
      setResult(null);
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
      setFinalTransform(`{\n  "result": $\n}`);
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

      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
      });
      const savedWorkflow = await superglueClient.upsertWorkflow(workflowId, input);

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
    try {
      setLoading(true);
      if (!workflowId) {
        updateWorkflowId(`wf-${Date.now()}`);
      }
      const workflowData = {
        id: workflowId,
        steps: steps.map((step: ExecutionStep) => ({
          ...step,
          apiConfig: {
            id: step.apiConfig.id || step.id,
            ...step.apiConfig
          }
        })),
        responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
        finalTransform
      };
      const parsedCredentials = parseCredentialsHelper(credentials);
      const parsedPayload = JSON.parse(payload || "{}");
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
      });
      const workflowResult = await superglueClient.executeWorkflow({
        workflow: workflowData, 
        credentials: parsedCredentials, 
        payload: parsedPayload
      });
      if(!workflowResult.success) {
        throw new Error(workflowResult.error || "Workflow execution failed without a specific error message.");
      }
      console.log(workflowResult);
      setResult(workflowResult);
      
      if (workflowResult.config.responseSchema === null || workflowResult.config.responseSchema === undefined) {
        setResponseSchema(null);
      } else {
        setResponseSchema(JSON.stringify(workflowResult.config.responseSchema));
      }
      setFinalTransform(workflowResult.config.finalTransform);
      setSteps(workflowResult.config.steps);
      setLoading(false);
    } catch (error) {
      console.error("Error executing workflow:", error);
      toast({
        title: "Error executing workflow",
        description: error.message,
        variant: "destructive",
      });
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

  return (
    <div className="p-6 max-w-none w-full">
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

            {/* Add Credentials Input */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="credentials">Credentials (Optional)</Label>
                <HelpTooltip text="Enter API keys/tokens needed for steps in this workflow. Can be a single string or a JSON object for multiple keys." />
              </div>
              <Input
                id="credentials"
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                placeholder="Enter API key, token, or JSON object"
              />
            </div>

            {/* Add Payload Input */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="payload">Payload (Optional)</Label>
                <HelpTooltip text="Enter JSON payload to be used as input data for the workflow" />
              </div>
              <Input
                id="payload"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                placeholder="Enter JSON payload"
                className="font-mono text-xs"
              />
            </div>

            {/* Steps and Final Transform */}
            <div className="space-y-3 flex flex-col flex-grow">
              <div className="flex-1 flex flex-col min-h-0">
                <Label htmlFor="steps" className="mb-1 block">
                  Steps
                </Label>
                <WorkflowStepsView
                  steps={steps}
                  onStepsChange={handleStepsChange}
                  onStepEdit={handleStepEdit}
                />
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <JsonSchemaEditor
                  isOptional={true}
                  value={responseSchema}
                  onChange={setResponseSchema}
                />
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
            <Button onClick={executeWorkflow} disabled={loading || saving} className="w-full">
              {loading ? "Running..." : "Run Workflow"}
            </Button>
          </CardFooter>
        </Card>

        {/* Right Column - Results */}
        <Card className="flex flex-col">
          <WorkflowResultsView
            activeTab={activeResultTab}
            setActiveTab={setActiveResultTab}
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
