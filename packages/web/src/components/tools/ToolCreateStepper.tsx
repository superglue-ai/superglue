import { useConfig } from '@/src/app/config-context';
import { useIntegrations } from '@/src/app/integrations-context';
import { getAuthBadge } from '@/src/app/integrations/page';
import { IntegrationForm } from '@/src/components/integrations/IntegrationForm';
import { useToast } from '@/src/hooks/use-toast';
import { needsUIToTriggerDocFetch } from '@/src/lib/client-utils';
import { formatBytes, generateUniqueKey, MAX_TOTAL_FILE_SIZE, sanitizeFileName, type UploadedFileInfo } from '@/src/lib/file-utils';
import { cn, composeUrl, getIntegrationIcon as getIntegrationIconName, getSimpleIcon, inputErrorStyles } from '@/src/lib/utils';
import { Integration, IntegrationInput, SuperglueClient, Workflow as Tool, UpsertMode } from '@superglue/client';
import { integrationOptions } from "@superglue/shared";
import { waitForIntegrationProcessing } from '@superglue/shared/utils';
import { ArrowRight, Check, Clock, FileJson, FileWarning, Globe, Key, Loader2, Paperclip, Pencil, Plus, Upload, Wrench, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { DocStatus } from '../utils/DocStatusSpinner';
import { HelpTooltip } from '../utils/HelpTooltip';
import JsonSchemaEditor from '../utils/JsonSchemaEditor';
import { StepIndicator, TOOL_CREATE_STEPS } from '../utils/StepIndicator';
import { ToolCreateSuccess } from './ToolCreateSuccess';
import { PayloadSpotlight } from './ToolMiniStepCards';
import ToolPlayground, { ToolPlaygroundHandle } from './ToolPlayground';

type ToolCreateStep = 'integrations' | 'build' | 'run' | 'publish';

interface ToolCreateStepperProps {
  onComplete?: () => void;
}

class ExtendedSuperglueClient extends SuperglueClient {
  async generateInstructions(integrations: IntegrationInput[]): Promise<string[]> {
    let instructions: string[] = [];
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
    
    instructions = result.data.generateInstructions;
    if (instructions.length === 1 && instructions[0].startsWith('Error:')) {
      throw new Error(instructions[0].replace('Error: ', ''));
    }
    return instructions;
  }
}

export function ToolCreateStepper({ onComplete }: ToolCreateStepperProps) {
  const [step, setStep] = useState<ToolCreateStep>('integrations');
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const superglueConfig = useConfig();
  const playgroundRef = useRef<ToolPlaygroundHandle>(null);

  const { integrations, pendingDocIds, loading, setPendingDocIds, refreshIntegrations } = useIntegrations();
  const preselectedIntegrationId = searchParams.get('integration');
  const [instruction, setInstruction] = useState('');
  const [payload, setPayload] = useState('{}');
  const [currentTool, setCurrentTool] = useState<Tool | null>(null);

  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(true);
  const [shouldStopExecution, setShouldStopExecution] = useState(false);

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [totalFileSize, setTotalFileSize] = useState(0);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});

  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<string[]>(() => {
    return preselectedIntegrationId && integrations.some(i => i.id === preselectedIntegrationId)
      ? [preselectedIntegrationId]
      : [];
  });

  const [integrationSearch, setIntegrationSearch] = useState('');
  const [showIntegrationForm, setShowIntegrationForm] = useState(false);
  const [integrationFormEdit, setIntegrationFormEdit] = useState<Integration | null>(null);

  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  // New state for redesigned prompt step
  const [showPayloadSection, setShowPayloadSection] = useState(false);
  const [showFileUploadSection, setShowFileUploadSection] = useState(false);
  const [showResponseSchemaSection, setShowResponseSchemaSection] = useState(false);
  const [responseSchema, setResponseSchema] = useState('');
  const [inputSchema, setInputSchema] = useState<string | null>(null);
  const [enforceInputSchema, setEnforceInputSchema] = useState(true);
  const [inputSchemaMode, setInputSchemaMode] = useState<'current' | 'custom'>('current');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (step === 'build') {
      setCurrentTool(null);
      // Lazy load suggestions when entering prompt step
      if (selectedIntegrationIds.length > 0) {
        handleGenerateInstructions();
      }
    }

    if (step !== 'build') {
      setValidationErrors({});
    }
  }, [step]);

  // Regenerate suggestions when selected integrations change
  useEffect(() => {
    if (step === 'build' && selectedIntegrationIds.length > 0) {
      setSuggestions([]); // Clear old suggestions first
      handleGenerateInstructions();
    }
  }, [selectedIntegrationIds, step]);

  const highlightJson = (code: string) => {
    return Prism.highlight(code, Prism.languages.json, 'json');
  };

  const hasDocumentation = (integration: Integration) => {
    return !!(integration.documentationUrl?.trim() && !pendingDocIds.has(integration.id));
  };

  const handleIntegrationFormSave = async (integration: Integration): Promise<Integration | null> => {
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

  const handleSaveTool = async (tool: Tool) => {
    try {
      setIsSaving(true);
      const currentToolState = playgroundRef.current?.getCurrentTool();
      const toolToSave = currentToolState || tool;

      const saved = await client.upsertWorkflow(toolToSave.id, toolToSave as any);
      if (!saved) throw new Error('Failed to save tool');

      toast({
        title: 'Tool published',
        description: `"${saved.id}" published successfully`
      });

      setCurrentTool(saved);
      setStep('publish');
    } catch (e: any) {
      toast({
        title: 'Error publishing tool',
        description: e.message || 'Unknown error',
        variant: 'destructive'
      });
      throw e;
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteTool = async () => {
    try {
      setIsExecuting(true);
      setShouldStopExecution(false);
      setIsStopping(false);
      await playgroundRef.current?.executeTool({ selfHealing: selfHealingEnabled });
    } finally {
      setIsExecuting(false);
      setIsStopping(false);
    }
  };

  const handleStopExecution = () => {
    setShouldStopExecution(true);
    setIsStopping(true);
    toast({
      title: "Stopping tool",
      description: "Tool will stop after the current step completes",
    });
  };

  const handleNext = async () => {
    if (step === 'integrations') {
      setStep('build');
    } else if (step === 'publish') {
      if (onComplete) {
        onComplete();
      } else {
        router.push('/');
      }
    }
  };

  const handleBack = () => {
    const steps: ToolCreateStep[] = ['integrations', 'build', 'run', 'publish'];
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
      return;
    }
    setIsGeneratingSuggestions(true);
    try {
      const selectedIntegrationInputs = selectedIntegrationIds
        .map(id => integrations.find(i => i.id === id))
        .filter(Boolean)
        .map(toIntegrationInput);
      try {
        const suggestionsText = await client.generateInstructions(selectedIntegrationInputs);
        const suggestionsArray = suggestionsText.filter(s => s.trim());
        setSuggestions(suggestionsArray);
      } catch (error: any) {
        toast({
          title: 'Error Connecting to LLM',
          description: "Please check your LLM configuration. \nError Details: \n" + error.message,
          variant: 'destructive',
        });
        setSuggestions([]);
      }
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

  const handleFilesUpload = async (files: File[]) => {
    setIsProcessingFiles(true);

    try {
      // Check total size limit
      const newSize = files.reduce((sum, f) => sum + f.size, 0);
      if (totalFileSize + newSize > MAX_TOTAL_FILE_SIZE) {
        toast({
          title: 'Size limit exceeded',
          description: `Total file size cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE)}`,
          variant: 'destructive'
        });
        return;
      }

      const existingKeys = Object.keys(filePayloads);
      const newFiles: UploadedFileInfo[] = [];

      for (const file of files) {
        try {
          // Generate unique key
          const baseKey = sanitizeFileName(file.name);
          const key = generateUniqueKey(baseKey, [...existingKeys, ...newFiles.map(f => f.key)]);

          const fileInfo: UploadedFileInfo = {
            name: file.name,
            size: file.size,
            key,
            status: 'processing'
          };
          newFiles.push(fileInfo);
          setUploadedFiles(prev => [...prev, fileInfo]);

          const extractResult = await client.extract({
            file: file
          });

          if (!extractResult.success) {
            throw new Error(extractResult.error || 'Failed to extract data');
          }
          const parsedData = extractResult.data;
          setFilePayloads(prev => ({ ...prev, [key]: parsedData }));
          existingKeys.push(key);

          setUploadedFiles(prev => prev.map(f =>
            f.key === key ? { ...f, status: 'ready' } : f
          ));

        } catch (error: any) {
          // Update file status with error
          const fileInfo = newFiles.find(f => f.name === file.name);
          if (fileInfo) {
            setUploadedFiles(prev => prev.map(f =>
              f.key === fileInfo.key
                ? { ...f, status: 'error', error: error.message }
                : f
            ));
          }

          toast({
            title: 'File processing failed',
            description: `Failed to parse ${file.name}: ${error.message}`,
            variant: 'destructive'
          });
        }
      }
      setTotalFileSize(prev => prev + newSize);

    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleFileRemove = (key: string) => {
    // Find the file to remove
    const fileToRemove = uploadedFiles.find(f => f.key === key);
    if (!fileToRemove) return;

    // Update file payloads map
    setFilePayloads(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    // Update files list and total size
    setUploadedFiles(prev => prev.filter(f => f.key !== key));
    setTotalFileSize(prev => Math.max(0, prev - fileToRemove.size));
  };

  const handleSendPrompt = async () => {
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
      const effectivePayload = { ...parsedPayload, ...filePayloads };
      const response = await client.buildWorkflow({
        instruction: instruction,
        payload: effectivePayload,
        integrationIds: selectedIntegrationIds,
        responseSchema: responseSchema ? JSON.parse(responseSchema) : null,
        save: false
      });
      if (!response) {
        throw new Error('Failed to build tool');
      }
      setCurrentTool(response);
      setStep('run');
    } catch (error: any) {
      console.error('Error building tool:', error);
      toast({
        title: 'Error Building Tool',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInstruction(e.target.value);
    if (e.target.value.trim()) {
      setValidationErrors(prev => ({ ...prev, instruction: false }));
    }
    
    // Auto-expand textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full p-6">
      <div className="flex-none mb-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mb-4">
          <h1 className="text-2xl font-semibold">
            {step === 'publish' ? 'Tool Created!' : 'Create New Tool'}
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
        <StepIndicator currentStep={step} steps={TOOL_CREATE_STEPS} />
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-y-auto px-1 min-h-0" style={{ scrollbarGutter: 'stable' }}>
          {step === 'integrations' && (
            <div className="space-y-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="font-medium">
                  Select one or more integrations to use in your tool. You can add new integrations as needed.
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
                      No integrations added yet. Define the APIs or data sources your tool will use.
                    </p>
                  </div>
                ) : (
                  <div className="gap-2 flex flex-col">
                    <div className="flex items-center justify-between py-2 pr-4 text-sm font-medium text-foreground border-b gap-4">
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
                              setSelectedIntegrationIds(ids => ids.filter(id => !filteredIds.includes(id)));
                            } else {
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
                      <div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/50 py-2 px-4 rounded-md">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4" />
                            <path d="M12 8h.01" />
                          </svg>
                          No integrations selected - you can create transform-only tools or add integrations for API calls
                        </div>
                      </div>
                    )}
                    {(() => {
                      const filteredIntegrations = integrations.filter(sys =>
                        integrationSearch === '' ||
                        sys.id.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                        sys.urlHost.toLowerCase().includes(integrationSearch.toLowerCase()) ||
                        sys.urlPath.toLowerCase().includes(integrationSearch.toLowerCase())
                      );

                      return (
                        <>
                          {filteredIntegrations.map(sys => {
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

                          {filteredIntegrations.length === 0 && integrationSearch.trim() !== '' && (
                            <div
                              className="flex items-center justify-between rounded-md px-4 py-3 transition-all duration-200 cursor-pointer bg-background border border-dashed border-muted-foreground/30 hover:bg-accent/50 hover:border-muted-foreground/50"
                              onClick={() => setShowIntegrationForm(true)}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center">
                                  <Plus className="h-3 w-3 text-muted-foreground" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium text-muted-foreground">
                                    Create "{integrationSearch}" integration
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Add a new integration for this API
                                  </span>
                                </div>
                              </div>
                              <div className="flex gap-2 items-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setShowIntegrationForm(true);
                                  }}
                                  title="Create new integration"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
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

          {/* NEW REDESIGNED PROMPT STEP */}
          {step === 'build' && (
            <div className="flex items-start justify-center pt-8">
              <div className="w-full max-w-3xl mx-auto space-y-4">
                <div className="text-center mb-4">
                  <h2 className="text-xl font-medium text-foreground">
                    What should your tool do for you?
                  </h2>
                </div>

                {/* Chat-like instruction input with send button and settings */}
                <div className="relative border rounded-2xl bg-card p-4">
                  <Textarea
                    ref={textareaRef}
                    id="instruction"
                    value={instruction}
                    onChange={handleTextareaChange}
                    placeholder="Describe what you want this tool to achieve..."
                    className={cn(
                      "resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 scrollbar-thin scrollbar-thumb-rounded min-h-[80px]",
                      validationErrors.instruction && inputErrorStyles
                    )}
                    rows={1}
                    style={{ 
                      maxHeight: '200px', 
                      overflowY: instruction.split('\n').length > 8 ? 'auto' : 'hidden',
                      scrollbarGutter: 'stable'
                    }}
                  />

                  {/* Settings buttons on left, send button on right */}
                  <div className="flex justify-between items-center gap-2 mt-3">
                    <div className="flex gap-2">
                      <button
                      onClick={() => {
                        if (showFileUploadSection) setShowFileUploadSection(false);
                        if (showResponseSchemaSection) setShowResponseSchemaSection(false);
                        setShowPayloadSection(!showPayloadSection);
                      }}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5",
                        (() => {
                          const trimmedPayload = payload.trim();
                          const isEmptyPayload = !trimmedPayload || trimmedPayload === '{}';
                          
                          if (isEmptyPayload) {
                            return "border border-border text-muted-foreground hover:bg-accent/50";
                          }
                          
                          // Check if JSON is valid
                          try {
                            JSON.parse(trimmedPayload);
                            // Valid JSON - filled
                            return "bg-[#FFD700]/40 border border-[#FFA500] text-foreground";
                          } catch {
                            // Invalid JSON
                            return "bg-red-100 dark:bg-red-950/30 border border-red-500 text-red-700 dark:text-red-400";
                          }
                        })()
                      )}
                    >
                      <FileJson className="h-4 w-4" />
                      {(() => {
                        const trimmedPayload = payload.trim();
                        const isEmptyPayload = !trimmedPayload || trimmedPayload === '{}';
                        
                        if (isEmptyPayload) {
                          return 'Attach JSON Tool Input';
                        }
                        
                        try {
                          JSON.parse(trimmedPayload);
                          return 'JSON Tool Input Attached';
                        } catch {
                          return 'Malformatted JSON';
                        }
                      })()}
                    </button>
                    
                    <button
                      onClick={() => {
                        if (showPayloadSection) setShowPayloadSection(false);
                        if (showResponseSchemaSection) setShowResponseSchemaSection(false);
                        setShowFileUploadSection(!showFileUploadSection);
                      }}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5",
                        uploadedFiles.length > 0
                          ? "bg-[#FFD700]/40 border border-[#FFA500] text-foreground"
                          : "border border-border text-muted-foreground hover:bg-accent/50"
                      )}
                    >
                      <Paperclip className="h-4 w-4" />
                      {uploadedFiles.length > 0 ? `File Tool Input Attached (${uploadedFiles.length})` : 'Attach File Tool Input'}
                    </button>
                    
                    <button
                      onClick={() => {
                        if (showPayloadSection) setShowPayloadSection(false);
                        if (showFileUploadSection) setShowFileUploadSection(false);
                        setShowResponseSchemaSection(!showResponseSchemaSection);
                      }}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5",
                        responseSchema 
                          ? "bg-[#FFD700]/40 border border-[#FFA500] text-foreground" 
                          : "border border-border text-muted-foreground hover:bg-accent/50"
                      )}
                    >
                      <FileWarning className="h-4 w-4" />
                      {responseSchema ? 'Tool Result Schema Defined' : 'Enforce Tool Result Schema'}
                    </button>
                    </div>

                    {/* Build button on the right */}
                    <Button
                      onClick={handleSendPrompt}
                      disabled={isBuilding || !instruction.trim()}
                      className="h-8 px-4 rounded-full flex-shrink-0 flex items-center gap-2"
                      title="Build Tool"
                    >
                      {isBuilding ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Building...
                        </>
                      ) : (
                        <>
                          <Wrench className="h-4 w-4" />
                          Build
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {validationErrors.instruction && (
                  <p className="text-sm text-destructive text-center mt-2">Tool instruction is required</p>
                )}

                {/* Expanded sections - show below buttons */}
                {showPayloadSection && (
                  <div className="space-y-3 border rounded-lg p-4 bg-card animate-fade-in mt-3" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">JSON Tool Input</h4>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="enforce-input-schema" className="text-xs cursor-pointer">
                            Enforce Input Schema
                          </Label>
                          <Switch
                            id="enforce-input-schema"
                            checked={enforceInputSchema}
                            onCheckedChange={setEnforceInputSchema}
                            className="custom-switch"
                          />
                        </div>
                      </div>

                      <Textarea
                        value={payload || '{}'}
                        onChange={(e) => {
                          setPayload(e.target.value);
                          try {
                            JSON.parse(e.target.value || '{}');
                            setValidationErrors(prev => ({ ...prev, payload: false }));
                          } catch {
                            setValidationErrors(prev => ({ ...prev, payload: true }));
                          }
                        }}
                        placeholder="{}"
                        className={cn("font-mono text-xs min-h-[150px]", validationErrors.payload && inputErrorStyles)}
                      />
                      {validationErrors.payload && (
                        <p className="text-xs text-destructive">Invalid JSON format</p>
                      )}

                      {/* Input Schema section - only show when enforcement is enabled */}
                      {enforceInputSchema && (
                        <div className="space-y-3 pt-3 border-t">
                          <h4 className="font-medium text-sm">Enforced Tool Input Schema</h4>
                          
                          <div className="flex gap-2">
                            <button
                              onClick={() => setInputSchemaMode('current')}
                              className={cn(
                                "flex-1 text-xs px-3 py-2 rounded-md transition-all border",
                                inputSchemaMode === 'current'
                                  ? "bg-primary/10 border-primary text-foreground"
                                  : "border-border text-muted-foreground hover:bg-accent/50"
                              )}
                            >
                              Use schema generated from tool input
                            </button>
                            <button
                              onClick={() => {
                                setInputSchemaMode('custom');
                                if (!inputSchema) {
                                  setInputSchema('{"type":"object","properties":{}}');
                                }
                              }}
                              className={cn(
                                "flex-1 text-xs px-3 py-2 rounded-md transition-all border",
                                inputSchemaMode === 'custom'
                                  ? "bg-primary/10 border-primary text-foreground"
                                  : "border-border text-muted-foreground hover:bg-accent/50"
                              )}
                            >
                              {/* This does not do anything at the moment. The Workflow builder does not support input schemas.*/}
                              Use custom schema
                            </button>
                          </div>

                          {inputSchemaMode === 'custom' && (
                            <div className="space-y-2">
                              <JsonSchemaEditor
                                value={inputSchema}
                                onChange={setInputSchema}
                                isOptional={false}
                                showModeToggle={true}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {showFileUploadSection && (
                  <div className="space-y-3 border rounded-lg p-4 bg-card animate-fade-in mt-3" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">File Tool Input</h4>
                      <input
                        type="file"
                        multiple
                        accept=".json,.csv,.txt,.xml,.xlsx,.xls"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            await handleFilesUpload(files);
                          }
                          e.target.value = '';
                        }}
                        className="hidden"
                        id="file-upload-new"
                      />
                      {uploadedFiles.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {uploadedFiles.map(file => {
                            const getFileTypeInfo = (filename: string) => {
                              const ext = filename.toLowerCase().split('.').pop() || '';
                              switch (ext) {
                                case 'json': return { color: 'text-blue-600', bgColor: 'bg-blue-50', icon: '{}' };
                                case 'csv': return { color: 'text-green-600', bgColor: 'bg-green-50', icon: '▤' };
                                case 'xml': return { color: 'text-orange-600', bgColor: 'bg-orange-50', icon: '<>' };
                                case 'xlsx':
                                case 'xls': return { color: 'text-emerald-600', bgColor: 'bg-emerald-50', icon: '⊞' };
                                default: return { color: 'text-gray-600', bgColor: 'bg-gray-50', icon: '📄' };
                              }
                            };
                            const fileInfo = getFileTypeInfo(file.name);
                            return (
                              <div
                                key={file.key}
                                className={cn(
                                  "flex items-center justify-between px-3 py-2 rounded-md",
                                  file.status === 'error' ? "bg-destructive/10" : fileInfo.bgColor
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={cn("font-mono text-sm", fileInfo.color)}>
                                    {fileInfo.icon}
                                  </span>
                                  <div>
                                    <div className="text-xs font-medium">{file.name}</div>
                                    <div className="text-[10px] text-muted-foreground">
                                      {file.status === 'processing' ? 'Parsing...' : 
                                       file.status === 'error' ? file.error :
                                       `${formatBytes(file.size)} • ${file.key}`}
                                    </div>
                                  </div>
                                </div>
                                {file.status !== 'processing' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleFileRemove(file.key)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex flex-col items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById('file-upload-new')?.click()}
                          disabled={isProcessingFiles}
                          className="w-48"
                        >
                          {isProcessingFiles ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Paperclip className="h-4 w-4 mr-2" />
                              Select Files
                            </>
                          )}
                        </Button>
                        <div className="text-xs text-muted-foreground text-center">
                          {formatBytes(totalFileSize)} / {formatBytes(MAX_TOTAL_FILE_SIZE)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {showResponseSchemaSection && (
                  <div className="border rounded-lg p-4 bg-card animate-fade-in mt-3" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
                    <h4 className="font-medium text-sm mb-3">Tool Result Schema</h4>
                    <JsonSchemaEditor
                      value={responseSchema || null}
                      onChange={(value) => setResponseSchema(value || '')}
                      isOptional={true}
                      showModeToggle={true}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Define a JSON Schema to validate the tool's response
                    </p>
                  </div>
                )}

                {/* Suggested prompts with animation - only show when textarea is empty and no section is expanded */}
                {suggestions.length > 0 && !instruction.trim() && !showPayloadSection && !showFileUploadSection && !showResponseSchemaSection && (
                  <div className="space-y-2 mt-4">
                    <p className="text-sm text-muted-foreground text-center">Suggestions</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {suggestions.map((suggestion, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => setInstruction(suggestion)}
                          className="text-sm h-auto py-2 px-4 font-normal animate-fade-in"
                          style={{
                            animationDelay: `${index * 150}ms`,
                            animationFillMode: 'backwards'
                          }}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {step === 'run' && currentTool && (
            <div className="w-full">
              <ToolPlayground
                ref={playgroundRef}
                embedded={true}
                initialTool={currentTool}
                initialPayload={payload}
                initialInstruction={instruction}
                integrations={integrations}
                onSave={handleSaveTool}
                onInstructionEdit={() => setStep('build')}
                selfHealingEnabled={selfHealingEnabled}
                onSelfHealingChange={setSelfHealingEnabled}
                shouldStopExecution={shouldStopExecution}
                onStopExecution={handleStopExecution}
                uploadedFiles={uploadedFiles}
                onFilesUpload={handleFilesUpload}
                onFileRemove={handleFileRemove}
                isProcessingFiles={isProcessingFiles}
                totalFileSize={totalFileSize}
                filePayloads={filePayloads}
                headerActions={(
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 mr-2">
                      <Label htmlFor="wcs-selfHealing" className="text-xs flex items-center gap-1">
                        <span>auto-repair</span>
                      </Label>
                      <div className="flex items-center">
                        <Switch
                          id="wcs-selfHealing"
                          className="custom-switch"
                          checked={selfHealingEnabled}
                          onCheckedChange={setSelfHealingEnabled}
                        />
                        <div className="ml-1 flex items-center">
                          <HelpTooltip text="Enable auto-repair during execution. Slower, but can auto-fix failures in tool steps and transformation code." />
                        </div>
                      </div>
                    </div>
                    {isExecuting ? (
                      <Button
                        variant="destructive"
                        onClick={handleStopExecution}
                        disabled={isSaving || isStopping}
                        className="h-9 px-4"
                      >
                        {isStopping ? "Stopping..." : "Stop Execution"}
                      </Button>
                    ) : (
                      <Button
                        variant="success"
                        onClick={handleExecuteTool}
                        disabled={isSaving || isExecuting}
                        className="h-9 px-4"
                      >
                        Run All Steps
                      </Button>
                    )}
                    <Button
                      variant="default"
                      onClick={() => playgroundRef.current?.saveTool()}
                      disabled={isSaving}
                      className="h-9 px-5 shadow-md border border-primary/40"
                    >
                      {isSaving ? "Publishing..." : "Publish"}
                    </Button>
                  </div>
                )}
              />
            </div>
          )}
          {step === 'publish' && currentTool && (
            <div className="space-y-4">
              <p className="text-lg font-medium">
                Tool{' '}
                <span className="font-mono text-base bg-muted px-2 py-0.5 rounded">
                  {currentTool.id}
                </span>{' '}
                created successfully!
              </p>
              <p>
                You can now use this tool ID in the "Tools" page or call it via the API/SDK.
              </p>
              <ToolCreateSuccess
                currentTool={currentTool}
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
                <Button variant="outline" onClick={() => router.push(`/tools/${currentTool.id}`)}>
                  Go to Tool
                </Button>
                <Button variant="outline" onClick={() => router.push('/')}>
                  View All Tools
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

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
          {step !== 'run' && step !== 'publish' && step !== 'build' && (
            <Button
              onClick={handleNext}
              disabled={
                isBuilding ||
                isSaving ||
                isGeneratingSuggestions
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