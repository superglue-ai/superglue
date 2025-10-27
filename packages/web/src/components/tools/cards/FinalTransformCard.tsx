import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import JsonSchemaEditor from '@/src/components/utils/JsonSchemaEditor';
import { downloadJson } from '@/src/lib/download-utils';
import { ensureSourceDataArrowFunction, isEmptyData, truncateForDisplay, truncateLines } from '@/src/lib/general-utils';
import { inferJsonSchema } from '@superglue/shared';
import { Code2, Download, FileJson, Package, Play, Settings } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { JavaScriptCodeEditor } from '../editors/JavaScriptCodeEditor';
import { JsonCodeEditor } from '../editors/JsonCodeEditor';
import { CopyButton } from '../shared/CopyButton';

const MAX_DISPLAY_LINES = 3000;
const LARGE_JSON_THRESHOLD = 100 * 1024;

export const FinalTransformMiniStepCard = React.memo(({ transform, responseSchema, onTransformChange, onResponseSchemaChange, readOnly, onExecuteTransform, isExecutingTransform, canExecute, transformResult, stepInputs, hasTransformCompleted }: { transform?: string; responseSchema?: string; onTransformChange?: (value: string) => void; onResponseSchemaChange?: (value: string) => void; readOnly?: boolean; onExecuteTransform?: (schema: string, transform: string) => void; isExecutingTransform?: boolean; canExecute?: boolean; transformResult?: any; stepInputs?: any; hasTransformCompleted?: boolean; }) => {
    const [activeTab, setActiveTab] = useState('transform');
    const [localTransform, setLocalTransform] = useState(transform || '');
    const [localSchema, setLocalSchema] = useState(responseSchema || '');
    const [inputViewMode, setInputViewMode] = useState<'preview' | 'schema'>('preview');
    const [outputViewMode, setOutputViewMode] = useState<'preview' | 'schema'>('preview');
    const [schemaInitialized, setSchemaInitialized] = useState(false);
    useEffect(() => { setLocalTransform(transform || ''); }, [transform]);
    useEffect(() => { if (!schemaInitialized) { setLocalSchema(responseSchema || ''); setSchemaInitialized(true); } }, [responseSchema, schemaInitialized]);
    useEffect(() => { const handleTabChange = () => { if (onTransformChange && localTransform !== transform) onTransformChange(localTransform); if (onResponseSchemaChange && localSchema !== responseSchema) onResponseSchemaChange(localSchema); }; handleTabChange(); }, [activeTab]);

    useEffect(() => {
        if (hasTransformCompleted) {
            setActiveTab('output');
        }
    }, [hasTransformCompleted]);

    const stepInputsJson = useMemo(() => {
        if (activeTab !== 'inputs') return { json: '', bytes: 0 };
        if (stepInputs === undefined) return { json: '', bytes: 0 };
        const json = JSON.stringify(stepInputs, null, 2);
        return { json, bytes: new Blob([json]).size };
    }, [stepInputs, activeTab]);

    const transformResultJson = useMemo(() => {
        if (activeTab !== 'output') return { json: '', bytes: 0 };
        if (transformResult === undefined) return { json: '', bytes: 0 };
        const json = JSON.stringify(transformResult, null, 2);
        return { json, bytes: new Blob([json]).size };
    }, [transformResult, activeTab]);

    const inputDisplayData = useMemo(() => {
        if (activeTab !== 'inputs') return { string: '', truncated: false };
        if (inputViewMode === 'schema') {
            const schemaObj = inferJsonSchema(stepInputs || {});
            return { string: truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES), truncated: false };
        } else {
            const displayData = truncateForDisplay(stepInputs);
            return { string: displayData.value, truncated: displayData.truncated };
        }
    }, [stepInputs, activeTab, inputViewMode]);

    const outputDisplayData = useMemo(() => {
        if (activeTab !== 'output') return { string: '', truncated: false };
        if (transformResult === undefined) return { string: '', truncated: false };
        if (outputViewMode === 'schema') {
            const schemaObj = inferJsonSchema(transformResult || {});
            return { string: truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES), truncated: false };
        } else {
            const displayData = truncateForDisplay(transformResult);
            return { string: displayData.value, truncated: displayData.truncated };
        }
    }, [transformResult, activeTab, outputViewMode]);

    const handleTransformChange = (value: string) => { setLocalTransform(value); };
    const handleSchemaChange = (value: string | null) => {
        if (value === null || value === '') {
            setLocalSchema('');
            if (onResponseSchemaChange) onResponseSchemaChange('');
        } else {
            setLocalSchema(value);
            if (onResponseSchemaChange) onResponseSchemaChange(value);
        }
    };
    const ensureValidTransform = (code: string): string => ensureSourceDataArrowFunction(code);
    const handleExecuteTransform = () => {
        const validTransform = ensureValidTransform(localTransform);
        if (onTransformChange) onTransformChange(localTransform);
        if (onResponseSchemaChange) onResponseSchemaChange(localSchema);
        if (onExecuteTransform) onExecuteTransform(localSchema, validTransform);
    };
    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50">
            <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">Tool Result</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {!readOnly && onExecuteTransform && (
                            <>
                                <span title={!canExecute ? "Execute all steps first" : isExecutingTransform ? "Transform is executing..." : "Test final transform"}>
                                    <Button
                                        variant="ghost"
                                        onClick={handleExecuteTransform}
                                        disabled={!canExecute || isExecutingTransform}
                                        className="h-8 px-3 gap-2"
                                    >
                                        {isExecutingTransform ? (
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        ) : (
                                            <Play className="h-3 w-3" />
                                        )}
                                        <span className="font-medium text-[13px]">Run Transform Code</span>
                                    </Button>
                                </span>
                                <HelpTooltip text="Executes the final transform script with step results as input. If a result schema is enabled, the output will be validated against it." />
                            </>
                        )}
                    </div>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="h-9 p-1 rounded-md mb-3">
                        <TabsTrigger value="inputs" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                            <FileJson className="h-4 w-4" /> Step Inputs
                        </TabsTrigger>
                        <TabsTrigger value="transform" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                            <Code2 className="h-4 w-4" /> Transform Code
                        </TabsTrigger>
                        <TabsTrigger value="schema" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                            <Settings className="h-4 w-4" /> Result Schema
                        </TabsTrigger>
                        {hasTransformCompleted && (
                            <TabsTrigger value="output" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm" style={{ backgroundColor: '#FFA500', color: '#000' }}>
                                <Package className="h-4 w-4" /> Tool Result
                            </TabsTrigger>
                        )}
                    </TabsList>
                    <TabsContent value="inputs" className="mt-2">
                        <>
                            <JsonCodeEditor value={inputDisplayData.string} readOnly={true} minHeight="150px" maxHeight="250px" resizable={true} overlay={<div className="flex items-center gap-2"><Tabs value={inputViewMode} onValueChange={(v) => setInputViewMode(v as 'preview' | 'schema')} className="w-auto"><TabsList className="h-6 rounded-md"><TabsTrigger value="preview" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Preview</TabsTrigger><TabsTrigger value="schema" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Schema</TabsTrigger></TabsList></Tabs><span className="text-[10px] text-muted-foreground">{stepInputsJson.bytes.toLocaleString()} bytes</span><CopyButton text={inputDisplayData.string} /><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => downloadJson(stepInputs, 'transform_step_inputs.json')} title="Download transform inputs as JSON"><Download className="h-3 w-3" /></Button></div>} />
                            {inputDisplayData.truncated && inputViewMode === 'preview' && (<div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">Preview truncated for display performance</div>)}
                        </>
                    </TabsContent>
                    <TabsContent value="transform" className="mt-2">
                        <JavaScriptCodeEditor value={localTransform} onChange={handleTransformChange} readOnly={readOnly} minHeight="150px" maxHeight="250px" resizable={true} isTransformEditor={true} />
                    </TabsContent>
                    <TabsContent value="schema" className="mt-2">
                        <div className="space-y-3">
                            <JsonSchemaEditor value={localSchema || ''} onChange={handleSchemaChange} isOptional={true} showModeToggle={true} />
                        </div>
                    </TabsContent>
                    {hasTransformCompleted && (
                        <TabsContent value="output" className="mt-2">
                            <>
                                {transformResult === undefined ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg">
                                        <Package className="h-8 w-8 mb-2 opacity-50" />
                                        <p className="text-sm">No result yet</p>
                                        <p className="text-xs mt-1">Run the tool or test the transform to see results</p>
                                    </div>
                                ) : (
                                    <>
                                        <JsonCodeEditor value={outputDisplayData.string} readOnly minHeight="150px" maxHeight="250px" resizable={true} overlay={<div className="flex items-center gap-2"><Tabs value={outputViewMode} onValueChange={(v) => setOutputViewMode(v as 'preview' | 'schema')} className="w-auto"><TabsList className="h-6 rounded-md"><TabsTrigger value="preview" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Preview</TabsTrigger><TabsTrigger value="schema" className="h-5 px-2 text-[11px] rounded-md data-[state=active]:rounded-md">Schema</TabsTrigger></TabsList></Tabs><span className="text-[10px] text-muted-foreground">{transformResultJson.bytes.toLocaleString()} bytes</span><CopyButton text={outputDisplayData.string} /><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => downloadJson(transformResult, 'tool_result.json')} title="Download tool result as JSON"><Download className="h-3 w-3" /></Button></div>} />
                                        {isEmptyData(transformResultJson.json) && (<div className="mt-2 text-xs text-amber-700 dark:text-amber-300">⚠ No data returned. Is this expected?</div>)}
                                        {outputDisplayData.truncated && outputViewMode === 'preview' && (<div className="mt-2 text-xs text-amber-600 dark:text-amber-300">Preview truncated for display performance. Use copy button to get full data.</div>)}
                                    </>
                                )}
                            </>
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </Card>
    );
});

