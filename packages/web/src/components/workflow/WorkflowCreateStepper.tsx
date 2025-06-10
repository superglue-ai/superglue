import { useConfig } from '@/src/app/config-context';
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
import { useToast } from '@/src/hooks/use-toast';
import { inputErrorStyles, splitUrl } from '@/src/lib/client-utils';
import { findMatchingIntegration, integrations } from '@/src/lib/integrations';
import { cn, composeUrl } from '@/src/lib/utils';
import { SuperglueClient, SystemInput, Workflow, WorkflowResult } from '@superglue/client';
import { ArrowRight, Check, ChevronsUpDown, Globe, Loader2, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { CredentialsManager } from '../utils/CredentialManager';
import { DocumentationField } from '../utils/DocumentationField';
import { HelpTooltip } from '../utils/HelpTooltip';
import JsonSchemaEditor from '../utils/JsonSchemaEditor';
import { StepIndicator, WORKFLOW_CREATE_STEPS } from '../utils/StepIndicator';
import type { URLFieldHandle } from '../utils/URLField';
import { URLField } from '../utils/URLField';
import { WorkflowCreateSuccess } from './WorkflowCreateSuccess';
import { WorkflowResultsView } from './WorkflowResultsView';
import { WorkflowStepsView } from './WorkflowStepsView';

// Define step types specific to workflow creation
type WorkflowCreateStep = 'integrations' | 'prompt' | 'review' | 'success'; // Added success step

interface WorkflowCreateStepperProps {
  onComplete?: () => void;
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
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null); // To store result from buildWorkflow
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [systemFormVisible, setSystemFormVisible] = useState(false);
  const [editingSystemIndex, setEditingSystemIndex] = useState<number | null>(null);
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<string>("custom");
  const [integrationDropdownOpen, setIntegrationDropdownOpen] = useState(false);

  const [schema, setSchema] = useState<string>('{}');
  const [activeTab, setActiveTab] = useState<'results' | 'transform' | 'final' | 'instructions'>('results');

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<WorkflowResult | null>(null);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

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

    if (editingSystemIndex !== null) {
      setSystems(prev => prev.map((sys, i) => i === editingSystemIndex ? currentSystem : sys));
      setEditingSystemIndex(null);
    } else {
      setSystems(prev => [...prev, currentSystem]);
    }
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

  const handleEditSystem = (index: number) => {
    setCurrentSystem(systems[index]);
    setSystemFormVisible(true);
    setEditingSystemIndex(index);
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
        const response = await superglueClient.buildWorkflow({
          instruction: instruction,
          payload: parsedPayload,
          systems: systems,
          responseSchema: schema,
          save: false
        });
        if (!response) {
          throw new Error('Failed to build workflow');
        }
        setCurrentWorkflow(response);
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
      if (!currentWorkflow) return;
      setIsSaving(true);
      try {
        const workflowInput = {
          id: currentWorkflow.id,
          steps: currentWorkflow.steps.map((step: any) => ({ // Map steps to input format if needed
            ...step,
            // Ensure apiConfig has an ID - use step ID if apiConfig ID is missing
            apiConfig: {
              ...(step.apiConfig || {}),
              id: step.apiConfig?.id || step.id,
            }
          })),
          inputSchema: currentWorkflow.inputSchema,
          finalTransform: currentWorkflow.finalTransform,
          responseSchema: JSON.parse(schema),
          instruction: instruction
        };
        const superglueClient = new ExtendedSuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: superglueConfig.superglueApiKey,
        });
        const response = await superglueClient.upsertWorkflow(currentWorkflow.id, workflowInput);
        if (!response) {
          throw new Error('Failed to save workflow');
        }

        toast({
          title: 'Workflow Saved',
          description: `Workflow "${currentWorkflow.id}" saved successfully.`
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
    if (step === 'integrations') {
      router.push('/configs');
      return;
    }

    if (step === 'review') {
      setExecutionResult(null);
      setFinalResult(null);
      setExecutionError(null);
    }

    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleClose = () => {
    if (onComplete) {
      onComplete();
    } else {
      router.push('/'); // Default redirect
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
    if (!currentWorkflow) return;

    const newSteps = currentWorkflow.steps.map((step: any) =>
      step.id === stepId ? updatedStep : step
    );
    setCurrentWorkflow({
      ...currentWorkflow,
      steps: newSteps
    });
  };

  const handleStepsChange = (newSteps: any[]) => {
    if (!currentWorkflow) return;
    setCurrentWorkflow({
      ...currentWorkflow,
      steps: newSteps
    });
  };


  const handleExecuteWorkflow = async () => {
    setIsExecuting(true);
    setExecutionError(null);
    try {
      const superglueClient = new ExtendedSuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey,
      });
      const credentials = Object.values(systems).reduce((acc, sys) => {
        return { ...acc, ...Object.entries(sys.credentials || {}).reduce((obj, [name, value]) => ({ ...obj, [`${sys.id}_${name}`]: value }), {}) };
      }, {});
      console.log(credentials);
      console.log(payload);
      console.log(currentWorkflow);
      const result = await superglueClient.executeWorkflow({
        workflow: {
          id: currentWorkflow.id,
          steps: currentWorkflow.steps,
          responseSchema: JSON.parse(schema),
          finalTransform: currentWorkflow.finalTransform,
          inputSchema: currentWorkflow.inputSchema,
          instruction: currentWorkflow.instruction
        },
        payload: JSON.parse(payload || '{}'),
        credentials: credentials
      });
      setExecutionResult(result);
      setCurrentWorkflow(result.config);
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

  const handleSaveSystemEdit = () => {
    if (editingSystemIndex !== null) {
      setSystems(prev => prev.map((sys, i) => i === editingSystemIndex ? currentSystem : sys));
      setEditingSystemIndex(null);
    }
    setSystemFormVisible(false);
    setValidationErrors({});
    setIdManuallyEdited(false);
    setSelectedIntegration("custom");
    setCurrentSystem({
      id: '',
      urlHost: '',
      urlPath: '',
      documentationUrl: '',
      documentation: '',
      credentials: {},
    });
  };

  const handleCancelEditOrAdd = () => {
    setSystemFormVisible(false);
    setValidationErrors({});
    setIdManuallyEdited(false);
    setSelectedIntegration("custom");
    setCurrentSystem({
      id: '',
      urlHost: '',
      urlPath: '',
      documentationUrl: '',
      documentation: '',
      credentials: {},
    });
  };

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
            <Button
              variant="outline"
              className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/50 hover:border-blue-300/50 text-blue-600 hover:text-blue-700 text-sm px-4 py-1 h-8 rounded-full animate-pulse shrink-0"
              onClick={() => window.open('https://cal.com/superglue/onboarding', '_blank')}
            >
              ✨ Get help from our team
            </Button>
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
                          <div className="flex flex-row gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-blue-500 hover:bg-blue-100 transition-colors"
                              onClick={() => handleEditSystem(index)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              onClick={() => removeSystem(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {(!sys.credentials || Object.keys(sys.credentials).length === 0) && (
                          <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
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
                      <Button variant="outline" onClick={handleCancelEditOrAdd}>Cancel</Button>
                      {editingSystemIndex !== null ? (
                        <Button onClick={handleSaveSystemEdit}>Save Changes</Button>
                      ) : (
                        <Button onClick={addSystem}>Add System</Button>
                      )}
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
                    onChange={(e) => { setInstruction(e.target.value); setValidationErrors(prev => ({ ...prev, instruction: false })); }}
                    placeholder="e.g., 'Fetch customer details from CRM using the input email, then get their recent orders from productApi.'"
                    className={cn("min-h-80", validationErrors.instruction && inputErrorStyles)}
                  />
                  {suggestions.length > 0 && !instruction && (
                    <div className="absolute bottom-0 p-3 pointer-events-none w-full">
                      <div className="flex gap-2 overflow-x-auto whitespace-nowrap w-full pointer-events-auto">
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
                <HelpTooltip text="Provide dynamic variables for the workflow as a JSON object. Workflow variables are equivalent to your workflow's initial payload and can be referenced in the entire config. You can change them when you use the workflow later." />
                <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                  <div className="h-full font-mono relative bg-transparent overflow-auto">
                    <Editor
                      value={payload}
                      onValueChange={(code) => {
                        setPayload(code);
                        try {
                          JSON.parse(code);
                          setValidationErrors(prev => ({ ...prev, payload: false }));
                        } catch (e) {
                          setValidationErrors(prev => ({ ...prev, payload: true }));
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
              {currentWorkflow ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-medium"><span className="font-mono text-base bg-muted px-2 py-0.5 rounded">{currentWorkflow.id}</span></p>
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
                    <Label>Steps ({currentWorkflow.steps.length})</Label>
                    <WorkflowStepsView
                      steps={currentWorkflow.steps}
                      onStepsChange={handleStepsChange}
                      onStepEdit={handleStepEdit}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex-1 min-h-0 bg-background h-[200px] mt-2 mb-4">
                      <JsonSchemaEditor
                        isOptional={true}
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
          {step === 'success' && currentWorkflow && (
            <div className="space-y-4">
              <p className="text-lg font-medium">
                Workflow{' '}
                <span className="font-mono text-base bg-muted px-2 py-0.5 rounded">
                  {currentWorkflow.id}
                </span>{' '}
                created successfully!
              </p>
              <p>
                You can now use this workflow ID in the "Workflows" page or call it via the API/SDK.
              </p>
              <WorkflowCreateSuccess
                currentWorkflow={currentWorkflow}
                credentials={
                  Object.values(systems).reduce((acc, sys: any) => {
                    return {
                      ...acc,
                      ...Object.entries(sys.credentials || {}).reduce(
                        (obj, [name, value]) => ({ ...obj, [`${sys.id}_${name}`]: value }),
                        {}
                      ),
                    }
                  }, {})
                }
                payload={(() => {
                  try {
                    return JSON.parse(payload || '{}');
                  } catch {
                    return {};
                  }
                })()}
              />
              <div className="flex gap-2 mt-6">
                <Button variant="outline" onClick={() => router.push(`/workflows/${currentWorkflow.id}`)}>
                  Go to Workflow
                </Button>
                <Button variant="outline" onClick={() => router.push('/')}>
                  View All Workflows
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Test Results (only shown during review) */}
        {step === 'review' && (
          <WorkflowResultsView
            activeTab={activeTab}
            showInstructionsTab={false}
            setActiveTab={setActiveTab}
            executionResult={executionResult}
            finalTransform={currentWorkflow?.finalTransform || '$'}
            setFinalTransform={(transform) => setCurrentWorkflow({ ...currentWorkflow, finalTransform: transform || '$' } as Workflow)}
            finalResult={finalResult}
            isExecuting={isExecuting}
            executionError={executionError}
          />
        )}
      </div>

      {/* Footer Buttons */}
      <div className="flex-none mt-4 pt-4 border-t flex justify-between items-center">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={
            (step === 'integrations' && (systemFormVisible || isBuilding || isSaving)) ||
            isBuilding || isSaving
          }
        >
          Back
        </Button>
        <Button
          onClick={() => {
            urlFieldRef.current?.commit()
            handleNext()
          }}
          disabled={
            isBuilding ||
            isSaving ||
            isGeneratingSuggestions ||
            (step === 'integrations' && (systemFormVisible || systems.length === 0))
          }
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
