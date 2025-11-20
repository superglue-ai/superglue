import { useConfig } from '@/src/app/config-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { useToast } from '@/src/hooks/use-toast';
import { splitUrl } from '@/src/lib/client-utils';
import { composeUrl, getIntegrationIcon as getIntegrationIconName, getSimpleIcon } from '@/src/lib/general-utils';
import { Integration } from "@superglue/client";
import { ArrowDown, Check, Copy, Globe, OctagonAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { JavaScriptCodeEditor } from '../editors/JavaScriptCodeEditor';
import { JsonCodeEditor } from '../editors/JsonCodeEditor';
import { Badge } from "../ui/badge";
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { HelpTooltip } from '../utils/HelpTooltip';
import { IntegrationSelector } from './shared/IntegrationSelector';

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
    loopItems?: any;
}

export function ToolStepConfigurator({ step, isLast, onEdit, onRemove, integrations: propIntegrations, onCreateIntegration, onEditingChange, disabled = false, stepInput, loopItems }: ToolStepConfiguratorProps) {
    const [headersText, setHeadersText] = useState('');
    const [queryParamsText, setQueryParamsText] = useState('');
    const [instructionCopied, setInstructionCopied] = useState(false);

    const config = useConfig();
    const { toast } = useToast();

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

    const handleImmediateEdit = (updater: (s: any) => any) => {
        if (disabled) return;
        const updated = updater(step);
        if (onEditingChange) onEditingChange(true);
        onEdit(step.id, updated, true);
        if (onEditingChange) setTimeout(() => onEditingChange(false), 100);
    };

    const handleIntegrationChange = (value: string, selectedIntegration?: Integration) => {
        if (disabled) return;
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

    const linkedIntegration = step.integrationId && propIntegrations
        ? propIntegrations.find(integration => integration.id === step.integrationId)
        : undefined;

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
                        {(step.modify === true) && (
                            <Badge variant="outline" className="flex items-center gap-1 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/30 text-amber-800 dark:text-amber-400 flex-shrink-0">
                                <OctagonAlert className="h-3 w-3 text-amber-800 dark:text-amber-400" aria-label="Modifies data" />
                                <span className="text-xs font-normal">Step modifies data on system</span>
                            </Badge>
                        )}
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
                                            </div>
                                        </div>
                                        
                                        <div className="text-xs mt-1 p-3 rounded-md border bg-muted/30 min-h-[5rem] whitespace-pre-wrap">
                                            {step.apiConfig.instruction || (
                                                <span className="text-muted-foreground italic">Describe what this step should do...</span>
                                            )}
                                        </div>
                                        
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label className="text-xs flex items-center gap-1">
                                                Integration
                                                <HelpTooltip text="Select an integration to link this step to. This will pre-fill the API configuration with the integration's base URL and credentials." />
                                            </Label>
                                            <IntegrationSelector
                                                value={step.integrationId || ''}
                                                onValueChange={handleIntegrationChange}
                                                disabled={disabled}
                                                triggerClassName="h-9 mt-1"
                                                showCreateNew={!!onCreateIntegration}
                                                onCreateNew={onCreateIntegration}
                                                integrations={propIntegrations}
                                            />
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
                                            showValidation={true}
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
                                            showValidation={true}
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
                    </div>
                </CardContent>
            </Card>
            {!isLast && (<div className="my-2 text-muted-foreground"><ArrowDown className="h-4 w-4" /></div>)}
        </div>
    );
}

