import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { splitUrl } from '@/src/lib/client-utils';
import { composeUrl } from '@/src/lib/general-utils';
import { buildCategorizedSources, buildCategorizedVariables, buildPaginationData, deriveCurrentItem } from '@/src/lib/templating-utils';
import { Integration, flattenAndNamespaceCredentials } from '@superglue/shared';
import { ArrowDown, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { JavaScriptCodeEditor } from '../editors/JavaScriptCodeEditor';
import { TemplateAwareJsonEditor } from '../editors/TemplateAwareJsonEditor';
import { TemplateAwareTextEditor } from '../editors/TemplateAwareTextEditor';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { HelpTooltip } from '../utils/HelpTooltip';
import { CopyButton } from './shared/CopyButton';
import { IntegrationSelector } from './shared/IntegrationSelector';
import { type CategorizedSources, type CategorizedVariables } from './templates/tiptap/TemplateContext';

interface ToolStepConfiguratorProps {
    step: any;
    isLast: boolean;
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onRemove: (stepId: string) => void;
    integrations?: Integration[];
    onCreateIntegration?: () => void;
    onEditingChange?: (editing: boolean) => void;
    disabled?: boolean;
    stepInput?: any;
    dataSelectorOutput?: any;
    categorizedSources?: CategorizedSources;
    onOpenFixStepDialog?: () => void;
    canExecute?: boolean;
    sourceDataVersion?: number;
}


export function ToolStepConfigurator({ step, isLast, onEdit, onRemove, integrations: propIntegrations, onCreateIntegration, onEditingChange, disabled = false, stepInput, dataSelectorOutput, categorizedSources, onOpenFixStepDialog, canExecute = true, sourceDataVersion }: ToolStepConfiguratorProps) {
    const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
    const [paginationOpen, setPaginationOpen] = useState(false);
    const [headersText, setHeadersText] = useState('');
    const [queryParamsText, setQueryParamsText] = useState('');

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
        if (disabled || !onEdit) return;
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

    const credentialsMap = useMemo(() => 
        flattenAndNamespaceCredentials(linkedIntegration ? [linkedIntegration] : []),
        [linkedIntegration]
    );

    const currentItemObj = useMemo(() => deriveCurrentItem(dataSelectorOutput), [dataSelectorOutput]);
    const paginationConfig = step.apiConfig?.pagination;
    const paginationData = useMemo(() => buildPaginationData(paginationConfig), [paginationConfig]);

    const templateStepData = useMemo<Record<string, unknown>>(() => {
        const baseData = (stepInput && typeof stepInput === 'object') ? stepInput as Record<string, unknown> : {};
        return { ...credentialsMap, ...baseData, ...(currentItemObj ? { currentItem: currentItemObj } : {}), ...paginationData };
    }, [stepInput, credentialsMap, currentItemObj, paginationData]);

    const categorizedVariables = useMemo<CategorizedVariables>(
        () => buildCategorizedVariables(Object.keys(credentialsMap), categorizedSources),
        [credentialsMap, categorizedSources]
    );

    const completeCategorizedSources = useMemo<CategorizedSources>(
        () => buildCategorizedSources(categorizedSources, currentItemObj, paginationData),
        [categorizedSources, currentItemObj, paginationData]
    );

    return (
        <div className="flex flex-col items-center">
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
                                                    disabled={disabled}
                                                    triggerClassName="h-9 border-0 bg-transparent shadow-none"
                                                    showCreateNew={!!onCreateIntegration}
                                                    onCreateNew={onCreateIntegration}
                                                    integrations={propIntegrations}
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
                                                    <Select value={step.apiConfig.method} onValueChange={(value) => { if (disabled) return; handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, method: value } })); }}>
                                                        <SelectTrigger className="h-9 w-28 border-0 bg-transparent shadow-none" disabled={disabled}>
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
                                                    stepData={templateStepData}
                                                    dataSelectorOutput={dataSelectorOutput}
                                                    canExecute={canExecute}
                                                    categorizedVariables={categorizedVariables}
                                                    categorizedSources={completeCategorizedSources}
                                                    className="flex-1" 
                                                    placeholder="https://api.example.com/endpoint" 
                                                    disabled={disabled} 
                                                    sourceDataVersion={sourceDataVersion}
                                                    stepId={step.id}
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
                                                if (disabled) return;
                                                setHeadersText(val || '');
                                                handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, headers: val || '' } }));
                                            }}
                                            stepData={templateStepData}
                                            dataSelectorOutput={dataSelectorOutput}
                                            canExecute={canExecute}
                                            categorizedVariables={categorizedVariables}
                                            categorizedSources={completeCategorizedSources}
                                            readOnly={disabled}
                                            minHeight="75px"
                                            maxHeight="300px"
                                            placeholder="{}"
                                            showValidation={true}
                                            sourceDataVersion={sourceDataVersion}
                                            stepId={step.id}
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
                                                if (disabled) return;
                                                setQueryParamsText(val || '');
                                                handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, queryParams: val || '' } }));
                                            }}
                                            stepData={templateStepData}
                                            dataSelectorOutput={dataSelectorOutput}
                                            canExecute={canExecute}
                                            categorizedVariables={categorizedVariables}
                                            categorizedSources={completeCategorizedSources}
                                            readOnly={disabled}
                                            minHeight="75px"
                                            maxHeight="300px"
                                            placeholder="{}"
                                            showValidation={true}
                                            sourceDataVersion={sourceDataVersion}
                                            stepId={step.id}
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
                                                stepData={templateStepData}
                                                dataSelectorOutput={dataSelectorOutput}
                                                canExecute={canExecute}
                                                categorizedVariables={categorizedVariables}
                                                categorizedSources={completeCategorizedSources}
                                                readOnly={disabled}
                                                minHeight="75px"
                                                maxHeight="300px"
                                                placeholder=""
                                                sourceDataVersion={sourceDataVersion}
                                                stepId={step.id}
                                            />
                                        </div>
                                    )}
                                    <div>
