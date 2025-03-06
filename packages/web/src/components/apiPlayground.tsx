'use client'

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiConfig, CacheMode } from "@superglue/client";
import { composeUrl } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Play, Clock, AlertCircle, Copy } from "lucide-react";
import { SuperglueClient } from "@superglue/client";
import { useToast } from "@/src/hooks/use-toast";
import { useConfig } from "@/src/app/config-context";

// Add this new type and state
type Credential = { key: string; value: string };

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

export function ApiPlayground({ configId }: { configId?: string }) {
  const params = useParams();
  const id = configId || params.id as string;
  const { toast } = useToast();
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const superglueConfig = useConfig();
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());

  // Find template variables in a string
  const findTemplateVars = (str: string): string[] => {
    if (!str) return [];
    // Only match {varName} patterns
    const matches = str.match(/\{(\w+)\}/g) || [];
    return matches.map(match => match.slice(1, -1));
  };

  // Save user inputs to sessionStorage instead of localStorage
  const saveUserInputs = () => {
    if (!id) return;
    const credentialsObj = Object.fromEntries(credentials.map(c => [c.key, c.value]));
    sessionStorage.setItem(`sg-playground-credentials-${id}`, JSON.stringify(credentialsObj));
  };

  // Load user inputs from sessionStorage
  const loadUserInputs = () => {
    if (!id) return;
    const savedCredentials = sessionStorage.getItem(`sg-playground-credentials-${id}`);
    
    if (savedCredentials) {
      try {
        const parsed = JSON.parse(savedCredentials);
        setCredentials(Object.entries(parsed).map(([key, value]) => ({ key, value: value as string })));
      } catch (e) {
        console.error('Failed to parse saved credentials');
      }
    }
  };

  // Save inputs when user switches tabs
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveUserInputs();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', saveUserInputs);
    
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', saveUserInputs);
    };
  }, [id, credentials]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const superglueClient = new SuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: superglueConfig.superglueApiKey
        })
        const data = await superglueClient.getApi(id);
        setConfig(data);
        
        const varMatches = [
          data.urlPath,
          ...Object.values(data.queryParams || {}),
          ...Object.values(data.headers || {}),
          data.body
        ].flatMap(value => findTemplateVars(String(value)));
        setTemplateVars(varMatches);
        const allVars = [...new Set(varMatches)].filter(v => !['limit', 'offset', 'page'].includes(v));
        // Pre-populate credentials list with template variables
        if (allVars.length > 0 && credentials.length === 0) {
          setCredentials(allVars.map(key => ({ key, value: '' })));
        }
        
        loadUserInputs();
      } catch (err) {
        setError('Failed to load API configuration');
        console.error(err);
      }
    };
    loadConfig();
  }, [id]);

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
      })
      const response = await superglue.call({
        id: config.id,
        credentials: credentialsObj,
        options: {
          cacheMode: CacheMode.ENABLED
        }
      })

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
                <label className="text-sm font-medium">Variables</label>
                <div className="mt-2 space-y-2">
                  {credentials.map((cred, index) => (
                    <div key={cred.key}>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={cred.key}
                          disabled
                          className="p-2 w-1/3 bg-secondary rounded-md"
                        />
                        <input
                          type="text"
                          value={cred.value}
                          onChange={(e) => {
                            const newCreds = [...credentials];
                            newCreds[index].value = e.target.value;
                            setCredentials(newCreds);
                            if (invalidFields.has(cred.key)) {
                              const newInvalidFields = new Set(invalidFields);
                              newInvalidFields.delete(cred.key);
                              setInvalidFields(newInvalidFields);
                            }
                          }}
                          required
                          placeholder="Enter value"
                          className={`p-2 w-2/3 bg-secondary rounded-md ${
                            invalidFields.has(cred.key) 
                              ? 'border border-red-500 focus:border-red-500 shake' 
                              : ''
                          }`}
                        />
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
