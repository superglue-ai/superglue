import { useConfig } from '@/src/app/config-context';
import { useIntegrations } from '@/src/app/integrations-context';
import { getAuthBadge } from '@/src/app/integrations/page';
import { IntegrationForm } from '@/src/components/integrations/IntegrationForm';
import { FileChip } from '@/src/components/ui/FileChip';
import { useToast } from '@/src/hooks/use-toast';
import { needsUIToTriggerDocFetch } from '@/src/lib/client-utils';
import { ExtendedSuperglueClient } from '@/src/lib/extended-superglue-client';
import { formatBytes, generateUniqueKey, MAX_TOTAL_FILE_SIZE_TOOLS, processAndExtractFile, sanitizeFileName, type UploadedFileInfo } from '@/src/lib/file-utils';
import { cn, composeUrl, getIntegrationIcon as getIntegrationIconName, getSimpleIcon, inputErrorStyles } from '@/src/lib/general-utils';
import { tokenRegistry } from '@/src/lib/token-registry';
import { Integration, IntegrationInput, Workflow as Tool, UpsertMode } from '@superglue/client';
import { generateDefaultFromSchema, integrationOptions } from "@superglue/shared";
import { waitForIntegrationProcessing } from '@superglue/shared/utils';
import { Validator } from 'jsonschema';
import { Check, Clock, FileJson, FileWarning, Globe, Key, Loader2, Paperclip, Pencil, Plus, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { JsonCodeEditor } from '../editors/JsonCodeEditor';
import JsonSchemaEditor from '../editors/JsonSchemaEditor';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';

type ToolBuilderView = 'integrations' | 'instructions';

export interface BuildContext {
  integrationIds: string[];
  instruction: string;
  payload: string;
  responseSchema: string;
  inputSchema: string | null;
  enforceInputSchema: boolean;
  uploadedFiles: UploadedFileInfo[];
  filePayloads: Record<string, any>;
}

interface ToolBuilderProps {
  initialView?: ToolBuilderView;
  initialIntegrationIds?: string[];
  initialInstruction?: string;
  initialPayload?: string;
  initialResponseSchema?: string;
  initialInputSchema?: string | null;
  initialFiles?: UploadedFileInfo[];
  onToolBuilt: (tool: Tool, context: BuildContext) => void;
  onCancel?: () => void;
  mode?: 'build' | 'rebuild';
}

// Check if a response schema is meaningful (not just empty or basic structure)
const isMeaningfulResponseSchema = (schemaText: string | null): boolean => {
  if (!schemaText || !schemaText.trim()) {
    return false;
  }
  if (schemaText.trim() === '{}') {
    return false;
  }

  try {
    const schema = JSON.parse(schemaText);
    
    // Try to generate a default - if it fails or is empty, schema is not meaningful
    try {
      const defaultValue = generateDefaultFromSchema(schema);
      // Check if the generated default is an empty object
      if (typeof defaultValue === 'object' && defaultValue !== null) {
        return Object.keys(defaultValue).length > 0;
      }
      // If it's not an object or is null, consider it meaningful
      return true;
    } catch {
      // If we can't generate a default, it's not a meaningful schema
      return false;
    }
  } catch {
    // Invalid JSON
    return false;
  }
};


export function ToolBuilder({
  initialView = 'integrations',
  initialIntegrationIds = [],
  initialInstruction = '',
  initialPayload = '{}',
  initialResponseSchema = '',
  initialInputSchema = null,
  initialFiles = [],
  onToolBuilt,
  onCancel,
  mode = 'build'
}: ToolBuilderProps) {
  const [view, setView] = useState<ToolBuilderView>(initialView);
  const [isBuilding, setIsBuilding] = useState(false);
  const { toast } = useToast();
  const superglueConfig = useConfig();

  const { integrations, pendingDocIds, loading, setPendingDocIds, refreshIntegrations } = useIntegrations();

  const [instruction, setInstruction] = useState(initialInstruction);
  const [payload, setPayload] = useState(initialPayload);
  const [responseSchema, setResponseSchema] = useState(initialResponseSchema);
  const [inputSchema, setInputSchema] = useState<string | null>(initialInputSchema);
  const [enforceInputSchema, setEnforceInputSchema] = useState(true);
  // Always default to 'current' (generated from tool input)
  const [inputSchemaMode, setInputSchemaMode] = useState<'current' | 'custom'>('current');

  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>(initialFiles);
  const [totalFileSize, setTotalFileSize] = useState(initialFiles.reduce((sum, f) => sum + f.size, 0));
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});

  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<string[]>(initialIntegrationIds);

  const [integrationSearch, setIntegrationSearch] = useState('');
  const [showIntegrationForm, setShowIntegrationForm] = useState(false);
  const [integrationFormEdit, setIntegrationFormEdit] = useState<Integration | null>(null);

  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  // Always start with all sections closed
  const [showPayloadSection, setShowPayloadSection] = useState(false);
  const [showFileUploadSection, setShowFileUploadSection] = useState(false);
  const [showResponseSchemaSection, setShowResponseSchemaSection] = useState(false);
  const [isPayloadValid, setIsPayloadValid] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const client = useMemo(() => new ExtendedSuperglueClient({
    endpoint: superglueConfig.superglueEndpoint,
    apiKey: tokenRegistry.getToken(),
  }), [superglueConfig.superglueEndpoint]);

  const { waitForIntegrationReady } = useMemo(() => ({
    waitForIntegrationReady: (integrationIds: string[]) => {
      const clientAdapter = {
        getIntegration: (id: string) => client.getIntegration(id)
      };
      return waitForIntegrationProcessing(clientAdapter, integrationIds);
    }
  }), [client]);

  useEffect(() => {
    if (view === 'instructions' && selectedIntegrationIds.length > 0 && !isGeneratingSuggestions) {
      setSuggestions([]);
      handleGenerateInstructions();
    }
  }, [selectedIntegrationIds, view, integrations]);

  useEffect(() => {
    if (view !== 'instructions') {
      setValidationErrors({});
    }
  }, [view]);

  // Auto-resize textarea when instruction changes (including initial mount)
  useEffect(() => {
    if (textareaRef.current && instruction) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [instruction]);

  // Validate payload against custom input schema
  useEffect(() => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = setTimeout(() => {
      // Only validate if custom schema mode is active and schema is set
      if (enforceInputSchema && inputSchemaMode === 'custom' && inputSchema) {
        try {
          const payloadData = JSON.parse(payload || '{}');
          const mergedPayload = { ...payloadData, ...filePayloads };
          const schemaObj = JSON.parse(inputSchema);
          const validator = new Validator();
          const result = validator.validate(mergedPayload, schemaObj);
          setIsPayloadValid(result.valid);
        } catch (e) {
          setIsPayloadValid(false);
        }
      } else {
        setIsPayloadValid(true);
      }
    }, 300);

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [payload, inputSchema, filePayloads, enforceInputSchema, inputSchemaMode]);

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
      
      if (selectedIntegrationInputs.length === 0) {
        setIsGeneratingSuggestions(false);
        return;
      }
      
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

  const handleFilesUpload = async (files: File[]) => {
    setIsProcessingFiles(true);

    try {
      const newSize = files.reduce((sum, f) => sum + f.size, 0);
      if (totalFileSize + newSize > MAX_TOTAL_FILE_SIZE_TOOLS) {
        toast({
          title: 'Size limit exceeded',
          description: `Total file size cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE_TOOLS)}`,
          variant: 'destructive'
        });
        return;
      }

      const existingKeys = Object.keys(filePayloads);
      const newFiles: UploadedFileInfo[] = [];

      for (const file of files) {
        try {
          const baseKey = sanitizeFileName(file.name, { removeExtension: true, lowercase: false });
          const key = generateUniqueKey(baseKey, [...existingKeys, ...newFiles.map(f => f.key)]);

          const fileInfo: UploadedFileInfo = {
            name: file.name,
            size: file.size,
            key,
            status: 'processing'
          };
          newFiles.push(fileInfo);
          setUploadedFiles(prev => [...prev, fileInfo]);

          const parsedData = await processAndExtractFile(file, client);

          setFilePayloads(prev => ({ ...prev, [key]: parsedData }));
          existingKeys.push(key);

          setUploadedFiles(prev => prev.map(f =>
            f.key === key ? { ...f, status: 'ready' } : f
          ));

        } catch (error: any) {
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
    const fileToRemove = uploadedFiles.find(f => f.key === key);
    if (!fileToRemove) return;

    setFilePayloads(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    setUploadedFiles(prev => prev.filter(f => f.key !== key));
    setTotalFileSize(prev => Math.max(0, prev - (fileToRemove.size || 0)));
  };

  const handleBuildTool = async () => {
    const errors: Record<string, boolean> = {};
    if (!instruction.trim()) errors.instruction = true;
    try {
      JSON.parse(payload || '{}');
    } catch {
      errors.payload = true;
    }
    if (responseSchema && responseSchema.trim()) {
      try {
        JSON.parse(responseSchema);
      } catch {
        errors.responseSchema = true;
      }
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

    setShowPayloadSection(false);
    setShowFileUploadSection(false);
    setShowResponseSchemaSection(false);
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

      const context: BuildContext = {
        integrationIds: selectedIntegrationIds,
        instruction,
        payload,
        responseSchema,
        inputSchema,
        enforceInputSchema,
        uploadedFiles,
        filePayloads
      };

      onToolBuilt(response, context);
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

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleNextFromIntegrations = () => {
    setView('instructions');
  };

  if (view === 'integrations') {
    return (
      <div className="flex items-start justify-center pt-8">
        <div className="w-full max-w-3xl mx-auto space-y-4">
          <div className="text-center mb-6">
            <h2 className="text-xl font-medium text-foreground mb-2">
              Select integrations for your tool
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose one or more integrations, or choose none to create transform-only tools
            </p>
          </div>
          
          <div className="border rounded-2xl bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search integrations..."
                value={integrationSearch}
                onChange={e => setIntegrationSearch(e.target.value)}
                className="h-10 flex-1"
              />
              <Button variant="outline" size="sm" className="h-10 shrink-0" onClick={() => setShowIntegrationForm(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Integration
              </Button>
            </div>

            {loading ? (
              <div className="h-[200px] bg-background" />
            ) : integrations.length === 0 ? (
              <div className="py-16 flex items-center justify-center">
                <p className="text-sm text-muted-foreground italic">
                  No integrations added yet. Define the APIs or data sources your tool will use.
                </p>
              </div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 450px)', minHeight: '200px' }}>
                <div className="space-y-2">
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
                          const badge = getAuthBadge(sys);
                          const colorClasses = {
                            blue: 'text-blue-800 dark:text-blue-300 bg-blue-500/10',
                            amber: 'text-amber-800 dark:text-amber-300 bg-amber-500/10',
                            green: 'text-green-800 dark:text-green-300 bg-green-500/10'
                          };
                          
                          return (
                            <div
                              key={sys.id}
                              className={cn(
                                "flex items-center justify-between rounded-lg px-4 py-3 transition-all duration-200 cursor-pointer",
                                selected
                                  ? "bg-primary/10 dark:bg-primary/40 border border-primary/50 dark:border-primary/60 hover:bg-primary/15 dark:hover:bg-primary/25"
                                  : "bg-muted/30 border border-border hover:bg-muted/50 hover:border-border/80"
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
                                  <span className="font-medium text-sm truncate">{sys.id}</span>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {composeUrl(sys.urlHost, sys.urlPath)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex gap-2 items-center">
                                <span className={`text-xs ${colorClasses[badge.color]} px-2 py-0.5 rounded flex items-center gap-1`}>
                                  {badge.icon === 'clock' ? <Clock className="h-3 w-3" /> : <Key className="h-3 w-3" />}
                                  {badge.label}
                                </span>
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
              </div>
            )}

            <div className="flex justify-end mt-3">
              <Button
                onClick={handleNextFromIntegrations}
                className="h-8 px-4 rounded-full flex-shrink-0"
              >
                {selectedIntegrationIds.length === 0
                  ? "Select None"
                  : selectedIntegrationIds.length === 1
                    ? "Select 1 Integration"
                    : `Select ${selectedIntegrationIds.length} Integrations`}
              </Button>
            </div>
          </div>
        
          {showIntegrationForm && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
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
            </div>,
            document.body
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center pt-8 h-full overflow-y-auto pb-8" style={{ scrollbarGutter: 'stable' }}>
      <div className="w-full max-w-3xl space-y-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-medium text-foreground">
            What should your tool do for you?
          </h2>
        </div>
        
          <div className="flex flex-wrap gap-2 justify-center mb-4">
          {selectedIntegrationIds.map(id => {
            const integration = integrations.find(i => i.id === id);
            if (!integration) return null;
            
            const iconName = getIntegrationIconName(integration);
            const icon = iconName ? getSimpleIcon(iconName) : null;
            
            return (
              <button
                key={id}
                onClick={(e) => {
                  e.preventDefault();
                  if (isBuilding) return;
                  setSelectedIntegrationIds(ids => ids.filter(i => i !== id));
                  setSuggestions([]);
                  if (selectedIntegrationIds.length > 1) {
                    handleGenerateInstructions();
                  }
                }}
                disabled={isBuilding}
                className={cn(
                  "group flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border transition-all",
                  isBuilding 
                    ? "opacity-50 cursor-not-allowed" 
                    : "hover:bg-red-500/10 hover:border-red-500/50"
                )}
                title={isBuilding ? "Cannot modify while building" : "Click to remove"}
              >
                {icon ? (
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
                  <Globe className="h-4 w-4 flex-shrink-0 text-foreground" />
                )}
                <span className="text-sm font-medium max-w-[120px] truncate">
                  {integration.id}
                </span>
                <X className="h-3 w-3 text-muted-foreground group-hover:text-red-500 transition-colors" />
              </button>
            );
          })}
          
          <button
            onClick={() => !isBuilding && setView('integrations')}
            disabled={isBuilding}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-dashed border-border transition-all",
              isBuilding
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-muted/80 hover:border-border/80"
            )}
            title={isBuilding ? "Cannot modify while building" : "Add integrations"}
          >
            <Plus className="h-4 w-4 flex-shrink-0 text-foreground" />
            <span className="text-sm font-medium">
              Add Integration
            </span>
          </button>
        </div>

        <div className="relative border rounded-2xl bg-card p-4">
          <Textarea
            ref={textareaRef}
            id="instruction"
            value={instruction}
            onChange={handleTextareaChange}
            placeholder="Describe what you want this tool to achieve..."
            disabled={isBuilding}
            className={cn(
              "resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 scrollbar-thin scrollbar-thumb-rounded min-h-[80px]",
              validationErrors.instruction && inputErrorStyles,
              isBuilding && "opacity-50 cursor-not-allowed"
            )}
            rows={1}
            style={{
              maxHeight: '200px',
              overflowY: instruction.split('\n').length > 8 ? 'auto' : 'hidden',
              scrollbarGutter: 'stable'
            }}
          />

          <div className="flex justify-between items-center gap-2 mt-3">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isBuilding) return;
                  if (showFileUploadSection) setShowFileUploadSection(false);
                  if (showResponseSchemaSection) setShowResponseSchemaSection(false);
                  setShowPayloadSection(!showPayloadSection);
                  if (!showPayloadSection && payload.trim() === '') {
                    setPayload('{}');
                    setValidationErrors(prev => ({ ...prev, payload: false }));
                  }
                }}
                disabled={isBuilding}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 border",
                  isBuilding && "opacity-50 cursor-not-allowed",
                  (() => {
                    const trimmedPayload = payload.trim();
                    const isEmptyPayload = !trimmedPayload || trimmedPayload === '{}';

                    if (isEmptyPayload) {
                      return showPayloadSection
                        ? "border-foreground/70 text-foreground hover:bg-accent/50"
                        : "border-border text-muted-foreground hover:bg-accent/50";
                    }

                    try {
                      JSON.parse(trimmedPayload);
                      return showPayloadSection
                        ? "bg-[#FFD700]/40 border-[#FF8C00] text-foreground"
                        : "bg-[#FFD700]/40 border-[#FFA500] text-foreground";
                    } catch {
                      return showPayloadSection
                        ? "bg-[#FFD700]/40 border-[#FF8C00] text-foreground"
                        : "bg-[#FFD700]/40 border-[#FFA500] text-foreground";
                    }
                  })()
                )}
              >
                <FileJson className="h-4 w-4" />
                {(() => {
                  const trimmedPayload = payload.trim();
                  const isEmptyPayload = !trimmedPayload || trimmedPayload === '{}';

                  // Check schema validation if custom schema is active
                  if (!isPayloadValid && enforceInputSchema && inputSchemaMode === 'custom' && inputSchema) {
                    return 'Input Does Not Match Schema';
                  }

                  if (isEmptyPayload) {
                    return 'Attach JSON Tool Input';
                  }

                  try {
                    JSON.parse(trimmedPayload);
                    return 'JSON Tool Input Attached';
                  } catch {
                    return 'Invalid Input JSON';
                  }
                })()}
              </button>

              <button
                onClick={() => {
                  if (isBuilding) return;
                  if (showPayloadSection) setShowPayloadSection(false);
                  if (!showPayloadSection && payload.trim() === '') {
                    setPayload('{}');
                    setValidationErrors(prev => ({ ...prev, payload: false }));
                  }
                  if (showResponseSchemaSection) setShowResponseSchemaSection(false);
                  setShowFileUploadSection(!showFileUploadSection);
                }}
                disabled={isBuilding}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 border",
                  isBuilding && "opacity-50 cursor-not-allowed",
                  uploadedFiles.length > 0
                    ? showFileUploadSection
                      ? "bg-[#FFD700]/40 border-[#FF8C00] text-foreground"
                      : "bg-[#FFD700]/40 border-[#FFA500] text-foreground"
                    : showFileUploadSection
                      ? "border-foreground/70 text-foreground hover:bg-accent/50"
                      : "border-border text-muted-foreground hover:bg-accent/50"
                )}
              >
                <Paperclip className="h-4 w-4" />
                {uploadedFiles.length > 0 ? `File Tool Input Attached (${uploadedFiles.length})` : 'Attach File Tool Input'}
              </button>

              <button
                onClick={() => {
                  if (isBuilding) return;
                  if (showPayloadSection) setShowPayloadSection(false);
                  if (!showPayloadSection && payload.trim() === '') {
                    setPayload('{}');
                    setValidationErrors(prev => ({ ...prev, payload: false }));
                  }
                  if (showFileUploadSection) setShowFileUploadSection(false);
                  setShowResponseSchemaSection(!showResponseSchemaSection);
                }}
                disabled={isBuilding}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 border",
                  isBuilding && "opacity-50 cursor-not-allowed",
                  (() => {
                    const hasMeaningfulSchema = isMeaningfulResponseSchema(responseSchema);
                    
                    if (!hasMeaningfulSchema) {
                      return showResponseSchemaSection
                        ? "border-foreground/70 text-foreground hover:bg-accent/50"
                        : "border-border text-muted-foreground hover:bg-accent/50";
                    }
                    
                    return showResponseSchemaSection
                      ? "bg-[#FFD700]/40 border-[#FF8C00] text-foreground"
                      : "bg-[#FFD700]/40 border-[#FFA500] text-foreground";
                  })()
                )}
              >
                <FileWarning className="h-4 w-4" />
                {isMeaningfulResponseSchema(responseSchema) 
                  ? 'Tool Result Schema Defined' 
                  : 'Enforce Tool Result Schema'}
              </button>
            </div>

            <Button
              onClick={handleBuildTool}
              disabled={isBuilding || !instruction.trim() || !isPayloadValid}
              className="h-8 px-4 rounded-full flex-shrink-0 flex items-center gap-2"
              title={
                !isPayloadValid 
                  ? 'Payload does not match custom input schema'
                  : mode === 'rebuild' ? 'Rebuild Tool' : 'Build Tool'
              }
            >
              {isBuilding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === 'rebuild' ? 'Rebuilding...' : 'Building...'}
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4" />
                  {mode === 'rebuild' ? 'Rebuild' : 'Build'}
                </>
              )}
            </Button>
          </div>
        </div>
        {validationErrors.instruction && (
          <p className="text-sm text-destructive text-center mt-2">Tool instruction is required</p>
        )}

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

              <JsonCodeEditor
                value={payload}
                onChange={(val) => {
                  setPayload(val);
                  try {
                    JSON.parse(val || '');
                    setValidationErrors(prev => ({ ...prev, payload: false }));
                  } catch {
                    setValidationErrors(prev => ({ ...prev, payload: true }));
                  }
                }}
                minHeight="150px"
                maxHeight="300px"
                resizable={true}
                placeholder="{}"
                showValidation={true}
              />
              
              {!isPayloadValid && enforceInputSchema && inputSchemaMode === 'custom' && inputSchema && (
                <div className="mt-2 p-3 bg-destructive/10 border border-destructive/50 rounded-md">
                  <div className="flex items-start gap-2">
                    <FileWarning className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-destructive">
                        Payload Does Not Match Custom Input Schema
                      </p>
                      <p className="text-xs text-destructive/90">
                        The JSON input above does not conform to your custom input schema. Fix the input or adjust the schema below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {enforceInputSchema && (
                <div className="space-y-3 pt-3 border-t">
                  <h4 className="font-medium text-sm">Enforced Tool Input Schema</h4>

                  <Tabs
                    value={inputSchemaMode}
                    onValueChange={(v) => {
                      setInputSchemaMode(v as 'current' | 'custom');
                      if (v === 'custom' && !inputSchema) {
                        setInputSchema('{"type":"object","properties":{}}');
                      }
                    }}
                  >
                    <TabsList className="h-9 p-1 rounded-md w-full">
                      <TabsTrigger value="current" className="flex-1 h-full px-3 text-xs rounded-sm data-[state=active]:rounded-sm">
                        Use schema generated from tool input
                      </TabsTrigger>
                      <TabsTrigger value="custom" className="flex-1 h-full px-3 text-xs rounded-sm data-[state=active]:rounded-sm">
                        Use custom schema
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {inputSchemaMode === 'custom' && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Define a JSON Schema here to validate the tool's input.
                      </p>
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
                accept=".json,.csv,.txt,.xml,.xlsx,.xls,.pdf"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    await handleFilesUpload(files);
                  }
                  e.target.value = '';
                }}
                className="hidden"
                id="file-upload-builder"
              />
              {uploadedFiles.length > 0 && (
                <div className="space-y-2 mb-3">
                  {uploadedFiles.map(file => (
                    <FileChip
                      key={file.key}
                      file={file}
                      onRemove={handleFileRemove}
                      size="default"
                      rounded="md"
                      showOriginalName={true}
                    />
                  ))}
                </div>
              )}
              <div className="flex flex-col items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('file-upload-builder')?.click()}
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
                  {formatBytes(totalFileSize)} / {formatBytes(MAX_TOTAL_FILE_SIZE_TOOLS)}
                </div>
              </div>
            </div>
          </div>
        )}

        {showResponseSchemaSection && (
          <div className="border rounded-lg p-4 bg-card animate-fade-in mt-3" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
            <h4 className="font-medium text-sm mb-3">Tool Result Schema</h4>
            <p className="text-xs text-muted-foreground mt-2">
              Define a JSON Schema to validate the tool's response
            </p>
            <JsonSchemaEditor
              value={responseSchema || null}
              onChange={(value) => {
                setResponseSchema(value || '');
                if (value && value.trim()) {
                  try {
                    JSON.parse(value);
                    setValidationErrors(prev => ({ ...prev, responseSchema: false }));
                  } catch {
                    setValidationErrors(prev => ({ ...prev, responseSchema: true }));
                  }
                } else {
                  setValidationErrors(prev => ({ ...prev, responseSchema: false }));
                }
              }}
              isOptional={true}
              showModeToggle={true}
            />
          </div>
        )}
      </div>
      
      {suggestions.length > 0 && !instruction.trim() && !showPayloadSection && !showFileUploadSection && !showResponseSchemaSection && (
        <div className="w-full max-w-4xl space-y-2 mt-4">
          <p className="text-sm text-muted-foreground text-center">Suggestions</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestions.map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => setInstruction(suggestion)}
                className="text-sm h-auto py-2 px-4 font-normal animate-fade-in whitespace-normal text-left max-w-full"
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
  );
}

