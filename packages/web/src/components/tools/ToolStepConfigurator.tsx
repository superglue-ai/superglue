import { useConfig } from '@/src/app/config-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { useToast } from '@/src/hooks/use-toast';
import { splitUrl } from '@/src/lib/client-utils';
import { composeUrl, ensureSourceDataArrowFunction, formatJavaScriptCode, getIntegrationIcon as getIntegrationIconName, getSimpleIcon, truncateForDisplay } from '@/src/lib/general-utils';
import { tokenRegistry } from '@/src/lib/token-registry';
import { Integration, SuperglueClient } from "@superglue/client";
import { ArrowDown, Check, Copy, Download, Edit, Globe } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadJson } from '../../lib/download-utils';
import { JavaScriptCodeEditor } from '../editors/JavaScriptCodeEditor';
import { JsonCodeEditor } from '../editors/JsonCodeEditor';
import { Badge } from "../ui/badge";
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { HelpTooltip } from '../utils/HelpTooltip';
import { CopyButton } from './shared/CopyButton';

interface ToolStepConfiguratorProps {
    step: any;
    isLast: boolean;
    onEdit: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onRemove: (stepId: string) => void;
    integrations?: Integration[];
    onCreateIntegration?: () => void;
    onEditingChange?: (editing: boolean) => void;
    disabled?: boolean;
    stepInput?: any;
}

