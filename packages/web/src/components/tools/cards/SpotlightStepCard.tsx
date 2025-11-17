import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/src/components/ui/alert-dialog';
import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { downloadJson } from '@/src/lib/download-utils';
import { ensureSourceDataArrowFunction, formatJavaScriptCode, isEmptyData, truncateForDisplay } from '@/src/lib/general-utils';
import { Integration } from '@superglue/client';
import { ChevronDown, Download, FileBraces, FileInput, FileOutput, Loader2, Play, Route, Trash2, Wand2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { JavaScriptCodeEditor } from '../../editors/JavaScriptCodeEditor';
import { JsonCodeEditor } from '../../editors/JsonCodeEditor';
import { Label } from '../../ui/label';
import { ToolStepConfigurator } from '../ToolStepConfigurator';
import { useDataProcessor } from '../hooks/use-data-processor';
import { CopyButton } from '../shared/CopyButton';

export const SpotlightStepCard = React.memo(({
    step,
    stepIndex,
    evolvingPayload,
    stepResult,
    onEdit,
    onRemove,
    onExecuteStep,
    onFixStep,
    canExecute,
    isExecuting,
    isFixingStep,
    isGlobalExecuting,
    currentExecutingStepIndex,
    integrations,
    readOnly,
    failedSteps = [],
    showOutputSignal,
    onConfigEditingChange,
    isFirstStep = false,
    isPayloadValid = true,
}: {
    step: any;
    stepIndex: number;
    evolvingPayload: any;
    stepResult?: any;
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onRemove?: (stepId: string) => void;
    onExecuteStep?: (stepOverride?: any) => Promise<void>;
    onFixStep?: () => Promise<void>;
    canExecute?: boolean;
    isExecuting?: boolean;
    isFixingStep?: boolean;
    isGlobalExecuting?: boolean;
    currentExecutingStepIndex?: number;
    integrations?: Integration[];
    readOnly?: boolean;
    failedSteps?: string[];
    stepResultsMap?: Record<string, any>;
    showOutputSignal?: number;
    onConfigEditingChange?: (editing: boolean) => void;
    isFirstStep?: boolean;
    isPayloadValid?: boolean;
}) => {
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [inputViewMode, setInputViewMode] = useState<'preview' | 'schema'>('preview');
    const [outputViewMode, setOutputViewMode] = useState<'preview' | 'schema'>('preview');
    const [showInvalidPayloadDialog, setShowInvalidPayloadDialog] = useState(false);
    const [pendingStepOverride, setPendingStepOverride] = useState<any>(undefined);
    const [didFormatLoopSelector, setDidFormatLoopSelector] = useState(false);
    
    const DATA_SELECTOR_DEBOUNCE_MS = 400;
    const [loopItems, setLoopItems] = useState<any | null>(null);
    const [loopItemsError, setLoopItemsError] = useState<string | null>(null);
    const [isLoopItemsEvaluating, setIsLoopItemsEvaluating] = useState<boolean>(false);
    const lastEvalTimerRef = useRef<number | null>(null);

    const inputProcessor = useDataProcessor(
        evolvingPayload,
        activePanel === 'input'
    );

    const outputProcessor = useDataProcessor(
        stepResult,
        activePanel === 'output'
    );

    const loopItemsDisplayValue = useMemo(() => {
        if (loopItemsError) return '{}';
        const displayData = truncateForDisplay(loopItems);
        return displayData.value;
    }, [loopItems, loopItemsError]);

    const loopItemsCopyValue = useMemo(() => {
        return JSON.stringify(loopItems, null, 2);
    }, [loopItems]);

    const handleInputViewModeChange = (mode: 'preview' | 'schema') => {
        setInputViewMode(mode);
        if (mode === 'schema') {
            inputProcessor.computeSchema();
        }
    };

    const handleOutputViewModeChange = (mode: 'preview' | 'schema') => {
        setOutputViewMode(mode);
        if (mode === 'schema') {
            outputProcessor.computeSchema();
        }
    };

    useEffect(() => {
        if (showOutputSignal) {
            setActivePanel('output');
        }
    }, [showOutputSignal]);

    // Re-trigger schema computation when data changes and we're viewing schema
    useEffect(() => {
        if (activePanel === 'input' && inputViewMode === 'schema' && evolvingPayload) {
            inputProcessor.computeSchema();
        }
    }, [evolvingPayload, inputViewMode, activePanel, inputProcessor]);

    useEffect(() => {
        if (activePanel === 'output' && outputViewMode === 'schema' && stepResult) {
            outputProcessor.computeSchema();
        }
    }, [stepResult, outputViewMode, activePanel, outputProcessor]);

    useEffect(() => {
        if (!didFormatLoopSelector && step.loopSelector) {
            formatJavaScriptCode(step.loopSelector).then(formatted => {
                if (formatted !== step.loopSelector && onEdit) {
                    const updated = { ...step, loopSelector: formatted } as any;
                    onEdit(step.id, updated, false);
                }
                setDidFormatLoopSelector(true);
            });
        }
    }, [step.loopSelector, didFormatLoopSelector, step, onEdit]);

    useEffect(() => {
        if (activePanel !== 'input') return;

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
                const out = fn(evolvingPayload || {});
                // Normalize the result - if it's a function, that's likely an error (user returned a function reference)
                if (typeof out === 'function') {
                    throw new Error('Data selector returned a function. Did you forget to call it?');
                }
                // Normalize undefined to null for consistency
                const normalizedOut = out === undefined ? null : out;
                setLoopItems(normalizedOut);
                setLoopItemsError(null);
            } catch (err: any) {
                setLoopItems(null);
                let errorMessage = 'Error evaluating loop selector';
                if (err) {
                    if (err instanceof Error) {
                        errorMessage = err.message || errorMessage;
                    } else if (typeof err === 'string') {
                        errorMessage = err;
                    } else if (err?.message && typeof err.message === 'string') {
                        errorMessage = err.message;
                    } else {
                        errorMessage = String(err);
                    }
                }
                setLoopItemsError(errorMessage);
            } finally {
                setIsLoopItemsEvaluating(false);
            }
        }, DATA_SELECTOR_DEBOUNCE_MS);
        lastEvalTimerRef.current = t as unknown as number;
        return () => { 
            if (lastEvalTimerRef.current) { 
                window.clearTimeout(lastEvalTimerRef.current); 
                lastEvalTimerRef.current = null; 
            } 
        };
    }, [step.executionMode, step.loopSelector, step.loopMaxIters, evolvingPayload, activePanel]);

    const handleRunStepClick = () => {
        if (isFirstStep && !isPayloadValid) {
            setPendingStepOverride(undefined);
            setShowInvalidPayloadDialog(true);
        } else if (onExecuteStep) {
            onExecuteStep();
        }
    };

    const handleRunFirstClick = async () => {
        const modifiedStep = { ...step, loopMaxIters: 1 };
        if (isFirstStep && !isPayloadValid) {
            setPendingStepOverride(modifiedStep);
            setShowInvalidPayloadDialog(true);
        } else if (onExecuteStep) {
            await onExecuteStep(modifiedStep);
        }
    };

    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50 overflow-hidden">
            <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">
                            {step.id || `Step ${stepIndex + 1}`}
                        </h3>
                        {step.name && step.name !== step.id && (
                            <span className="text-sm text-muted-foreground">({step.name})</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!readOnly && onExecuteStep && (
                            <div className="flex items-center">
                                <span title={!canExecute ? "Execute previous steps first" : isExecuting ? "Step is executing..." : "Run this single step"}>
                                    <Button
                                        variant="ghost"
                                        onClick={handleRunStepClick}
                                        disabled={!canExecute || isExecuting || isFixingStep}
                                        className={`h-8 px-3 gap-2 ${Array.isArray(loopItems) && loopItems.length > 0 ? 'rounded-r-none border-r border-border/50' : ''}`}
                                    >
                                        {isExecuting ? (
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        ) : (
                                            <Play className="h-3 w-3" />
                                        )}
                                        <span className="font-medium text-[13px]">Run Step</span>
                                    </Button>
                                </span>
                                {Array.isArray(loopItems) && loopItems.length > 1 && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                disabled={!canExecute || isExecuting || isFixingStep}
                                                className="h-8 px-1 rounded-l-none"
                                            >
                                                <ChevronDown className="h-3 w-3" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={handleRunFirstClick}>
                                                Run with first item
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        )}
                        {!readOnly && onFixStep && (
                            <>
                                <span title={!canExecute ? "Execute previous steps first" : isFixingStep ? "Step is self-healing..." : "Run and fix this step with AI"}>
                                    <Button
                                        variant="ghost"
                                        onClick={onFixStep}
                                        disabled={!canExecute || isExecuting || isFixingStep}
                                        className="h-8 px-3 gap-2"
                                    >
                                        {isFixingStep ? (
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        ) : (
                                            <Wand2 className="h-3 w-3" />
                                        )}
                                        <span className="font-medium text-[13px]">Fix Step</span>
                                    </Button>
                                </span>
                            </>
                        )}
                        {!readOnly && onRemove && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onRemove(step.id)}
                                className="h-8 w-8"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
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

                    <div className="mt-1">
                        {activePanel === 'input' && (
                            <div>
                                {(() => {
                                    // Show "run previous step" if we can't execute this step yet
                                    const cannotExecuteYet = stepIndex > 0 && !canExecute;
                                    if (cannotExecuteYet) {
                                        return (
                                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                                                <div className="text-xs mb-1">No input yet</div>
                                                <p className="text-[10px]">Run previous step to see inputs</p>
                                            </div>
                                        );
                                    }

                                    const inputData = {
                                        displayString: inputViewMode === 'schema'
                                            ? inputProcessor.schema?.displayString || ''
                                            : inputProcessor.preview?.displayString || '',
                                        truncated: inputViewMode === 'schema'
                                            ? inputProcessor.schema?.truncated || false
                                            : inputProcessor.preview?.truncated || false,
                                    };

                                    return (
                                        <>
                                            <p className="text-xs text-muted-foreground mb-2">
                                                Step data selector extracts step data from the aggregated step input and exposes it as sourceData.currentItem.
                                            </p>
                                            <div className="flex gap-3">
                                                <div className="flex-1">
                                                    <Label className="text-xs flex items-center gap-1 mb-1">
                                                        Aggregated Step Input
                                                        <HelpTooltip text="This is an object combined from the tool payload and the previous step results." />
                                                    </Label>
                                                    <JsonCodeEditor
                                                        value={inputData.displayString}
                                                        readOnly={true}
                                                        minHeight="580px"
                                                        maxHeight="740px"
                                                        resizable={true}
                                                        overlay={
                                                            <div className="flex items-center gap-1">
                                                                {(inputProcessor.isComputingPreview || inputProcessor.isComputingSchema) && (
                                                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                                )}
                                                                <Tabs value={inputViewMode} onValueChange={(v) => handleInputViewModeChange(v as 'preview' | 'schema')} className="w-auto">
                                                                    <TabsList className="h-6 p-0.5 rounded-md">
                                                                        <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                                                        <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                                                    </TabsList>
                                                                </Tabs>
                                                                <CopyButton text={inputData.displayString} />
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={() => downloadJson(evolvingPayload, `step_${step.id}_input.json`)}
                                                                    title="Download step input as JSON"
                                                                >
                                                                    <Download className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        }
                                                    />
                                                    {inputData.truncated && inputViewMode === 'preview' && (
                                                        <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
                                                            Preview truncated for display performance
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex-1 flex flex-col gap-3">
                                                    <div className="flex-1">
                                                        <Label className="text-xs flex items-center gap-1 mb-1">
                                                            Step Data Selector (JavaScript)
                                                            <HelpTooltip text="JavaScript arrow function that receives the aggregated step input as sourceData. It should return the part of the data this step needs. If it returns an object, the step runs once. If it returns an array, the step runs once for each item and sourceData.currentItem is set for every iteration." />
                                                        </Label>
                                                        <JavaScriptCodeEditor
                                                            value={step.loopSelector || '(sourceData) => { }'}
                                                            onChange={(val) => {
                                                                if (onEdit && !readOnly) {
                                                                    onEdit(step.id, { ...step, loopSelector: val }, true);
                                                                }
                                                            }}
                                                            readOnly={readOnly}
                                                            minHeight="220px"
                                                            maxHeight="350px"
                                                            resizable={true}
                                                            isTransformEditor={false}
                                                            autoFormatOnMount={false}
                                                        />
                                                    </div>

                                                    <div className="flex-1">
                                                        <Label className="text-xs flex items-center gap-1 mb-1">
                                                            Step Data
                                                            <HelpTooltip text="Preview of the step data. Evaluates the step data selector against the aggregated step input." />
                                                            {isLoopItemsEvaluating && (
                                                                <div className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/70 border-t-transparent" />
                                                            )}
                                                        </Label>
                                                        <div className="relative">
                                                            <JsonCodeEditor
                                                                value={loopItemsDisplayValue}
                                                                readOnly={true}
                                                                minHeight="220px"
                                                                maxHeight="350px"
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
                                                                bottomRightOverlay={(!loopItemsError && loopItems) ?  ((Array.isArray(loopItems)) ? (
                                                                    <div className="px-2 py-1 rounded-md bg-secondary text-muted-foreground text-[11px] font-medium shadow-md">
                                                                        Step config will run {loopItems.length} times. Loop items can be accessed in config as sourceData.currentItem.
                                                                    </div>
                                                                ) : <div className="px-2 py-1 rounded-md bg-secondary text-muted-foreground text-[11px] font-medium shadow-md">
                                                                Step data is available in config as sourceData.currentItem.
                                                            </div>) : undefined}
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
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {activePanel === 'config' && (
                            <div className="mt-1">
                                <ToolStepConfigurator
                                    step={step}
                                    isLast={true}
                                    onEdit={onEdit}
                                    onRemove={() => { }}
                                    integrations={integrations}
                                    onEditingChange={onConfigEditingChange}
                                    stepInput={evolvingPayload}
                                />
                            </div>
                        )}

                        {activePanel === 'output' && (
                            <div>
                                {(() => {
                                    const stepFailed = failedSteps?.includes(step.id);
                                    const errorResult = stepFailed && (!stepResult || typeof stepResult === 'string');

                                    const isPending = !stepFailed && stepResult === undefined;

                                    const isActivelyRunning = !!(isExecuting || (isGlobalExecuting && currentExecutingStepIndex === stepIndex));

                                    let outputString = '';
                                    let isTruncated = false;
                                    
                                    if (!isPending) {
                                        if (errorResult) {
                                            if (stepResult) {
                                                if (typeof stepResult === 'string') {
                                                    outputString = stepResult.length > 50000 ?
                                                        stepResult.substring(0, 50000) + '\n... [Error message truncated]' :
                                                        stepResult;
                                                } else {
                                                    outputString = outputProcessor.preview?.displayString || '';
                                                    isTruncated = outputProcessor.preview?.truncated || false;
                                                }
                                            } else {
                                                outputString = '{\n  "error": "Step execution failed"\n}';
                                            }
                                        } else {
                                            outputString = outputViewMode === 'schema'
                                                ? outputProcessor.schema?.displayString || ''
                                                : outputProcessor.preview?.displayString || '';
                                            isTruncated = outputViewMode === 'schema'
                                                ? outputProcessor.schema?.truncated || false
                                                : outputProcessor.preview?.truncated || false;
                                        }
                                    }
                                    const showEmptyWarning = !stepFailed && !isPending && !errorResult && outputViewMode === 'preview' && isEmptyData(outputString || '');
                                    return (
                                        <>
                                            {stepFailed && (
                                                <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                                                    <p className="text-xs text-destructive">Step execution failed</p>
                                                </div>
                                            )}
                                            {isPending ? (
                                                isActivelyRunning ? (
                                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                                            <span className="text-xs">Currently running...</span>
                                                        </div>
                                                        <p className="text-[10px]">Step results will be shown shortly</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                                                        <div className="text-xs mb-1">No result yet</div>
                                                        <p className="text-[10px]">Run this step to see results</p>
                                                    </div>
                                                )
                                            ) : (
                                                <>
                                                    <JsonCodeEditor
                                                        value={outputString}
                                                        readOnly={true}
                                                        minHeight="300px"
                                                        maxHeight="600px"
                                                        resizable={true}
                                                        overlay={
                                                            <div className="flex items-center gap-1">
                                                                {!errorResult && (outputProcessor.isComputingPreview || outputProcessor.isComputingSchema) && (
                                                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                                )}
                                                                {!errorResult && (
                                                                    <Tabs value={outputViewMode} onValueChange={(v) => handleOutputViewModeChange(v as 'preview' | 'schema')} className="w-auto">
                                                                        <TabsList className="h-6 p-0.5 rounded-md">
                                                                            <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                                                            <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                                                        </TabsList>
                                                                    </Tabs>
                                                                )}
                                                                <CopyButton text={outputString} />
                                                                {!errorResult && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-6 w-6"
                                                                        onClick={() => downloadJson(stepResult, `step_${step.id}_result.json`)}
                                                                        title="Download step result as JSON"
                                                                    >
                                                                        <Download className="h-3 w-3" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        }
                                                    />
                                                    {showEmptyWarning && (
                                                        <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 px-2">
                                                            ⚠ No data returned. Is this expected?
                                                        </div>
                                                    )}
                                                    {isTruncated && outputViewMode === 'preview' && (
                                                        <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-300 px-2">
                                                            Preview truncated for display performance
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                    </div>
                </div>
            </div>

            <AlertDialog open={showInvalidPayloadDialog} onOpenChange={setShowInvalidPayloadDialog}>
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
                            if (onExecuteStep) {
                                onExecuteStep(pendingStepOverride);
                            }
                            setPendingStepOverride(undefined);
                        }}>
                            Run Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
});

