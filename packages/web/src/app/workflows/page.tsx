"use client"

import { useState } from 'react';
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

import { Button } from "../../components/ui/button";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";

import { Textarea } from "../../components/ui/textarea";

import { useToast } from '../../hooks/use-toast';

export default function WorkflowsPage() {
  const { toast } = useToast();
  const [apiHost, setApiHost] = useState('https://dog.ceo/api');
  const [stepsText, setStepsText] = useState(JSON.stringify([
    {
      id: "getAllBreeds",
      endpoint: "/breeds/list/all",
      instruction: "Get all dog breeds",
      executionMode: "DIRECT",
      outputIsArray: true,
      responseField: "message", 
      objectKeysAsArray: true
    },
    {
      id: "getBreedImage",
      endpoint: "/breed/${breed}/images/random",
      instruction: "Get a random image for a specific dog breed",
      dependencies: ["getAllBreeds"],
      executionMode: "LOOP",
      loopVariable: "breed",
      loopMaxIters: 5
    }
  ], null, 2));
  const [finalTransform, setFinalTransform] = useState(`{
  "breeds": $map(
    $filter(
      $keys($.getAllBreeds),
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
  const [result, setResult] = useState(null);
  
  // Base API Input state - keep these but remove editing capability
  const [instruction, setInstruction] = useState('Get a link to a single random picture for all dog breeds');
  const [documentationUrl, setDocumentationUrl] = useState('https://dog.ceo/dog-api/documentation');
  
  const executeWorkflow = async () => {
    try {
      setLoading(true);
      const steps = JSON.parse(stepsText);
      
      const executionPlan = {
        id: `manual-plan-${Date.now()}`,
        apiHost,
        steps,
        finalTransform
      };
      
      const workflowInput = {
        plan: executionPlan,
        payload: {},
        credentials: {},
        baseApiInput: {
          urlHost: apiHost,
          instruction: instruction,
          documentationUrl: documentationUrl
        }
      };
      
      // TODO: remove this once we have a real endpoint
      const response = await fetch('http://localhost:3000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer hi'
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
            input: workflowInput
          }
        }),
      });
      
      const jsonResponse = await response.json();
      
      if (jsonResponse.errors) {
        throw new Error(jsonResponse.errors[0].message);
      }
      
      const workflowResult = jsonResponse.data.executeWorkflow;
      setResult(workflowResult);
      
      toast({
        title: workflowResult.success ? 'Workflow executed successfully' : 'Workflow execution failed',
        description: workflowResult.error || 'See results below',
        variant: workflowResult.success ? 'default' : 'destructive',
      });
      
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast({
        title: 'Error executing workflow',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Workflow Executor</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Workflow Configuration</CardTitle>
            <CardDescription>Define your API workflow parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="apiHost">API Host</Label>
              <Input 
                id="apiHost" 
                value={apiHost} 
                onChange={(e) => setApiHost(e.target.value)} 
                placeholder="https://api.example.com"
              />
            </div>
            
            <div>
              <div className="mb-4">
                <Label htmlFor="instruction">Instruction</Label>
                <Input 
                  id="instruction" 
                  value={instruction} 
                  onChange={(e) => setInstruction(e.target.value)} 
                  placeholder="Execute workflow"
                />
              </div>
              
              <div className="mb-4">
                <Label htmlFor="documentationUrl">Documentation URL</Label>
                <Input 
                  id="documentationUrl" 
                  value={documentationUrl} 
                  onChange={(e) => setDocumentationUrl(e.target.value)} 
                  placeholder="URL to API documentation"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="steps">Steps (JSON)</Label>
              <Textarea 
                id="steps" 
                value={stepsText} 
                onChange={(e) => setStepsText(e.target.value)} 
                placeholder="Enter workflow steps as JSON array"
                className="h-96 font-mono"
              />
            </div>
            
            <div>
              <Label htmlFor="finalTransform">Final Transform (JSONata)</Label>
              <Textarea 
                id="finalTransform" 
                value={finalTransform} 
                onChange={(e) => setFinalTransform(e.target.value)} 
                placeholder="Enter final transform expression"
                className="h-32 font-mono"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={executeWorkflow} 
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Running...' : 'Run Workflow'}
            </Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>Workflow execution results</CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-md">
                  <h3 className="font-semibold mb-2">Status: 
                    <span className={result.success ? "text-green-600" : "text-red-600"}>
                      {result.success ? ' Success' : ' Failed'}
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
                      {result.completedAt && ` • Duration: ${((new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()) / 1000).toFixed(2)}s`}
                    </p>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Final Data:</h3>
                  <pre className="bg-muted p-4 rounded-md font-mono text-sm overflow-auto max-h-64">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Step Results:</h3>
                  <pre className="bg-muted p-4 rounded-md font-mono text-sm overflow-auto max-h-64">
                    {JSON.stringify(result.stepResults, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 italic">
                No results yet. Execute a workflow to see results here.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