export function ToolStepConfigurator({ step, isLast, onEdit, onRemove, integrations: propIntegrations, onCreateIntegration, onEditingChange, disabled = false, stepInput }: ToolStepConfiguratorProps) {
    const [didFormatLoopSelector, setDidFormatLoopSelector] = useState(false);
    const [localIntegrations, setLocalIntegrations] = useState<Integration[]>([]);
    const [headersText, setHeadersText] = useState('');
    const [queryParamsText, setQueryParamsText] = useState('');
    const [isEditingInstruction, setIsEditingInstruction] = useState(false);
    const [instructionCopied, setInstructionCopied] = useState(false);

    const config = useConfig();
    const { toast } = useToast();

    const loadIntegrations = async () => {
        if (localIntegrations.length > 0) return;
        try {
            
            const client = new SuperglueClient({
                endpoint: config.superglueEndpoint,
                apiKey: tokenRegistry.getToken(),
            });
            
            const result = await client.listIntegrations(100, 0);
            setLocalIntegrations(result.items);
        } catch (error: any) {
            console.error("Error loading integrations:", error);
            toast({ title: "Error loading integrations", description: error.message, variant: "destructive" });
        } finally {
        }
    };

    useEffect(() => {
        if (!propIntegrations) {
            loadIntegrations();
        }
    }, []);

    const integrations = propIntegrations || localIntegrations;

    const getIntegrationIcon = (integration: Integration) => {
        const iconName = getIntegrationIconName(integration);
        return iconName ? getSimpleIcon(iconName) : null;
    };

    useEffect(() => {
        try {
            const headers = step.apiConfig?.headers;
            if (typeof headers === 'string') {
                setHeadersText(headers);
            } else if (headers !== undefined && headers !== null) {
                setHeadersText(JSON.stringify(headers, null, 2));
            } else {
                setHeadersText('{}');
            }
        } catch {
            setHeadersText('{}');
        }
        try {
            const queryParams = step.apiConfig?.queryParams;
            if (typeof queryParams === 'string') {
                setQueryParamsText(queryParams);
            } else if (queryParams !== undefined && queryParams !== null) {
                setQueryParamsText(JSON.stringify(queryParams, null, 2));
            } else {
                setQueryParamsText('{}');
            }
        } catch {
            setQueryParamsText('{}');
        }
    }, [step.id]);

    // Also reflect parent updates to headers/queryParams even if id doesn't change (e.g., self-heal)
    useEffect(() => {
        try {
            const headers = step.apiConfig?.headers;
            let newHeadersText = '{}';
            if (typeof headers === 'string') {
                newHeadersText = headers;
            } else if (headers !== undefined && headers !== null) {
                newHeadersText = JSON.stringify(headers, null, 2);
            }
            if (newHeadersText !== headersText) {
                setHeadersText(newHeadersText);
            }
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.apiConfig?.headers]);

    useEffect(() => {
        try {
            const queryParams = step.apiConfig?.queryParams;
            let newQueryParamsText = '{}';
            if (typeof queryParams === 'string') {
                newQueryParamsText = queryParams;
            } else if (queryParams !== undefined && queryParams !== null) {
                newQueryParamsText = JSON.stringify(queryParams, null, 2);
            }
            if (newQueryParamsText !== queryParamsText) {
                setQueryParamsText(newQueryParamsText);
            }
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.apiConfig?.queryParams]);

    // Format loop selector on first load
    useEffect(() => {
        if (!didFormatLoopSelector && step.loopSelector) {
            formatJavaScriptCode(step.loopSelector).then(formatted => {
                if (formatted !== step.loopSelector) {
                    const updated = { ...step, loopSelector: formatted } as any;
                    // Programmatic normalization; do NOT mark as user-initiated
                    onEdit(step.id, updated, false);
                }
                setDidFormatLoopSelector(true);
            });
        }
    }, [step.loopSelector]);

    const handleImmediateEdit = (updater: (s: any) => any) => {
        if (disabled) return;
        const updated = updater(step);
        if (onEditingChange) onEditingChange(true);
        onEdit(step.id, updated, true);
        if (onEditingChange) setTimeout(() => onEditingChange(false), 100);
    };

    const linkedIntegration = integrations?.find(integration => {
        if (step.integrationId && integration.id === step.integrationId) return true;
        return step.apiConfig?.urlHost && integration.urlHost && step.apiConfig.urlHost.includes(integration.urlHost.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, ''));
    });

    const DATA_SELECTOR_DEBOUNCE_MS = 400;
    const [loopItems, setLoopItems] = useState<any | null>(null);
    const [loopItemsError, setLoopItemsError] = useState<string | null>(null);
    const [isLoopItemsEvaluating, setIsLoopItemsEvaluating] = useState<boolean>(false);
    const lastEvalTimerRef = useRef<number | null>(null);

    const loopItemsDisplayValue = useMemo(() => {
        if (loopItemsError) return '{}';
        const displayData = truncateForDisplay(loopItems);
        return displayData.value;
    }, [loopItems, loopItemsError]);

    const loopItemsCopyValue = useMemo(() => {
        return JSON.stringify(loopItems, null, 2);
    }, [loopItems]);

    useEffect(() => {

        if (lastEvalTimerRef.current) {
            window.clearTimeout(lastEvalTimerRef.current);
            lastEvalTimerRef.current = null;
        }
        setLoopItemsError(null);
        const t = window.setTimeout(() => {
            setIsLoopItemsEvaluating(true);
            try {
                let sel = step?.loopSelector || "(sourceData) => { }";
                const raw = ensureSourceDataArrowFunction(sel).trim();
                const stripped = raw.replace(/;\s*$/, '');
                const body = `const __selector = (${stripped});\nreturn __selector(sourceData);`;
                // eslint-disable-next-line no-new-func
                const fn = new Function('sourceData', body);
                const out = fn(stepInput || {});
                setLoopItems(out);
                setLoopItemsError(null);
            } catch (err: any) {
                setLoopItems(null);
                setLoopItemsError(err?.message ? String(err.message) : 'Error evaluating loop selector');
            } finally {
                setIsLoopItemsEvaluating(false);
            }
        }, DATA_SELECTOR_DEBOUNCE_MS);
        lastEvalTimerRef.current = t as unknown as number;
        return () => { if (lastEvalTimerRef.current) { window.clearTimeout(lastEvalTimerRef.current); lastEvalTimerRef.current = null; } };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.executionMode, step.loopSelector, step.loopMaxIters, stepInput]);

    return (
        <div className="flex flex-col items-center">
            <Card className="w-full border-primary/50 opacity-100">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0">
                                <span className="font-mono truncate">{step.id}</span>
                                {linkedIntegration && (() => {
                                    const icon = getIntegrationIcon(linkedIntegration);
                                    return (
                                        <Badge variant="outline" className="text-xs flex-shrink-0">
                                            <div className="text-xs flex items-center gap-1">
                                                {icon ? (
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill={`#${icon.hex}`} className="flex-shrink-0">
                                                        <path d={icon.path || ''} />
                                                    </svg>
                                                ) : (
                                                    <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                                )}
                                                <span className="truncate">{linkedIntegration.id}</span>
                                            </div>
                                        </Badge>
                                    );
                                })()}
                            </CardTitle>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div className="space-y-2">
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs flex items-center gap-1">
                                                Step Instruction
                                                <HelpTooltip text="AI-generated instruction for this step. This describes what the step does and how it should behave." />
                                            </Label>
                                            {!isEditingInstruction && (
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(step.apiConfig.instruction || '');
                                                            setInstructionCopied(true);
                                                            setTimeout(() => setInstructionCopied(false), 1500);
                                                        }}
                                                        disabled={disabled || !step.apiConfig.instruction}
                                                        title="Copy instruction"
                                                    >
                                                        {instructionCopied ? (
                                                            <Check className="h-3 w-3 text-green-600" />
                                                        ) : (
                                                            <Copy className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => setIsEditingInstruction(true)}
                                                        disabled={disabled}
                                                        title="Edit instruction"
                                                    >
                                                        <Edit className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        {isEditingInstruction ? (
                                            <Textarea
                                                value={step.apiConfig.instruction || ''}
                                                onChange={(e) => handleImmediateEdit((s) => ({
                                                    ...s,
                                                    apiConfig: {
                                                        ...s.apiConfig,
                                                        instruction: e.target.value
                                                    }
                                                }))}
                                                onBlur={() => setIsEditingInstruction(false)}
                                                className="text-xs h-20 mt-1 focus:ring-0 focus:ring-offset-0"
                                                placeholder="Describe what this step should do..."
                                                disabled={disabled}
                                                autoFocus
                                            />
                                        ) : (
                                            <div className="text-xs mt-1 p-3 rounded-md border bg-muted/30 min-h-[5rem] whitespace-pre-wrap">
                                                {step.apiConfig.instruction || (
                                                    <span className="text-muted-foreground italic">Describe what this step should do...</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label className="text-xs flex items-center gap-1">
                                                Integration
                                                <HelpTooltip text="Select an integration to link this step to. This will pre-fill the API configuration with the integration's base URL and credentials." />
                                            </Label>
                                            <Select value={step.integrationId || ''} onValueChange={(value) => { if (disabled) return; if (value === "CREATE_NEW") { onCreateIntegration?.(); } else { const selectedIntegration = integrations?.find(integration => integration.id === value); handleImmediateEdit((s) => ({ ...s, integrationId: value, apiConfig: { ...s.apiConfig, urlHost: selectedIntegration?.urlHost || s.apiConfig.urlHost, urlPath: selectedIntegration?.urlPath || s.apiConfig.urlPath, headers: selectedIntegration?.credentials ? Object.entries(selectedIntegration.credentials).reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {}) : s.apiConfig.headers } })); } }}>
                                                <SelectTrigger className="h-9 mt-1" disabled={disabled}>
                                                    <SelectValue placeholder="Select integration" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {integrations?.map(integration => {
                                                        const icon = getIntegrationIcon(integration);
                                                        return (
                                                            <SelectItem key={integration.id} value={integration.id}>
                                                                <div className="flex items-center gap-2 w-full">
                                                                    {icon ? (
                                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill={`#${icon.hex}`} className="flex-shrink-0">
                                                                            <path d={icon.path || ''} />
                                                                        </svg>
                                                                    ) : (
                                                                        <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                                                    )}
                                                                    <span className="flex-grow">{integration.id}</span>
                                                                    {integration.urlHost && (<span className="text-muted-foreground text-xs ml-auto">({integration.urlHost})</span>)}
                                                                </div>
                                                            </SelectItem>
                                                        );
                                                    })}
                                                    {onCreateIntegration && (<SelectItem value="CREATE_NEW" className="text-primary">+ Add New Integration</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            API Config
                                            <HelpTooltip text="Configure the HTTP method and URL for this API call. Use variables like {variable} to reference previous step outputs." />
                                        </Label>
                                        <div className="space-y-2 mt-1">
                                            <div className="flex gap-2">
                                                <Select value={step.apiConfig.method} onValueChange={(value) => { if (disabled) return; handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, method: value } })); }}>
                                                    <SelectTrigger className="h-9 w-28" disabled={disabled}>
                                                        <SelectValue placeholder="Method" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(method => (<SelectItem key={method} value={method}>{method}</SelectItem>))}
                                                    </SelectContent>
                                                </Select>
                                                <Input 
                                                    value={composeUrl(step.apiConfig.urlHost || '', step.apiConfig.urlPath || '')} 
                                                    onChange={(e) => {
                                                        const { urlHost, urlPath } = splitUrl(e.target.value);
                                                        handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, urlHost, urlPath } }));
                                                    }} 
                                                    className="text-xs flex-1 focus:ring-0 focus:ring-offset-0" 
                                                    placeholder="https://api.example.com/endpoint" 
                                                    disabled={disabled} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Headers (JSON)
                                            <HelpTooltip text="HTTP headers to include with the request. Use JSON format. Common headers include Content-Type, Authorization, etc." />
                                        </Label>
                                        <JsonCodeEditor
                                            value={headersText}
                                            onChange={(val) => {
                                                if (disabled) return;
                                                setHeadersText(val || '');
                                                handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, headers: val || '' } }));
                                            }}
                                            readOnly={disabled}
                                            minHeight="100px"
                                            maxHeight="150px"
                                            resizable={true}
                                            placeholder="{}"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1 mb-1">
                                            Query Parameters
                                            <HelpTooltip text='URL query parameters to append to the request. Can be JSON object or any text format like "param1=value1&param2=value2"' />
                                        </Label>
                                        <JsonCodeEditor
                                            value={queryParamsText}
                                            onChange={(val) => {
                                                if (disabled) return;
                                                setQueryParamsText(val || '');
                                                handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, queryParams: val || '' } }));
                                            }}
                                            readOnly={disabled}
                                            minHeight="100px"
                                            maxHeight="150px"
                                            resizable={true}
                                            placeholder="{}"
                                        />
                                    </div>
                                    {['POST', 'PUT', 'PATCH'].includes(step.apiConfig.method) && (
                                        <div>
                                            <Label className="text-xs flex items-center gap-1 mb-1">
                                                Body
                                                <HelpTooltip text="Request body content. Can be JSON, form data, plain text, or any format. Use JavaScript expressions to transform data from previous steps." />
                                            </Label>
                                            <JsonCodeEditor
                                                value={step.apiConfig.body || ''}
                                                onChange={(val) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, body: val || '' } }))}
                                                readOnly={disabled}
                                                minHeight="100px"
                                                maxHeight="150px"
                                                resizable={true}
                                                placeholder=""
                                            />
                                        </div>
                                    )}
                                                                            <div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="text-xs flex items-center gap-1 mb-1">
                                                        Data Selector (JavaScript)
                                                        <HelpTooltip text="JavaScript arrow function selecting an array from step input. The step runs once per item; within each iteration sourceData.currentItem is set to that item." />
                                                    </Label>
                                                    <JavaScriptCodeEditor
                                                        value={step.loopSelector || '(sourceData) => { }'}
                                                        onChange={(val) => handleImmediateEdit((s) => ({ ...s, loopSelector: val }))}
                                                        readOnly={disabled}
                                                        minHeight="150px"
                                                        maxHeight="300px"
                                                        resizable={true}
                                                        isTransformEditor={false}
                                                        autoFormatOnMount={false}
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs flex items-center gap-1 mb-1">
                                                        Selected Data (JSON)
                                                        <HelpTooltip text="Evaluates the data selector against the step input. The resulting array drives execution (one run per item). During execution, sourceData.currentItem equals the current item." />
                                                        {isLoopItemsEvaluating && (
                                                            <div className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/70 border-t-transparent" />
                                                        )}
                                                    </Label>
                                                    <div className="relative">
                                                    <JsonCodeEditor
                                                            value={loopItemsDisplayValue}
                                                            readOnly={true}
                                                            minHeight="176px"
                                                            maxHeight="300px"
                                                            resizable={true}
                                                            placeholder=""
                                                            overlay={
                                                                <div className="flex items-center gap-2">
                                                                    {!loopItemsError && (
                                                                        <CopyButton text={loopItemsCopyValue} />
                                                                    )}
                                                                    {!loopItemsError && (
                                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => downloadJson(loopItems, `step_${step.id}_loop_items.json`)} title="Download loop items as JSON">
                                                                            <Download className="h-3 w-3" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            }
                                                            bottomRightOverlay={(!loopItemsError && Array.isArray(loopItems)) ? (
                                                                <div className="px-2 py-1 rounded-md bg-secondary text-muted-foreground text-[11px] font-medium shadow-md">
                                                                    {loopItems.length} items
                                                                </div>
                                                            ) : undefined}
                                                        />
                                                        {loopItemsError && (
                                                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-destructive/10 text-destructive text-xs max-h-32 overflow-y-auto overflow-x-hidden">
                                                                Error: {loopItemsError}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Pagination
                                            <HelpTooltip text="Configure pagination if the API returns data in pages. Only set this if you're using pagination variables like {'<<offset>>'}, {'<<page>>'}, or {'<<cursor>>'} in your request." />
                                        </Label>
                                        <div className="space-y-2 mt-1">
                                            <Select value={step.apiConfig.pagination?.type || 'none'} onValueChange={(value) => { if (disabled) return; if (value === 'none') { handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, pagination: undefined } })); } else { handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, pagination: { ...(s.apiConfig.pagination || {}), type: value, pageSize: s.apiConfig.pagination?.pageSize || '50', cursorPath: s.apiConfig.pagination?.cursorPath || '', stopCondition: s.apiConfig.pagination?.stopCondition || '(response, pageInfo) => !response.data || response.data.length === 0' } } })); } }}>
                                                <SelectTrigger className="h-9" disabled={disabled}>
                                                    <SelectValue placeholder="No pagination" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">No pagination</SelectItem>
                                                    <SelectItem value="OFFSET_BASED">Offset-based (uses {'<<offset>>'})</SelectItem>
                                                    <SelectItem value="PAGE_BASED">Page-based (uses {'<<page>>'})</SelectItem>
                                                    <SelectItem value="CURSOR_BASED">Cursor-based (uses {'<<cursor>>'})</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {step.apiConfig.pagination && (
                                                <>
                                                    <div className="flex  gap-2">
                                                        <div className="flex-1">
                                                            <Label className="text-xs">Page Size</Label>
                                                            <Input value={step.apiConfig.pagination.pageSize || '50'} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, pagination: { ...(s.apiConfig.pagination || {}), pageSize: e.target.value } } }))} className="text-xs mt-1 focus:ring-0 focus:ring-offset-0" placeholder="50" disabled={disabled} />
                                                        </div>
                                                        {step.apiConfig.pagination.type === 'CURSOR_BASED' && (
                                                            <div className="flex-1">
                                                                <Label className="text-xs">Cursor Path</Label>
                                                                <Input value={step.apiConfig.pagination.cursorPath || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, pagination: { ...(s.apiConfig.pagination || {}), cursorPath: e.target.value } } }))} className="text-xs mt-1 focus:ring-0 focus:ring-offset-0" placeholder="e.g., response.nextCursor" disabled={disabled} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs flex items-center gap-1">
                                                            Stop Condition (JavaScript)
                                                            <HelpTooltip text="JavaScript function that returns true when pagination should stop. Receives (response, pageInfo) where pageInfo has: page, offset, cursor, total fetched." />
                                                        </Label>
                                                        <div className="mt-1">
                                                            <JavaScriptCodeEditor
                                                                value={step.apiConfig.pagination.stopCondition || '(response, pageInfo) => !response.data || response.data.length === 0'}
                                                                onChange={(val) => handleImmediateEdit((s) => ({
                                                                    ...s,
                                                                    apiConfig: {
                                                                        ...s.apiConfig,
                                                                        pagination: { ...(s.apiConfig.pagination || {}), stopCondition: val }
                                                                    }
                                                                }))}
                                                                readOnly={disabled}
                                                                minHeight="150px"
                                                                maxHeight="250px"
                                                                resizable={true}
                                                                isTransformEditor={false}
                                                                autoFormatOnMount={true}
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                        <div>
                                            <Label className="text-xs flex items-center gap-1">
                                                # of max requests
                                                <HelpTooltip text="Maximum number of requests sent per step to prevent infinite loops. Default is 1000." />
                                            </Label>
                                            <Input type="number" value={step.loopMaxIters || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, loopMaxIters: parseInt(e.target.value) || undefined }))} className="text-xs mt-1 w-32" placeholder="1000" disabled={disabled} />
                                        </div>
                    </div>
                </CardContent>
            </Card>
            {!isLast && (<div className="my-2 text-muted-foreground"><ArrowDown className="h-4 w-4" /></div>)}
        </div>
    );
}

