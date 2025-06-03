'use client'

import { useConfig } from "@/src/app/config-context";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { useToast } from "@/src/hooks/use-toast";
import { cn } from "@/src/lib/utils";
import { CacheMode, ExtractConfig, SuperglueClient } from "@superglue/client";
import { AlertCircle, Clock, Copy, Play, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";

export function ExtractPlayground({ extractId }: { extractId?: string }) {
  const params = useParams();
  const id = extractId || params.id as string;
  const { toast } = useToast();
  const [extract, setExtract] = useState<ExtractConfig | null>(null);
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [payloadInput, setPayloadInput] = useState("{}");
  const [credentialsInput, setCredentialsInput] = useState("{}");
  const [selectedCacheMode, setSelectedCacheMode] = useState<CacheMode>(CacheMode.READONLY);
  const superglueConfig = useConfig();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const superglueClient = new SuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: superglueConfig.superglueApiKey
        })
        const data = await superglueClient.getExtract(id);
        setExtract(data);
      } catch (err) {
        setError('Failed to load API configuration');
        console.error(err);
      }
    };
    loadConfig();
  }, [id]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setFile(file);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
  };

  const handleRunExtract = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!extract) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setResponseTime(null);

    const startTime = Date.now();

    try {
      let parsedPayload = {};
      let parsedCredentials = {};

      try {
        parsedPayload = JSON.parse(payloadInput);
        parsedCredentials = JSON.parse(credentialsInput);
      } catch (e) {
        toast({
          title: "Invalid JSON",
          description: "Please check your payload and credentials JSON format",
          variant: "destructive",
        });
        throw new Error("Invalid JSON in payload or credentials");
      }

      const superglue = new SuperglueClient({
        apiKey: superglueConfig.superglueApiKey,
        endpoint: superglueConfig.superglueEndpoint
      });

      let extractResult = await superglue.extract({
        file,
        id,
        payload: parsedPayload,
        credentials: parsedCredentials,
        options: {
          cacheMode: selectedCacheMode
        }
      });
      if (!extractResult.success) {
        throw new Error(extractResult.error);
      }
      let transformResult = await superglue.transform({
        id,
        data: extractResult.data,
        options: {
          cacheMode: selectedCacheMode
        }
      });
      setResponse(transformResult.data);
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

  if (!extract) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Request Section */}
      <div className="space-y-6 lg:mx-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Request Configuration</span>
              <div className="flex gap-2 items-center">
                <Button
                  onClick={handleRunExtract}
                  disabled={loading}
                  size="lg"
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  {loading ? 'Running...' : 'Run Extraction'}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Source</label>
              <div
                className={cn(
                  "mt-1 relative rounded-lg border-2 border-dashed p-6",
                  isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                  file ? "border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/20" : "",
                  "transition-all duration-200 ease-in-out"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  {file ? (
                    <>
                      <div className="flex items-center gap-3 bg-blue-500/10 px-4 py-2 rounded-full">
                        <Upload className="h-5 w-5 text-blue-500" />
                        <span className="text-blue-700 font-medium">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => setFile(null)}
                        >
                          Remove
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground/60" />
                      <div>
                        <Button
                          variant="ghost"
                          className="text-primary font-medium hover:text-primary/80"
                          onClick={() => document.getElementById('playground-file-upload')?.click()}
                        >
                          Upload File
                        </Button>
                        <input
                          type="file"
                          id="playground-file-upload"
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                        <p className="text-sm text-muted-foreground mt-1">or drag and drop your file here</p>
                      </div>
                    </>
                  )}
                </div>
                {isDragging && (
                  <div className="absolute inset-0 bg-primary/5 backdrop-blur-[1px] flex items-center justify-center rounded-lg border-2 border-primary transition-all duration-200">
                    <p className="text-sm font-medium text-primary">Drop file here</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Instruction</label>
              <div className="mt-1 p-2 bg-secondary rounded-md">
                {extract.instruction}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Payload (JSON)</label>
              <textarea
                className="mt-1 p-2 w-full h-32 font-mono text-sm bg-secondary rounded-md"
                value={payloadInput}
                onChange={(e) => setPayloadInput(e.target.value)}
                placeholder="{}"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Credentials (JSON)</label>
              <textarea
                className="mt-1 p-2 w-full h-32 font-mono text-sm bg-secondary rounded-md"
                value={credentialsInput}
                onChange={(e) => setCredentialsInput(e.target.value)}
                placeholder="{}"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Cache Mode</label>
              <select
                className="mt-1 p-2 w-full bg-secondary rounded-md"
                value={selectedCacheMode}
                onChange={(e) => setSelectedCacheMode(e.target.value as CacheMode)}
              >
                <option value={CacheMode.READONLY}>Read Only</option>
                <option value={CacheMode.ENABLED}>Enabled</option>
              </select>
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
                <p>Run the extraction to see the response here</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
