import { useConfig } from '@/src/app/config-context';
import { IntegrationForm } from '@/src/components/integrations/IntegrationForm';
import { useIntegrationPolling } from '@/src/hooks/use-integration-polling';
import { useToast } from '@/src/hooks/use-toast';
import { inputErrorStyles, parseCredentialsHelper } from '@/src/lib/client-utils';
import { findMatchingIntegration, integrations as integrationTemplates, waitForIntegrationsReady } from '@/src/lib/integrations';
import { cn, composeUrl } from '@/src/lib/utils';
import { Integration, IntegrationInput, SuperglueClient, Workflow, WorkflowResult } from '@superglue/client';
import { ArrowRight, ChevronRight, Globe, Loader2, Pencil, Play, Plus, RotateCw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { DocStatus } from '../utils/DocStatusSpinner';
import { HelpTooltip } from '../utils/HelpTooltip';
import JsonSchemaEditor from '../utils/JsonSchemaEditor';
import { StepIndicator, WORKFLOW_CREATE_STEPS } from '../utils/StepIndicator';
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
  const [instruction, setInstruction] = useState('');
  const [payload, setPayload] = useState('{}');
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null); // To store result from buildWorkflow

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

  const [loading, setLoading] = useState(false);

  const [integrationSearch, setIntegrationSearch] = useState('');
  const [showIntegrationForm, setShowIntegrationForm] = useState(false);
  const [integrationFormEdit, setIntegrationFormEdit] = useState<Integration | null>(null);

  const client = useMemo(() => new ExtendedSuperglueClient({
    endpoint: superglueConfig.superglueEndpoint,
    apiKey: superglueConfig.superglueApiKey,
  }), [superglueConfig.superglueEndpoint, superglueConfig.superglueApiKey]);

  // Get integration IDs for polling
  const integrationIds = useMemo(() => integrations.map(i => i.id), [integrations]);

  // Track previous pending IDs to detect completion
  const previousPendingIdsRef = useRef<Set<string>>(new Set());

  // Poll for documentation status
  const { pendingIds, isPolling, hasPending } = useIntegrationPolling({
    client,
    integrationIds,
    enabled: integrations.length > 0
  });

  // Detect when documentation processing completes and show toast
  useEffect(() => {
    const currentPendingIds = new Set(pendingIds);
    const previousPendingIds = previousPendingIdsRef.current;

    // Find integrations that were pending before but are no longer pending
    const completedIds = Array.from(previousPendingIds).filter(id => !currentPendingIds.has(id));

    if (completedIds.length > 0) {
      completedIds.forEach(id => {
        const integration = integrations.find(i => i.id === id);
        if (integration) {
          toast({
            title: 'Documentation Ready',
            description: `Documentation for integration "${integration.id}" is now ready!`,
            variant: 'default',
          });
        }
      });
    }

    // Update the ref for next comparison
    previousPendingIdsRef.current = currentPendingIds;
  }, [pendingIds, integrations, toast]);

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
        if (items.length === 0) setShowIntegrationForm(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [client]);

  // Add this helper function near the top of the component
  const highlightJson = (code: string) => {
    return Prism.highlight(code, Prism.languages.json, 'json');
  };

  // Helper function to determine if integration has documentation
  const hasDocumentation = (integration: Integration) => {
    // Check for direct documentation content or URL
    const hasDirectDocs = !!(integration.documentation || integration.documentationUrl);

    // For direct doc upload scenarios, if there's documentation content, consider it available
    if (integration.documentation && integration.documentation.trim()) {
      return true;
    }

    // For URL-based docs, check if has URL
    if (integration.documentationUrl) {
      return true;
    }

    return hasDirectDocs;
  };

  // Function to refresh documentation for a specific integration
  const handleRefreshDocs = async (integrationId: string) => {
    try {
      const integration = integrations.find(i => i.id === integrationId);
      if (!integration) return;

      // Trigger manual documentation refresh by upserting with only required fields
      // Don't pass existing documentation to avoid large payloads
      // Note: documentationPending is set by the backend, not the client
      await client.upsertIntegration(integrationId, {
        id: integration.id,
        urlHost: integration.urlHost,
        urlPath: integration.urlPath,
        documentationUrl: integration.documentationUrl,
        credentials: integration.credentials || {},
      });

      // Refresh the integrations list to update doc status
      const { items } = await client.listIntegrations(100, 0);
      setIntegrations(items);
    } catch (error) {
      console.error('Error refreshing docs:', error);
      toast({
        title: 'Error Refreshing Docs',
        description: 'Failed to refresh documentation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // --- Integration Management (add/edit) ---
  const handleIntegrationFormSave = async (integration: Integration) => {
    // Close form immediately
    setShowIntegrationForm(false);
    setIntegrationFormEdit(null);

    // Handle background operations
    setLoading(true);
    try {
      await client.upsertIntegration(integration.id, integration);
      // Wait for docs to be ready in background - no toast needed since UI shows spinner
      waitForIntegrationsReady([integration.id], client, null);
      // Refresh integrations list to get updated data including documentation
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
        toast({
          title: 'Validation Error',
          description: 'Please provide a valid instruction and JSON payload.',
          variant: 'destructive',
        });
        return;
      }
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
          integrationIds: selectedIntegrationIds,
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
                <Button variant="outline" size="sm" onClick={() => setShowIntegrationForm(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Integration
                </Button>
              </div>
              <div className="rounded-md bg-muted/50 overflow-y-auto" style={{ height: 320 }}>
                {loading ? (
                  <div className="h-full bg-background" />
                ) : integrations.length === 0 ? (
                  <div className="h-[320px] flex items-center justify-center bg-background">
                    <p className="text-sm text-muted-foreground italic">
                      No integrations added yet. Define the APIs or data sources your workflow will use.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {integrations.map(sys => {
                      const selected = selectedIntegrationIds.includes(sys.id);
                      return (
                        <div
                          key={sys.id}
                          className={cn(
                            "flex items-center justify-between px-4 py-3 cursor-pointer transition-colors",
                            selected ? "bg-primary/20" : "hover:bg-accent/50"
                          )}
                          onClick={() => {
                            if (selected) {
                              setSelectedIntegrationIds(ids => ids.filter(i => i !== sys.id));
                            } else {
                              setSelectedIntegrationIds(ids => {
                                const newIds = [...ids, sys.id];
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
                            <div className="flex flex-col items-center gap-2">
                              <div className="flex items-center gap-2">
                                <DocStatus
                                  pending={pendingIds.includes(sys.id)}
                                  hasDocumentation={hasDocumentation(sys)}
                                />
                                {(!sys.credentials || Object.keys(sys.credentials).length === 0) && (
                                  <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">No credentials</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={e => { e.stopPropagation(); setIntegrationFormEdit(sys); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={e => { e.stopPropagation(); handleRefreshDocs(sys.id); }}
                              disabled={!sys.documentationUrl || !sys.documentationUrl.trim() || pendingIds.includes(sys.id)}
                              title={sys.documentationUrl && sys.documentationUrl.trim() ? "Refresh documentation from URL" : "No documentation URL to refresh"}
                            >
                              <RotateCw className="h-4 w-4" />
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
                    })}
                  </div>
                )}
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
                    onChange={(e) => { setInstruction(e.target.value); }}
                    placeholder="e.g., 'Fetch customer details from CRM using the input email, then get their recent orders from productApi.'"
                    className={cn("min-h-80")}
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
                )}>
                  <Editor
                    value={payload}
                    onValueChange={(code) => {
                      setPayload(code);
                    }}
                    highlight={highlightJson}
                    padding={10}
                    tabSize={2}
                    insertSpaces={true}
                    className="font-mono text-xs w-full min-h-[60px] bg-transparent"
                  />
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
                        }}
                        placeholder="Enter credentials"
                        className={cn("min-h-10 font-mono text-xs")}
                      />
                    </div>
                  </div>

                  {/* Editable workflow variables (payload) input */}
                  <div className="mb-4">
                    <Label htmlFor="review-payload">Workflow Variables</Label>
                    <HelpTooltip text="Dynamic variables for the workflow as a JSON object. These are equivalent to your workflow's initial payload and can be referenced in the entire config." />
                    <div className={cn(
                      "w-full max-w-full code-editor rounded-md border bg-transparent",
                    )}>
                      <Editor
                        value={payload}
                        onValueChange={(code) => {
                          setPayload(code);
                        }}
                        highlight={highlightJson}
                        padding={10}
                        tabSize={2}
                        insertSpaces={true}
                        className="font-mono text-xs w-full min-h-[60px] bg-transparent"
                      />
                    </div>
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
            (step === 'integrations' && showIntegrationForm) ||
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
            onClick={handleNext}
            disabled={
              isBuilding ||
              isSaving ||
              isGeneratingSuggestions ||
              (step === 'integrations' && integrations.length === 0)
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
