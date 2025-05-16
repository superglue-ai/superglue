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
import { ExecutionStep } from "@superglue/client";
import { SuperglueClient } from "@superglue/client";
import { parseCredentialsHelper, removeNullUndefined } from "@/src/lib/client-utils";

export default function WorkflowPlayground({ id }: { id?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const config = useConfig();
  const [workflowId, setWorkflowId] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [finalTransform, setFinalTransform] = useState(`{
  "result": $
}`);
  const [credentials, setCredentials] = useState("");
  const [payload, setPayload] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState("finalData");
  
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
        updateWorkflowId('');
        setStepsText('');
        setFinalTransform('');
        throw new Error(`Workflow with ID "${idToLoad}" not found.`);
      }
      // Recursively remove null/undefined values from the entire workflow object
      const cleanedWorkflow = removeNullUndefined(workflow);

      // Extract potentially cleaned steps and finalTransform
      const cleanedSteps = cleanedWorkflow.steps || []; // Default to empty array if steps were removed
      const cleanedFinalTransform = cleanedWorkflow.finalTransform || `{\n  "result": $\n}`; // Default transform

      updateWorkflowId(cleanedWorkflow.id || ''); // Use cleaned ID, default to empty string
      setStepsText(JSON.stringify(cleanedSteps, null, 2));
      setFinalTransform(cleanedFinalTransform);

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
      updateWorkflowId('');
      setStepsText('');
      setFinalTransform('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadWorkflow(id);
    }
  }, [id]);

  const fillDogExample = () => {
    updateWorkflowId("Dog Breed Workflow");
    setStepsText(
      JSON.stringify(
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
              urlPath: "/breed/{value}/images/random",
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
        ],
        null,
        2,
      ),
    );
    setFinalTransform(`$.getBreedImage.(
  {"breed": currentItem, "image": data}
)`);

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
        steps: JSON.parse(stepsText).map((step: ExecutionStep) => ({
          ...step,
          apiConfig: {
            id: step.apiConfig.id || step.id,
            ...step.apiConfig,
            pagination: step.apiConfig.pagination || null
          }
        })),
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
      const steps = JSON.parse(stepsText);
      if (!workflowId) {
        updateWorkflowId(`wf-${Date.now()}`);
      }
      const workflowInput = {
        id: workflowId,
        steps: steps.map((step: ExecutionStep) => ({
          ...step,
          apiConfig: {
            id: step.apiConfig.id || step.id,
            ...step.apiConfig
          }
        })),
        finalTransform
      };
      const parsedCredentials = parseCredentialsHelper(credentials);
      const parsedPayload = JSON.parse(payload || "{}");
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
      });
      const workflowResult = await superglueClient.executeWorkflow({
        workflow: workflowInput, 
        credentials: parsedCredentials, 
        payload: parsedPayload
      });
      if(!workflowResult.success) {
        throw new Error(workflowResult.error);
      }
      setResult(workflowResult);
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
                  Steps (JSON)
                </Label>
                <Textarea
                  id="steps"
                  value={stepsText}
                  onChange={(e) => setStepsText(e.target.value)}
                  placeholder="Enter workflow steps as JSON array"
                  className="font-mono resize-none flex-1 min-h-[250px] overflow-auto w-full text-xs"
                />
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <Label htmlFor="finalTransform" className="mb-1 block">
                  Final Transformation (JSONata)
                </Label>
                <Textarea
                  id="finalTransform"
                  value={finalTransform}
                  onChange={(e) => setFinalTransform(e.target.value)}
                  placeholder="Enter final transform expression"
                  className="font-mono resize-none flex-1 min-h-[180px] overflow-auto w-full text-xs"
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
          <CardHeader className="py-3 px-4 flex-shrink-0">
            <CardTitle>Results</CardTitle>
          </CardHeader>

          <CardContent className="p-0 flex-grow flex flex-col overflow-hidden">
            {result ? (
              <>
                {/* Status Bar */}
                <div className="p-3 bg-muted border-b flex-shrink-0">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center">
                      <span className="font-semibold mr-2">Status:</span>
                      <span className={result.success ? "text-green-600" : "text-red-600"}>
                        {result.success ? "Success" : "Failed"}
                      </span>
                    </div>

                    <div className="flex items-center">
                      <span className="font-semibold mr-2">Time:</span>
                      <span className="text-sm">
                        Started: {new Date(result.startedAt).toLocaleString()}
                        {result.completedAt &&
                          ` • Duration: ${((new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()) / 1000).toFixed(2)}s`}
                      </span>
                    </div>

                    {result.error && (
                      <div className="text-red-600">
                        <span className="font-semibold mr-2">Error:</span>
                        <span>{result.error}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Custom Tab Implementation */}
                <div className="flex-grow flex flex-col overflow-hidden">
                  <div className="flex border-b px-4 pt-2 pb-0 bg-background flex-shrink-0">
                    <button
                      type="button"
                      className={`px-4 py-2 mr-2 ${
                        activeResultTab === "finalData"
                          ? "border-b-2 border-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setActiveResultTab("finalData")}
                    >
                      Final Data
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 ${
                        activeResultTab === "stepResults"
                          ? "border-b-2 border-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setActiveResultTab("stepResults")}
                    >
                      Step Results
                    </button>
                  </div>

                  <div className="flex-grow overflow-auto relative">
                    <div
                      className={`absolute inset-0 overflow-auto transition-opacity duration-200 ${
                        activeResultTab === "finalData" ? "opacity-100 z-10" : "opacity-0 z-0"
                      }`}
                    >
                      <pre className="bg-muted/50 p-4 font-mono text-xs min-h-full">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>

                    <div
                      className={`absolute inset-0 overflow-auto transition-opacity duration-200 ${
                        activeResultTab === "stepResults" ? "opacity-100 z-10" : "opacity-0 z-0"
                      }`}
                    >
                      <pre className="bg-muted/50 p-4 font-mono text-xs min-h-full">
                        {JSON.stringify(result.stepResults, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center p-4">
                <p className="text-gray-500 italic">No results yet. Execute a workflow to see results here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
