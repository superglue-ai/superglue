import { useConfig } from '@/src/app/config-context';
import { IntegrationForm } from '@/src/components/integrations/IntegrationForm';
import { useToast } from '@/src/hooks/use-toast';
import { inputErrorStyles, parseCredentialsHelper, splitUrl } from '@/src/lib/client-utils';
import { findMatchingIntegration, integrations as integrationTemplates, waitForIntegrationsReady } from '@/src/lib/integrations';
import { cn, composeUrl } from '@/src/lib/utils';
import { Integration, IntegrationInput, SuperglueClient, Workflow, WorkflowResult } from '@superglue/client';
import { flattenAndNamespaceWorkflowCredentials } from '@superglue/shared/utils';
import { ArrowRight, ChevronRight, Globe, Loader2, Pencil, Play, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { FixedSizeList as List } from 'react-window';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { HelpTooltip } from '../utils/HelpTooltip';
import JsonSchemaEditor from '../utils/JsonSchemaEditor';
import { StepIndicator, WORKFLOW_CREATE_STEPS } from '../utils/StepIndicator';
import type { URLFieldHandle } from '../utils/URLField';
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
  async generateInstructions(integrations: IntegrationInput[]): Promise<string[]> {
    const response = await fetch(`${this['endpoint']}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this['apiKey']}`
      },
      body: JSON.stringify({
        query: `
          query GenerateInstructions($integrations: [IntegrationInput!]!) {
            generateInstructions(integrations: $integrations)
          }
        `,
        variables: { integrations }
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

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [currentIntegration, setCurrentIntegration] = useState<Integration>({
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
  const [integrationFormVisible, setIntegrationFormVisible] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
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

  const [showSchemaEditor, setShowSchemaEditor] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const [reviewCredentials, setReviewCredentials] = useState<string>(
    JSON.stringify((currentWorkflow && (currentWorkflow as any).credentials) || {}, null, 2)
  );

  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<string[]>([]);

  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [integrationSearch, setIntegrationSearch] = useState('');
  const [showIntegrationForm, setShowIntegrationForm] = useState(false);
  const [integrationFormEdit, setIntegrationFormEdit] = useState<Integration | null>(null);

  const client = useMemo(() => new ExtendedSuperglueClient({
    endpoint: superglueConfig.superglueEndpoint,
    apiKey: superglueConfig.superglueApiKey,
  }), [superglueConfig.superglueEndpoint, superglueConfig.superglueApiKey]);

  // Create integration options array with custom option first
  const integrationOptions = [
    { value: "custom", label: "Custom", icon: "default" },
    ...Object.entries(integrationTemplates).map(([key, integration]) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
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

  // Auto-open integration form when no integrations exist and we're on the integrations step
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    client.listIntegrations(100, 0)
      .then(({ items }) => {
        if (ignore) return;
        setIntegrations(items);
        if (items.length === 0) setAddModalOpen(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [client]);

  const handleUrlChange = (urlHost: string, urlPath: string, queryParams?: Record<string, string>) => {
    const normalizedUrlPath = urlPath === "/" ? "" : urlPath;
    if (urlHost) {
      const match = findMatchingIntegration(urlHost);
      setCurrentIntegration(prev => ({
        ...prev,
        urlHost,
        urlPath: normalizedUrlPath,
        id: idManuallyEdited ? prev.id : sanitizeIntegrationId(urlHost),
        documentationUrl: prev.documentationUrl || match?.integration.docsUrl,
      }));
    }
  }

  const sanitizeIntegrationId = (id: string) => {
    return id
      .replace('www.', '')
      .replace('api.', '')
      .replace('http://', '')
      .replace('https://', '')
      .replace(/\./g, "-") // Replace dots with hyphens
      .replace(/ /g, "-") // Replace spaces with hyphens
      .replace(/[^a-zA-Z0-9-]/g, ""); // Remove special characters
  };

  // --- Step Navigation ---
  const handleNext = async () => {
    const steps: WorkflowCreateStep[] = ['integrations', 'prompt', 'review', 'success'];
    const currentIndex = steps.indexOf(step);

    if (step === 'integrations') {
      if (integrations.length === 0) {
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
        // Wait for docs to be ready
        await waitForIntegrationsReady(selectedIntegrationIds, client, toast);
        // Refresh integrations list to ensure up-to-date docs
        const { items: freshIntegrations } = await client.listIntegrations(100, 0);
        setIntegrations(freshIntegrations);
        const schema = await client.generateSchema(instruction, "");
        setSchema(JSON.stringify(schema, null, 2));
        const parsedPayload = JSON.parse(payload || '{}');
        const integrationInputRequests = selectedIntegrationIds
          .map(id => freshIntegrations.find(i => i.id === id))
          .filter(Boolean)
          .map(i => ({ integration: toIntegrationInput(i) }));
        const response = await client.buildWorkflow({
          instruction: instruction,
          payload: parsedPayload,
          integrations: integrationInputRequests,
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
          steps: currentWorkflow.steps.map((step: any) => ({
            ...step,
            apiConfig: {
              ...(step.apiConfig || {}),
              id: step.apiConfig?.id || step.id,
            }
          })),
          integrationIds: selectedIntegrationIds,
          inputSchema: currentWorkflow.inputSchema,
          finalTransform: currentWorkflow.finalTransform,
          responseSchema: JSON.parse(schema),
          instruction: instruction
        };
        const response = await client.upsertWorkflow(currentWorkflow.id, workflowInput);
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
      if (onComplete) {
        onComplete();
      } else {
        router.push('/');
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
      setCurrentIntegration(prev => ({
        ...prev,
        urlHost: '',
        urlPath: '',
        documentationUrl: ''
      }));
      return;
    }

    // Use the static template
    const integration = integrationTemplates[value];
    if (integration) {
      const apiUrl = integration.apiUrl || '';
      const { urlHost, urlPath } = splitUrl(apiUrl);
      setCurrentIntegration(prev => ({
        ...prev,
        id: idManuallyEdited ? prev.id : sanitizeIntegrationId(value),
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
      const result = await client.executeWorkflow({
        workflow: {
          id: currentWorkflow.id,
          steps: currentWorkflow.steps,
          responseSchema: JSON.parse(schema),
          finalTransform: currentWorkflow.finalTransform,
          inputSchema: currentWorkflow.inputSchema,
          instruction: currentWorkflow.instruction
        },
        payload: JSON.parse(payload || '{}'),
        credentials: parseCredentialsHelper(reviewCredentials)
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

  // Helper to convert Integration to IntegrationInput (strip extra fields)
  const toIntegrationInput = (i: Integration): IntegrationInput => ({
    id: i.id,
    urlHost: i.urlHost,
    urlPath: i.urlPath,
    documentationUrl: i.documentationUrl,
    documentation: i.documentation,
    credentials: i.credentials,
  });

  // Modify handleGenerateInstructions
  const handleGenerateInstructions = async () => {
    if (selectedIntegrationIds.length === 0) {
      toast({
        title: 'No Integrations',
        description: 'Add at least one integration to get suggestions.',
        variant: 'destructive',
      });
      return;
    }
    setIsGeneratingSuggestions(true);
    try {
      const selectedIntegrationInputs = selectedIntegrationIds
        .map(id => integrations.find(i => i.id === id))
        .filter(Boolean)
        .map(toIntegrationInput);
      const suggestionsText = await client.generateInstructions(selectedIntegrationInputs);
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

  const handleCancelEditOrAdd = () => {
    setIntegrationFormVisible(false);
    setValidationErrors({});
    setIdManuallyEdited(false);
    setSelectedIntegration("custom");
    setCurrentIntegration({
      id: '',
      urlHost: '',
      urlPath: '',
      documentationUrl: '',
      documentation: '',
      credentials: {},
    });
  };

  const reviewCredentialsRef = useRef<string>(reviewCredentials);

  useEffect(() => {
    if (step === 'review') {
      const flatCreds = flattenAndNamespaceWorkflowCredentials(
        integrations.map(sys => ({
          id: sys.id,
          credentials: sys.credentials || {}
        }))
      );
      setReviewCredentials(JSON.stringify(flatCreds, null, 2));
      setCurrentWorkflow({ ...(currentWorkflow as any), credentials: flatCreds } as any);
    }
    // eslint-disable-next-line
  }, [step, integrations]);

  function handleSelectIntegration(id: string) {
    setSelectedIntegrationIds(ids => ids.includes(id) ? ids : [...ids, id]);
  }

  function handleDeselectIntegration(id: string) {
    setSelectedIntegrationIds(ids => ids.filter(i => i !== id));
  }

  // When moving to the next step:
  const integrationInputRequests = selectedIntegrationIds.map(id => ({ id }));

  // For instruction generation:
  const resolvedIntegrations = selectedIntegrationIds
    .map(id => integrations.find(i => i.id === id))
    .filter(Boolean);

  // Filtered integrations for search
  const filteredIntegrations = useMemo(() => {
    if (!integrationSearch.trim()) return integrations;
    const term = integrationSearch.toLowerCase();
    return integrations.filter(i =>
      i.id.toLowerCase().includes(term) ||
      i.urlHost.toLowerCase().includes(term) ||
      (i.urlPath && i.urlPath.toLowerCase().includes(term))
    );
  }, [integrationSearch, integrations]);

  // Helper: sort integrations so selected are always at the top
  const sortIntegrations = (list, selectedIds) => [
    ...list.filter(i => selectedIds.includes(i.id)),
    ...list.filter(i => !selectedIds.includes(i.id))
  ];
  const [sortedIntegrations, setSortedIntegrations] = useState(sortIntegrations(filteredIntegrations, selectedIntegrationIds));
  useEffect(() => {
    setSortedIntegrations(sortIntegrations(filteredIntegrations, selectedIntegrationIds));
  }, [filteredIntegrations, selectedIntegrationIds]);

  // --- Integration Management (add/edit) ---
  const handleOpenAddIntegration = () => {
    setIntegrationFormEdit(null);
    setShowIntegrationForm(true);
  };
  const handleOpenEditIntegration = (integration: Integration) => {
    setIntegrationFormEdit(integration);
    setShowIntegrationForm(true);
  };
  const handleIntegrationFormSave = async (integration: Integration) => {
    // Close form immediately
    setShowIntegrationForm(false);
    setIntegrationFormEdit(null);

    // Handle background operations
    setLoading(true);
    try {
      await client.upsertIntegration(integration.id, integration);
      // Wait for docs to be ready in background
      waitForIntegrationsReady([integration.id], client, toast);
      const { items } = await client.listIntegrations(100, 0);
      setIntegrations(items);
      setSelectedIntegrationIds(ids => ids.includes(integration.id) ? ids : [...ids, integration.id]);
    } finally {
      setLoading(false);
    }
  };
  const handleIntegrationFormCancel = () => {
    setShowIntegrationForm(false);
    setIntegrationFormEdit(null);
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
          {/* Step 1: Integrations */}
          {step === 'integrations' && (
            <div className="space-y-4">
              <p className="text-muted-foreground mb-4">
                Select one or more integrations to use in your workflow. You can add new integrations as needed.
              </p>
              <div className="mb-2 flex gap-2 items-center">
                <Input
                  placeholder="Search integrations..."
                  value={integrationSearch}
                  onChange={e => setIntegrationSearch(e.target.value)}
                  className="w-full max-w-md"
                />
                <Button variant="outline" size="sm" onClick={handleOpenAddIntegration}>
                  <Plus className="mr-2 h-4 w-4" /> Add Integration
                </Button>
              </div>
              <div className="rounded-md bg-muted/50" style={{ height: 320 }}>
                <List
                  height={320}
                  itemCount={sortedIntegrations.length}
                  itemSize={72}
                  width="100%"
                >
                  {({ index, style }) => {
                    const sys = sortedIntegrations[index];
                    const selected = selectedIntegrationIds.includes(sys.id);
                    return (
                      <div
                        key={sys.id}
                        style={style}
                        className={cn(
                          "flex items-center justify-between px-4 py-3 cursor-pointer transition-colors rounded-lg",
                          selected ? "bg-primary/20" : "hover:bg-accent/50"
                        )}
                        onClick={() => {
                          if (selected) {
                            setSelectedIntegrationIds(ids => ids.filter(i => i !== sys.id));
                          } else {
                            setSelectedIntegrationIds(ids => {
                              const newIds = [...ids, sys.id];
                              // Move selected to top by reordering sortedIntegrations
                              setSortedIntegrations(sortIntegrations(filteredIntegrations, newIds));
                              return newIds;
                            });
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
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
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate max-w-[200px]">{sys.id}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[240px]">
                              {composeUrl(sys.urlHost, sys.urlPath)}
                            </span>
                          </div>
                          {(!sys.credentials || Object.keys(sys.credentials).length === 0) && (
                            <span className="ml-2 text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">No credentials</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={e => { e.stopPropagation(); handleOpenEditIntegration(sys); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => { }}
                            className="ml-2 accent-primary"
                            tabIndex={-1}
                            readOnly
                          />
                        </div>
                      </div>
                    );
                  }}
                </List>
              </div>
              {showIntegrationForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                  <div className="bg-background rounded-xl max-w-2xl w-full p-0">
                    <IntegrationForm
                      modal={true}
                      integration={integrationFormEdit || undefined}
                      onSave={handleIntegrationFormSave}
                      onCancel={handleIntegrationFormCancel}
                      integrationOptions={integrationOptions}
                      getSimpleIcon={getSimpleIcon}
                      inputErrorStyles={inputErrorStyles}
                    />
                  </div>
                </div>
              )}
              {integrations.length === 0 && !showIntegrationForm && (
                <p className="text-sm text-muted-foreground italic text-center py-4">
                  No integrations added yet. Define the APIs or data sources your workflow will use.
                </p>
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
                <div className={cn(
                  "flex-1 min-h-0 code-editor rounded-md border bg-transparent",
                  validationErrors.payload ? inputErrorStyles : "border-input"
                )}>
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
                    className="font-mono text-xs w-full min-h-[60px] bg-transparent"
                  />
                </div>
                {validationErrors.payload && (
                  <div className="bg-red-500/10 text-red-500 p-2 text-xs mt-1 rounded">
                    Invalid JSON format
                  </div>
                )}
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
                  </div>
                  {/* Recap of instruction */}
                  <div className="mb-2">
                    <Label>Instruction</Label>
                    <div className="font-mono text-xs text-muted-foreground rounded px-2 py-1 mt-1 break-words">
                      {instruction}
                    </div>
                  </div>

                  {/* Editable credentials input */}
                  <div className="mb-4">
                    <Label htmlFor="review-credentials">Credentials</Label>
                    <HelpTooltip text='API keys or tokens needed for this workflow. Enter without any prefix like Bearer. If you need to add new credentials keys to the JSON, go back and add them to your integrations or add them to the workflow variables.' />
                    <div className="w-full max-w-full">
                      <Input
                        value={reviewCredentials}
                        onChange={(e) => {
                          setReviewCredentials(e.target.value);
                          try {
                            const parsed = JSON.parse(e.target.value);
                            setCurrentWorkflow({ ...(currentWorkflow as any), credentials: parsed } as any);
                          } catch (e) {
                            // ignore parse errors for now
                          }
                        }}
                        placeholder="Enter credentials"
                        className={cn("min-h-10 font-mono text-xs", validationErrors.credentials && inputErrorStyles)}
                      />
                    </div>
                    {(() => {
                      try {
                        const creds = JSON.parse(reviewCredentials);
                        if (!creds || Object.keys(creds).length === 0) {
                          return (
                            <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mt-2">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              No credentials added
                            </div>
                          );
                        }
                        return null;
                      } catch {
                        return (
                          <div className="text-xs text-red-600 flex items-center gap-1.5 bg-red-500/10 py-1 px-2 rounded mt-2">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            Invalid JSON format
                          </div>
                        );
                      }
                    })()}
                  </div>

                  {/* Editable workflow variables (payload) input */}
                  <div className="mb-4">
                    <Label htmlFor="review-payload">Workflow Variables</Label>
                    <HelpTooltip text="Dynamic variables for the workflow as a JSON object. These are equivalent to your workflow's initial payload and can be referenced in the entire config." />
                    <div className={cn(
                      "w-full max-w-full code-editor rounded-md border bg-transparent",
                      validationErrors.payload ? inputErrorStyles : "border-input"
                    )}>
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
                        className="font-mono text-xs w-full min-h-[60px] bg-transparent"
                      />
                    </div>
                    {validationErrors.payload && (
                      <div className="bg-red-500/10 text-red-500 p-2 text-xs mt-1 rounded">
                        Invalid JSON format
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    {/* Workflow Steps Toggle */}
                    <div
                      className="flex items-center gap-2 cursor-pointer select-none"
                      onClick={() => setShowSteps(!showSteps)}
                      role="button"
                      tabIndex={0}
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          showSteps && "rotate-90"
                        )}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-sm">Workflow Steps</span>
                    </div>
                    {showSteps && (
                      <div className="flex-1 min-h-0 bg-background h-[200px] mb-2">
                        <WorkflowStepsView
                          steps={currentWorkflow.steps}
                          onStepsChange={handleStepsChange}
                          onStepEdit={handleStepEdit}
                        />
                      </div>
                    )}
                    {/* Response Schema Editor Toggle */}
                    <div
                      className="flex items-center gap-2 cursor-pointer select-none"
                      onClick={() => setShowSchemaEditor(!showSchemaEditor)}
                      role="button"
                      tabIndex={0}
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          showSchemaEditor && "rotate-90"
                        )}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-sm">Response Schema Editor</span>
                    </div>
                    {showSchemaEditor && (
                      <div className="bg-background mt-2 mb-4">
                        <JsonSchemaEditor
                          isOptional={true}
                          value={schema}
                          onChange={setSchema}
                        />
                      </div>
                    )}
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
                  Object.values(integrations).reduce((acc, sys: any) => {
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
            (step === 'integrations' && (integrationFormVisible || isBuilding || isSaving)) ||
            isBuilding || isSaving
          }
        >
          Back
        </Button>
        <div className="flex gap-2">
          {step === 'review' && (
            <Button
              onClick={handleExecuteWorkflow}
              disabled={isExecuting}
              variant="success"
            >
              {isExecuting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Executing...</>
              ) : (
                <><Play className="mr-2 h-4 w-4" /> Test Workflow</>
              )}
            </Button>
          )}
          <Button
            onClick={() => {
              urlFieldRef.current?.commit()
              handleNext()
            }}
            disabled={
              isBuilding ||
              isSaving ||
              isGeneratingSuggestions ||
              (step === 'integrations' && (integrationFormVisible || integrations.length === 0 || selectedIntegrationIds.length === 0))
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
    </div>
  );
}
