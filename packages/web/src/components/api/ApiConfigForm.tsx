'use client';

import { useConfig } from '@/src/app/config-context';
import ApiConfigIdEditModal from '@/src/components/api/ApiConfigIdEditModal';
import { ApiPlayground } from '@/src/components/api/ApiPlayground';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import JsonSchemaEditor from "@/src/components/utils/JsonSchemaEditor";
import { useToast } from "@/src/hooks/use-toast";
import { isJsonEmpty } from '@/src/lib/client-utils';
import { ApiConfig, AuthType, CacheMode, HttpMethod, PaginationType, SuperglueClient } from '@superglue/client';
import { ArrowLeft, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import React from 'react';
import Editor from 'react-simple-code-editor';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const AUTH_TYPES = ['NONE', 'HEADER', 'QUERY_PARAM', 'OAUTH2'];
const PAGINATION_TYPES = ['OFFSET_BASED', 'PAGE_BASED', 'CURSOR_BASED', 'DISABLED'];

const InfoTooltip = ({ text }: { text: string; }) => (
  <TooltipProvider delayDuration={100}>
    <Tooltip>
      <TooltipTrigger type="button">
        <Info className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-sm">{text}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const highlightJson = (code: string) => {
  try {
    const formatted = JSON.stringify(JSON.parse(code), null, 2);
    return Prism.highlight(formatted, Prism.languages.json, 'json');
  } catch {
    return code;
  }
};

const ApiConfigForm = ({ id }: { id?: string; }) => {
  const router = useRouter();
  const [searchParamsChecked, setSearchParamsChecked] = React.useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = React.useState({
    id: '',
    urlHost: '',
    urlPath: '',
    method: 'auto',
    instruction: '',
    queryParams: '',
    headers: '',
    body: '',
    documentationUrl: '',
    responseSchema: '',
    responseMapping: '',
    dataPath: '',
    authentication: 'auto',
    paginationType: 'auto',
    pageSize: ''
  });

  const [isAutofilling, setIsAutofilling] = React.useState(false);
  const [editingId, setEditingId] = React.useState(id);
  const [isAutofillDialogOpen, setIsAutofillDialogOpen] = React.useState(false);
  const [autofillCredentials, setAutofillCredentials] = React.useState("{}");
  const [isEditingIdModalOpen, setIsEditingIdModalOpen] = React.useState(false);
  const superglueConfig = useConfig();
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("basic");

  React.useEffect(() => {
    if (editingId && !searchParamsChecked) {
      fetchConfig();
    }
  }, [searchParamsChecked]); // Only depend on searchParamsChecked

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.urlHost || !formData.instruction) {
      toast({
        title: "Missing Required Fields",
        description: "Please provide both Host and Instruction before saving",
        variant: "destructive",
      });
      return;
    }

    // Add JSON validation for headers and query parameters
    try {
      if (formData.headers && formData.headers.trim()) {
        JSON.parse(formData.headers);
      }
    } catch (error) {
      toast({
        title: "Invalid Headers JSON",
        description: "Please check your headers format",
        variant: "destructive",
      });
      setActiveTab("request");
      return;
    }

    try {
      if (formData.queryParams && formData.queryParams.trim()) {
        JSON.parse(formData.queryParams);
      }
    } catch (error) {
      toast({
        title: "Invalid Query Parameters JSON",
        description: "Please check your query parameters format",
        variant: "destructive",
      });
      setActiveTab("request");
      return;
    }

    if (!formData.id) {
      formData.id = formData.urlHost
        .replace(/^https?:\/\//, '')  // Remove http:// or https://
        .replace(/\//g, '')           // Remove all slashes
        + (formData.urlPath ? formData.urlPath.split('/').pop() : '')
        + '-' + Math.floor(1000 + Math.random() * 9000);
    }

    try {
      const payload = {
        id: formData.id,
        ...buildEndpointConfig(formData),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ApiConfig;

      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey
      });
      const response = await superglueClient.upsertApi(formData.id, payload);
      if (!response) {
        throw new Error("Failed to save configuration");
      }
      setHasUnsavedChanges(false);
      router.push(`/configs/${response.id}/edit`);

      // Add refetch after successful save
      await fetchConfig();

      toast({
        title: "Configuration Saved",
        description: "Configuration saved successfully",
        variant: "default",
      });

    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error Saving Configuration",
        description: "An error occurred while saving the configuration: " + error,
        variant: "destructive",
      });
    }
  };

  const handleChange = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string
  ) => {
    const value = typeof e === 'string' ? e : e.target.value;
    setFormData(prev => {
      const newState = { ...prev, [field]: value };
      return newState;
    });
    setHasUnsavedChanges(true);

    if (field === 'id') {
      setEditingId(value);
    }
  };

  const handleApiRun = (runConfig: ApiConfig) => {
    // Update form data based on the config used in the playground run
    setFormData(prev => ({
      ...prev, // Keep existing form data
      id: runConfig.id || prev.id, // Update ID if changed (though unlikely here)
      urlHost: runConfig.urlHost || prev.urlHost,
      urlPath: runConfig.urlPath || prev.urlPath,
      method: runConfig.method || prev.method,
      // instruction: runConfig.instruction || prev.instruction, // Instruction likely doesn't change on run
      queryParams: runConfig.queryParams ? JSON.stringify(runConfig.queryParams, null, 2) : prev.queryParams,
      headers: runConfig.headers ? JSON.stringify(runConfig.headers, null, 2) : prev.headers,
      body: runConfig.body || prev.body,
      // documentationUrl: runConfig.documentationUrl || prev.documentationUrl, // Doc URL unlikely to change
      responseSchema: runConfig.responseSchema ? JSON.stringify(runConfig.responseSchema, null, 2) : prev.responseSchema,
      responseMapping: runConfig.responseMapping || prev.responseMapping,
      dataPath: runConfig.dataPath || prev.dataPath,
      authentication: runConfig.authentication || prev.authentication,
      paginationType: runConfig.pagination?.type || prev.paginationType,
      pageSize: runConfig.pagination?.pageSize ? String(runConfig.pagination.pageSize) : prev.pageSize,
    }));
  };

  const handleAutofill = async () => {
    // Check for required fields
    setIsAutofillDialogOpen(true);
  };
  const fetchConfig = async () => {
    try {
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey
      });
      const data = await superglueClient.getApi(editingId);
      setFormData({
        id: data.id,
        urlHost: data.urlHost,
        instruction: data.instruction,
        urlPath: data.urlPath || '',
        method: data.method || 'auto',
        queryParams: JSON.stringify(data.queryParams || {}, null, 2),
        headers: JSON.stringify(data.headers || {}, null, 2),
        body: data.body || '',
        documentationUrl: data.documentationUrl || '',
        responseSchema: JSON.stringify(data.responseSchema || {}, null, 2),
        responseMapping: data.responseMapping || '',
        dataPath: data.dataPath || '',
        authentication: data.authentication || 'auto',
        paginationType: data.pagination?.type || 'auto',
        pageSize: String(data.pagination?.pageSize || "")
      });

      setSearchParamsChecked(true);
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  };

  const buildEndpointConfig = (formData: Record<string, any>): ApiConfig => {
    const config: ApiConfig = {
      id: formData.id,
      urlHost: formData.urlHost,
      instruction: formData.instruction,
      urlPath: formData.urlPath,
      headers: isJsonEmpty(formData.headers) ? null : JSON.parse(formData.headers),
      queryParams: isJsonEmpty(formData.queryParams) ? null : JSON.parse(formData.queryParams),
      body: formData.body,
      dataPath: formData.dataPath,
      method: formData.method !== "auto" ? formData.method as HttpMethod : null,
      authentication: formData.authentication !== "auto" ? formData.authentication as AuthType : null,
      responseSchema: isJsonEmpty(formData.responseSchema) ? null : JSON.parse(formData.responseSchema),
      responseMapping: formData.responseMapping ? String(formData.responseMapping) : null,
      documentationUrl: formData.documentationUrl,
      pagination: formData.paginationType !== "auto" ? {
        type: formData.paginationType as PaginationType,
        pageSize: formData.pageSize || null
      } : null
    };
    return config;
  };

  const handleAutofillSubmit = async () => {
    if (!formData.urlHost || !formData.instruction) {
      toast({
        title: "Missing Required Fields",
        description: "Please provide both Host and Instruction before autofilling",
        variant: "destructive",
      });
      return;
    }
    setIsAutofilling(true);

    try {
      let parsedCredentials = {};

      try {
        parsedCredentials = JSON.parse(autofillCredentials);
      } catch (e) {
        toast({
          title: "Invalid JSON",
          description: "Please check your payload and credentials JSON format",
          variant: "destructive",
        });
        return;
      }
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey
      });

      const response = await superglueClient.call({
        endpoint: buildEndpointConfig(formData),
        credentials: parsedCredentials,
        options: {
          cacheMode: CacheMode.DISABLED
        }
      });
      if (response.error) {
        throw new Error(response.error);
      }

      // Apply the returned config to the form
      const config = response.config as ApiConfig;
      if (config) {
        setFormData({
          id: formData.id || config.id || '',
          urlHost: config.urlHost || '',
          urlPath: config.urlPath || '',
          method: config.method || 'auto',
          instruction: config.instruction || '',
          queryParams: JSON.stringify(config.queryParams || {}, null, 2),
          headers: JSON.stringify(config.headers || {}, null, 2),
          body: config.body || '',
          documentationUrl: config.documentationUrl || '',
          responseSchema: JSON.stringify(config.responseSchema || {}, null, 2),
          responseMapping: config.responseMapping || '',
          dataPath: config.dataPath || '',
          authentication: config.authentication || 'auto',
          paginationType: config.pagination?.type || 'auto',
          pageSize: String(config.pagination?.pageSize || '')
        });
      }

      setIsAutofillDialogOpen(false);
    } catch (error: any) {
      console.error('Error during autofill:', error);
      toast({
        title: "Autofill Failed",
        description: error?.message || "An error occurred while autofilling the configuration",
        variant: "destructive",
      });
    } finally {
      setIsAutofilling(false);
    }
  };

  const handleTabChange = (value: string) => {
    if (value === "test" && hasUnsavedChanges) {
      setShowUnsavedChangesDialog(true);
    } else {
      setActiveTab(value);
    }
  };

  const handleSaveAndRun = async () => {
    try {
      // Reuse existing submit logic
      const payload = {
        id: formData.id,
        ...buildEndpointConfig(formData),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ApiConfig;

      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey
      });
      await superglueClient.upsertApi(formData.id, payload);
      setHasUnsavedChanges(false);
      setShowUnsavedChangesDialog(false);
      setActiveTab("test");
      toast({
        title: "Configuration Saved",
        description: "Configuration saved successfully",
        variant: "default",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error Saving Configuration",
        description: "An error occurred while saving the configuration: " + error,
        variant: "destructive",
      });
    }
  };

  const handleConfigIdUpdated = (newId: string) => {
    router.push(`/configs/${newId}/edit`);
  };

  return (
    <div className="p-8 max-w-none w-full min-h-full">
      <Button
        variant="ghost"
        onClick={() => router.push('/configs')}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <form onSubmit={handleSubmit} className="h-full">
        <Card className="mb-6 h-[calc(100vh-12rem)]">
          <CardHeader>
            <CardTitle>{editingId ? 'Edit' : 'Create'} API Configuration</CardTitle>
            <CardDescription>
              Configure the API endpoint and its behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[calc(100%-5rem)]">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full h-full">
              <TabsList className="mb-4">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="responseMapping">Response Mapping</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
                {editingId && (
                  <TabsTrigger value="test">
                    Run
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="overflow-y-auto h-[calc(100%-4rem)]">
                <TabsContent value="basic" className="h-full m-0">
                  <div className="grid grid-cols-2 gap-4 h-full">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="id" className="flex items-center gap-1 my-1">
                          ID
                          <InfoTooltip text="A unique identifier for this API configuration. Use this ID to call the endpoint through the SDK." />
                        </Label>
                        <div className="flex items-center">
                          <Input
                            id="id"
                            value={formData.id}
                            onChange={handleChange('id')}
                            placeholder="unique-identifier"
                            disabled={!!editingId}
                            className={`${editingId ? "disabled:opacity-100" : ""} ${editingId ? "rounded-r-none" : ""}`}
                          />
                          {editingId && (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 rounded-l-none"
                              onClick={() => setIsEditingIdModalOpen(true)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="lucide lucide-pen"
                              >
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              </svg>
                              <span className="sr-only">Edit ID</span>
                            </Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="urlHost" className="flex items-center gap-1 my-1">
                          Host
                          <InfoTooltip text="The base URL of the API endpoint (e.g., https://api.example.com)" />
                        </Label>
                        <Input
                          id="urlHost"
                          value={formData.urlHost}
                          onChange={handleChange('urlHost')}
                          placeholder="https://api.example.com"
                          required
                        />
                      </div>

                      <div className="h-[calc(100%-10.8rem)]">
                        <Label htmlFor="instruction" className="flex items-center gap-1 my-1">
                          Instruction
                          <InfoTooltip text="Describe what this API does and what data it should return. Be as specific as possible." />
                        </Label>
                        <Textarea
                          id="instruction"
                          value={formData.instruction}
                          onChange={handleChange('instruction')}
                          placeholder="Get a list of all available products."
                          className="h-full"
                          required
                        />
                      </div>
                    </div>

                    <div className="h-full overflow-y-hidden">
                      <JsonSchemaEditor
                        value={formData.responseSchema}
                        onChange={handleChange('responseSchema')}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="request">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="urlPath" className="flex items-center gap-1 my-1">
                        URL Path
                        <InfoTooltip text="The path component of the URL, starting with / (e.g., /v1/products)" />
                      </Label>
                      <Input
                        id="urlPath"
                        value={formData.urlPath}
                        onChange={handleChange('urlPath')}
                        placeholder="/rest/v1/products"
                      />
                    </div>
                    <div>
                      <Label htmlFor="method" className="flex items-center gap-1 my-1">
                        HTTP Method
                        <InfoTooltip text="The HTTP method to use for the request. Select 'Auto' to let the system determine the appropriate method." />
                      </Label>
                      <Select
                        value={formData.method}
                        onValueChange={handleChange('method')}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          {HTTP_METHODS.map(method => (
                            <SelectItem key={method} value={method}>
                              {method}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="headers" className="flex items-center gap-1 my-1">
                        Headers (JSON)
                        <InfoTooltip text="Request headers in JSON format. Each key-value pair represents a header name and its value." />
                      </Label>
                      <div className="relative font-mono border rounded-md">
                        <Editor
                          value={formData.headers}
                          onValueChange={handleChange('headers')}
                          highlight={highlightJson}
                          padding={10}
                          tabSize={2}
                          insertSpaces={true}
                          className="min-h-[8rem] text-sm [&_textarea]:outline-none [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:p-0 [&_textarea]:border-0 [&_textarea]:bg-transparent dark:[&_textarea]:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="queryParams" className="flex items-center gap-1 my-1">
                        Query Parameters (JSON)
                        <InfoTooltip text="URL query parameters in JSON format. These will be appended to the URL as ?key=value pairs." />
                      </Label>
                      <div className="relative font-mono border rounded-md">
                        <Editor
                          value={formData.queryParams}
                          onValueChange={handleChange('queryParams')}
                          highlight={highlightJson}
                          padding={10}
                          tabSize={2}
                          insertSpaces={true}
                          className="min-h-[8rem] text-sm [&_textarea]:outline-none [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:p-0 [&_textarea]:border-0 [&_textarea]:bg-transparent dark:[&_textarea]:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="body" className="flex items-center gap-1 my-1">
                        Request Body
                        <InfoTooltip text="The request body to send with POST, PUT, or PATCH requests. Usually in JSON format." />
                      </Label>
                      <Textarea
                        id="body"
                        value={formData.body}
                        onChange={handleChange('body')}
                        placeholder="Request body..."
                        className="h-32 font-mono"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="responseMapping">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="dataPath" className="flex items-center gap-1 my-1">
                        Data Path
                        <InfoTooltip text="JSON path to the array of items in the response (e.g., 'data.items' for nested data)" />
                      </Label>
                      <Input
                        id="dataPath"
                        value={formData.dataPath}
                        onChange={handleChange('dataPath')}
                        placeholder="products"
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <Label htmlFor="responseMapping" className="flex items-center gap-1 my-1">
                        Response Mapping
                        <InfoTooltip text="JS expression to transform the API response into the desired format" />
                      </Label>
                      <Textarea
                        id="responseMapping"
                        value={formData.responseMapping}
                        onChange={handleChange('responseMapping')}
                        placeholder="$.data"
                        className="h-48 font-mono"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="documentationUrl" className="flex items-center gap-1 my-1">
                        Documentation URL
                        <InfoTooltip text="Link to the API documentation for reference" />
                      </Label>
                      <Input
                        id="documentationUrl"
                        value={formData.documentationUrl}
                        onChange={handleChange('documentationUrl')}
                        placeholder="https://docs.example.com"
                      />
                    </div>

                    <div className="grid gap-4 pt-4">
                      <h3 className="font-medium">Authentication</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="authentication" className="flex items-center gap-1 my-1">
                            Authentication
                            <InfoTooltip text="The authentication method required by the API. Select 'Auto' to let the system detect it." />
                          </Label>
                          <Select
                            value={formData.authentication}
                            onValueChange={handleChange('authentication')}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto</SelectItem>
                              {AUTH_TYPES.map(type => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 pt-4">
                      <h3 className="font-medium">Pagination</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="paginationType" className="flex items-center gap-1 my-1">
                            Type
                            <InfoTooltip text="The pagination method used by the API. Select 'Auto' for automatic detection, or 'Disabled' if the API doesn't support pagination." />
                          </Label>
                          <Select
                            value={formData.paginationType}
                            onValueChange={handleChange('paginationType')}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto</SelectItem>
                              {PAGINATION_TYPES.map(type => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="pageSize" className="flex items-center gap-1 my-1">
                            Page Size
                            <InfoTooltip text="Number of items to request per page when using pagination" />
                          </Label>
                          <Input
                            id="pageSize"
                            type="number"
                            value={formData.pageSize}
                            onChange={handleChange('pageSize')}
                            min="1"
                            disabled={formData.paginationType === 'DISABLED'}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {editingId && (
                  <TabsContent value="test" className="-mx-6 max-w-full">
                    {hasUnsavedChanges ? (
                      <div className="p-4 text-center text-muted-foreground">
                        Please save your changes before running the configuration.
                      </div>
                    ) : (
                      <ApiPlayground
                        configId={editingId}
                        onRunApi={handleApiRun} // <-- Pass the handler here
                      />
                    )}
                  </TabsContent>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.push('/configs')}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAutofill}
            disabled={isAutofilling}
          >
            {isAutofilling ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </span>
            ) : (
              'Autofill Configuration'
            )}
          </Button>
          <Button type="submit">
            {editingId ? 'Save' : 'Create'} Configuration
          </Button>
        </div>
      </form>

      <Dialog open={isAutofillDialogOpen} onOpenChange={setIsAutofillDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Autofill Configuration</DialogTitle>
            <DialogDescription>
              Provide credentials and payload to automatically generate the configuration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="autofillHost">Host</Label>
              <Input
                id="autofillHost"
                value={formData.urlHost}
                onChange={handleChange('urlHost')}
                placeholder="https://api.example.com"
              />
            </div>

            <div>
              <Label htmlFor="autofillInstruction">Instruction</Label>
              <Textarea
                id="autofillInstruction"
                value={formData.instruction}
                onChange={handleChange('instruction')}
                placeholder="Describe what this API configuration does..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="autofillDocUrl">Documentation URL</Label>
              <Input
                id="autofillDocUrl"
                value={formData.documentationUrl}
                onChange={handleChange('documentationUrl')}
                placeholder="https://docs.example.com"
              />
            </div>
            <div>
              <Label htmlFor="autofillCredentials">Credentials (JSON)</Label>
              <Textarea
                id="autofillCredentials"
                className="font-mono"
                value={autofillCredentials}
                onChange={(e) => setAutofillCredentials(e.target.value)}
                placeholder="{}"
                rows={6}
              />
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAutofillDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAutofillSubmit}
              disabled={isAutofilling}
            >
              {isAutofilling ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </span>
              ) : (
                'Generate Configuration'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showUnsavedChangesDialog}
        onOpenChange={setShowUnsavedChangesDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. You need to save them to run the configuration. Would you like to save the configuration now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndRun}>
              Save & Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingId && (
        <ApiConfigIdEditModal
          isOpen={isEditingIdModalOpen}
          onClose={() => setIsEditingIdModalOpen(false)}
          configId={editingId}
          onConfigUpdated={handleConfigIdUpdated}
        />
      )}
    </div>
  );
};

export default ApiConfigForm;