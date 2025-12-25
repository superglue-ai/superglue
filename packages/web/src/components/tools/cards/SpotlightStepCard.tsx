import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/src/components/ui/alert-dialog';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Switch } from '@/src/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { splitUrl } from '@/src/lib/client-utils';
import { composeUrl } from '@/src/lib/general-utils';
import { Bug, ChevronDown, ChevronRight, FileBraces, FileInput, FileOutput, Pencil, Play, RotateCw, Route, Square, Trash2, Wand2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { JavaScriptCodeEditor } from '../../editors/JavaScriptCodeEditor';
import { TemplateAwareJsonEditor } from '../../editors/TemplateAwareJsonEditor';
import { TemplateAwareTextEditor } from '../../editors/TemplateAwareTextEditor';
import { HelpTooltip } from '../../utils/HelpTooltip';
import { useToolConfig, useExecution } from '../context';
import { CopyButton } from '../shared/CopyButton';
import { IntegrationSelector } from '../shared/IntegrationSelector';
import { StepInputTab } from './tabs/StepInputTab';
import { StepResultTab } from './tabs/StepResultTab';

interface SpotlightStepCardProps {
    step: any;
    stepIndex: number;
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onRemove?: (stepId: string) => void;
    onExecuteStep?: () => Promise<void>;
    onExecuteStepWithLimit?: (limit: number) => Promise<void>;
    onOpenFixStepDialog?: () => void;
    onAbort?: () => void;
    isExecuting?: boolean;
    showOutputSignal?: number;
    onConfigEditingChange?: (editing: boolean) => void;
    onDataSelectorChange?: (itemCount: number | null, isInitial: boolean) => void;
    isFirstStep?: boolean;
    isPayloadValid?: boolean;
}

export const SpotlightStepCard = React.memo(({
    step,
    stepIndex,
    onEdit,
    onRemove,
    onExecuteStep,
    onExecuteStepWithLimit,
    onOpenFixStepDialog,
    onAbort,
    isExecuting,
    showOutputSignal,
    onConfigEditingChange,
    onDataSelectorChange,
    isFirstStep = false,
    isPayloadValid = true,
}: SpotlightStepCardProps) => {
    // === CONSUME FROM CONTEXTS ===
    const { integrations } = useToolConfig();
    const {
        isExecutingAny,
        getStepResult,
        isStepFailed,
        canExecuteStep,
        getDataSelectorResult,
    } = useExecution();
    
    const isGlobalExecuting = isExecutingAny;
    const stepResult = getStepResult(step.id);
    const stepFailed = isStepFailed(step.id);
    const canExecute = canExecuteStep(stepIndex);
    
    const { output: dataSelectorOutput, error: dataSelectorError } = getDataSelectorResult(step.id);
    const lastNotifiedStepIdRef = useRef<string | null>(null);
    
    // Notify parent of data selector changes
    useEffect(() => {
        const isInitial = lastNotifiedStepIdRef.current !== step.id;
        const hasValidOutput = !dataSelectorError && dataSelectorOutput != null;
        const itemCount = hasValidOutput && Array.isArray(dataSelectorOutput) ? dataSelectorOutput.length : null;
        onDataSelectorChange?.(itemCount, isInitial);
        if (isInitial) {
            lastNotifiedStepIdRef.current = step.id;
        }
    }, [dataSelectorOutput, dataSelectorError, step.id, onDataSelectorChange]);
    
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [showInvalidPayloadDialog, setShowInvalidPayloadDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingAction, setPendingAction] = useState<'execute' | null>(null);
    const prevShowOutputSignalRef = useRef<number | undefined>(undefined);
    
    // === CONFIG TAB STATE (from ToolStepConfigurator) ===
    const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
    const [paginationOpen, setPaginationOpen] = useState(false);
    const [headersText, setHeadersText] = useState('');
    const [queryParamsText, setQueryParamsText] = useState('');
    
    const serializeValue = (val: unknown): string => {
        if (typeof val === 'string') return val;
        if (val !== undefined && val !== null) {
            try { return JSON.stringify(val, null, 2); } catch { return '{}'; }
        }
        return '{}';
    };

    useEffect(() => {
        setHeadersText(serializeValue(step.apiConfig?.headers));
        setQueryParamsText(serializeValue(step.apiConfig?.queryParams));
    }, [step.id, step.apiConfig?.headers, step.apiConfig?.queryParams]);

    useEffect(() => {
        if (showOutputSignal && showOutputSignal !== prevShowOutputSignalRef.current && stepResult != null) {
            setActivePanel('output');
        }
        prevShowOutputSignalRef.current = showOutputSignal;
    }, [showOutputSignal, stepResult]);

    const handleImmediateEdit = (updater: (s: any) => any) => {
        if (!onEdit) return;
        const updated = updater(step);
        if (onConfigEditingChange) onConfigEditingChange(true);
        onEdit(step.id, updated, true);
        if (onConfigEditingChange) setTimeout(() => onConfigEditingChange(false), 100);
    };

    const handleIntegrationChange = (value: string, selectedIntegration?: any) => {
        handleImmediateEdit((s) => ({
            ...s,
            integrationId: value,
            apiConfig: {
                ...s.apiConfig,
                urlHost: selectedIntegration?.urlHost || s.apiConfig.urlHost,
                urlPath: selectedIntegration?.urlPath || s.apiConfig.urlPath,
            }
        }));
    };

    const DEFAULT_PAGINATION_STOP_CONDITION = '(response, pageInfo) => !response.data || response.data.length === 0';

    const handlePaginationTypeChange = (value: string) => {
        if (value === 'none') {
            handleImmediateEdit((s) => ({
                ...s,
                apiConfig: { ...s.apiConfig, pagination: undefined },
            }));
        } else {
            handleImmediateEdit((s) => ({
                ...s,
                apiConfig: {
                    ...s.apiConfig,
                    pagination: {
                        type: value,
                        pageSize: s.apiConfig.pagination?.pageSize || '50',
                        cursorPath: s.apiConfig.pagination?.cursorPath || '',
                        stopCondition: s.apiConfig.pagination?.stopCondition || DEFAULT_PAGINATION_STOP_CONDITION,
                    },
                },
            }));
        }
    };

    const handleRunStepClick = () => {
        if (isFirstStep && !isPayloadValid) {
            setPendingAction('execute');
            setShowInvalidPayloadDialog(true);
        } else if (onExecuteStep) {
            onExecuteStep();
        }
    };

    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50 overflow-hidden">
            <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Route className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <h3 className="text-lg font-semibold truncate">
                            {step.id || `Step ${stepIndex + 1}`}
                        </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {onExecuteStep && (
                            <div className="flex items-center">
                                {isExecuting && onAbort ? (
                                    <Button
                                        variant="outline"
                                        onClick={onAbort}
                                        className="h-8 px-3 gap-2"
                                    >
                                        <Square className="h-3 w-3" />
                                        <span className="font-medium text-[13px]">Stop</span>
                                    </Button>
                                ) : (
                                    <span title={!canExecute ? "Execute previous steps first" : isExecuting ? "Step is executing..." : "Run this step"}>
                                        <div className={`relative flex rounded-md border border-input bg-background ${dataSelectorOutput && Array.isArray(dataSelectorOutput) && dataSelectorOutput.length > 1 && onExecuteStepWithLimit ? '' : ''}`}>
                                            <Button
                                                variant="ghost"
                                                onClick={handleRunStepClick}
                                                disabled={!canExecute || isExecuting || isGlobalExecuting}
                                                className={`h-8 pl-3 gap-2 border-0 ${dataSelectorOutput && Array.isArray(dataSelectorOutput) && dataSelectorOutput.length > 1 && onExecuteStepWithLimit ? 'pr-2 rounded-r-none' : 'pr-3'}`}
                                            >
                                                {dataSelectorOutput && Array.isArray(dataSelectorOutput) && dataSelectorOutput.length > 1 ? (
                                                    <RotateCw className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Play className="h-3 w-3" />
                                                )}
                                                <span className="font-medium text-[13px]">Run Step</span>
                                            </Button>
                                            {dataSelectorOutput && Array.isArray(dataSelectorOutput) && dataSelectorOutput.length > 1 && onExecuteStepWithLimit && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            disabled={!canExecute || isExecuting || isGlobalExecuting}
                                                            className="h-8 px-1.5 rounded-l-none border-0"
                                                        >
                                                            <ChevronDown className="h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => onExecuteStepWithLimit(1)}>
                                                            <Bug className="h-3.5 w-3.5 mr-2" />
                                                            Run single iteration
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                            {dataSelectorOutput && Array.isArray(dataSelectorOutput) && dataSelectorOutput.length > 1 && (
                                                <span className="absolute -top-2 -left-2 min-w-[16px] h-[16px] px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded flex items-center justify-center">
                                                    {dataSelectorOutput.length >= 1000 ? `${Math.floor(dataSelectorOutput.length / 1000)}k` : dataSelectorOutput.length}
                                                </span>
                                            )}
                                        </div>
                                    </span>
                                )}
                            </div>
                        )}
                        {onOpenFixStepDialog && (
                            <span title={!canExecute ? "Execute previous steps first" : isExecuting ? "Step is executing..." : "Fix this step with AI"}>
                                <div className={`relative flex rounded-md border border-input bg-background ${stepFailed ? 'border-destructive/50' : ''}`}>
                                <Button
                                    variant="ghost"
                                    onClick={onOpenFixStepDialog}
                                    disabled={!canExecute || isExecuting || isGlobalExecuting}
                                        className={`h-8 px-3 gap-2 border-0 ${stepFailed ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive animate-pulse' : ''}`}
                                >
                                    <Wand2 className="h-3 w-3" />
                                    <span className="font-medium text-[13px]">Fix Step</span>
                                </Button>
                                </div>
                            </span>
                        )}
                        {onRemove && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="h-8 w-8"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                <div className={activePanel === 'config' ? 'space-y-1' : 'space-y-2'}>
                    <div className="flex items-center justify-between">
                        <Tabs value={activePanel} onValueChange={(v) => setActivePanel(v as 'input' | 'config' | 'output')}>
                            <TabsList className="h-9 p-1 rounded-md">
                                <TabsTrigger value="input" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                                    <FileInput className="h-4 w-4" /> Step Input
                                </TabsTrigger>
                                <TabsTrigger value="config" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                                    <FileBraces className="h-4 w-4" /> Step Config
                                </TabsTrigger>
                                <TabsTrigger value="output" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                                    <FileOutput className="h-4 w-4" /> Step Result
                                </TabsTrigger>

                            </TabsList>
                        </Tabs>
                    </div>

                    <div>
                        {activePanel === 'input' && (
                            <StepInputTab
                                step={step}
                                stepIndex={stepIndex}
                                onEdit={onEdit}
                            />
                        )}
                        {activePanel === 'config' && (
                            <Card className="w-full border-none shadow-none opacity-100">
                                <CardContent className="space-y-3 text-sm p-3">
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Step Instruction
                                            <HelpTooltip text="Instruction for this step. This describes what the step does and how it should behave." />
                                        </Label>
                                        <div className="relative mt-1 rounded-lg border shadow-sm bg-muted/30">
                                            <div className="absolute top-0 right-0 bottom-0 z-10 flex items-center gap-1 pl-2 pr-1 bg-gradient-to-l from-muted via-muted/90 to-muted/60">
                                                {onOpenFixStepDialog && (
                                                    <button
                                                        type="button"
                                                        onClick={onOpenFixStepDialog}
                                                        className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-muted/50"
                                                        title="Fix this step with AI"
                                                        aria-label="Fix this step with AI"
                                                    >
                                                        <Pencil className="h-3 w-3 text-muted-foreground" />
                                                    </button>
                                                )}
                                                <CopyButton text={step.apiConfig.instruction || ''} />
                                            </div>
                                            <div className="h-9 flex items-center text-xs text-muted-foreground px-3 pr-16 truncate">
                                                {step.apiConfig.instruction || (
                                                    <span className="text-muted-foreground italic">Describe what this step should do...</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label className="text-xs flex items-center gap-1">
                                                Integration
                                                <HelpTooltip text="Select an integration to link this step to. This will pre-fill the API configuration with the integration's base URL and credentials." />
                                            </Label>
                                            <div className="rounded-lg border shadow-sm bg-muted/30 mt-1">
                                                <IntegrationSelector
                                                    value={step.integrationId || ''}
                                                    onValueChange={handleIntegrationChange}
                                                    triggerClassName="h-9 border-0 bg-transparent shadow-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Request &amp; URL
                                            <HelpTooltip text="Configure the HTTP method and URL for this request. Use variables like {variable} to reference previous step outputs." />
                                        </Label>
                                        <div className="space-y-2 mt-1">
                                            <div className="flex gap-2">
                                                <div className="rounded-lg border shadow-sm bg-muted/30">
                                                    <Select value={step.apiConfig.method} onValueChange={(value) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, method: value } }))}>
                                                        <SelectTrigger className="h-9 w-28 border-0 bg-transparent shadow-none">
                                                            <SelectValue placeholder="Method" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(method => (<SelectItem key={method} value={method}>{method}</SelectItem>))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <TemplateAwareTextEditor 
                                                    value={composeUrl(step.apiConfig.urlHost || '', step.apiConfig.urlPath || '')} 
                                                    onChange={(newValue) => {
                                                        const { urlHost, urlPath } = splitUrl(newValue);
                                                        handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, urlHost, urlPath } }));
                                                    }}
                                                    stepId={step.id}
                                                    className="flex-1" 
                                                    placeholder="https://api.example.com/endpoint" 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Headers
                                            <HelpTooltip text="HTTP headers to include with the request. Use JSON format. Common headers include Content-Type, Authorization, etc." />
                                        </Label>
                                        <TemplateAwareJsonEditor
                                            value={headersText}
                                            onChange={(val) => {
                                                setHeadersText(val || '');
                                                handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, headers: val || '' } }));
                                            }}
                                            stepId={step.id}
                                            minHeight="75px"
                                            maxHeight="300px"
                                            placeholder="{}"
                                            showValidation={true}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1 mb-1">
                                            Query Parameters
                                            <HelpTooltip text='URL query parameters to append to the request. Can be JSON object or any text format like "param1=value1&param2=value2"' />
                                        </Label>
                                        <TemplateAwareJsonEditor
                                            value={queryParamsText}
                                            onChange={(val) => {
                                                setQueryParamsText(val || '');
                                                handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, queryParams: val || '' } }));
                                            }}
                                            stepId={step.id}
                                            minHeight="75px"
                                            maxHeight="300px"
                                            placeholder="{}"
                                            showValidation={true}
                                        />
                                    </div>
                                    {['POST', 'PUT', 'PATCH'].includes(step.apiConfig.method) && (
                                        <div>
                                            <Label className="text-xs flex items-center gap-1 mb-1">
                                                Body
                                                <HelpTooltip text="Request body content. Can be JSON, form data, plain text, or any format. Use JavaScript expressions to transform data from previous steps." />
                                            </Label>
                                            <TemplateAwareJsonEditor
                                                value={step.apiConfig.body || ''}
                                                onChange={(val) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, body: val || '' } }))}
                                                stepId={step.id}
                                                minHeight="75px"
                                                maxHeight="300px"
                                                placeholder=""
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <div
                                            onClick={() => setPaginationOpen(!paginationOpen)}
                                            className="w-full flex items-center justify-between text-xs font-medium text-left p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setPaginationOpen(!paginationOpen);
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-1">
                                                {paginationOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                <span>
                                                    {step.apiConfig.pagination?.type === 'OFFSET_BASED' ? 'Offset-based Pagination' :
                                                        step.apiConfig.pagination?.type === 'PAGE_BASED' ? 'Page-based Pagination' :
                                                            step.apiConfig.pagination?.type === 'CURSOR_BASED' ? 'Cursor-based Pagination' :
                                                                'No Pagination'}
                                                </span>
                                                <HelpTooltip text="Configure pagination if the API returns data in pages. Only set this if you're using pagination variables like {'<<offset>>'}, {'<<page>>'}, or {'<<cursor>>'} in your request." />
                                            </div>
                                        </div>
                                        <div className={`overflow-hidden transition-all duration-200 ease-in-out ${paginationOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                            <div className="space-y-2 mt-1 border-muted">
                                                <div className="pl-2 mb-1">
                                                    <Select
                                                        value={step.apiConfig.pagination?.type || 'none'}
                                                        onValueChange={handlePaginationTypeChange}
                                                    >
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue placeholder="No pagination" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">No pagination</SelectItem>
                                                            <SelectItem value="OFFSET_BASED">Offset-based (uses {'<<offset>>'})</SelectItem>
                                                            <SelectItem value="PAGE_BASED">Page-based (uses {'<<page>>'})</SelectItem>
                                                            <SelectItem value="CURSOR_BASED">Cursor-based (uses {'<<cursor>>'})</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                {step.apiConfig.pagination && (
                                                    <div className="mt-2 gap-2 pl-2">
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <Label className="text-xs">Page Size</Label>
                                                                <div className="rounded-lg border shadow-sm bg-muted/30 mt-1">
                                                                    <Input value={step.apiConfig.pagination.pageSize || '50'} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, pagination: { ...(s.apiConfig.pagination || {}), pageSize: e.target.value } } }))} className="text-xs border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0" placeholder="50" />
                                                                </div>
                                                            </div>
                                                            {step.apiConfig.pagination.type === 'CURSOR_BASED' && (
                                                                <div className="flex-1">
                                                                    <Label className="text-xs">Cursor Path</Label>
                                                                    <div className="rounded-lg border shadow-sm bg-muted/30 mt-1">
                                                                        <Input value={step.apiConfig.pagination.cursorPath || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, pagination: { ...(s.apiConfig.pagination || {}), cursorPath: e.target.value } } }))} className="text-xs border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0" placeholder="e.g., response.nextCursor" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="mt-2 gap-2">
                                                            <Label className="text-xs flex items-center gap-1">
                                                                Stop Condition (JavaScript)
                                                                <HelpTooltip text="JavaScript function that returns true when pagination should stop. Receives (response, pageInfo) where pageInfo has: page, offset, cursor, total fetched." />
                                                            </Label>
                                                            <div className="mt-1">
                                                                <JavaScriptCodeEditor
                                                                    value={step.apiConfig.pagination.stopCondition || DEFAULT_PAGINATION_STOP_CONDITION}
                                                                    onChange={(val) => handleImmediateEdit((s) => ({
                                                                        ...s,
                                                                        apiConfig: {
                                                                            ...s.apiConfig,
                                                                            pagination: { ...(s.apiConfig.pagination || {}), stopCondition: val }
                                                                        }
                                                                    }))}
                                                                    minHeight="50px"
                                                                    maxHeight="250px"
                                                                    resizable={true}
                                                                    isTransformEditor={false}
                                                                    autoFormatOnMount={true}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <div
                                            onClick={() => setAdvancedSettingsOpen(!advancedSettingsOpen)}
                                            className="w-full flex items-center justify-between text-xs font-medium text-left p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setAdvancedSettingsOpen(!advancedSettingsOpen);
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-1">
                                                {advancedSettingsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                <span>Advanced Step Settings</span>
                                            </div>
                                        </div>
                                        <div className={`overflow-hidden transition-all duration-200 ease-in-out ${advancedSettingsOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                            <div className="space-y-3 mt-2 border-muted">
                                                <div className="flex items-center justify-between space-x-2 pl-2">
                                                    <div className="flex flex-col gap-1">
                                                        <label
                                                            htmlFor={`modify-${step.id}`}
                                                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                        >
                                                            Modifies data
                                                        </label>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            Enable this if the step can modify or delete live data. When enabled, you'll be prompted to confirm before execution.
                                                        </p>
                                                    </div>
                                                    <Switch
                                                        id={`modify-${step.id}`}
                                                        checked={step.modify === true}
                                                        onCheckedChange={(checked) => {
                                                            handleImmediateEdit((s) => ({
                                                                ...s,
                                                                modify: checked === true
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between space-x-2 pl-2">
                                                    <div className="flex flex-col gap-1">
                                                        <label
                                                            htmlFor={`continue-on-failure-${step.id}`}
                                                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                        >
                                                            Continue on failure
                                                        </label>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            When enabled, the workflow continues even if this step fails. Failed iterations are tracked in the results but don't stop execution.
                                                        </p>
                                                    </div>
                                                    <Switch
                                                        id={`continue-on-failure-${step.id}`}
                                                        checked={step.failureBehavior === 'CONTINUE'}
                                                        onCheckedChange={(checked) => {
                                                            handleImmediateEdit((s) => ({
                                                                ...s,
                                                                failureBehavior: checked === true ? 'CONTINUE' : 'FAIL'
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        {activePanel === 'output' && (
                            <StepResultTab
                                step={step}
                                stepIndex={stepIndex}
                                isExecuting={isExecuting}
                                isActive={true}
                            />
                        )}
                    </div>
                </div>
            </div>

            <AlertDialog open={showInvalidPayloadDialog} onOpenChange={(open) => {
                setShowInvalidPayloadDialog(open);
                if (!open) {
                    setPendingAction(null);
                }
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Tool Input Does Not Match Input Schema</AlertDialogTitle>
                        <AlertDialogDescription>
                            Your tool input does not match the input schema. This may cause execution to fail.
                            You can edit the input and schema in the Start (Tool Input) Card.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            setShowInvalidPayloadDialog(false);
                            if (pendingAction === 'execute' && onExecuteStep) {
                                onExecuteStep();
                            }
                            setPendingAction(null);
                        }}>
                            Run Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Step</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete step "{step.id}"? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={() => {
                                setShowDeleteConfirm(false);
                                onRemove?.(step.id);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
});
