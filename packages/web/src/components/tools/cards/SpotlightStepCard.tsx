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
import { isEmptyData } from '@/src/lib/general-utils';
import { Integration } from '@superglue/shared';
import { assertValidArrowFunction } from '@superglue/shared';
import { Bug, ChevronDown, Download, FileBraces, FileInput, FileOutput, Loader2, Play, RotateCw, Route, Trash2, Wand2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { JsonCodeEditor } from '../../editors/JsonCodeEditor';
import { TemplateAwareJsonDisplay } from '../../editors/TemplateAwareJsonDisplay';
import { Label } from '../../ui/label';
import { ToolStepConfigurator } from '../ToolStepConfigurator';
import { useDataProcessor } from '../hooks/use-data-processor';
import { CopyButton } from '../shared/CopyButton';
import { type CategorizedSources } from '../templates/tiptap/TemplateContext';

export const SpotlightStepCard = React.memo(({
    step,
    stepIndex,
    evolvingPayload,
    categorizedSources,
    stepResult,
    onEdit,
    onRemove,
    onExecuteStep,
    onExecuteStepWithLimit,
    onOpenFixStepDialog,
    canExecute,
    isExecuting,
    isGlobalExecuting,
    currentExecutingStepIndex,
    integrations,
    readOnly,
    failedSteps = [],
    showOutputSignal,
    onConfigEditingChange,
    onLoopInfoChange,
    isFirstStep = false,
    isPayloadValid = true,
}: {
    step: any;
    stepIndex: number;
    evolvingPayload: any;
    categorizedSources?: CategorizedSources;
    stepResult?: any;
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onRemove?: (stepId: string) => void;
    onExecuteStep?: () => Promise<void>;
    onExecuteStepWithLimit?: (limit: number) => Promise<void>;
    onOpenFixStepDialog?: () => void;
    canExecute?: boolean;
    isExecuting?: boolean;
    isGlobalExecuting?: boolean;
    currentExecutingStepIndex?: number;
    integrations?: Integration[];
    readOnly?: boolean;
    failedSteps?: string[];
    stepResultsMap?: Record<string, any>;
    showOutputSignal?: number;
    onConfigEditingChange?: (editing: boolean) => void;
    onLoopInfoChange?: (loopCount: number | null) => void;
    isFirstStep?: boolean;
    isPayloadValid?: boolean;
}) => {
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [outputViewMode, setOutputViewMode] = useState<'preview' | 'schema'>('preview');
    const [showInvalidPayloadDialog, setShowInvalidPayloadDialog] = useState(false);
    const [pendingAction, setPendingAction] = useState<'execute' | null>(null);
    
    const DATA_SELECTOR_DEBOUNCE_MS = 400;
    const [loopItems, setLoopItems] = useState<any | null>(null);
    const [loopItemsError, setLoopItemsError] = useState<string | null>(null);
    const lastEvalTimerRef = useRef<number | null>(null);

    const outputProcessor = useDataProcessor(
        stepResult,
        activePanel === 'output'
    );

    const handleOutputViewModeChange = (mode: 'preview' | 'schema') => {
        setOutputViewMode(mode);
        if (mode === 'schema') {
            outputProcessor.computeSchema();
        }
    };

    useEffect(() => {
        // Only switch to output tab if there's actual output data to show
        if (showOutputSignal && stepResult != null) {
            setActivePanel('output');
        }
    }, [showOutputSignal, stepResult]);

    useEffect(() => {
        if (activePanel === 'output' && outputViewMode === 'schema' && stepResult) {
            outputProcessor.computeSchema();
        }
    }, [stepResult, outputViewMode, activePanel, outputProcessor]);

    useEffect(() => {
        if (lastEvalTimerRef.current) {
            window.clearTimeout(lastEvalTimerRef.current);
            lastEvalTimerRef.current = null;
        }
        setLoopItemsError(null);
        const t = window.setTimeout(() => {
            try {
                let sel = step?.loopSelector;
                const raw = assertValidArrowFunction(sel).trim();
                const stripped = raw.replace(/;\s*$/, '');
                const body = `const __selector = (${stripped});\nreturn __selector(sourceData);`;
                // eslint-disable-next-line no-new-func
                const fn = new Function('sourceData', body);
                const out = fn(evolvingPayload || {});
                if (typeof out === 'function') {
                    throw new Error('Data selector returned a function. Did you forget to call it?');
                }
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
            }
        }, DATA_SELECTOR_DEBOUNCE_MS);
        lastEvalTimerRef.current = t as unknown as number;
        return () => { 
            if (lastEvalTimerRef.current) { 
                window.clearTimeout(lastEvalTimerRef.current); 
                lastEvalTimerRef.current = null; 
            } 
        };
    }, [step.executionMode, step.loopSelector, evolvingPayload]);

    useEffect(() => {
        if (!loopItemsError && loopItems && Array.isArray(loopItems)) {
            onLoopInfoChange?.(loopItems.length);
        } else {
            onLoopInfoChange?.(null);
        }
    }, [loopItems, loopItemsError, onLoopInfoChange]);

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
                        {!readOnly && onExecuteStep && (
                            <div className="flex items-center">
                                <span title={!canExecute ? "Execute previous steps first" : isExecuting ? "Step is executing..." : "Run this step"}>
                                    <div className={`relative flex rounded-md border border-input bg-background ${loopItems && Array.isArray(loopItems) && loopItems.length > 1 && onExecuteStepWithLimit ? '' : ''}`}>
                                        <Button
                                            variant="ghost"
                                            onClick={handleRunStepClick}
                                            disabled={!canExecute || isExecuting || isGlobalExecuting}
                                            className={`h-8 pl-3 gap-2 border-0 ${loopItems && Array.isArray(loopItems) && loopItems.length > 1 && onExecuteStepWithLimit ? 'pr-2 rounded-r-none' : 'pr-3'}`}
                                        >
                                            {isExecuting ? (
                                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                            ) : loopItems && Array.isArray(loopItems) && loopItems.length > 1 ? (
                                                <RotateCw className="h-3.5 w-3.5" />
                                            ) : (
                                                <Play className="h-3 w-3" />
                                            )}
                                            <span className="font-medium text-[13px]">Run Step</span>
                                        </Button>
                                        {loopItems && Array.isArray(loopItems) && loopItems.length > 1 && onExecuteStepWithLimit && (
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
                                        {loopItems && Array.isArray(loopItems) && loopItems.length > 1 && (
                                            <span className="absolute -top-2 -left-2 min-w-[16px] h-[16px] px-1 text-[10px] font-bold bg-primary text-primary-foreground rounded flex items-center justify-center">
                                                {loopItems.length >= 1000 ? `${Math.floor(loopItems.length / 1000)}k` : loopItems.length}
                                            </span>
                                        )}
                                    </div>
                                </span>
                            </div>
                        )}
                        {!readOnly && onOpenFixStepDialog && (
                            <span title={!canExecute ? "Execute previous steps first" : isExecuting ? "Step is executing..." : "Fix this step with AI"}>
                                <Button
                                    variant="ghost"
                                    onClick={onOpenFixStepDialog}
                                    disabled={!canExecute || isExecuting || isGlobalExecuting}
                                    className="h-8 px-3 gap-2"
                                >
                                    <Wand2 className="h-3 w-3" />
                                    <span className="font-medium text-[13px]">Fix Step</span>
                                </Button>
                            </span>
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
                                    const cannotExecuteYet = stepIndex > 0 && !canExecute;

                                    if (cannotExecuteYet) {
                                        return (
                                            <div className="flex flex-col items-center justify-center border rounded-md bg-muted/5 text-muted-foreground" style={{ height: '400px' }}>
                                                <div className="text-xs mb-1">No input yet</div>
                                                <p className="text-[10px]">Run previous step to see inputs</p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div>
                                            <Label className="text-xs flex items-center gap-1 mb-1">
                                                Step Input Data
                                                <HelpTooltip text="Aggregated data from the tool payload and previous step results. Edit the currentItem expression to control what data this step receives for each iteration." />
                                            </Label>
                                            <TemplateAwareJsonDisplay
                                                data={evolvingPayload}
                                                currentItemExpression={step.loopSelector || '(sourceData) => sourceData'}
                                                onExpressionChange={(newExpression) => {
                                                    if (onEdit && !readOnly) {
                                                        onEdit(step.id, { ...step, loopSelector: newExpression }, true);
                                                    }
                                                }}
                                                readOnly={readOnly}
                                                canExecute={canExecute}
                                                minHeight="400px"
                                                maxHeight="600px"
                                            />
                                        </div>
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
                                    loopItems={loopItems}
                                    categorizedSources={categorizedSources}
                                    onOpenFixStepDialog={onOpenFixStepDialog}
                                    canExecute={canExecute}
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
                                            {errorResult ? (
                                                <div className="flex flex-col items-start justify-start p-4 border rounded-lg bg-muted/30 border-border">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <X className="h-4 w-4 text-red-500 dark:text-red-400" />
                                                        <p className="text-sm font-semibold text-red-500 dark:text-red-400">Step Error</p>
                                                    </div>
                                                    <pre className="text-xs whitespace-pre-wrap font-mono w-full overflow-x-auto">
                                                    {outputString || 'Step execution failed'}
                                                    </pre>
                                                    <p className="text-xs text-muted-foreground mt-2">
                                                        Use the "Fix Step" button above to automatically repair the step configuration.
                                                    </p>
                                                </div>
                                            ) : isPending ? (
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
                                                                {(outputProcessor.isComputingPreview || outputProcessor.isComputingSchema) && (
                                                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                                )}
                                                                <Tabs value={outputViewMode} onValueChange={(v) => handleOutputViewModeChange(v as 'preview' | 'schema')} className="w-auto">
                                                                    <TabsList className="h-6 p-0.5 rounded-md">
                                                                        <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                                                        <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                                                    </TabsList>
                                                                </Tabs>
                                                                <CopyButton text={outputString} />
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={() => downloadJson(stepResult, `step_${step.id}_result.json`)}
                                                                    title="Download step result as JSON"
                                                                >
                                                                    <Download className="h-3 w-3" />
                                                                </Button>
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
        </Card>
    );
});

