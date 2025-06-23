import { useConfig } from '@/src/app/config-context';
import { useIntegrations } from '@/src/app/integrations-context';
import { IntegrationForm } from '@/src/components/integrations/IntegrationForm';
import { useIntegrationPolling } from '@/src/hooks/use-integration-polling';
import { useToast } from '@/src/hooks/use-toast';
import { inputErrorStyles, needsUIToTriggerDocFetch, parseCredentialsHelper } from '@/src/lib/client-utils';
import { findMatchingIntegration, integrations as integrationTemplates } from '@/src/lib/integrations';
import { cn, composeUrl } from '@/src/lib/utils';
import { Integration, IntegrationInput, SuperglueClient, UpsertMode, Workflow, WorkflowResult } from '@superglue/client';
import { flattenAndNamespaceWorkflowCredentials } from '@superglue/shared/utils';
import { ArrowRight, Check, ChevronRight, FileText, Globe, Loader2, Pencil, Play, Plus, Workflow as WorkflowIcon, X } from 'lucide-react';
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
import { Switch } from '../ui/switch';
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

  const { integrations, pendingDocIds, loading, setPendingDocIds, refreshIntegrations } = useIntegrations();

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

  const [integrationSearch, setIntegrationSearch] = useState('');
  const [showIntegrationForm, setShowIntegrationForm] = useState(false);
  const [integrationFormEdit, setIntegrationFormEdit] = useState<Integration | null>(null);

  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});


  const client = useMemo(() => new ExtendedSuperglueClient({
    endpoint: superglueConfig.superglueEndpoint,
    apiKey: superglueConfig.superglueApiKey,
  }), [superglueConfig.superglueEndpoint, superglueConfig.superglueApiKey]);

  const { waitForIntegrationReady } = useIntegrationPolling(client);

  // Track previous pending IDs to detect completion
  const previousPendingIdsRef = useRef<Set<string>>(new Set());

  // Create integration options array with custom option first
  const integrationOptions = [
    { value: "custom", label: "Custom", icon: "default" },
    ...Object.entries(integrationTemplates).map(([key, integration]) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      icon: integration.icon || "default"
    }))
  ];

  // Auto-open integration form when no integrations exist and we're on the integrations step
  useEffect(() => {
    if (integrations.length === 0) {
      setShowIntegrationForm(true);
    }
  }, [integrations.length]);

  // Add this helper function near the top of the component
  const highlightJson = (code: string) => {
    return Prism.highlight(code, Prism.languages.json, 'json');
  };

  const generateDefaultFromSchema = (schema: any): any => {
    if (!schema || typeof schema !== 'object') return {};

    if (schema.type === 'object' && schema.properties) {
      const result: any = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        result[key] = generateDefaultFromSchema(propSchema);
      }
      return result;
    }

    if (schema.type === 'array') {
      return [];
    }

    if (schema.type === 'string') {
      return schema.default || '';
    }

    if (schema.type === 'number' || schema.type === 'integer') {
      return schema.default || 0;
    }

    if (schema.type === 'boolean') {
      return schema.default || false;
    }

    return schema.default || null;
  };

  // Helper function to determine if integration has documentation
  const hasDocumentation = (integration: Integration) => {
    // Check for direct documentation content or URL
    const hasDirectDocs = !!(integration.documentation || integration.documentationUrl);

    // For direct doc upload scenarios, if there's documentation content, consider it available
    // even if documentationPending might be true (since it's already uploaded)
    if (integration.documentation && integration.documentation.trim()) {
      return true;
    }

    // For URL-based docs, check if not pending and has URL
    if (integration.documentationUrl && !pendingDocIds.has(integration.id)) {
      return true;
    }

    return hasDirectDocs;
  };

  // Function to refresh documentation for a specific integration
  const handleRefreshDocs = async (integrationId: string) => {
    // Set pending state immediately
    setPendingDocIds(prev => new Set([...prev, integrationId]));

    try {
      // Get current integration to upsert with documentationPending=true
      const integration = integrations.find(i => i.id === integrationId);
      if (!integration) return;

      // Use documentationPending flag to trigger backend refresh
      const upsertData = {
        id: integration.id,
        urlHost: integration.urlHost,
        urlPath: integration.urlPath,
        documentationUrl: integration.documentationUrl,
        credentials: integration.credentials || {},
        documentation: integration.documentation || '', // Keep existing docs
        documentationPending: true // Trigger refresh
      };

      await client.upsertIntegration(integrationId, upsertData, UpsertMode.UPDATE);

      // Use proper polling to wait for docs to be ready
      const results = await waitForIntegrationReady([integrationId], 60000);

      if (results.length > 0 && results[0]?.documentation) {
        // Success - docs are ready
        setPendingDocIds(prev => new Set([...prev].filter(id => id !== integrationId)));
      } else {
        // Polling failed - reset documentationPending to false
        await client.upsertIntegration(integrationId, {
          ...upsertData,
          documentationPending: false
        }, UpsertMode.UPDATE);

        setPendingDocIds(prev => new Set([...prev].filter(id => id !== integrationId)));
      }

    } catch (error) {
      console.error('Error refreshing docs:', error);
      // Reset documentationPending to false on error
      try {
        const integration = integrations.find(i => i.id === integrationId);
        if (integration) {
          await client.upsertIntegration(integrationId, {
            id: integration.id,
            urlHost: integration.urlHost,
            urlPath: integration.urlPath,
            documentationUrl: integration.documentationUrl,
            credentials: integration.credentials || {},
            documentation: integration.documentation || '',
            documentationPending: false
          }, UpsertMode.UPDATE);
        }
      } catch (resetError) {
        console.error('Error resetting documentationPending:', resetError);
      }

      setPendingDocIds(prev => new Set([...prev].filter(id => id !== integrationId)));
    }
  };

  // --- Integration Management (add/edit) ---
  const handleIntegrationFormSave = async (integration: Integration) => {
    // Close form immediately
    setShowIntegrationForm(false);
    setIntegrationFormEdit(null);

    // Handle background operations
    try {
      const mode = integrationFormEdit ? UpsertMode.UPDATE : UpsertMode.CREATE;
      const savedIntegration = await client.upsertIntegration(integration.id, integration, mode);
      const needsDocFetch = needsUIToTriggerDocFetch(savedIntegration, integrationFormEdit);

      if (needsDocFetch) {
        // Set pending state for new integrations with doc URLs
        setPendingDocIds(prev => new Set([...prev, savedIntegration.id]));

        // Wait for docs to be ready in background - no toast needed since UI shows spinner
        waitForIntegrationReady([savedIntegration.id], 60000).then(() => {
          // Remove from pending when done
          setPendingDocIds(prev => new Set([...prev].filter(id => id !== savedIntegration.id)));
        }).catch((error) => {
          console.error('Error waiting for docs:', error);
          // Remove from pending on error
          setPendingDocIds(prev => new Set([...prev].filter(id => id !== savedIntegration.id)));
        });
      }

      setSelectedIntegrationIds(ids => {
        const newIds = ids.filter(id => id !== (integrationFormEdit?.id || integration.id));
        newIds.push(savedIntegration.id);
        return newIds;
      });

      // Refresh integrations to ensure UI is updated
      await refreshIntegrations();
    } catch (error) {
      console.error('Error saving integration:', error);
      toast({
        title: 'Error Saving Integration',
        description: error instanceof Error ? error.message : 'Failed to save integration',
        variant: 'destructive',
      });
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

      // Check if any selected integrations are still pending
      const pendingSelectedIds = selectedIntegrationIds.filter(id => pendingDocIds.has(id));
      if (pendingSelectedIds.length > 0) {
        toast({
          title: 'Documentation Still Processing',
          description: `Please wait for documentation to finish processing for: ${pendingSelectedIds.join(', ')}`,
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
        // Check if any selected integrations are still pending locally
        const pendingSelectedIds = selectedIntegrationIds.filter(id => pendingDocIds.has(id));
        if (pendingSelectedIds.length > 0) {
          toast({
            title: 'Documentation Still Processing',
            description: `Please wait for documentation to finish processing for: ${pendingSelectedIds.join(', ')}`,
            variant: 'destructive',
          });
          return;
        }

        // Wait for docs to be ready
        await waitForIntegrationReady(selectedIntegrationIds, 60000);
        const freshIntegrations = integrations; // Use the updated integrations from context
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

        // Populate review credentials from integrations
        const selectedIntegrations = selectedIntegrationIds
          .map(id => freshIntegrations.find(i => i.id === id))
          .filter(Boolean);
        const credentialsFromIntegrations = flattenAndNamespaceWorkflowCredentials(selectedIntegrations);
        setReviewCredentials(JSON.stringify(credentialsFromIntegrations, null, 2));

        // Populate payload with required fields from inputSchema
        if (response.inputSchema) {
          try {
            const defaultValues = generateDefaultFromSchema(response.inputSchema);
            if (defaultValues.payload !== undefined) {
              setPayload(JSON.stringify(defaultValues.payload, null, 2));
            } else {
              setPayload('{}');
            }
          } catch (error) {
            console.warn('Failed to generate payload from schema:', error);
            setPayload('{}');
          }
        } else {
          setPayload('{}');
        }

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
              onClick={() => window.open('https://cal.com/supergle/onboarding', '_blank')}
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
              <div className="mb-4">
                <h3 className="mb-2 font-medium">
                  Select one or more integrations to use in your workflow. You can add new integrations as needed.
                </h3>
              </div>
              <div className="mb-2 flex gap-2 items-center">
                <Input
                  placeholder="Search integrations..."
                  value={integrationSearch}
                  onChange={e => setIntegrationSearch(e.target.value)}
                  className="w-full"
                />
                <Button variant="outline" size="sm" className="h-9" onClick={() => setShowIntegrationForm(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Integration
                </Button>
              </div>
              <div className="overflow-y-auto" style={{ height: 320 }}>
                {loading ? (
                  <div className="h-full bg-background" />
                ) : integrations.length === 0 ? (
                  <div className="h-[320px] flex items-center justify-center bg-background">
                    <p className="text-sm text-muted-foreground italic">
                      No integrations added yet. Define the APIs or data sources your workflow will use.
                    </p>
                  </div>
                ) : (
                  <div className="gap-2 flex flex-col">
                    {/* Header row */}
                    <div className="flex items-center justify-between px-2 py-2 text-sm font-medium text-foreground border-b">
                      <span>Integration</span>
                      <div className="flex items-center gap-2">
                        <span>Selected</span>
                        <Button
                          variant="default"
                          size="icon"
                          className="h-4 w-4 p-0"
                          onClick={() => {
                            const filteredIntegrations = integrations.filter(sys =>
                              integrationSearch === '' ||
                              sys.id.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                              sys.urlHost.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                              sys.urlPath.toLowerCase().includes(integrationSearch.toLowerCase())
                            );
                            const filteredIds = filteredIntegrations.map(i => i.id);
                            const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIntegrationIds.includes(id));

                            if (allSelected) {
                              // Unselect all filtered
                              setSelectedIntegrationIds(ids => ids.filter(id => !filteredIds.includes(id)));
                            } else {
                              // Select all filtered
                              setSelectedIntegrationIds(ids => [...new Set([...ids, ...filteredIds])]);
                            }
                          }}
                        >
                          {(() => {
                            const filteredIntegrations = integrations.filter(sys =>
                              integrationSearch === '' ||
                              sys.id.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                              sys.urlHost.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                              sys.urlPath.toLowerCase().includes(integrationSearch.toLowerCase())
                            );
                            const filteredIds = filteredIntegrations.map(i => i.id);
                            const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIntegrationIds.includes(id));
                            return allSelected ? <Check className="h-2 w-2" /> : <div className="h-2 w-2" />;
                          })()}
                        </Button>
                      </div>
                    </div>
                    {selectedIntegrationIds.length === 0 && integrations.length > 0 && (
                      <div className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded whitespace-nowrap mx-4 mt-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Select at least one integration
                      </div>
                    )}
                    {integrations
                      .filter(sys =>
                        integrationSearch === '' ||
                        sys.id.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                        sys.urlHost.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                        sys.urlPath.toLowerCase().includes(integrationSearch.toLowerCase())
                      )
                      .map(sys => {
                        const selected = selectedIntegrationIds.includes(sys.id);
                        return (
                          <div
                            key={sys.id}
                            className={cn(
                              "flex items-center justify-between rounded-md px-4 py-3 transition-colors",
                              selected
                                ? "hover:bg-accent/50 border border-[#ffffff/10]"
                                : "hover:bg-accent/50 border border-transparent"
                            )}
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
                                  <Globe className="h-5 w-5 flex-shrink-0 text-foreground" />
                                );
                              })()}
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium truncate max-w-[200px]">{sys.id}</span>
                                <span className="text-xs text-foreground truncate max-w-[240px]">
                                  {composeUrl(sys.urlHost, sys.urlPath)}
                                </span>
                              </div>
                              <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2">
                                  <DocStatus
                                    pending={pendingDocIds.has(sys.id)}
                                    hasDocumentation={hasDocumentation(sys)}
                                  />
                                  {(!sys.credentials || Object.keys(sys.credentials).length === 0) && (
                                    <span className="text-xs text-amber-800 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">No credentials</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 items-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={e => {
                                  e.stopPropagation();
                                  setIntegrationFormEdit(sys);
                                  setShowIntegrationForm(true);
                                }}
                                disabled={pendingDocIds.has(sys.id)}
                                title={pendingDocIds.has(sys.id) ? "Documentation is being processed" : "Edit integration"}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Switch
                                className="custom-switch"
                                checked={selected}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedIntegrationIds(ids => [...ids, sys.id]);
                                  } else {
                                    setSelectedIntegrationIds(ids => ids.filter(i => i !== sys.id));
                                  }
                                }}
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
                    <div className="font-mono text-sm text-foreground rounded py-1 mt-1 break-words flex items-start gap-2">
                      {instruction}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 text-foreground hover:text-foreground flex-shrink-0"
                        onClick={() => setStep('prompt')}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
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
                            JSON.parse(e.target.value);
                            setValidationErrors(prev => ({ ...prev, credentials: false }));
                          } catch (e) {
                            setValidationErrors(prev => ({ ...prev, credentials: true }));
                          }
                        }}
                        placeholder="Enter credentials"
                        className={cn("min-h-10 font-mono text-xs")}
                      />
                    </div>
                    {(() => {
                      try {
                        const creds = JSON.parse(reviewCredentials);
                        if (!creds || Object.keys(creds).length === 0) {
                          return (
                            <div className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mt-2">
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
                    {(() => {
                      try {
                        JSON.parse(payload);
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
                      <WorkflowIcon className="h-4 w-4" />
                      <span className="font-medium text-sm">Workflow Steps</span>
                    </div>
                    {showSteps && (
                      <div className="flex-1 min-h-0 bg-background h-[200px] mb-2">
                        <WorkflowStepsView
                          steps={currentWorkflow.steps}
                          onStepsChange={handleStepsChange}
                          onStepEdit={handleStepEdit}
                          integrations={integrations}
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
                      <FileText className="h-4 w-4" />
                      <span className="font-medium text-sm">Response Schema Editor</span>
                    </div>
                    {showSchemaEditor && (
                      <div className="mt-2 mb-4">
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
              (step === 'integrations' && selectedIntegrationIds.length === 0) ||
              (step === 'integrations' && selectedIntegrationIds.some(id => pendingDocIds.has(id)))
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

