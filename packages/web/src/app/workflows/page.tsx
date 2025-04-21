"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { useConfig } from "../config-context";
import { useSearchParams } from 'next/navigation';
import { HelpTooltip } from '@/src/components/HelpTooltip';

const parseCredentialsHelper = (value: string): Record<string, any> | string => {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return value;
  } catch (e) {
    return value;
  }
};

const removeNullUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    // Filter out null/undefined values after mapping
    return obj
      .map(removeNullUndefined)
      .filter(v => v !== null && v !== undefined);
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = removeNullUndefined(obj[key]);
        // Only add the key back if the processed value is not null/undefined
        if (value !== null && value !== undefined) {
          newObj[key] = value;
        }
      }
    }
    // Return null if the object becomes empty after cleaning,
    // or you could return {} depending on desired behavior.
    // Let's return {} for now to avoid removing empty objects entirely.
    return newObj;
  }
  // Return primitives, null, or undefined as is
  return obj;
};

export default function WorkflowsPage() {
  const { toast } = useToast();
  const config = useConfig();
  const searchParams = useSearchParams();
  const [workflowId, setWorkflowId] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [finalTransform, setFinalTransform] = useState(`{
  "result": $
}`);
  const [credentials, setCredentials] = useState("");
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
      const response = await fetch(`${config.superglueEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.superglueApiKey}`,
        },
        body: JSON.stringify({
          query: `
            query GetWorkflow($id: ID!) {
              getWorkflow(id: $id) {
                id
                steps {
                  id
                  apiConfig {
                    version
                    createdAt
                    updatedAt
                    urlHost
                    urlPath
                    instruction
                    method
                    queryParams
                    headers
                    body
                    documentationUrl
                    responseSchema
                    responseMapping
                    authentication
                    pagination {
                      type
                      pageSize
                      cursorPath
                    }
                    dataPath
                  }
                  executionMode
                  loopSelector
                  loopMaxIters
                  inputMapping
                  responseMapping
                }
                finalTransform
              }
            }
          `,
          variables: { id: idToLoad },
        }),
      });

      const jsonResponse = await response.json();

      if (jsonResponse.errors || !jsonResponse.data.getWorkflow) {
         const errorMessage = jsonResponse.errors ? jsonResponse.errors[0].message : `Workflow with ID "${idToLoad}" not found.`;
         console.error("Error loading workflow:", errorMessage);
         toast({
           title: "Error loading workflow",
           description: errorMessage,
           variant: "destructive",
         });
         updateWorkflowId('');
         setStepsText('');
         setFinalTransform('');
         return;
      }

      const workflow = jsonResponse.data.getWorkflow;

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
    const idFromQuery = searchParams.get('id');
    if (idFromQuery) {
      loadWorkflow(idFromQuery);
    }
  }, [searchParams]);

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
  {"breed": loopValue, "image": message}
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

      const variables = {
        id: workflowId,
        input: {
          id: workflowId,
          steps: JSON.parse(stepsText),
          finalTransform
        },
      };

      const response = await fetch(`${config.superglueEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.superglueApiKey}`,
        },
        body: JSON.stringify({
          query: `
            mutation UpsertWorkflow($id: ID!, $input: JSON!) {
              upsertWorkflow(id: $id, input: $input) {
                id
              }
            }
          `,
          variables,
        }),
      });

      const jsonResponse = await response.json();

      if (jsonResponse.errors) {
        throw new Error(jsonResponse.errors[0].message);
      }

      const savedWorkflow = jsonResponse.data.upsertWorkflow;
      updateWorkflowId(savedWorkflow.id);

      toast({
        title: "Workflow saved",
        description: `"${savedWorkflow.id}" saved successfully`,
      });

      loadWorkflow(savedWorkflow.id);
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
        steps,
        finalTransform
      };
      const parsedCredentials = parseCredentialsHelper(credentials);

      const response = await fetch(`${config.superglueEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.superglueApiKey}`,
        },
        body: JSON.stringify({
          query: `
            mutation ExecuteWorkflow($input: WorkflowInputRequest!, $credentials: JSON) {
              executeWorkflow(input: $input, credentials: $credentials) {
                success
                data
                stepResults {
                  stepId
                  success
                  rawData
                  transformedData
                  error
                }
                error
                startedAt
                completedAt
              }
            }
          `,
          variables: { input: { workflow: workflowInput }, credentials: parsedCredentials },
        }),
      });

      const jsonResponse = await response.json();

      if (jsonResponse.errors) {
        throw new Error(jsonResponse.errors[0].message);
      }

      const workflowResult = jsonResponse.data.executeWorkflow;
      setResult(workflowResult);

      toast({
        title: workflowResult.success ? "Workflow executed successfully" : "Workflow execution failed",
        description: workflowResult.error || "See results below",
        variant: workflowResult.success ? "default" : "destructive",
      });
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

  return (
    <div className="p-6 max-w-none w-full h-full flex flex-col">
      <h1 className="text-2xl font-bold mb-3 flex-shrink-0">Workflows</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0 flex-grow overflow-hidden">
        {/* Left Column - Workflow Configuration */}
        <Card className="flex flex-col h-full">
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
                  className="font-mono resize-none flex-1 min-h-[250px] overflow-auto w-full text-xs"
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
        <Card className="flex flex-col h-full">
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
