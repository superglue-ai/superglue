import { useConfig } from '@/src/app/config-context';
import { useToast } from '@/src/hooks/use-toast';
import { cn, composeUrl } from '@/src/lib/utils';
import { SuperglueClient, SystemInput, TransformConfig, WorkflowResult } from '@superglue/client';
import { Loader2, Plus, Trash2, X, Upload, Link, Check, ChevronsUpDown, Globe, ArrowRight, ArrowDown, RotateCw, Play, Pencil, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { API_CREATE_STEPS, StepIndicator, WORKFLOW_CREATE_STEPS } from '../utils/StepIndicator';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { HelpTooltip } from '../utils/HelpTooltip';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { inputErrorStyles, parseCredentialsHelper, splitUrl } from '@/src/lib/client-utils';
import { CredentialsManager } from '../utils/CredentialManager';
import { DocumentationField } from '../utils/DocumentationField';
import { URLField } from '../utils/URLField';
import { integrations } from '@/src/lib/integrations';
import { 
  Command, 
  CommandEmpty, 
  CommandGroup, 
  CommandInput, 
  CommandItem 
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import * as simpleIcons from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';
import { findMatchingIntegration } from '@/src/lib/integrations';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import Editor from 'react-simple-code-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import JsonSchemaEditor from '../utils/JsonSchemaEditor'
import { AutoSizer, List } from 'react-virtualized';
import type { URLFieldHandle } from '../utils/URLField'

// Define step types specific to workflow creation
type WorkflowCreateStep = 'integrations' | 'prompt' | 'review' | 'success'; // Added success step

interface WorkflowCreateStepperProps {
  onComplete?: () => void;
}

interface WorkflowStepCardProps {
  step: any;
  isLast: boolean;
  onEdit: (stepId: string, updatedStep: any) => void;
}

function WorkflowStepCard({ step, isLast, onEdit }: WorkflowStepCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedStep, setEditedStep] = useState(step);

  const handleSave = () => {
    onEdit(step.id, editedStep);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedStep(step);
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col items-center">
      <Card className={cn("w-full", isEditing ? "border-primary" : "bg-muted/50")}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {editedStep.executionMode === 'LOOP' && (
                <RotateCw className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-mono">{step.id}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {isEditing && (
                <Select
                  value={editedStep.executionMode}
                  onValueChange={(value) => setEditedStep(prev => ({ ...prev, executionMode: value }))}
                >
                  <SelectTrigger className="h-7 w-24">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIRECT">DIRECT</SelectItem>
                    <SelectItem value="LOOP">LOOP</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-1">
                {isEditing ? (
                  <>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancel}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSave}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditing(true)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isEditing ? (
            <>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">API Config</Label>
                  <div className="space-y-2 mt-1">
                    <div className="flex gap-2">
                    <Select
                        value={editedStep.apiConfig.method}
                        onValueChange={(value) => setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, method: value }
                        }))}
                      >
                        <SelectTrigger className="h-7 flex-1">
                          <SelectValue placeholder="Method" />
                        </SelectTrigger>
                        <SelectContent>
                          {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(method => (
                            <SelectItem key={method} value={method}>{method}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={editedStep.apiConfig.urlHost}
                        onChange={(e) => setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, urlHost: e.target.value }
                        }))}
                        className="text-xs flex-1"
                        placeholder="Host"
                      />
                      <Input
                        value={editedStep.apiConfig.urlPath}
                        onChange={(e) => setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, urlPath: e.target.value }
                        }))}
                        className="text-xs flex-1"
                        placeholder="Path"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Headers (JSON)</Label>
                  <Textarea
                    value={JSON.stringify(editedStep.apiConfig.headers || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const headers = JSON.parse(e.target.value);
                        setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, headers }
                        }));
                      } catch (error) {
                        // Handle invalid JSON
                      }
                    }}
                    className="font-mono text-xs h-20 mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Query Parameters (JSON)</Label>
                  <Textarea
                    value={JSON.stringify(editedStep.apiConfig.queryParams || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        const queryParams = JSON.parse(e.target.value);
                        setEditedStep(prev => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig, queryParams }
                        }));
                      } catch (error) {
                        // Handle invalid JSON
                      }
                    }}
                    className="font-mono text-xs h-20 mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Body</Label>
                  <Textarea
                    value={editedStep.apiConfig.body || ''}
                    onChange={(e) => setEditedStep(prev => ({
                      ...prev,
                      apiConfig: { ...prev.apiConfig, body: e.target.value }
                    }))}
                    className="font-mono text-xs h-20 mt-1"
                  />
                </div>

                {editedStep.executionMode === 'LOOP' && (
                  <>
                    <div>
                      <Label className="text-xs">Loop Selector (JSONata)</Label>
                      <Input
                        value={editedStep.loopSelector || ''}
                        onChange={(e) => setEditedStep(prev => ({
                          ...prev,
                          loopSelector: e.target.value
                        }))}
                        className="text-xs mt-1"
                        placeholder="e.g., $.items"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max Iterations</Label>
                      <Input
                        type="number"
                        value={editedStep.loopMaxIters || ''}
                        onChange={(e) => setEditedStep(prev => ({
                          ...prev,
                          loopMaxIters: parseInt(e.target.value) || undefined
                        }))}
                        className="text-xs mt-1 w-32"
                      />
                    </div>
                  </>
                )}

                <div>
                  <Label className="text-xs">Input Mapping (JSONata)</Label>
                  <Textarea
                    value={editedStep.inputMapping || ''}
                    onChange={(e) => setEditedStep(prev => ({
                      ...prev,
                      inputMapping: e.target.value
                    }))}
                    className="font-mono text-xs h-20 mt-1"
                    placeholder="Transform input before sending to API"
                  />
                </div>

                <div>
                  <Label className="text-xs">Response Mapping (JSONata)</Label>
                  <Textarea
                    value={editedStep.responseMapping || ''}
                    onChange={(e) => setEditedStep(prev => ({
                      ...prev,
                      responseMapping: e.target.value
                    }))}
                    className="font-mono text-xs h-20 mt-1"
                    placeholder="Transform API response"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="font-mono text-xs bg-background/50 p-2 rounded mt-1">
                  <div>{editedStep.apiConfig.method || 'GET'} {editedStep.apiConfig.urlHost}{editedStep.apiConfig.urlPath}</div>
                </div>
              </div>
              {editedStep.executionMode === 'LOOP' && editedStep.loopSelector && (
                <div>
                  <Label className="text-xs text-muted-foreground">Loop Over</Label>
                  <div className="font-mono text-xs bg-background/50 p-2 rounded mt-1">
                    {editedStep.loopSelector}
                    {editedStep.loopMaxIters && ` (max ${editedStep.loopMaxIters} iterations)`}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {!isLast && (
        <div className="my-2 text-muted-foreground">
          <ArrowDown className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

// Create an extended client class
class ExtendedSuperglueClient extends SuperglueClient {
  async generateInstructions(systems: SystemInput[]): Promise<string[]> {
    const response = await fetch(`${this['endpoint']}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this['apiKey']}`
      },
      body: JSON.stringify({
        query: `
          query GenerateInstructions($systems: [SystemInput!]!) {
            generateInstructions(systems: $systems)
          }
        `,
        variables: { systems }
      })
    });
    
    const result = await response.json();
    return result.data.generateInstructions;
  }
}

export function WorkflowCreateStepper({ onComplete }: WorkflowCreateStepperProps) {
  const [step, setStep] = useState<WorkflowCreateStep>('integrations');
  const [isBuilding, setIsBuilding] = useState(false); // For buildWorkflow mutation
  const [isSaving, setIsSaving] = useState(false); // For upsertWorkflow mutation
  const { toast } = useToast();
  const router = useRouter();
  const superglueConfig = useConfig();

  const [systems, setSystems] = useState<SystemInput[]>([]);
  const [currentSystem, setCurrentSystem] = useState<SystemInput>({
    id: '',
    urlHost: '',
    urlPath: '',
    documentationUrl: '',
    documentation: '',
    credentials: {},
  });
  const [instruction, setInstruction] = useState('');
  const [payload, setPayload] = useState('{}');
  const [generatedWorkflow, setGeneratedWorkflow] = useState<any>(null); // To store result from buildWorkflow
  const [finalTransform, setFinalTransform] = useState<string>("$"); // For editing in review step
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [systemFormVisible, setSystemFormVisible] = useState(false);

  // Add new state to track if ID was manually edited
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<string>("custom");
  const [integrationDropdownOpen, setIntegrationDropdownOpen] = useState(false);

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<WorkflowResult | null>(null);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Add new state for loading suggestions
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]); // Store multiple suggestions

  // Create integration options array with custom option first
  const integrationOptions = [
    { value: "custom", label: "Custom", icon: "default" },
    ...Object.entries(integrations).map(([key, integration]) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize first letter
      icon: integration.icon || "default"
    }))
  ];

  // Helper function to get SimpleIcon
  const getSimpleIcon = (name: string): SimpleIcon | null => {
    if (!name || name === "default") return null;
    
    // Convert service name to proper format for simple-icons
    const formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    const iconKey = `si${formatted}`;
    try {
      // Try the direct lookup
      // @ts-ignore - The type definitions don't properly handle string indexing
      let icon = simpleIcons[iconKey];
      return icon || null;
    } catch (e) {
      return null;
    }
  };

  // Auto-open system form when no systems exist and we're on the systems step
  useState(() => {
    if (systems.length === 0 && step === 'integrations') {
      setSystemFormVisible(true);
    }
  });

  const handleUrlChange = (urlHost: string, urlPath: string, queryParams?: Record<string, string>) => {
    const normalizedUrlPath = urlPath === "/" ? "" : urlPath;
    if (urlHost) {
      const match = findMatchingIntegration(urlHost);
      setCurrentSystem(prev => ({
        ...prev,
        urlHost,
        urlPath: normalizedUrlPath,
        id: idManuallyEdited ? prev.id : sanitizeSystemId(urlHost),
        documentationUrl: prev.documentationUrl || match?.integration.docsUrl,
      }));
  }
  }

  const sanitizeSystemId = (id: string) => {
    return id
      .replace('www.', '')
      .replace('api.', '')
      .replace('http://', '')
      .replace('https://', '')
      .replace(/\./g, "-") // Replace dots with hyphens
      .replace(/ /g, "-") // Replace spaces with hyphens
      .replace(/[^a-zA-Z0-9-]/g, ""); // Remove special characters
  };

  // --- System Management ---
  const handleSystemInputChange = (field: keyof SystemInput | 'fullUrl') => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    let newValue = e.target.value;
    
    // Apply sanitization for the id field
    if (field === 'id') {
      newValue = sanitizeSystemId(newValue);
      setIdManuallyEdited(true); // Track that user manually edited the ID
    } else if (field === 'credentials') {
      try {
        newValue = JSON.parse(newValue);
      } catch {
        setValidationErrors(prev => ({ ...prev, credentials: true }));
      }
    }
    
    setCurrentSystem(prev => ({ ...prev, [field]: newValue }));
    setValidationErrors(prev => ({ ...prev, [field]: false })); // Clear error on change
  };

  const addSystem = () => {
    const errors: Record<string, boolean> = {};
    
    // Generate ID if not provided
    if (!currentSystem.id?.trim()) {
      // Try to extract domain from URL
      if (currentSystem.urlHost) {
        try {
          const url = new URL(currentSystem.urlHost.startsWith('http') ? currentSystem.urlHost : `https://${currentSystem.urlHost}`);
          const domain = url.hostname.replace('www.', '').split('.')[0];
          setCurrentSystem(prev => ({
            ...prev,
            id: sanitizeSystemId(domain)
          }));
        } catch (e) {
          errors.id = true;
        }
      } else {
        errors.id = true;
      }
    }
    
    // Check if ID already exists
    if (systems.some(sys => sys.id === currentSystem.id)) {
      errors.id = true;
      errors.duplicateId = true;
    }

    if (!currentSystem.urlHost?.trim()) errors.urlHost = true;
    
    // Basic JSON validation for credentials
    try {
      if (currentSystem.credentials) {
        JSON.parse(JSON.stringify(currentSystem.credentials));
      }
    } catch {
      errors.credentials = true;
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSystems(prev => [...prev, currentSystem as SystemInput]);
    setCurrentSystem({ // Reset form
      id: '',
      urlHost: '',
      urlPath: '',
      documentationUrl: '',
      documentation: '',
      credentials: {},
    });
    setSelectedIntegration("custom");
    setValidationErrors({});
    setSystemFormVisible(false); // Hide form after adding
    setIdManuallyEdited(false); // Reset when adding system
  };

  const removeSystem = (index: number) => {
    setSystems(prev => prev.filter((_, i) => i !== index));
  };

  // --- Step Navigation ---
  const handleNext = async () => {
    const steps: WorkflowCreateStep[] = ['integrations', 'prompt', 'review', 'success'];
    const currentIndex = steps.indexOf(step);

    if (step === 'integrations') {
      if (systems.length === 0) {
        toast({
          title: 'Add Integrations',
          description: 'Please add at least one integration.',
          variant: 'destructive',
        });
        return;
      }
      
      setIsGeneratingSuggestions(true);
      try {
        await handleGenerateInstructions();
        setStep(steps[currentIndex + 1]);
      } finally {
        setIsGeneratingSuggestions(false);
      }
    } else if (step === 'prompt') {
      const errors: Record<string, boolean> = {};
      if (!instruction.trim()) errors.instruction = true;
      try {
        JSON.parse(payload || '{}');
      } catch {
        errors.payload = true;
      }

      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        toast({
          title: 'Validation Error',
          description: 'Please provide a valid instruction and JSON payload.',
          variant: 'destructive',
        });
        return;
      }
      setValidationErrors({});
      setIsBuilding(true);

      try {
        const superglueClient = new ExtendedSuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: superglueConfig.superglueApiKey,
        });

        // Generate schema first
        const schema = await superglueClient.generateSchema(instruction, "");
        setSchema(JSON.stringify(schema, null, 2));
        const parsedPayload = JSON.parse(payload || '{}');
        // Then build workflow
        const response = await superglueClient.buildWorkflow(instruction, parsedPayload, systems, schema);
        if (!response) {
          throw new Error('Failed to build workflow');
        }
        setGeneratedWorkflow(response);
        setFinalTransform(response.finalTransform || `{\n  "result": $\n}`);
        toast({
          title: 'Workflow Built',
          description: `Workflow "${response.id}" generated successfully.`,
        });
        setStep(steps[currentIndex + 1]);
      } catch (error: any) {
        console.error('Error building workflow:', error);
        toast({
          title: 'Error Building Workflow',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setIsBuilding(false);
      }
    } else if (step === 'review') {
        // Save the potentially modified workflow
        if (!generatedWorkflow) return;
        setIsSaving(true);
        try {
            const workflowInput = {
              id: generatedWorkflow.id,
              steps: generatedWorkflow.steps.map((step: any) => ({ // Map steps to input format if needed
                ...step,
                // Ensure apiConfig has an ID - use step ID if apiConfig ID is missing
                apiConfig: {
                  ...(step.apiConfig || {}),
                  id: step.apiConfig?.id || step.id,
                  // Ensure nested objects like pagination are handled or nulled if not present
                  // createdAt: undefined,
                  // updatedAt: undefined,
                  // version: undefined,
                }
              })),
              finalTransform: finalTransform
            };
            const superglueClient = new ExtendedSuperglueClient({
              endpoint: superglueConfig.superglueEndpoint,
              apiKey: superglueConfig.superglueApiKey,
            });
            const response = await superglueClient.upsertWorkflow(generatedWorkflow.id, workflowInput);
            if(!response) {
                throw new Error('Failed to save workflow');
            }

            toast({
                title: 'Workflow Saved',
                description: `Workflow "${generatedWorkflow.id}" saved successfully.`
            });
            setStep(steps[currentIndex + 1]); // Move to success step

        } catch (error: any) {
            console.error("Error saving workflow:", error);
            toast({
                title: "Error Saving Workflow",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    } else if (step === 'success') {
        // Handle completion
        if (onComplete) {
            onComplete();
        } else {
            router.push('/'); // Default redirect
        }
    }
  };

  const handleBack = () => {
    const steps: WorkflowCreateStep[] = ['integrations', 'prompt', 'review', 'success'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleClose = () => {
    if (onComplete) {
        onComplete();
    } else {
        router.push('/workflows'); // Default redirect
    }
  };

  const handleIntegrationSelect = (value: string) => {
    setSelectedIntegration(value);
    
    if (value === "custom") {
      // For custom, just reset URL fields but keep other values
      setCurrentSystem(prev => ({
        ...prev,
        urlHost: '',
        urlPath: '',
        documentationUrl: ''
      }));
      return;
    }
    
    // For an existing integration
    const integration = integrations[value];
    if (integration) {
      // Get values from integration
      const apiUrl = integration.apiUrl || '';      
      const { urlHost, urlPath } = splitUrl(apiUrl);
      setCurrentSystem(prev => ({
        ...prev,
        id: idManuallyEdited ? prev.id : sanitizeSystemId(value),
        urlHost,
        urlPath,
        documentationUrl: integration.docsUrl || '',
      }));

      handleUrlChange(urlHost, urlPath);
    }
  };

  // Add this helper function near the top of the component
  const highlightJson = (code: string) => {
    return Prism.highlight(code, Prism.languages.json, 'json');
  };

  const handleStepEdit = (stepId: string, updatedStep: any) => {
    if (!generatedWorkflow) return;
    
    setGeneratedWorkflow({
      ...generatedWorkflow,
      steps: generatedWorkflow.steps.map((step: any) => 
        step.id === stepId ? updatedStep : step
      )
    });
  };

  const [schema, setSchema] = useState<string>('{}');

  // First, add a new state for the tabs
  const [activeTab, setActiveTab] = useState<'results' | 'transform' | 'final'>('results');

  // Modify the workflow execution to include transform
  const handleExecuteWorkflow = async () => {
    setIsExecuting(true);
    setExecutionError(null);
    try {
      const superglueClient = new ExtendedSuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey,
      });
      const result = await superglueClient.executeWorkflow({
        workflow: {
          id: generatedWorkflow.id,
          steps: generatedWorkflow.steps,
          responseSchema: JSON.parse(schema),
          finalTransform: generatedWorkflow.finalTransform,
        },
        payload: JSON.parse(payload || '{}'),
        credentials: systems.reduce((acc, system) => ({...acc, ...system.credentials}), {}),
      });
      setExecutionResult(result);
      console.log(finalTransform);
      setFinalTransform(result.finalTransform);
      setFinalResult(result.data);
      setActiveTab('final');

    } catch (error: any) {
      setExecutionError(error.message);
      toast({
        title: 'Execution Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Add this helper function near your other helpers
  const getResponseLines = (response: any) => {
    return response ? JSON.stringify(response, null, 2).split('\n') : ['No results yet...'];
  };

  // Modify handleGenerateInstructions
  const handleGenerateInstructions = async () => {
    if (systems.length === 0) {
      toast({
        title: 'No Systems',
        description: 'Add at least one system to get suggestions.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingSuggestions(true);
    try {
      const superglueClient = new ExtendedSuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey,
      });

      const suggestionsText = await superglueClient.generateInstructions(systems);
      // Split suggestions into array (assuming they're separated by newlines)
      const suggestionsArray = suggestionsText.filter(s => s.trim());
      setSuggestions(suggestionsArray);
    } catch (error: any) {
      toast({
        title: 'Error Generating Suggestions',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const urlFieldRef = useRef<URLFieldHandle>(null)

  return (
    <div className="flex-1 flex flex-col h-full p-6">
      {/* Header */}
      <div className="flex-none mb-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mb-4">
          <h1 className="text-2xl font-semibold">
            {step === 'success' ? 'Workflow Created!' : 'Create New Workflow'}
          </h1>
          <div className="flex items-center gap-2">
            {/* Optional Help Button */}
            {/* <Button variant="outline" ...>Get Help</Button> */}
            <Button variant="ghost" size="icon" className="shrink-0" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <StepIndicator currentStep={step} steps={WORKFLOW_CREATE_STEPS} />
      </div>

      {/* Content Area */}
      <div className={cn(
        "flex-1 overflow-hidden",
        // Only use grid layout on review step
        step === 'review' ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "flex flex-col"
      )}>
        {/* Main Content */}
        <div className="overflow-y-auto px-1 min-h-0">
          {/* Step 1: Systems */}
          {step === 'integrations' && (
            <div className="space-y-4">
                {systems.length === 0 && !systemFormVisible && (
                  <p className="text-sm text-muted-foreground italic text-center py-4">
                    No integrations added yet. Define the APIs or data sources your workflow will use.
                  </p>
                )}
              <div>
                <div className="space-y-3">
                  {systems.map((sys, index) => (
                    <Card key={index} className="bg-muted/50 hover:bg-muted/70 transition-colors">
                      <CardContent className="flex flex-col gap-2 py-3 px-4">
                        <div className="flex flex-row items-center justify-between">
                          <div className="flex flex-row items-center gap-3">
                            {(() => {
                              const integration = findMatchingIntegration(sys.urlHost);
                              const icon = integration?.integration.icon ? getSimpleIcon(integration.integration.icon) : null;
                              return icon ? (
                                <svg 
                                  width="20" 
                                  height="20" 
                                  viewBox="0 0 24 24" 
                                  fill={`#${icon.hex}`}
                                  className="flex-shrink-0"
                                >
                                  <path d={icon.path} />
                                </svg>
                              ) : (
                                <Globe className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                              );
                            })()}
                            <div className="flex flex-col">
                              <span className="font-medium">{sys.id}</span>
                              <span className="text-sm text-muted-foreground truncate max-w-[300px]">
                                {composeUrl(sys.urlHost, sys.urlPath)}
                              </span>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" 
                            onClick={() => removeSystem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {(!sys.credentials || Object.keys(sys.credentials).length === 0) && (
                          <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                              <line x1="12" y1="9" x2="12" y2="13"/>
                              <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            No credentials added
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Add System button - always visible if form not showing */}
              {!systemFormVisible && (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" size="sm" onClick={() => setSystemFormVisible(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Integration
                  </Button>
                </div>
              )}

              {/* Add System Form */}
              {systemFormVisible && (
                <Card className="mt-4 border-primary/50">
                   <CardHeader className="py-3 px-4">
                    <CardTitle className="text-lg">Add New Integration</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                      <div>
                        <Label htmlFor="integrationSelect">Integration</Label>
                        <HelpTooltip text="Select from known integrations or choose custom for any other API." />
                        <Popover open={integrationDropdownOpen} onOpenChange={setIntegrationDropdownOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={integrationDropdownOpen}
                              className="w-full justify-between"
                            >
                              <div className="flex items-center gap-2">
                                {selectedIntegration ? (
                                  <>
                                    {(() => {
                                      const icon = getSimpleIcon(integrationOptions.find(opt => opt.value === selectedIntegration)?.icon || "");
                                      return icon ? (
                                        <svg 
                                          width="16" 
                                          height="16" 
                                          viewBox="0 0 24 24" 
                                          fill={`#${icon.hex}`}
                                          className="flex-shrink-0"
                                        >
                                          <path d={icon.path} />
                                        </svg>
                                      ) : (
                                        <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                      );
                                    })()}
                                    <span>
                                      {integrationOptions.find(option => option.value === selectedIntegration)?.label}
                                    </span>
                                  </>
                                ) : (
                                  <span>Select integration...</span>
                                )}
                              </div>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                            <Command className="w-full">
                              <CommandInput placeholder="Search integrations..." />
                              <CommandEmpty>No integration found.</CommandEmpty>
                              <CommandGroup className="max-h-[300px] overflow-y-auto">
                                {integrationOptions.map((option) => (
                                  <CommandItem
                                    key={option.value}
                                    value={option.value}
                                    onSelect={() => {
                                      handleIntegrationSelect(option.value);
                                      setIntegrationDropdownOpen(false);
                                    }}
                                    className="flex items-center py-2"
                                  >
                                    <div className="flex items-center gap-2 w-full">
                                      <div className="w-6 flex justify-center">
                                        {(() => {
                                          const icon = getSimpleIcon(option.icon);
                                          return icon ? (
                                            <svg 
                                              width="16" 
                                              height="16" 
                                              viewBox="0 0 24 24" 
                                              fill={`#${icon.hex}`}
                                              className="flex-shrink-0"
                                            >
                                              <path d={icon.path} />
                                            </svg>
                                          ) : (
                                            <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                          );
                                        })()}
                                      </div>
                                      <span className="flex-grow">{option.label}</span>
                                      <Check
                                        className={cn(
                                          "h-4 w-4 flex-shrink-0",
                                          selectedIntegration === option.value ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      
                      <div>
                        <Label htmlFor="systemFullUrl">API Endpoint*</Label>
                        <HelpTooltip text="The base URL of the API (e.g., https://api.example.com/v1)." />
                        <URLField
                          ref={urlFieldRef}
                          url={composeUrl(currentSystem.urlHost, currentSystem.urlPath) || ''}
                          onUrlChange={handleUrlChange}
                        />
                        {validationErrors.urlHost && <p className="text-sm text-destructive mt-1">API Endpoint is required.</p>}
                      </div>
                      
                      <div>
                        <Label htmlFor="systemId">Integration ID*</Label>
                        <HelpTooltip text="A unique identifier for this integration within the workflow (e.g., 'crm', 'productApi')." />
                        <Input
                          id="systemId"
                          value={currentSystem.id || ''}
                          onChange={handleSystemInputChange('id')}
                          placeholder="e.g., crm-api"
                          className={cn(validationErrors.id && inputErrorStyles)}
                        />
                         {validationErrors.id && <p className="text-sm text-destructive mt-1">Integration ID is required and must be unique.</p>}
                      </div>
                      
                      <div>
                        <Label htmlFor="documentation">Documentation</Label>
                        <HelpTooltip text="Paste relevant parts of the API documentation here or upload a file." />
                        <DocumentationField
                          url={currentSystem.documentationUrl || ''}
                          content={currentSystem.documentation || ''}
                          onUrlChange={(url: string) => setCurrentSystem(prev => ({ ...prev, documentationUrl: url }))}
                          onContentChange={(content: string) => setCurrentSystem(prev => ({ ...prev, documentation: content }))}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="credentials">Credentials</Label>
                        <HelpTooltip text='API keys or tokens needed for this specific system. Enter without any prefix like Bearer. Use advanced mode to add multiple credentials.' />
                        <div className="w-full max-w-full">
                          <CredentialsManager
                            value={JSON.stringify(currentSystem.credentials)}
                            onChange={(value) => {
                              try {
                                const parsed = JSON.parse(value);
                                setCurrentSystem(prev => ({ ...prev, credentials: parsed }));
                                setValidationErrors(prev => ({ ...prev, credentials: false }));
                              } catch (e) {
                                setValidationErrors(prev => ({ ...prev, credentials: true }));
                              }
                            }}
                            className={cn("min-h-20font-mono text-xs", validationErrors.credentials && inputErrorStyles)}
                          />
                        </div>
                        {validationErrors.credentials && <p className="text-sm text-destructive mt-1">Credentials must be valid JSON.</p>}
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                           <Button variant="outline" onClick={() => { 
                             setSystemFormVisible(false); 
                             setValidationErrors({}); 
                             setIdManuallyEdited(false); // Reset when canceling
                             setSelectedIntegration("custom"); // Reset integration selection
                             setCurrentSystem({
                               id: '',
                               urlHost: '',
                               urlPath: '',
                               documentationUrl: '',
                               documentation: '',
                               credentials: {},
                             }); 
                           }}>Cancel</Button>
                           <Button onClick={addSystem}>Add System</Button>
                      </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 2: Prompt */}
          {step === 'prompt' && (
            <div className="space-y-4">
               <div className="space-y-2">
                  <Label htmlFor="instruction">Workflow Instruction*</Label>
                  <HelpTooltip text="Describe what you want this workflow to achieve using the integrations you defined. Be specific!" />
                  <div className="relative">
                    <Textarea
                      id="instruction"
                      value={instruction}
                      onChange={(e) => { setInstruction(e.target.value); setValidationErrors(prev => ({...prev, instruction: false})); }}
                      placeholder="e.g., 'Fetch customer details from CRM using the input email, then get their recent orders from productApi.'"
                      className={cn("min-h-80", validationErrors.instruction && inputErrorStyles)}
                    />
                    {suggestions.length > 0 && !instruction && (
                      <div className="absolute bottom-0  p-3 pointer-events-none">
                        <div className="flex flex-wrap gap-2">
                          {suggestions.map((suggestion, index) => (
                            <Button
                              key={index}
                              variant="outline"
                              className="text-sm py-2 px-4 h-auto font-normal bg-background/80 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 pointer-events-auto"
                              onClick={() => setInstruction(suggestion)}
                            >
                              <ArrowRight className="h-3 w-3" />
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                   {validationErrors.instruction && <p className="text-sm text-destructive mt-1">Instruction is required.</p>}
               </div>

               {/* Show loading state */}
               {isGeneratingSuggestions && (
                 <div className="flex items-center justify-center py-4">
                   <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                 </div>
               )}

               <div className="space-y-1">
                  <Label htmlFor="payload">Workflow Variables (Optional, JSON)</Label>
                  <HelpTooltip text="Provide dynamic variables for the workflow as a JSON object. You can change them when you use the workflow later." />
                  <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                    <div className="h-full font-mono relative bg-transparent overflow-auto">
                      <Editor
                        value={payload}
                        onValueChange={(code) => {
                          setPayload(code);
                          try {
                            JSON.parse(code);
                            setValidationErrors(prev => ({...prev, payload: false}));
                          } catch (e) {
                            setValidationErrors(prev => ({...prev, payload: true}));
                          }
                        }}
                        highlight={highlightJson}
                        padding={10}
                        tabSize={2}
                        insertSpaces={true}
                        className={cn(
                          "min-h-[96px] text-xs [&_textarea]:outline-none [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:p-0 [&_textarea]:border-0 [&_textarea]:bg-transparent dark:[&_textarea]:text-white",
                          validationErrors.payload && inputErrorStyles
                        )}
                        style={{
                          fontFamily: 'var(--font-mono)',
                        }}
                      />
                      {validationErrors.payload && (
                        <div className="absolute bottom-0 left-0 right-0 bg-red-500/10 text-red-500 p-2 text-xs">
                          Invalid JSON format
                        </div>
                      )}
                    </div>
                  </div>
               </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              {generatedWorkflow ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-medium"><span className="font-mono text-base bg-muted px-2 py-0.5 rounded">{generatedWorkflow.id}</span></p>
                    <Button 
                      onClick={handleExecuteWorkflow}
                      disabled={isExecuting}
                      variant="outline"
                    >
                      {isExecuting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Executing...</>
                      ) : (
                        <><Play className="mr-2 h-4 w-4" /> Test Workflow</>
                      )}
                    </Button>
                  </div>
                  <div>
                    <Label>Steps ({generatedWorkflow.steps.length})</Label>
                    <div className="space-y-2 mt-2">
                      {generatedWorkflow.steps.map((step: any, index: number) => (
                        <WorkflowStepCard 
                          key={step.id} 
                          step={step} 
                          isLast={index === generatedWorkflow.steps.length - 1} 
                          onEdit={handleStepEdit}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex-1 min-h-0 bg-background h-[200px] mt-2 mb-4">
                      <JsonSchemaEditor
                        value={schema}
                        onChange={setSchema}
                      />
                  </div>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">Workflow details will appear here after generation.</p>
              )}
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && generatedWorkflow && (() => {
            // Define code strings once
            const sdkCode = `const client = new SuperglueClient({
  apiKey: "${superglueConfig.superglueApiKey}"
});

const result = await client.executeWorkflow({
  id: "${generatedWorkflow.id}",
  payload: ${payload || '{}'},
  credentials: ${JSON.stringify(systems.reduce((acc, system) => ({ ...acc, ...system.credentials }), {}), null, 2)}
});`;

            // Correct the curl command based on the GraphQL schema
            const curlCommand = `curl -X POST "${superglueConfig.superglueEndpoint}/graphql" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${superglueConfig.superglueApiKey}" \\
  -d '${JSON.stringify({
              query: `mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON) { 
  executeWorkflow(input: $input, payload: $payload, credentials: $credentials) { 
    data 
    error 
    success 
  } 
}`, // Updated query signature
              variables: {
                input: { // Nest id under input
                  id: generatedWorkflow.id 
                },
                payload: JSON.parse(payload || '{}'),
                credentials: systems.reduce((acc, system) => ({ ...acc, ...system.credentials }), {})
              }
            })}'`;

            return (
              <div className="space-y-4">
                <p className="text-lg font-medium">Workflow <span className="font-mono text-base bg-muted px-2 py-0.5 rounded">{generatedWorkflow.id}</span> created successfully!</p>
                <p>You can now use this workflow ID in the "Workflows" page or call it via the API/SDK.</p>

                <div className="space-y-4 mt-6">
                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-start space-x-2">
                      <div className="space-y-1 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium">Using the SDK</h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 flex-none"
                            onClick={() => {
                              navigator.clipboard.writeText(sdkCode);
                              toast({ title: 'SDK code copied!' });
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="bg-secondary rounded-md overflow-hidden">
                          <pre className="font-mono text-sm p-4 overflow-x-auto">
                            <code>
                              {sdkCode}
                            </code>
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-start space-x-2">
                      <div className="space-y-1 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium">Using cURL</h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 flex-none"
                            onClick={() => {
                              navigator.clipboard.writeText(curlCommand); // Use updated command
                              toast({ title: 'cURL command copied!' });
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="bg-secondary rounded-md overflow-hidden">
                          <pre className="font-mono text-sm p-4 overflow-x-auto">
                            <code>
                              {curlCommand} {/* Display updated command */}
                            </code>
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button variant="outline" onClick={() => router.push(`/workflows/${generatedWorkflow.id}`)}>
                    Go to Workflow
                  </Button>
                  <Button variant="outline" onClick={() => router.push('/')}>
                    View All Workflows
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right Column - Test Results (only shown during review) */}
        {step === 'review' && (
          <Card className="flex flex-col">
            <CardHeader className="py-3 px-4 flex-shrink-0">
              <div className="flex justify-between items-center">
                <CardTitle>Results</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={activeTab === 'results' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('results')}
                  >
                    Raw Results
                  </Button>
                  <Button
                    variant={activeTab === 'final' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('final')}
                  >
                    Final Results
                  </Button>
                  <Button
                    variant={activeTab === 'transform' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('transform')}
                  >
                    Transformation
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 flex-grow flex flex-col overflow-hidden">
              { executionResult && (
                <div className="p-3 bg-muted border-b flex-shrink-0">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center">
                      <span className="font-semibold mr-2">Status:</span>
                      <span className={executionResult.success ? "text-green-600" : "text-red-600"}>
                        {executionResult.success ? "Success" : "Failed"}
                      </span>
                    </div>

                    {executionResult.startedAt && (
                      <div className="flex items-center">
                        <span className="font-semibold mr-2">Time:</span>
                        <span className="text-sm">
                          {new Date(executionResult.startedAt).toLocaleString()}
                          {executionResult.completedAt &&
                            ` • Duration: ${((new Date(executionResult.completedAt).getTime() - new Date(executionResult.startedAt).getTime()) / 1000).toFixed(2)}s`}
                        </span>
                      </div>
                    )}

                    {executionError && (
                      <div className="text-red-600">
                        <span className="font-semibold mr-2">Error:</span>
                        <span>{executionError}</span>
                      </div>
                    )}
                  </div>
                </div>)
              }
              {activeTab === 'results' ? (
                executionResult ? (
                  <>
                    {/* Results - Replace with virtualized list */}
                    <div className="flex-grow overflow-hidden p-1">
                      <AutoSizer>
                        {({ height, width }) => (
                          <List
                            width={width}
                            height={height}
                            rowCount={getResponseLines(executionResult?.stepResults).length}
                            rowHeight={18}
                            rowRenderer={({ index, key, style }) => {
                              const line = getResponseLines(executionResult?.stepResults)[index];
                              const indentMatch = line?.match(/^(\s*)/);
                              const indentLevel = indentMatch ? indentMatch[0].length : 0;
                              
                              return (
                                <div 
                                  key={key} 
                                  style={{
                                    ...style,
                                    whiteSpace: 'pre',
                                    paddingLeft: `${indentLevel * 8}px`,
                                  }} 
                                  className="font-mono text-xs overflow-hidden text-ellipsis px-4"
                                >
                                  {line?.trimLeft()}
                                </div>
                              );
                            }}
                            overscanRowCount={100}
                            className="overflow-auto"
                          />
                        )}
                      </AutoSizer>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center p-4">
                    <p className="text-gray-500 italic">
                      {isExecuting ? 'Executing workflow...' : 'No results yet. Test the workflow to see results here.'}
                    </p>
                  </div>
                )
              ) : activeTab === 'transform' ? (
                <div className="flex-grow overflow-auto p-4">
                  <Textarea
                    value={finalTransform}
                    onChange={(e) => setFinalTransform(e.target.value)}
                    className="font-mono text-xs w-full h-full min-h-[300px]"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div className="flex-grow overflow-hidden p-1">
                  <AutoSizer>
                    {({ height, width }) => (
                      <List
                        width={width}
                        height={height}
                        rowCount={getResponseLines(finalResult).length}
                        rowHeight={18}
                        rowRenderer={({ index, key, style }) => {
                          const line = getResponseLines(finalResult)[index];
                          const indentMatch = line?.match(/^(\s*)/);
                          const indentLevel = indentMatch ? indentMatch[0].length : 0;
                          
                          return (
                            <div 
                              key={key} 
                              style={{
                                ...style,
                                whiteSpace: 'pre',
                                paddingLeft: `${indentLevel * 8}px`,
                              }} 
                              className="font-mono text-xs overflow-hidden text-ellipsis px-4"
                            >
                              {line?.trimLeft()}
                            </div>
                          );
                        }}
                        overscanRowCount={100}
                        className="overflow-auto"
                      />
                    )}
                  </AutoSizer>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer Buttons */}
      <div className="flex-none mt-4 pt-4 border-t flex justify-between items-center">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 'integrations' || isBuilding || isSaving}
        >
          Back
        </Button>
        <Button
          onClick={() => {
            urlFieldRef.current?.commit()
            handleNext()
          }}
          disabled={isBuilding || isSaving || isGeneratingSuggestions || (step === 'integrations' && systems.length === 0)}
        >
          {isBuilding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building...</> :
           isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> :
           isGeneratingSuggestions ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> :
           step === 'review' ? 'Save & Complete' :
           step === 'success' ? 'Done' :
           'Next'}
        </Button>
      </div>
    </div>
  );
}
