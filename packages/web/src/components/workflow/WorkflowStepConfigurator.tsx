import { useConfig } from '@/src/app/config-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { useToast } from '@/src/hooks/use-toast';
import { cn, getIntegrationIcon as getIntegrationIconName } from '@/src/lib/utils';
import { Integration, SuperglueClient } from "@superglue/client";
import { ArrowDown, Check, Copy, Globe, Pencil, RotateCw, Save, X } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { useEffect, useMemo, useState } from 'react';
import Editor from 'react-simple-code-editor';
import type { SimpleIcon } from 'simple-icons';
import * as simpleIcons from 'simple-icons';
import { Badge } from "../ui/badge";
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { HelpTooltip } from '../utils/HelpTooltip';

interface WorkflowStepConfiguratorProps {
    step: any;
    isLast: boolean;
    onEdit: (stepId: string, updatedStep: any) => void;
    onRemove: (stepId: string) => void;
    integrations?: Integration[];
    onCreateIntegration?: () => void;
}

export function WorkflowStepConfigurator({ step, isLast, onEdit, onRemove, integrations: propIntegrations, onCreateIntegration }: WorkflowStepConfiguratorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedStep, setEditedStep] = useState({ ...step });
    const [showJson, setShowJson] = useState(false);
    const [localIntegrations, setLocalIntegrations] = useState<Integration[]>([]);
    const [loadingIntegrations, setLoadingIntegrations] = useState(false);
    const [headersText, setHeadersText] = useState('');
    const [queryParamsText, setQueryParamsText] = useState('');
    const [headersError, setHeadersError] = useState(false);
    const [queryParamsError, setQueryParamsError] = useState(false);
    const [copied, setCopied] = useState(false);

    const config = useConfig();
    const { toast } = useToast();

    const client = useMemo(() => new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: config.superglueApiKey,
    }), [config.superglueEndpoint, config.superglueApiKey]);

    const loadIntegrations = async () => {
        if (localIntegrations.length > 0) return;
        try {
            setLoadingIntegrations(true);
            const result = await client.listIntegrations(100, 0);
            setLocalIntegrations(result.items);
        } catch (error: any) {
            console.error("Error loading integrations:", error);
            toast({ title: "Error loading integrations", description: error.message, variant: "destructive" });
        } finally {
            setLoadingIntegrations(false);
        }
    };

    useEffect(() => { if (isEditing) { loadIntegrations(); } }, [isEditing]);

    const integrations = propIntegrations || localIntegrations;

    const getSimpleIcon = (name: string): SimpleIcon | null => {
        if (!name || name === "default") return null;
        const formatted = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        const iconKey = `si${formatted}`;
        try {
            // @ts-ignore
            let icon = simpleIcons[iconKey];
            return icon || null;
        } catch (e) {
            return null;
        }
    };

    const getIntegrationIcon = (integration: Integration) => {
        const iconName = getIntegrationIconName(integration);
        return iconName ? getSimpleIcon(iconName) : null;
    };

    useEffect(() => { if (!isEditing) { setEditedStep({ ...step }); } }, [step, isEditing]);

    useEffect(() => {
        if (isEditing) {
            try {
                const headers = editedStep.apiConfig?.headers;
                const headersJson = headers !== undefined && headers !== null ? JSON.stringify(headers, null, 2) : '{}';
                setHeadersText(headersJson);
                try { JSON.parse(headersJson); setHeadersError(false); } catch { setHeadersError(true); }
            } catch (error) {
                console.warn('Failed to stringify headers:', error);
                setHeadersText('{}');
                setHeadersError(false);
            }
            try {
                const queryParams = editedStep.apiConfig?.queryParams;
                const queryParamsJson = queryParams !== undefined && queryParams !== null ? JSON.stringify(queryParams, null, 2) : '{}';
                setQueryParamsText(queryParamsJson);
                try { JSON.parse(queryParamsJson); setQueryParamsError(false); } catch { setQueryParamsError(true); }
            } catch (error) {
                console.warn('Failed to stringify queryParams:', error);
                setQueryParamsText('{}');
                setQueryParamsError(false);
            }
        }
    }, [isEditing, editedStep.apiConfig?.headers, editedStep.apiConfig?.queryParams]);

    const handleSave = () => {
        if (headersError || queryParamsError) {
            toast({ title: 'Invalid JSON', description: 'Please fix the JSON errors in Headers or Query Parameters before saving.', variant: 'destructive' });
            return;
        }
        const updatedStep = {
            ...step,
            ...editedStep,
            executionMode: editedStep.executionMode,
            loopSelector: editedStep.loopSelector,
            loopMaxIters: editedStep.loopMaxIters,
            apiConfig: { ...step.apiConfig, ...editedStep.apiConfig }
        };
        const originalJson = JSON.stringify(step);
        const updatedJson = JSON.stringify(updatedStep);
        if (originalJson !== updatedJson) { onEdit(step.id, updatedStep); }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditedStep({ ...step });
        try {
            const headers = step.apiConfig?.headers;
            setHeadersText(headers !== undefined && headers !== null ? JSON.stringify(headers, null, 2) : '{}');
        } catch (error) {
            console.warn('Failed to stringify headers on cancel:', error);
            setHeadersText('{}');
        }
        try {
            const queryParams = step.apiConfig?.queryParams;
            setQueryParamsText(queryParams !== undefined && queryParams !== null ? JSON.stringify(queryParams, null, 2) : '{}');
        } catch (error) {
            console.warn('Failed to stringify queryParams on cancel:', error);
            setQueryParamsText('{}');
        }
        setHeadersError(false);
        setQueryParamsError(false);
        setIsEditing(false);
    };

    const [rawJsonText, setRawJsonText] = useState<string>(() => JSON.stringify(editedStep, null, 2));
    useEffect(() => { setRawJsonText(JSON.stringify(editedStep, null, 2)); }, [step.id]);

    const handleRemove = () => { onRemove(step.id); };

    const linkedIntegration = integrations?.find(integration => {
        if ((editedStep.integrationId && integration.id === editedStep.integrationId) || (step.integrationId && integration.id === step.integrationId)) return true;
        return step.apiConfig?.urlHost && integration.urlHost && step.apiConfig.urlHost.includes(integration.urlHost.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, ''));
    });

    useEffect(() => {
        if (linkedIntegration && !editedStep.integrationId) {
            setEditedStep(prev => ({ ...prev, integrationId: linkedIntegration.id }));
        }
    }, [linkedIntegration, editedStep.integrationId, step.integrationId]);

    return (
        <div className="flex flex-col items-center">
            <Card className={cn("w-full", isEditing ? "border-primary" : "bg-muted/50")}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0">
                                {editedStep.executionMode === 'LOOP' && (<RotateCw className="h-4 w-4 text-muted-foreground flex-shrink-0" />)}
                                <span className="font-mono truncate">{step.id}</span>
                                {linkedIntegration && !isEditing && (
                                    <Badge variant="outline" className="text-xs flex-shrink-0">
                                        <div className="text-xs flex items-center gap-1">
                                            {getIntegrationIcon(linkedIntegration) ? (
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill={`#${getIntegrationIcon(linkedIntegration)?.hex}`} className="flex-shrink-0">
                                                    <path d={getIntegrationIcon(linkedIntegration)?.path || ''} />
                                                </svg>
                                            ) : (
                                                <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                            )}
                                            <span className="truncate">{linkedIntegration.id}</span>
                                        </div>
                                    </Badge>
                                )}
                            </CardTitle>
                            {isEditing && (
                                <div className="flex items-center gap-1 ml-2">
                                    <Label className="text-xs text-muted-foreground">Code Mode</Label>
                                    <Switch checked={showJson} onCheckedChange={setShowJson} className="custom-switch" />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="flex gap-1 flex-shrink-0">
                                {isEditing ? (
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleCancel}>
                                            <X className="h-3 w-3 mr-0.5" />
                                            Cancel
                                        </Button>
                                        <Button variant="default" size="sm" className="h-7 px-2 text-xs" onClick={handleSave} disabled={headersError || queryParamsError}>
                                            <Save className="h-3 w-3 mr-0.5" />
                                            Save
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditing(true)} title="Edit step">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    {isEditing ? (
                        <>
                            {showJson ? (
                                <div className="space-y-2">
                                    <Label className="text-xs flex items-center gap-1">Step JSON</Label>
                                    <div className="relative bg-muted/30 rounded-lg border">
                                        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 bg-background/80 hover:bg-background" onClick={() => { navigator.clipboard.writeText(rawJsonText); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="Copy JSON">
                                                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                        <Editor value={rawJsonText} onValueChange={(val) => { setRawJsonText(val); }} highlight={(code) => Prism.highlight(code, Prism.languages.json, 'json')} padding={10} tabSize={2} insertSpaces={true} className="font-mono text-xs min-h[260px]" textareaClassName="outline-none focus:outline-none" style={{ background: 'transparent' }} onBlur={() => { try { const parsed = JSON.parse(rawJsonText); setEditedStep(parsed); } catch { } }} />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Step Instruction
                                            <HelpTooltip text="AI-generated instruction for this step. This describes what the step does and how it should behave." />
                                        </Label>
                                        <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded mt-1">
                                            {editedStep.apiConfig.instruction || <span className="italic">No instruction provided</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label className="text-xs flex items-center gap-1">
                                                Integration
                                                <HelpTooltip text="Select an integration to link this step to. This will pre-fill the API configuration with the integration's base URL and credentials." />
                                            </Label>
                                            <Select value={editedStep.integrationId || step.integrationId} onValueChange={(value) => { if (value === "CREATE_NEW") { onCreateIntegration?.(); } else { const selectedIntegration = integrations?.find(integration => integration.id === value); setEditedStep(prev => ({ ...prev, integrationId: value, apiConfig: { ...prev.apiConfig, urlHost: selectedIntegration?.urlHost || prev.apiConfig.urlHost, urlPath: selectedIntegration?.urlPath || prev.apiConfig.urlPath, headers: selectedIntegration?.credentials ? Object.entries(selectedIntegration.credentials).reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}) : prev.apiConfig.headers } })); } }}>
                                                <SelectTrigger className="h-9 mt-1">
                                                    <SelectValue placeholder="Select integration" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {integrations?.map(integration => (
                                                        <SelectItem key={integration.id} value={integration.id}>
                                                            <div className="flex items-center gap-2 w-full">
                                                                {getIntegrationIcon(integration) ? (
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill={`#${getIntegrationIcon(integration)?.hex}`} className="flex-shrink-0">
                                                                        <path d={getIntegrationIcon(integration)?.path || ''} />
                                                                    </svg>
                                                                ) : (
                                                                    <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                                                )}
                                                                <span className="flex-grow">{integration.id}</span>
                                                                {integration.urlHost && (<span className="text-muted-foreground text-xs ml-auto">({integration.urlHost})</span>)}
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                    {onCreateIntegration && (<SelectItem value="CREATE_NEW" className="text-primary">+ Add New Integration</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1">
                                                <Label className="text-xs">Mode</Label>
                                                <HelpTooltip text="DIRECT: Execute once with input data. LOOP: Execute multiple times iterating over an array from previous steps." />
                                            </div>
                                            <Select value={editedStep.executionMode} onValueChange={(value) => setEditedStep(prev => ({ ...prev, executionMode: value }))}>
                                                <SelectTrigger className="h-9 w-28 mt-1">
                                                    <SelectValue placeholder="Mode" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="DIRECT">DIRECT</SelectItem>
                                                    <SelectItem value="LOOP">LOOP</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            API Config
                                            <HelpTooltip text="Configure the HTTP method, host, and endpoint path for this API call. Use variables like {variable} to reference previous step outputs." />
                                        </Label>
                                        <div className="space-y-2 mt-1">
                                            <div className="flex gap-2">
                                                <Select value={editedStep.apiConfig.method} onValueChange={(value) => setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, method: value } }))}>
                                                    <SelectTrigger className="h-9 flex-1">
                                                        <SelectValue placeholder="Method" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(method => (<SelectItem key={method} value={method}>{method}</SelectItem>))}
                                                    </SelectContent>
                                                </Select>
                                                <Input value={editedStep.apiConfig.urlHost} onChange={(e) => setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, urlHost: e.target.value } }))} className="text-xs flex-1 focus:ring-0 focus:ring-offset-0" placeholder="Host" />
                                                <Input value={editedStep.apiConfig.urlPath} onChange={(e) => setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, urlPath: e.target.value } }))} className="text-xs flex-1 focus:ring-0 focus:ring-offset-0" placeholder="Path" />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Headers (JSON)
                                            <HelpTooltip text="HTTP headers to include with the request. Use JSON format. Common headers include Content-Type, Authorization, etc." />
                                        </Label>
                                        <Textarea value={headersText} onChange={(e) => { const newValue = e.target.value; setHeadersText(newValue); if (!newValue.trim()) { setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, headers: {} } })); setHeadersError(false); return; } try { const headers = JSON.parse(newValue); setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, headers } })); setHeadersError(false); } catch { setHeadersError(true); } }} className="font-mono text-xs h-20 mt-1 focus:ring-0 focus:ring-offset-0" placeholder="{}" />
                                        {headersError && (<div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 bg-red-500/10 dark:bg-red-500/20 py-1.5 px-2.5 rounded-md mt-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg><span>Invalid JSON format</span></div>)}
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Query Parameters (JSON)
                                            <HelpTooltip text='URL query parameters to append to the request. Use JSON format like {"param1": "value1", "param2": "value2"}' />
                                        </Label>
                                        <Textarea value={queryParamsText} onChange={(e) => { const newValue = e.target.value; setQueryParamsText(newValue); if (!newValue.trim()) { setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, queryParams: {} } })); setQueryParamsError(false); return; } try { const queryParams = JSON.parse(newValue); setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, queryParams } })); setQueryParamsError(false); } catch { setQueryParamsError(true); } }} className="font-mono text-xs h-20 mt-1 focus:ring-0 focus:ring-offset-0" placeholder="{}" />
                                        {queryParamsError && (<div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 bg-red-500/10 dark:bg-red-500/20 py-1.5 px-2.5 rounded-md mt-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg><span>Invalid JSON format</span></div>)}
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Body
                                            <HelpTooltip text="Request body content. Can be JSON, form data, or plain text. Use JavaScript expressions to transform data from previous steps." />
                                        </Label>
                                        <Textarea value={editedStep.apiConfig.body || ''} onChange={(e) => setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, body: e.target.value } }))} className="font-mono text-xs h-20 mt-1 focus:ring-0 focus:ring-offset-0" />
                                    </div>
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Pagination
                                            <HelpTooltip text="Configure pagination if the API returns data in pages. Only set this if you're using pagination variables like {'<<offset>>'}, {'<<page>>'}, or {'<<cursor>>'} in your request." />
                                        </Label>
                                        <div className="space-y-2 mt-1">
                                            <Select value={editedStep.apiConfig.pagination?.type || 'none'} onValueChange={(value) => { if (value === 'none') { setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, pagination: undefined } })); } else { setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, pagination: { ...(prev.apiConfig.pagination || {}), type: value, pageSize: prev.apiConfig.pagination?.pageSize || '50', cursorPath: prev.apiConfig.pagination?.cursorPath || '', stopCondition: prev.apiConfig.pagination?.stopCondition || '(response, pageInfo) => !response.data || response.data.length === 0' } } })); } }}>
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
                                            {editedStep.apiConfig.pagination && (
                                                <>
                                                    <div>
                                                        <Label className="text-xs">Page Size</Label>
                                                        <Input value={editedStep.apiConfig.pagination.pageSize || '50'} onChange={(e) => setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, pagination: { ...(prev.apiConfig.pagination || {}), pageSize: e.target.value } } }))} className="text-xs mt-1 focus:ring-0 focus:ring-offset-0" placeholder="50" />
                                                    </div>
                                                    {editedStep.apiConfig.pagination.type === 'CURSOR_BASED' && (
                                                        <div>
                                                            <Label className="text-xs">Cursor Path</Label>
                                                            <Input value={editedStep.apiConfig.pagination.cursorPath || ''} onChange={(e) => setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, pagination: { ...(prev.apiConfig.pagination || {}), cursorPath: e.target.value } } }))} className="text-xs mt-1 focus:ring-0 focus:ring-offset-0" placeholder="e.g., response.nextCursor" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <Label className="text-xs flex items-center gap-1">
                                                            Stop Condition (JavaScript)
                                                            <HelpTooltip text="JavaScript function that returns true when pagination should stop. Receives (response, pageInfo) where pageInfo has: page, offset, cursor, total fetched." />
                                                        </Label>
                                                        <Textarea value={editedStep.apiConfig.pagination.stopCondition || '(response, pageInfo) => !response.data || response.data.length === 0'} onChange={(e) => setEditedStep(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, pagination: { ...(prev.apiConfig.pagination || {}), stopCondition: e.target.value } } }))} className="font-mono text-xs h-16 mt-1" placeholder="(response, pageInfo) => !response.data || response.data.length === 0" />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {editedStep.executionMode === 'LOOP' && (
                                        <>
                                            <div>
                                                <Label className="text-xs flex items-center gap-1">
                                                    Loop Selector (JavaScript)
                                                    <HelpTooltip text="JavaScript arrow function to select an array from previous step outputs. The step will execute once for each item. Example: (sourceData) => sourceData.items" />
                                                </Label>
                                                <Input value={editedStep.loopSelector || ''} onChange={(e) => setEditedStep(prev => ({ ...prev, loopSelector: e.target.value }))} className="text-xs mt-1 focus:ring-0 focus:ring-offset-0" placeholder="e.g., (sourceData) => sourceData.items" />
                                            </div>
                                            <div>
                                                <Label className="text-xs flex items-center gap-1">
                                                    Max Iterations
                                                    <HelpTooltip text="Maximum number of loop iterations to prevent infinite loops. Default is 1000." />
                                                </Label>
                                                <Input type="number" value={editedStep.loopMaxIters || ''} defaultValue={1000} onChange={(e) => setEditedStep(prev => ({ ...prev, loopMaxIters: parseInt(e.target.value) || undefined }))} className="text-xs mt-1 w-32" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div>
                                <div className="font-mono text-xs bg-background/50 p-2 rounded mt-1 overflow-x-auto">
                                    <div>{editedStep.apiConfig.method || 'GET'} {editedStep.apiConfig.urlHost}{editedStep.apiConfig.urlPath}</div>
                                </div>
                            </div>
                            {editedStep.executionMode === 'LOOP' && editedStep.loopSelector && (
                                <div>
                                    <Label className="text-xs text-muted-foreground">Loop Over</Label>
                                    <div className="font-mono text-xs bg-background/50 p-2 rounded mt-1 overflow-x-auto">
                                        {editedStep.loopSelector}
                                        {editedStep.loopMaxIters && ` (max ${editedStep.loopMaxIters} iterations)`}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
            {!isLast && (<div className="my-2 text-muted-foreground"><ArrowDown className="h-4 w-4" /></div>)}
        </div>
    );
}