<div
    onClick={() => !disabled && setPaginationOpen(!paginationOpen)}
    className="w-full flex items-center justify-between text-xs font-medium text-left p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            !disabled && setPaginationOpen(!paginationOpen);
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
                onValueChange={(value) => {
                    if (disabled) return;
                    if (value === 'none') {
                        handleImmediateEdit((s) => ({
                            ...s,
                            apiConfig: {
                                ...s.apiConfig,
                                pagination: undefined,
                            },
                        }));
                    } else {
                        handleImmediateEdit((s) => ({
                            ...s,
                            apiConfig: {
                                ...s.apiConfig,
                                pagination: {
                                    ...(s.apiConfig.pagination || {}),
                                    type: value,
                                    pageSize: s.apiConfig.pagination?.pageSize || '50',
                                    cursorPath: s.apiConfig.pagination?.cursorPath || '',
                                    stopCondition: s.apiConfig.pagination?.stopCondition || '(response, pageInfo) => !response.data || response.data.length === 0'
                                },
                            },
                        }));
                    }
                }}
            >
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
                                            </div>
                                            {step.apiConfig.pagination && (
            <div className="mt-2 gap-2 pl-2">
                <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <Label className="text-xs">Page Size</Label>
                                                            <div className="rounded-lg border shadow-sm bg-muted/30 mt-1">
                                                                <Input value={step.apiConfig.pagination.pageSize || '50'} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, pagination: { ...(s.apiConfig.pagination || {}), pageSize: e.target.value } } }))} className="text-xs border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0" placeholder="50" disabled={disabled} />
                                                            </div>
                                                        </div>
                                                        {step.apiConfig.pagination.type === 'CURSOR_BASED' && (
                                                            <div className="flex-1">
                                                                <Label className="text-xs">Cursor Path</Label>
                                                                <div className="rounded-lg border shadow-sm bg-muted/30 mt-1">
                                                                    <Input value={step.apiConfig.pagination.cursorPath || ''} onChange={(e) => handleImmediateEdit((s) => ({ ...s, apiConfig: { ...s.apiConfig, pagination: { ...(s.apiConfig.pagination || {}), cursorPath: e.target.value } } }))} className="text-xs border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0" placeholder="e.g., response.nextCursor" disabled={disabled} />
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
                                                                value={step.apiConfig.pagination.stopCondition || '(response, pageInfo) => !response.data || response.data.length === 0'}
                                                                onChange={(val) => handleImmediateEdit((s) => ({
                                                                    ...s,
                                                                    apiConfig: {
                                                                        ...s.apiConfig,
                                                                        pagination: { ...(s.apiConfig.pagination || {}), stopCondition: val }
                                                                    }
                                                                }))}
                                                                readOnly={disabled}
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
                                            onClick={() => !disabled && setAdvancedSettingsOpen(!advancedSettingsOpen)}
                                            className="w-full flex items-center justify-between text-xs font-medium text-left p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    !disabled && setAdvancedSettingsOpen(!advancedSettingsOpen);
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
                                                        disabled={disabled}
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
                                                        disabled={disabled}
                                                    />
                                                </div>
                                            </div>
                                    </div>
                    </div>
                </CardContent>
            </Card>
            {!isLast && (<div className="my-2 text-muted-foreground"><ArrowDown className="h-4 w-4" /></div>)}
        </div>
    );
}

