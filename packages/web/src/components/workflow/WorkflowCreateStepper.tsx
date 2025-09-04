import { useConfig } from '@/src/app/config-context';
import { useIntegrations } from '@/src/app/integrations-context';
import { getAuthBadge } from '@/src/app/integrations/page';
import { IntegrationForm } from '@/src/components/integrations/IntegrationForm';
import { useToast } from '@/src/hooks/use-toast';
import { needsUIToTriggerDocFetch } from '@/src/lib/client-utils';
import { cn, composeUrl, getIntegrationIcon as getIntegrationIconName, inputErrorStyles } from '@/src/lib/utils';
import { Integration, IntegrationInput, SuperglueClient, UpsertMode, Workflow } from '@superglue/client';
import { integrations as integrationTemplates } from "@superglue/shared";
import { waitForIntegrationProcessing } from '@superglue/shared/utils';
import { ArrowRight, Check, Clock, Globe, Key, Loader2, Pencil, Plus, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { StepIndicator, WORKFLOW_CREATE_STEPS } from '../utils/StepIndicator';
import { WorkflowCreateSuccess } from './WorkflowCreateSuccess';
import WorkflowPlayground, { WorkflowPlaygroundHandle } from './WorkflowPlayground';

type WorkflowCreateStep = 'integrations' | 'prompt' | 'review' | 'success';

interface WorkflowCreateStepperProps {
  onComplete?: () => void;
}

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
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const superglueConfig = useConfig();
  const playgroundRef = useRef<WorkflowPlaygroundHandle>(null);

  const { integrations, pendingDocIds, loading, setPendingDocIds, refreshIntegrations } = useIntegrations();
  const preselectedIntegrationId = searchParams.get('integration');
  const [instruction, setInstruction] = useState('');
  const [payload, setPayload] = useState('{}');
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);

  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(true);
  const [shouldStopExecution, setShouldStopExecution] = useState(false);

  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<string[]>(() => {
    return preselectedIntegrationId && integrations.some(i => i.id === preselectedIntegrationId)
      ? [preselectedIntegrationId]
      : [];
  });

  const [integrationSearch, setIntegrationSearch] = useState('');
  const [showIntegrationForm, setShowIntegrationForm] = useState(false);
  const [integrationFormEdit, setIntegrationFormEdit] = useState<Integration | null>(null);

  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  const client = useMemo(() => new ExtendedSuperglueClient({
    endpoint: superglueConfig.superglueEndpoint,
    apiKey: superglueConfig.superglueApiKey,
  }), [superglueConfig.superglueEndpoint, superglueConfig.superglueApiKey]);

  const { waitForIntegrationReady } = useMemo(() => ({
    waitForIntegrationReady: (integrationIds: string[]) => {
      const clientAdapter = {
        getIntegration: (id: string) => client.getIntegration(id)
      };
      return waitForIntegrationProcessing(clientAdapter, integrationIds);
    }
  }), [client]);


  useEffect(() => {
    if (preselectedIntegrationId && integrations.length > 0 && selectedIntegrationIds.length === 0) {
      if (integrations.some(i => i.id === preselectedIntegrationId)) {
        setSelectedIntegrationIds([preselectedIntegrationId]);
      }
    }
  }, [preselectedIntegrationId, integrations, selectedIntegrationIds.length]);


  useEffect(() => {
    if (step === 'prompt') {
      setCurrentWorkflow(null);
    }

    if (step !== 'prompt') {
      setValidationErrors({});
    }
  }, [step]);


  const integrationOptions = [
    { value: "manual", label: "No Template", icon: "default" },
    ...Object.entries(integrationTemplates).map(([key, integration]) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      icon: integration.icon || "default"
    }))
  ];

  const highlightJson = (code: string) => {
    return Prism.highlight(code, Prism.languages.json, 'json');
  };

  const hasDocumentation = (integration: Integration) => {
    // Check if integration has documentation URL and is not pending
    return !!(integration.documentationUrl?.trim() && !pendingDocIds.has(integration.id));
  };

  const handleIntegrationFormSave = async (integration: Integration): Promise<Integration | null> => {
    // Close form immediately
    setShowIntegrationForm(false);
    setIntegrationFormEdit(null);

    try {
      const mode = integrationFormEdit ? UpsertMode.UPDATE : UpsertMode.CREATE;
      const savedIntegration = await client.upsertIntegration(integration.id, integration, mode);
      const willTriggerDocFetch = needsUIToTriggerDocFetch(savedIntegration, integrationFormEdit);

      if (willTriggerDocFetch) {
        setPendingDocIds(prev => new Set([...prev, savedIntegration.id]));

        waitForIntegrationReady([savedIntegration.id]).then(() => {
          setPendingDocIds(prev => new Set([...prev].filter(id => id !== savedIntegration.id)));
        }).catch((error) => {
          console.error('Error waiting for docs:', error);
          setPendingDocIds(prev => new Set([...prev].filter(id => id !== savedIntegration.id)));
        });
      }

      setSelectedIntegrationIds(ids => {
        const newIds = ids.filter(id => id !== (integrationFormEdit?.id || integration.id));
        newIds.push(savedIntegration.id);
        return newIds;
      });

      await refreshIntegrations();

      return savedIntegration;
    } catch (error) {
      console.error('Error saving integration:', error);
      toast({
        title: 'Error Saving Integration',
        description: error instanceof Error ? error.message : 'Failed to save integration',
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleIntegrationFormCancel = () => {
    setShowIntegrationForm(false);
    setIntegrationFormEdit(null);
  };

  const handleSaveWorkflow = async (workflow: Workflow) => {
    try {
      setIsSaving(true);
      const currentWorkflowState = playgroundRef.current?.getCurrentWorkflow();
      const workflowToSave = currentWorkflowState || workflow;

      const saved = await client.upsertWorkflow(workflowToSave.id, workflowToSave as any);
      if (!saved) throw new Error('Failed to save workflow');

      toast({
        title: 'Workflow saved',
        description: `"${saved.id}" saved successfully`
      });

      setCurrentWorkflow(saved);
      setStep('success');
    } catch (e: any) {
      toast({
        title: 'Error saving workflow',
        description: e.message || 'Unknown error',
        variant: 'destructive'
      });
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteWorkflow = async () => {
    try {
      setIsExecuting(true);
      setShouldStopExecution(false);
      await playgroundRef.current?.executeWorkflow({ selfHealing: selfHealingEnabled });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleStopExecution = () => {
    setShouldStopExecution(true);
    toast({
      title: "Stopping workflow",
      description: "Workflow will stop after the current step completes",
    });
  };

  const handleNext = async () => {
    const steps: WorkflowCreateStep[] = ['integrations', 'prompt', 'review', 'success'];
    const currentIndex = steps.indexOf(step);

    if (step === 'integrations') {
      if (selectedIntegrationIds.length === 0) {
        toast({
          title: 'Add Integrations',
          description: 'Please select at least one integration.',
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

      setValidationErrors(errors);

      if (Object.keys(errors).length > 0) {
        toast({
          title: 'Validation Error',
          description: 'Please fix the errors below before continuing.',
          variant: 'destructive',
        });
        return;
      }
      setIsBuilding(true);
      try {
        const parsedPayload = JSON.parse(payload || '{}');
        const response = await client.buildWorkflow({
          instruction: instruction,
          payload: parsedPayload,
          integrationIds: selectedIntegrationIds,
          save: false
        });
        if (!response) {
          throw new Error('Failed to build workflow');
        }
        setCurrentWorkflow(response);
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

  const toIntegrationInput = (i: Integration): IntegrationInput => ({
    id: i.id,
    urlHost: i.urlHost,
    urlPath: i.urlPath,
    documentationUrl: i.documentationUrl,
    documentation: i.documentation,
    credentials: i.credentials,
  });

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

  const getSimpleIcon = (name: string): SimpleIcon | null => {
    if (!name || name === "default") return null;

    const formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    const iconKey = `si${formatted}`;
    try {
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
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Main Content */}
        <div className="overflow-y-auto px-1 min-h-0">
          {/* Step 1: Integrations */}
          {step === 'integrations' && (
            <div className="space-y-4">
              <div className="mb-4 flex items-center justify-between gap-4 px-4">
                <h3 className="font-medium">
                  Select one or more integrations to use in your workflow. You can add new integrations as needed.
                </h3>
                <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setShowIntegrationForm(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Integration
                </Button>
              </div>
              <div className="overflow-y-auto">
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
                    <div className="flex items-center justify-between px-4 py-2 text-sm font-medium text-foreground border-b gap-4">
                      <Input
                        placeholder="Search integrations..."
                        value={integrationSearch}
                        onChange={e => setIntegrationSearch(e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
                      <div className="flex items-center gap-2">
                        {(() => {
                          const filteredIntegrations = integrations.filter(sys =>
                            integrationSearch === '' ||
                            sys.id.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                            sys.urlHost.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                            sys.urlPath.toLowerCase().includes(integrationSearch.toLowerCase())
                          );
                          const filteredIds = filteredIntegrations.map(i => i.id);
                          const selectedCount = filteredIds.filter(id => selectedIntegrationIds.includes(id)).length;
                          const allSelected = filteredIds.length > 0 && selectedCount === filteredIds.length;

                          return (
                            <span className="text-xs text-muted-foreground">
                              {allSelected || selectedCount > 0 ? 'Unselect all' : 'Select all'}
                            </span>
                          );
                        })()}
                        <button
                          className={cn(
                            "h-5 w-5 rounded border-2 transition-all duration-200 flex items-center justify-center",
                            (() => {
                              const filteredIntegrations = integrations.filter(sys =>
                                integrationSearch === '' ||
                                sys.id.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                                sys.urlHost.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                                sys.urlPath.toLowerCase().includes(integrationSearch.toLowerCase())
                              );
                              const filteredIds = filteredIntegrations.map(i => i.id);
                              const selectedCount = filteredIds.filter(id => selectedIntegrationIds.includes(id)).length;
                              const allSelected = filteredIds.length > 0 && selectedCount === filteredIds.length;
                              const someSelected = selectedCount > 0 && selectedCount < filteredIds.length;

                              if (allSelected || someSelected) {
                                return "bg-primary border-primary";
                              }
                              return "bg-background border-input hover:border-primary/50";
                            })()
                          )}
                          onClick={() => {
                            const filteredIntegrations = integrations.filter(sys =>
                              integrationSearch === '' ||
                              sys.id.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                              sys.urlHost.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                              sys.urlPath.toLowerCase().includes(integrationSearch.toLowerCase())
                            );
                            const filteredIds = filteredIntegrations.map(i => i.id);
                            const selectedCount = filteredIds.filter(id => selectedIntegrationIds.includes(id)).length;
                            const allSelected = filteredIds.length > 0 && selectedCount === filteredIds.length;

                            if (allSelected || selectedCount > 0) {
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
                            const selectedCount = filteredIds.filter(id => selectedIntegrationIds.includes(id)).length;
                            const allSelected = filteredIds.length > 0 && selectedCount === filteredIds.length;
                            const someSelected = selectedCount > 0 && selectedCount < filteredIds.length;

                            if (allSelected) {
                              return <Check className="h-3 w-3 text-primary-foreground" />;
                            } else if (someSelected) {
                              return <div className="h-0.5 w-2.5 bg-primary-foreground" />;
                            }
                            return null;
                          })()}
                        </button>
                      </div>
                    </div>
                    {selectedIntegrationIds.length === 0 && integrations.length > 0 && (
                      <div className="mx-4">
                        <div className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 bg-amber-500/10 py-2 px-4 rounded-md">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          Select at least one integration to continue
                        </div>
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
                              "flex items-center justify-between rounded-md px-4 py-3 transition-all duration-200 cursor-pointer",
                              selected
                                ? "bg-primary/10 dark:bg-primary/40 border border-primary/50 dark:border-primary/60 hover:bg-primary/15 dark:hover:bg-primary/25"
                                : "bg-background border border-transparent hover:bg-accent/50 hover:border-border"
                            )}
                            onClick={() => {
                              if (selected) {
                                setSelectedIntegrationIds(ids => ids.filter(i => i !== sys.id));
                              } else {
                                setSelectedIntegrationIds(ids => [...ids, sys.id]);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {(() => {
                                const iconName = getIntegrationIconName(sys);
                                const icon = iconName ? getSimpleIcon(iconName) : null;
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
                                <span className="text-xs text-muted-foreground truncate max-w-[240px]">
                                  {composeUrl(sys.urlHost, sys.urlPath)}
                                </span>
                              </div>
                              <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2">
                                  <DocStatus
                                    pending={pendingDocIds.has(sys.id)}
                                    hasDocumentation={hasDocumentation(sys)}
                                  />
                                  {(() => {
                                    const badge = getAuthBadge(sys);
                                    const colorClasses = {
                                      blue: 'text-blue-800 dark:text-blue-300 bg-blue-500/10',
                                      amber: 'text-amber-800 dark:text-amber-300 bg-amber-500/10',
                                      green: 'text-green-800 dark:text-green-300 bg-green-500/10'
                                    };

                                    return (
                                      <span className={`text-xs ${colorClasses[badge.color]} px-2 py-0.5 rounded flex items-center gap-1`}>
                                        {badge.icon === 'clock' ? <Clock className="h-3 w-3" /> : <Key className="h-3 w-3" />}
                                        {badge.label}
                                      </span>
                                    );
                                  })()}
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
                              <button
                                className={cn(
                                  "h-5 w-5 rounded border-2 transition-all duration-200 flex items-center justify-center",
                                  selected
                                    ? "bg-primary border-primary"
                                    : "bg-background border-input hover:border-primary/50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selected) {
                                    setSelectedIntegrationIds(ids => ids.filter(i => i !== sys.id));
                                  } else {
                                    setSelectedIntegrationIds(ids => [...ids, sys.id]);
                                  }
                                }}
                              >
                                {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                              </button>
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
                    onChange={(e) => {
                      setInstruction(e.target.value);
                      if (e.target.value.trim()) {
                        setValidationErrors(prev => ({ ...prev, instruction: false }));
                      }
                    }}
                    placeholder="e.g., 'Fetch customer details from CRM using the input email, then get their recent orders from productApi.'"
                    className={cn("min-h-64", validationErrors.instruction && inputErrorStyles)}
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
                {validationErrors.instruction && (
                  <p className="text-sm text-destructive mt-1">Workflow instruction is required</p>
                )}
              </div>

              {/* Show loading state */}
              {isGeneratingSuggestions && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="payload">Workflow Variables (Optional, JSON)</Label>
                <HelpTooltip text="Provide the payload for the workflow as a JSON object. You can reference these variables throughout the config. You can change them when you use the workflow later." />
                <div className={cn(
                  "h-64 rounded-md border border-input bg-transparent code-editor",
                  validationErrors.payload && inputErrorStyles
                )}>
                  <Editor
                    value={payload}
                    onValueChange={(code) => {
                      setPayload(code);
                      try {
                        JSON.parse(code || '{}');
                        setValidationErrors(prev => ({ ...prev, payload: false }));
                      } catch (e) {
                        setValidationErrors(prev => ({ ...prev, payload: true }));
                      }
                    }}
                    highlight={highlightJson}
                    padding={10}
                    tabSize={2}
                    insertSpaces={true}
                    className="font-mono text-xs w-full h-64 [&_textarea]:outline-none [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:p-0 [&_textarea]:border-0 [&_textarea]:bg-transparent"
                  />
                </div>
                {validationErrors.payload && (
                  <p className="text-xs text-destructive">Invalid JSON format</p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Review - Use WorkflowPlayground in embedded mode */}
          {step === 'review' && currentWorkflow && (
            <div className="w-full">
              <WorkflowPlayground
                ref={playgroundRef}
                embedded={true}
                initialWorkflow={currentWorkflow}
                initialPayload={payload}
                initialInstruction={instruction}
                integrations={integrations}
                onSave={handleSaveWorkflow}
                onInstructionEdit={() => setStep('prompt')}
                selfHealingEnabled={selfHealingEnabled}
                onSelfHealingChange={setSelfHealingEnabled}
                shouldStopExecution={shouldStopExecution}
                onStopExecution={handleStopExecution}
                headerActions={(
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 mr-2">
                      <Label htmlFor="wcs-selfHealing" className="text-xs flex items-center gap-1">
                        <span>Self-healing</span>
                      </Label>
                      <div className="flex items-center">
                        <Switch
                          id="wcs-selfHealing"
                          className="custom-switch"
                          checked={selfHealingEnabled}
                          onCheckedChange={setSelfHealingEnabled}
                        />
                        <div className="ml-1 flex items-center">
                          <HelpTooltip text="Enable self-healing during execution. Slower, but can auto-fix failures in workflow steps and transformation code." />
                        </div>
                      </div>
                    </div>
                    {isExecuting ? (
                      <Button
                        variant="destructive"
                        onClick={handleStopExecution}
                        disabled={isSaving}
                        className="h-9 px-4"
                      >
                        Stop Execution
                      </Button>
                    ) : (
                      <Button
                        variant="success"
                        onClick={handleExecuteWorkflow}
                        disabled={isSaving || isExecuting}
                        className="h-9 px-4"
                      >
                        Test Workflow
                      </Button>
                    )}
                    <Button
                      variant="default"
                      onClick={() => playgroundRef.current?.saveWorkflow()}
                      disabled={isSaving}
                      className="h-9 px-5 shadow-md border border-primary/40"
                    >
                      {isSaving ? "Saving..." : "Save & Complete"}
                    </Button>
                  </div>
                )}
              />
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
                    };
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
          {step !== 'review' && step !== 'success' && (
            <Button
              onClick={handleNext}
              disabled={
                isBuilding ||
                isSaving ||
                isGeneratingSuggestions ||
                (step === 'integrations' && selectedIntegrationIds.length === 0)
              }
            >
              {isBuilding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building...</> :
                isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> :
                  isGeneratingSuggestions ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> :
                    'Next'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}