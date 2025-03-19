"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { useConfig } from "../config-context";

export default function WorkflowsPage() {
  const { toast } = useToast();
  const config = useConfig();
  const [workflowName, setWorkflowName] = useState("Dog Breed Workflow");
  const [workflowId, setWorkflowId] = useState("");
  const [apiHost, setApiHost] = useState("https://dog.ceo/api");
  const [stepsText, setStepsText] = useState(
    JSON.stringify(
      [
        {
          id: "getAllBreeds",
          apiConfig: {
            urlPath: "/breeds/list/all",
            instruction: "Get all dog breeds",
            id: "getAllBreeds_config",
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
            urlPath: "/breed/{breed}/images/random",
            instruction: "Get a random image for a specific dog breed",
            id: "getBreedImage_config",
            urlHost: "https://dog.ceo/api",
            method: "GET",
          },
          executionMode: "LOOP",
          loopVariable: "breed",
          loopMaxIters: 5,
          inputMapping: "$", // Use identity mapping since loopVariable will handle extracting values
          responseMapping: "$",
        },
      ],
      null,
      2,
    ),
  );
  const [finalTransform, setFinalTransform] = useState(`{
  "breeds": $map(
    $filter(
      $keys($.getAllBreeds.message),
      function($b) {
        $count($.getBreedImage[$split(message, "/")[4] = $b]) > 0
      }
    ),
    function($b) {
      {
        $b: $.getBreedImage[$split(message, "/")[4] = $b].message[0]
      }
    }
  )
}`);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);

  // Base API Input state - keep these but remove editing capability
  const [instruction, setInstruction] = useState("Get a link to a single random picture for all dog breeds");
  const [documentationUrl, setDocumentationUrl] = useState("https://dog.ceo/dog-api/documentation");

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      setLoadingWorkflows(true);
      const response = await fetch(`${config.superglueEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.superglueApiKey}`,
        },
        body: JSON.stringify({
          query: `
            query ListWorkflows {
              listWorkflows {
                id
                name
                createdAt
              }
            }
          `,
        }),
      });

      const jsonResponse = await response.json();

      if (jsonResponse.errors) {
        throw new Error(jsonResponse.errors[0].message);
      }

      const workflowsList = jsonResponse.data.listWorkflows;
      setWorkflows(workflowsList);
    } catch (error) {
      console.error("Error fetching workflows:", error);
      toast({
        title: "Error fetching workflows",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const loadWorkflow = async (id) => {
    try {
      if (!id) return;

      setLoading(true);
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
                name
                plan {
                  id
                  apiHost
                  steps {
                    id
                    apiConfig {
                      id
                      urlPath
                      instruction
                      method
                      urlHost
                    }
                    executionMode
                    loopVariable
                    loopMaxIters
                    inputMapping
                    responseMapping
                  }
                  finalTransform
                }
              }
            }
          `,
          variables: {
            id,
          },
        }),
      });

      const jsonResponse = await response.json();

      if (jsonResponse.errors) {
        throw new Error(jsonResponse.errors[0].message);
      }

      const workflow = jsonResponse.data.getWorkflow;

      setWorkflowId(workflow.id);
      setWorkflowName(workflow.name);
      setApiHost(workflow.plan.apiHost);
      setStepsText(JSON.stringify(workflow.plan.steps, null, 2));
      setFinalTransform(workflow.plan.finalTransform || "");

      toast({
        title: "Workflow loaded",
        description: `Loaded "${workflow.name}" successfully`,
      });
    } catch (error) {
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

  const deleteWorkflow = async () => {
    try {
      if (!workflowId) {
        throw new Error("No workflow selected");
      }

      const confirmDelete = window.confirm(`Are you sure you want to delete "${workflowName}"?`);
      if (!confirmDelete) return;

      setDeleting(true);

      const response = await fetch(`${config.superglueEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.superglueApiKey}`,
        },
        body: JSON.stringify({
          query: `
            mutation DeleteWorkflow($id: ID!) {
              deleteWorkflow(id: $id)
            }
          `,
          variables: { id: workflowId },
        }),
      });

      const jsonResponse = await response.json();

      if (jsonResponse.errors) {
        throw new Error(jsonResponse.errors[0].message);
      }

      if (jsonResponse.data.deleteWorkflow) {
        toast({
          title: "Workflow deleted",
          description: `"${workflowName}" deleted successfully`,
        });

        setWorkflowId("");
        setWorkflowName("New Workflow");
        setApiHost("https://dog.ceo/api");
        setStepsText(
          JSON.stringify(
            [
              {
                id: "step1",
                apiConfig: {
                  urlPath: "/",
                  instruction: "First step",
                  id: "step1_config",
                  urlHost: "https://dog.ceo/api",
                  method: "GET",
                },
                executionMode: "DIRECT",
                inputMapping: "$",
                responseMapping: "$",
              },
            ],
            null,
            2,
          ),
        );
        setFinalTransform("");

        fetchWorkflows();
      } else {
        throw new Error("Failed to delete workflow");
      }
    } catch (error) {
      console.error("Error deleting workflow:", error);
      toast({
        title: "Error deleting workflow",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const saveWorkflow = async () => {
    try {
      if (!workflowName.trim()) {
        throw new Error("Workflow name is required");
      }

      setSaving(true);
      const steps = JSON.parse(stepsText);

      const executionPlan = {
        id: `plan-${Date.now()}`,
        apiHost,
        steps,
        finalTransform,
      };

      const mutation = "upsertWorkflow";
      const variables = {
        id: workflowId || `workflow-${Date.now()}`,
        input: {
          name: workflowName,
          plan: executionPlan,
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
            mutation UpsertWorkflow($id: ID!, $input: SaveWorkflowInput!) {
              upsertWorkflow(id: $id, input: $input) {
                id
                name
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

      const savedWorkflow = jsonResponse.data[mutation];
      setWorkflowId(savedWorkflow.id);

      toast({
        title: "Workflow saved",
        description: `"${savedWorkflow.name}" saved successfully`,
      });

      fetchWorkflows();
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

      const executionPlan = {
        id: `plan-${Date.now()}`,
        apiHost,
        steps,
        finalTransform,
      };

      const workflowInput = {
        plan: executionPlan,
        payload: {},
        credentials: {},
        baseApiInput: {
          urlHost: apiHost,
          instruction: instruction,
          documentationUrl: documentationUrl,
        },
      };

      // TODO: remove this once we have a real endpoint
      const response = await fetch(`${config.superglueEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.superglueApiKey}`,
        },
        body: JSON.stringify({
          query: `
            mutation ExecuteWorkflow($input: WorkflowInput!) {
              executeWorkflow(input: $input) {
                success
                data
                stepResults
                error
                startedAt
                completedAt
              }
            }
          `,
          variables: {
            input: workflowInput,
          },
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
    <div className="p-8 max-w-none w-full min-h-full">
      <h1 className="text-2xl font-bold mb-4">Workflow Executor</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-120px)]">
        <Card className="flex flex-col h-full">
          <CardHeader className="pb-2">
            <CardTitle>Workflow Configuration</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow overflow-auto p-4 flex flex-col">
            {/* Workflow selector - only shown if workflows exist */}
            {workflows.length > 0 && (
              <div className="mb-4">
                <Label htmlFor="workflowSelect" className="mb-2 block">
                  Load Workflow
                </Label>
                <div className="flex gap-2">
                  <Select
                    disabled={loadingWorkflows || loading || saving || deleting}
                    onValueChange={(value) => loadWorkflow(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={loadingWorkflows ? "Loading workflows..." : "Select a workflow"} />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map((workflow) => (
                        <SelectItem key={workflow.id} value={workflow.id}>
                          {workflow.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWorkflowId("");
                      setWorkflowName("New Workflow");
                      setStepsText(
                        JSON.stringify(
                          [
                            {
                              id: "step1",
                              apiConfig: {
                                urlPath: "/",
                                instruction: "First step",
                                id: "step1_config",
                                urlHost: "https://dog.ceo/api",
                                method: "GET",
                              },
                              executionMode: "DIRECT",
                              inputMapping: "$",
                              responseMapping: "$",
                            },
                          ],
                          null,
                          2,
                        ),
                      );
                    }}
                    size="icon"
                    title="New Workflow"
                    disabled={loading || saving || deleting}
                  >
                    +
                  </Button>
                </div>
              </div>
            )}

            {/* Workflow name */}
            <div className="mb-4">
              <Label htmlFor="workflowName">Workflow Name</Label>
              <Input
                id="workflowName"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Enter workflow name"
              />
            </div>

            <div className="flex flex-col gap-4 h-full min-h-0 flex-grow">
              <div className="flex-1 flex flex-col min-h-0">
                <Label htmlFor="steps" className="mb-1">
                  Steps (JSON)
                </Label>
                <Textarea
                  id="steps"
                  value={stepsText}
                  onChange={(e) => setStepsText(e.target.value)}
                  placeholder="Enter workflow steps as JSON array"
                  className="font-mono resize-none h-full flex-1 min-h-0"
                />
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <Label htmlFor="finalTransform" className="mb-1">
                  Final Transform (JSONata)
                </Label>
                <Textarea
                  id="finalTransform"
                  value={finalTransform}
                  onChange={(e) => setFinalTransform(e.target.value)}
                  placeholder="Enter final transform expression"
                  className="font-mono resize-none h-full flex-1 min-h-0"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <div className="flex justify-between gap-4 w-full">
              <Button
                variant="outline"
                onClick={saveWorkflow}
                disabled={saving || loading || deleting}
                className="w-full"
              >
                {saving ? "Saving..." : workflowId ? "Update Workflow" : "Save Workflow"}
              </Button>
              <Button onClick={executeWorkflow} disabled={loading || saving || deleting} className="w-full">
                {loading ? "Running..." : "Run Workflow"}
              </Button>
            </div>

            {workflowId && (
              <Button
                variant="destructive"
                onClick={deleteWorkflow}
                disabled={saving || loading || deleting}
                className="w-full"
              >
                {deleting ? "Deleting..." : "Delete Workflow"}
              </Button>
            )}
          </CardFooter>
        </Card>

        <Card className="flex flex-col h-full">
          <CardHeader className="pb-2">
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow overflow-auto p-4 flex flex-col">
            {result ? (
              <div className="flex flex-col h-full space-y-4">
                <div className="bg-muted p-4 rounded-md">
                  <h3 className="font-semibold mb-2">
                    Status:
                    <span className={result.success ? "text-green-600" : "text-red-600"}>
                      {result.success ? " Success" : " Failed"}
                    </span>
                  </h3>

                  {result.error && (
                    <div className="text-red-600 mb-2">
                      <p className="font-semibold">Error:</p>
                      <p>{result.error}</p>
                    </div>
                  )}

                  <div>
                    <p className="font-semibold inline-block mr-2">Time:</p>
                    <p className="inline">
                      Started: {new Date(result.startedAt).toLocaleString()}
                      {result.completedAt &&
                        ` • Duration: ${((new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()) / 1000).toFixed(2)}s`}
                    </p>
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  <h3 className="font-semibold mb-2">Final Data:</h3>
                  <pre className="bg-muted p-4 rounded-md font-mono text-sm overflow-auto h-[calc(100%-32px)]">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>

                <div className="flex-1 min-h-0">
                  <h3 className="font-semibold mb-2">Step Results:</h3>
                  <pre className="bg-muted p-4 rounded-md font-mono text-sm overflow-auto h-[calc(100%-32px)]">
                    {JSON.stringify(result.stepResults, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500 italic">No results yet. Execute a workflow to see results here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
