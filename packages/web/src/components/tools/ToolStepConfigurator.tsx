import { useConfig } from '@/src/app/config-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { useToast } from '@/src/hooks/use-toast';
import { downloadJson } from '@/src/lib/download-utils';
import { ensureSourceDataArrowFunction, formatJavaScriptCode, getIntegrationIcon as getIntegrationIconName, getSimpleIcon, isEmptyData, MAX_DISPLAY_LINES, truncateForDisplay, truncateLines } from '@/src/lib/utils';
import { Integration, SuperglueClient } from "@superglue/client";
import { inferJsonSchema } from '@superglue/shared';
import { ArrowDown, Copy, Download, Globe, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from "../ui/badge";
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { HelpTooltip } from '../utils/HelpTooltip';
import { CopyButton, JavaScriptCodeEditor, JsonCodeEditor } from './ToolMiniStepCards';

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
            setRawJsonText(JSON.stringify(step, null, 2));
        } catch { }
        try {
            const headers = step.apiConfig?.headers;
            const headersJson = headers !== undefined && headers !== null ? JSON.stringify(headers, null, 2) : '{}';
            setHeadersText(headersJson);
            setHeadersError(false);
        } catch {
            setHeadersText('{}');
            setHeadersError(false);
        }
        try {
            const queryParams = step.apiConfig?.queryParams;
            const queryParamsJson = queryParams !== undefined && queryParams !== null ? JSON.stringify(queryParams, null, 2) : '{}';
            setQueryParamsText(queryParamsJson);
            setQueryParamsError(false);
        } catch {
            setQueryParamsText('{}');
            setQueryParamsError(false);
        }
    }, [step.id]);

    // Also reflect parent updates to headers/queryParams even if id doesn't change (e.g., self-heal)
    useEffect(() => {
        try {
            const headers = step.apiConfig?.headers;
            const headersJson = headers !== undefined && headers !== null ? JSON.stringify(headers, null, 2) : '{}';
            if (headersJson !== headersText) {
                setHeadersText(headersJson);
                setHeadersError(false);
            }
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.apiConfig?.headers]);

    useEffect(() => {
        try {
            const queryParams = step.apiConfig?.queryParams;
            const queryParamsJson = queryParams !== undefined && queryParams !== null ? JSON.stringify(queryParams, null, 2) : '{}';
            if (queryParamsJson !== queryParamsText) {
                setQueryParamsText(queryParamsJson);
                setQueryParamsError(false);
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
        try { setRawJsonText(JSON.stringify(updated, null, 2)); } catch { }
        if (onEditingChange) onEditingChange(true);
        onEdit(step.id, updated, true);
        if (onEditingChange) setTimeout(() => onEditingChange(false), 100);
    };

    const [rawJsonText, setRawJsonText] = useState<string>(() => {
        try { return JSON.stringify(step, null, 2); } catch { return '{}'; }
    });

    const isCodeEditingRef = useRef<boolean>(false);
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                if (!isCodeEditingRef.current) return; // only react to actual code editor edits
                const parsed = JSON.parse(rawJsonText);
                if (onEditingChange) onEditingChange(true);
                onEdit(step.id, parsed, true);
                try {
                    const headers = parsed.apiConfig?.headers;
                    setHeadersText(headers !== undefined && headers !== null ? JSON.stringify(headers, null, 2) : '{}');
                    setHeadersError(false);
                } catch { }
                try {
                    const queryParams = parsed.apiConfig?.queryParams;
                    setQueryParamsText(queryParams !== undefined && queryParams !== null ? JSON.stringify(queryParams, null, 2) : '{}');
                    setQueryParamsError(false);
                } catch { }
                if (onEditingChange) setTimeout(() => onEditingChange(false), 100);
            } catch { }
            isCodeEditingRef.current = false;
        }, 300);
        return () => clearTimeout(timer);
    }, [rawJsonText]);

    const handleRemove = () => { onRemove(step.id); };

    const linkedIntegration = integrations?.find(integration => {
        if (step.integrationId && integration.id === step.integrationId) return true;
        return step.apiConfig?.urlHost && integration.urlHost && step.apiConfig.urlHost.includes(integration.urlHost.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, ''));
    });

    // Debug logging
    useEffect(() => {
        console.log('[ToolStepConfigurator] Step:', step.id);
        console.log('[ToolStepConfigurator] Has codeConfig?', !!step.codeConfig, step.codeConfig);
        console.log('[ToolStepConfigurator] Has apiConfig?', !!step.apiConfig, step.apiConfig);
        console.log('[ToolStepConfigurator] Full step:', step);
    }, [step]);

    const LOOP_ITEMS_DEBOUNCE_MS = 400;
    const [loopItemsViewMode, setLoopItemsViewMode] = useState<'preview' | 'schema'>('preview');
    const [loopItems, setLoopItems] = useState<any[] | null>(null);
    const [loopItemsError, setLoopItemsError] = useState<string | null>(null);
    const [isLoopItemsEvaluating, setIsLoopItemsEvaluating] = useState<boolean>(false);
    const lastEvalTimerRef = useRef<number | null>(null);

    // Code config evaluation
    const CODE_CONFIG_DEBOUNCE_MS = 400;
    const [codeConfigResult, setCodeConfigResult] = useState<any | null>(null);
    const [codeConfigError, setCodeConfigError] = useState<string | null>(null);
    const [isCodeConfigEvaluating, setIsCodeConfigEvaluating] = useState<boolean>(false);
    const lastCodeConfigEvalTimerRef = useRef<number | null>(null);

    useEffect(() => {
        if (step.executionMode !== 'LOOP') {
            setLoopItems(null);
            setLoopItemsError(null);
            return;
        }
        if (!stepInput || isEmptyData(stepInput)) {
            setLoopItems(null);
            setLoopItemsError(null);
            return;
        }
        if (lastEvalTimerRef.current) {
            window.clearTimeout(lastEvalTimerRef.current);
            lastEvalTimerRef.current = null;
        }
        setLoopItemsError(null);
        const t = window.setTimeout(() => {
            setIsLoopItemsEvaluating(true);
            try {
                const sel = step?.loopSelector;
                if (!sel || typeof sel !== 'string') {
                    setLoopItems(null);
                    setLoopItemsError('No loop selector configured');
                } else {
                    const raw = ensureSourceDataArrowFunction(sel).trim();
                    const stripped = raw.replace(/;\s*$/, '');
                    const body = `const __selector = (${stripped});\nreturn __selector(sourceData);`;
                    // eslint-disable-next-line no-new-func
                    const fn = new Function('sourceData', body);
                    const out = fn(stepInput || {});
                    if (Array.isArray(out)) {
                        setLoopItems(out);
                        setLoopItemsError(null);
                    } else {
                        setLoopItems(null);
                        setLoopItemsError('Loop selector did not return an array');
                    }
                }
            } catch (err: any) {
                setLoopItems(null);
                setLoopItemsError(err?.message ? String(err.message) : 'Error evaluating loop selector');
            } finally {
                setIsLoopItemsEvaluating(false);
            }
        }, LOOP_ITEMS_DEBOUNCE_MS);
        lastEvalTimerRef.current = t as unknown as number;
        return () => { if (lastEvalTimerRef.current) { window.clearTimeout(lastEvalTimerRef.current); lastEvalTimerRef.current = null; } };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.executionMode, step.loopSelector, step.loopMaxIters, stepInput]);

    // Evaluate code config when it exists
    useEffect(() => {
        console.log('[CodeConfig Eval] Triggered', {
            hasCodeConfig: !!step.codeConfig,
            codeConfigCode: step.codeConfig?.code,
            hasStepInput: !!stepInput,
            isStepInputEmpty: isEmptyData(stepInput),
            linkedIntegration: linkedIntegration?.id,
            stepInput
        });
        
        if (!step.codeConfig) {
            console.log('[CodeConfig Eval] No codeConfig, clearing result');
            setCodeConfigResult(null);
            setCodeConfigError(null);
            return;
        }
        
        if (lastCodeConfigEvalTimerRef.current) {
            window.clearTimeout(lastCodeConfigEvalTimerRef.current);
            lastCodeConfigEvalTimerRef.current = null;
        }
        setCodeConfigError(null);
        const t = window.setTimeout(() => {
            setIsCodeConfigEvaluating(true);
            try {
                const code = step.codeConfig?.code;
                console.log('[CodeConfig Eval] Code to evaluate:', code);
                
                if (!code || typeof code !== 'string') {
                    console.log('[CodeConfig Eval] No valid code string');
                    setCodeConfigResult(null);
                    setCodeConfigError('No code config defined');
                } else {
                    const raw = code.trim();
                    const stripped = raw.replace(/;\s*$/, '');
                    const body = `const __configFn = (${stripped});\nreturn __configFn(context);`;
                    
                    // Build context object - always provide context even if stepInput is empty
                    const context = {
                        inputData: stepInput || {},
                        credentials: linkedIntegration?.credentials || {},
                        paginationState: {}
                    };
                    
                    console.log('[CodeConfig Eval] Context:', context);
                    console.log('[CodeConfig Eval] Function body:', body);
                    
                    // eslint-disable-next-line no-new-func
                    const fn = new Function('context', body);
                    const result = fn(context);
                    
                    console.log('[CodeConfig Eval] Result:', result);
                    
                    if (result && typeof result === 'object') {
                        setCodeConfigResult(result);
                        setCodeConfigError(null);
                    } else {
                        console.log('[CodeConfig Eval] Result is not a valid object');
                        setCodeConfigResult(null);
                        setCodeConfigError('Code config did not return a valid config object');
                    }
                }
            } catch (err: any) {
                console.error('[CodeConfig Eval] Error:', err);
                setCodeConfigResult(null);
                setCodeConfigError(err?.message ? String(err.message) : 'Error evaluating code config');
            } finally {
                setIsCodeConfigEvaluating(false);
            }
        }, CODE_CONFIG_DEBOUNCE_MS);
        lastCodeConfigEvalTimerRef.current = t as unknown as number;
        return () => { if (lastCodeConfigEvalTimerRef.current) { window.clearTimeout(lastCodeConfigEvalTimerRef.current); lastCodeConfigEvalTimerRef.current = null; } };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.codeConfig, stepInput, linkedIntegration]);

    return (
        <div className="flex flex-col items-center">
            <Card className="w-full border-primary/50 opacity-100">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0">
                                {step.executionMode === 'LOOP' && (<RotateCw className="h-4 w-4 text-muted-foreground flex-shrink-0" />)}
                                <span className="font-mono truncate">{step.id}</span>
                                {linkedIntegration && (
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
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div className="space-y-2">
                        <div>
                            <Label className="text-xs flex items-center gap-1">
                                Step Instruction
                                <HelpTooltip text="AI-generated instruction for this step. This describes what the step does and how it should behave." />
                            </Label>
                            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded mt-1">
                                {step.codeConfig?.stepInstruction || step.apiConfig?.instruction || <span className="italic">No instruction provided</span>}
                            </div>
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
                                <Select value={step.executionMode} onValueChange={(value) => { if (disabled) return; handleImmediateEdit((s) => ({ ...s, executionMode: value })); }}>
                                    <SelectTrigger className="h-9 w-28 mt-1" disabled={disabled}>
                                        <SelectValue placeholder="Mode" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DIRECT">DIRECT</SelectItem>
                                        <SelectItem value="LOOP">LOOP</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {step.codeConfig ? (
                            <>
                                <div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                                        <div>
                                            <Label className="text-xs flex items-center gap-1 mb-1">
                                                Configuration Code
                                                <HelpTooltip text="Function that returns { url, method, headers, data, params }. Has access to context.inputData, context.credentials, and context.paginationState." />
                                            </Label>
                                            <JavaScriptCodeEditor
                                                value={step.codeConfig.code || ''}
                                                onChange={(val) => handleImmediateEdit((s) => ({ ...s, codeConfig: { ...s.codeConfig, code: val } }))}
                                                readOnly={disabled}
                                                minHeight="200px"
                                                maxHeight="300px"
                                                resizable={true}
                                                isTransformEditor={false}
                                                autoFormatOnMount={false}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs flex items-center gap-1 mb-1">
                                                Evaluated Config
                                                <HelpTooltip text="Live preview of the axios config object returned by your code when evaluated with the current step input." />
                                                {isCodeConfigEvaluating && (
                                                    <div className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/70 border-t-transparent" />
                                                )}
                                            </Label>
                                            <div className="relative rounded-lg border font-mono shadow-sm bg-muted/30 overflow-hidden h-[calc(300px-0rem)]">
                                                <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                                                    {!codeConfigError && codeConfigResult && (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-6 w-6 bg-background/80 hover:bg-background" 
                                                                    title="Copy options"
                                                                >
                                                                    <Copy className="h-3 w-3" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => {
                                                                    navigator.clipboard.writeText(JSON.stringify(codeConfigResult, null, 2));
                                                                }}>
                                                                    <Copy className="h-3 w-3 mr-2" />
                                                                    Copy as JSON
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => {
                                                                    const curlCmd = (() => {
                                                                        const cfg = codeConfigResult;
                                                                        let url = cfg.url || '';
                                                                        
                                                                        // Add params to URL
                                                                        if (cfg.params && Object.keys(cfg.params).length > 0) {
                                                                            const queryString = new URLSearchParams(cfg.params as Record<string, string>).toString();
                                                                            url += (url.includes('?') ? '&' : '?') + queryString;
                                                                        }
                                                                        
                                                                        let cmd = `curl -X ${cfg.method || 'GET'} "${url}"`;
                                                                        
                                                                        // Add headers
                                                                        if (cfg.headers) {
                                                                            Object.entries(cfg.headers).forEach(([key, value]) => {
                                                                                cmd += ` \\\n  -H "${key}: ${String(value).replace(/"/g, '\\"')}"`;
                                                                            });
                                                                        }
                                                                        
                                                                        // Add data
                                                                        if (cfg.data) {
                                                                            const dataStr = JSON.stringify(cfg.data).replace(/'/g, "'\\''");
                                                                            cmd += ` \\\n  -d '${dataStr}'`;
                                                                        }
                                                                        
                                                                        return cmd;
                                                                    })();
                                                                    navigator.clipboard.writeText(curlCmd);
                                                                }}>
                                                                    <Copy className="h-3 w-3 mr-2" />
                                                                    Copy as curl
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                </div>
                                                <div className="p-3 space-y-3 overflow-auto">
                                                    {codeConfigError ? (
                                                        <div className="text-xs text-red-500">{codeConfigError}</div>
                                                    ) : !codeConfigResult ? (
                                                        <div className="text-xs text-muted-foreground italic">No config generated yet</div>
                                                    ) : (
                                                        <>
                                                            {(codeConfigResult.method || codeConfigResult.url) && (
                                                                <div className="space-y-1">
                                                                    <div className="text-xs font-mono break-all flex items-center gap-2">
                                                                        {codeConfigResult.method && <span className="text-xs px-1 py-1 rounded font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{codeConfigResult.method}</span>}
                                                                        {codeConfigResult.url && <span>{codeConfigResult.url}</span>}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {codeConfigResult.headers && Object.keys(codeConfigResult.headers).length > 0 && (
                                                                <div className="space-y-1">
                                                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Headers</div>
                                                                    <div className="pl-2 space-y-0.5 text-xs">
                                                                        {Object.entries(codeConfigResult.headers).map(([key, value]) => (
                                                                            <div key={key} className="flex gap-2 font-mono">
                                                                                <span className="text-blue-500">{key}:</span>
                                                                                <span className="break-all text-foreground">{String(value)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {codeConfigResult.params && Object.keys(codeConfigResult.params).length > 0 && (
                                                                <div className="space-y-1">
                                                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Params</div>
                                                                    <div className="pl-2 space-y-0.5 text-xs">
                                                                        {Object.entries(codeConfigResult.params).map(([key, value]) => (
                                                                            <div key={key} className="flex gap-2 font-mono">
                                                                                <span className="text-blue-500">{key}:</span>
                                                                                <span className="break-all text-foreground">{String(value)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {codeConfigResult.data && (
                                                                <div className="space-y-1">
                                                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Data</div>
                                                                    <div className="pl-2 bg-background/50 rounded p-2 overflow-auto max-h-40">
                                                                        <pre className="text-xs font-mono">{JSON.stringify(codeConfigResult.data, null, 2)}</pre>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {step.codeConfig.pagination && (
                                    <div>
                                        <Label className="text-xs flex items-center gap-1">
                                            Pagination Handler
                                            <HelpTooltip text="Custom pagination logic handler code." />
                                        </Label>
                                        <div className="mt-1">
                                            <JavaScriptCodeEditor
                                                value={step.codeConfig.pagination.handler || ''}
                                                onChange={(val) => handleImmediateEdit((s) => ({
                                                    ...s,
                                                    codeConfig: {
                                                        ...s.codeConfig,
                                                        pagination: { ...(s.codeConfig.pagination || {}), handler: val }
                                                    }
                                                }))}
                                                readOnly={disabled}
                                                minHeight="150px"
                                                maxHeight="250px"
                                                resizable={true}
                                                isTransformEditor={false}
                                                autoFormatOnMount={false}
                                            />
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div>
                                    <Label className="text-xs flex items-center gap-1">
                                        API Config
                                        <HelpTooltip text="Configure the HTTP method, host, and endpoint path for this API call. Use variables like {variable} to reference previous step outputs." />
                                    </Label>
                                    <div className="space-y-2 mt-1">
                                        <div className="flex gap-2">
                                            <Select value={step.apiConfig?.method || 'GET'} onValueChange={(value) => { if (disabled) return; handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), method: value } })); }}>
                                                <SelectTrigger className="h-9 flex-1" disabled={disabled}>
                                                    <SelectValue placeholder="Method" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(method => (<SelectItem key={method} value={method}>{method}</SelectItem>))}
                                                </SelectContent>
                                            </Select>
                                            <Input value={step.apiConfig?.urlHost || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), urlHost: e.target.value } }))} className="text-xs flex-1 focus:ring-0 focus:ring-offset-0" placeholder="Host" disabled={disabled} />
                                            <Input value={step.apiConfig?.urlPath || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), urlPath: e.target.value } }))} className="text-xs flex-1 focus:ring-0 focus:ring-offset-0" placeholder="Path" disabled={disabled} />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs flex items-center gap-1">
                                        Headers (JSON)
                                        <HelpTooltip text="HTTP headers to include with the request. Use JSON format. Common headers include Content-Type, Authorization, etc." />
                                    </Label>
                                    <Textarea value={headersText} onChange={(e) => { if (disabled) return; const newValue = e.target.value; setHeadersText(newValue); try { const trimmed = newValue.trim(); const headers = trimmed === '' ? {} : JSON.parse(newValue); handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), headers } })); setHeadersError(false); } catch { setHeadersError(true); } }} className="font-mono text-xs h-20 mt-1 focus:ring-0 focus:ring-offset-0" placeholder="{}" disabled={disabled} />
                                    {headersError && (<div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 bg-red-500/10 dark:bg-red-500/20 py-1.5 px-2.5 rounded-md mt-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg><span>Invalid JSON format</span></div>)}
                                </div>
                                <div>
                                    <Label className="text-xs flex items-center gap-1">
                                        Query Parameters (JSON)
                                        <HelpTooltip text='URL query parameters to append to the request. Use JSON format like {"param1": "value1", "param2": "value2"}' />
                                    </Label>
                                    <Textarea value={queryParamsText} onChange={(e) => { if (disabled) return; const newValue = e.target.value; setQueryParamsText(newValue); try { const trimmed = newValue.trim(); const queryParams = trimmed === '' ? {} : JSON.parse(newValue); handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), queryParams } })); setQueryParamsError(false); } catch { setQueryParamsError(true); } }} className="font-mono text-xs h-20 mt-1 focus:ring-0 focus:ring-offset-0" placeholder="{}" disabled={disabled} />
                                    {queryParamsError && (<div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 bg-red-500/10 dark:bg-red-500/20 py-1.5 px-2.5 rounded-md mt-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg><span>Invalid JSON format</span></div>)}
                                </div>
                                <div>
                                    <Label className="text-xs flex items-center gap-1">
                                        Body
                                        <HelpTooltip text="Request body content. Can be JSON, form data, or plain text. Use JavaScript expressions to transform data from previous steps." />
                                    </Label>
                                    <Textarea value={step.apiConfig?.body || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), body: e.target.value } }))} className="font-mono text-xs h-20 mt-1 focus:ring-0 focus:ring-offset-0" disabled={disabled} />
                                </div>
                                <div>
                                    <Label className="text-xs flex items-center gap-1">
                                        Pagination
                                        <HelpTooltip text="Configure pagination if the API returns data in pages. Only set this if you're using pagination variables like {'<<offset>>'}, {'<<page>>'}, or {'<<cursor>>'} in your request." />
                                    </Label>
                                    <div className="space-y-2 mt-1">
                                        <Select value={step.apiConfig?.pagination?.type || 'none'} onValueChange={(value) => { if (disabled) return; if (value === 'none') { handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), pagination: undefined } })); } else { handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), pagination: { ...(s.apiConfig?.pagination || {}), type: value, pageSize: s.apiConfig?.pagination?.pageSize || '50', cursorPath: s.apiConfig?.pagination?.cursorPath || '', stopCondition: s.apiConfig?.pagination?.stopCondition || '(response, pageInfo) => !response.data || response.data.length === 0' } } })); } }}>
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
                                        {step.apiConfig?.pagination && (
                                            <>
                                                <div>
                                                    <Label className="text-xs">Page Size</Label>
                                                    <Input value={step.apiConfig.pagination.pageSize || '50'} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), pagination: { ...(s.apiConfig?.pagination || {}), pageSize: e.target.value } } }))} className="text-xs mt-1 focus:ring-0 focus:ring-offset-0" placeholder="50" disabled={disabled} />
                                                </div>
                                                {step.apiConfig.pagination.type === 'CURSOR_BASED' && (
                                                    <div>
                                                        <Label className="text-xs">Cursor Path</Label>
                                                        <Input value={step.apiConfig.pagination.cursorPath || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...(s.apiConfig || {}), pagination: { ...(s.apiConfig?.pagination || {}), cursorPath: e.target.value } } }))} className="text-xs mt-1 focus:ring-0 focus:ring-offset-0" placeholder="e.g., response.nextCursor" disabled={disabled} />
                                                    </div>
                                                )}
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
                                                                    ...(s.apiConfig || {}),
                                                                    pagination: { ...(s.apiConfig?.pagination || {}), stopCondition: val }
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
                            </>
                        )}
                        {step.executionMode === 'LOOP' && (
                            <>
                                <div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs flex items-center gap-1 mb-1">
                                                Loop Selector (JavaScript)
                                                <HelpTooltip text="JavaScript arrow function selecting an array from step input. The step runs once per item; within each iteration sourceData.currentItem is set to that item." />
                                            </Label>
                                            <JavaScriptCodeEditor
                                                value={step.loopSelector || ''}
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
                                                Loop Items (JSON)
                                                <HelpTooltip text="Evaluates the loop selector against the step input. The resulting array drives LOOP execution (one run per item). During execution, sourceData.currentItem equals the current item." />
                                                {isLoopItemsEvaluating && (
                                                    <div className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/70 border-t-transparent" />
                                                )}
                                            </Label>
                                            {(!stepInput || isEmptyData(stepInput)) ? (
                                                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                                                    <div className="text-xs mb-1">No input yet</div>
                                                    <p className="text-[10px]">Run previous step to see loop items</p>
                                                </div>
                                            ) : (
                                                <JsonCodeEditor
                                                    value={(() => {
                                                        if (loopItemsError) return JSON.stringify({ error: loopItemsError }, null, 2);
                                                        if (loopItemsViewMode === 'schema') {
                                                            const schemaObj = inferJsonSchema(loopItems || []);
                                                            return truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                                                        }
                                                        const displayData = truncateForDisplay(loopItems || []);
                                                        return displayData.value;
                                                    })()}
                                                    readOnly={true}
                                                    minHeight="150px"
                                                    maxHeight="300px"
                                                    resizable={true}
                                                    placeholder="[]"
                                                    overlay={
                                                        <div className="flex items-center gap-2">
                                                            {!loopItemsError && (
                                                                <Tabs value={loopItemsViewMode} onValueChange={(v) => setLoopItemsViewMode(v as 'preview' | 'schema')} className="w-auto">
                                                                    <TabsList className="h-6 p-0.5 rounded-md">
                                                                        <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                                                        <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                                                    </TabsList>
                                                                </Tabs>
                                                            )}
                                                            {!loopItemsError && (
                                                                <CopyButton text={(() => {
                                                                    if (loopItemsViewMode === 'schema') {
                                                                        const schemaObj = inferJsonSchema(loopItems || []);
                                                                        return truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                                                                    }
                                                                    const displayData = truncateForDisplay(loopItems || []);
                                                                    return displayData.value;
                                                                })()} />
                                                            )}
                                                            {!loopItemsError && (
                                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => downloadJson(loopItems || [], `step_${step.id}_loop_items.json`)} title="Download loop items as JSON">
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
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs flex items-center gap-1">
                                        Max Iterations
                                        <HelpTooltip text="Maximum number of loop iterations to prevent infinite loops. Default is 1000." />
                                    </Label>
                                    <Input type="number" value={step.loopMaxIters || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, loopMaxIters: parseInt(e.target.value) || undefined }))} className="text-xs mt-1 w-32" placeholder="1000" disabled={disabled} />
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
            {!isLast && (<div className="my-2 text-muted-foreground"><ArrowDown className="h-4 w-4" /></div>)}
        </div>
    );
}

