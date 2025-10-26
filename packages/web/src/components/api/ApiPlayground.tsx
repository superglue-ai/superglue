'use client';

import { useConfig } from "@/src/app/config-context";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { useToast } from "@/src/hooks/use-toast";
import { generateUUID } from "@/src/lib/client-utils";
import { composeUrl } from "@/src/lib/general-utils";
import { ApiConfig, CacheMode, SuperglueClient } from "@superglue/client";
import { AlertCircle, Clock, Copy, Play, Plus, X } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

// Add this new type and state
type Credential = { id: string; key: string; value: string; isManual?: boolean; };

// Define the props for the component including the new callback
type ApiPlaygroundProps = {
  configId?: string;
  onRunApi?: (config: ApiConfig) => void; // Add the callback prop here
};

// Add this CSS animation class at the top of the file
const invalidFieldAnimation = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
.shake {
  animation: shake 0.3s ease-in-out;
}
`;

export function ApiPlayground({ configId, onRunApi }: ApiPlaygroundProps) {
  const params = useParams();
  const id = configId || params.id as string;
  const { toast } = useToast();
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const superglueConfig = useConfig();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());

  // Find template variables in a string
  const findTemplateVars = (str: string): string[] => {
    if (!str) return [];
    // Match both {varName} and <<varName>> patterns
    const matches = str.match(/\{(\w+)\}|<<(\w+)>>/g) || [];
    return matches.map(match => {
      if (match.startsWith('{')) {
        return match.slice(1, -1);
      } else {
        return match.slice(2, -2);
      }
    });
  };

  // Save user inputs to sessionStorage instead of localStorage
  const saveUserInputs = useCallback(() => {
    if (!id) return;
    const credentialsObj = Object.fromEntries(credentials.map(c => [c.key, c.value]));
    const manualVars = credentials.filter(c => c.isManual).map(c => c.key);
    sessionStorage.setItem(`sg-playground-credentials-${id}`, JSON.stringify(credentialsObj));
    sessionStorage.setItem(`sg-playground-manual-vars-${id}`, JSON.stringify(manualVars));
  }, [id, credentials]);

  // Load user inputs from sessionStorage
  const loadUserInputs = useCallback(() => {
    if (!id) return;
    const savedCredentials = sessionStorage.getItem(`sg-playground-credentials-${id}`);
    const savedManualVars = sessionStorage.getItem(`sg-playground-manual-vars-${id}`);

    if (savedCredentials) {
      try {
        const parsed = JSON.parse(savedCredentials);
        const manualVars = savedManualVars ? JSON.parse(savedManualVars) : [];

        setCredentials(prev => {
          const existing = prev.map(cred => ({
            ...cred,
            value: parsed[cred.key] || cred.value
          }));

          // Add manual variables that were saved but not in auto-detected ones
          const existingKeys = new Set(existing.map(c => c.key));
          const additionalManual = manualVars
            .filter((key: string) => !existingKeys.has(key) && parsed[key] !== undefined)
            .map((key: string) => ({
              id: generateUUID(),
              key,
              value: parsed[key],
              isManual: true
            }));

          return [...existing, ...additionalManual];
        });
      } catch (e) {
        console.error('Failed to parse saved credentials:', e);
      }
    }
  }, [id]);

  // Keep only this useEffect that loads config and calls loadUserInputs once
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const superglueClient = new SuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: superglueConfig.superglueApiKey
        });
        const data = await superglueClient.getApi(id);
        setConfig(data);

        const varMatches = [
          data.urlPath,
          ...Object.values(data.queryParams || {}),
          ...Object.values(data.headers || {}),
          data.body
        ].flatMap(value => findTemplateVars(String(value)));
        const allVars = [...new Set(varMatches)].filter(v => !['limit', 'offset', 'page'].includes(v));

        // Set credentials with unique IDs
        setCredentials(allVars.map(key => ({
          id: generateUUID(),
          key,
          value: '',
          isManual: false
        })));

        // Load saved values after setting initial credentials
        loadUserInputs();
      } catch (err) {
        setError('Failed to load API configuration');
        console.error(err);
      }
    };
    loadConfig();
  }, [id, loadUserInputs]);

  const handleRunApi = async (e: React.MouseEvent) => {
    e.preventDefault();  // Prevent any form submission
    if (!config) return;

    // Check for empty credentials and mark them as invalid
    const emptyCredentials = credentials
      .filter(c => c.value === "")
      .map(c => c.key);

    if (emptyCredentials.length > 0) {
      setInvalidFields(new Set(emptyCredentials));
      return;
    }

    // Clear invalid fields if all are filled
    setInvalidFields(new Set());

    // Save inputs before running
    saveUserInputs();

    setLoading(true);
    setError(null);
    setResponse(null);
    setResponseTime(null);

    const startTime = Date.now();

    try {
      // Parse JSON values if they are valid JSON strings
      const credentialsObj = Object.fromEntries(
        credentials.map(c => {
          let value = c.value;
          try {
            // Check if the value looks like JSON (starts with { or [)
            if (/^[\[\{]/.test(value.trim())) {
              value = JSON.parse(value);
            }
          } catch (e) {
            // If parsing fails, use the original string value
            console.debug(`Failed to parse JSON for ${c.key}, using raw string`);
          }
          return [c.key, value];
        })
      );

      const superglue = new SuperglueClient({
        apiKey: superglueConfig.superglueApiKey,
        endpoint: superglueConfig.superglueEndpoint
      });
      const response = await superglue.call({
        id: config.id,
        credentials: credentialsObj,
        options: {
          cacheMode: CacheMode.READONLY
        }
      });
      // Call the callback if it exists
      if (onRunApi) {
        onRunApi(response.config as ApiConfig);
      }

      setResponse(response.data);
      setResponseTime(Date.now() - startTime);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to execute API call';
      setError(errorMessage);
      toast({
        title: "API Call Failed",
        description: errorMessage,
        variant: "destructive",
      });
      if (err.response) {
        setResponse(err.response.data);
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVariable = () => {
    const newKey = `var${credentials.filter(c => c.isManual).length + 1}`;
    setCredentials(prev => [...prev, {
      id: generateUUID(),
      key: newKey,
      value: '',
      isManual: true
    }]);
  };

  const handleRemoveVariable = (id: string) => {
    setCredentials(prev => prev.filter(cred => cred.id !== id));
    saveUserInputs();
  };

  const handleKeyChange = (id: string, newKey: string) => {
    setCredentials(prev => {
      const updated = [...prev];
      const index = updated.findIndex(cred => cred.id === id);
      if (index !== -1) {
        updated[index] = { ...updated[index], key: newKey };
      }
      return updated;
    });
    saveUserInputs();
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <>
      <style>{invalidFieldAnimation}</style>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Section */}
        <div className="space-y-6 lg:mx-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Request Configuration</span>
                <div className="flex gap-2 items-center">
                  <Button
                    onClick={handleRunApi}
                    disabled={loading}
                    size="lg"
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    {loading ? 'Running...' : 'Run API'}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">URL</label>
                <div className="mt-1 p-2 bg-secondary rounded-md flex items-center gap-2">
                  <Badge variant={loading ? "secondary" : "default"} className="h-6 justify-center">
                    {config.method}
                  </Badge>
                  {composeUrl(config.urlHost, config.urlPath)}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Instruction</label>
                <div className="mt-1 p-2 bg-secondary rounded-md">
                  {config.instruction}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Variables</label>
                  <Button
                    onClick={handleAddVariable}
                    size="sm"
                    variant="outline"
                    className="gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add Variable
                  </Button>
                </div>
                <div className="space-y-2">
                  {credentials.map((cred) => (
                    <div key={cred.id}>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={cred.key}
                          onChange={(e) => handleKeyChange(cred.id, e.target.value)}
                          disabled={!cred.isManual}
                          className={`p-2 w-1/3 rounded-md ${cred.isManual ? 'bg-background border' : 'bg-secondary'
                            }`}
                          placeholder="Variable name"
                        />
                        <input
                          type="text"
                          value={cred.value}
                          onChange={(e) => {
                            const newCreds = [...credentials];
                            const index = newCreds.findIndex(c => c.id === cred.id);
                            if (index !== -1) {
                              newCreds[index].value = e.target.value;
                              setCredentials(newCreds);
                            }
                            if (invalidFields.has(cred.key)) {
                              const newInvalidFields = new Set(invalidFields);
                              newInvalidFields.delete(cred.key);
                              setInvalidFields(newInvalidFields);
                            }
                            saveUserInputs();
                          }}
                          required
                          placeholder="Enter value"
                          className={`p-2 flex-1 bg-secondary rounded-md ${invalidFields.has(cred.key)
                            ? 'border border-red-500 focus:border-red-500 shake'
                            : ''
                            }`}
                        />
                        {cred.isManual && (
                          <Button
                            onClick={() => handleRemoveVariable(cred.id)}
                            size="sm"
                            variant="ghost"
                            className="px-2"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {invalidFields.has(cred.key) && (
                        <p className="text-red-500 text-xs mt-1">This field is required</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Response Section */}
        <div className="space-y-6">
          {response ? (
            <Card className="min-h-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Response</span>
                  <Badge variant={loading ? "secondary" : "default"}>
                    {loading ? "Loading..." : "Success"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {responseTime && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Clock className="h-4 w-4" />
                    Response time: {responseTime}ms
                  </div>
                )}
                <div className="relative">
                  <pre className="bg-secondary p-4 rounded-md overflow-auto text-xs max-h-full">
                    {JSON.stringify(response, null, 2)}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {error && (
                  <Card className="border-red-200 bg-red-50 mt-4">
                    <CardHeader>
                      <CardTitle className="text-red-700 flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        Error
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-red-600">{error}</p>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="min-h-full">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Response</span>
                  <Badge variant="secondary">Waiting</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center text-muted-foreground p-8">
                  <Play className="h-12 w-12 mb-4 opacity-50" />
                  <p>Run the API to see the response here</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
