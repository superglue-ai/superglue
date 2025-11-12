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
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { downloadJson } from '@/src/lib/download-utils';
import { isEmptyData } from '@/src/lib/general-utils';
import { Integration } from '@superglue/client';
import { Download, FileBraces, FileInput, FileOutput, FilePlay, Loader2, Play, Route, Trash2, Wand2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { JsonCodeEditor } from '../../editors/JsonCodeEditor';
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
    onExecuteStep?: () => Promise<void>;
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

    const inputProcessor = useDataProcessor(
        evolvingPayload,
        activePanel === 'input'
    );

    const outputProcessor = useDataProcessor(
        stepResult,
        activePanel === 'output'
    );

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

    const handleRunStepClick = () => {
        if (isFirstStep && !isPayloadValid) {
            setShowInvalidPayloadDialog(true);
        } else if (onExecuteStep) {
            onExecuteStep();
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
                            <>
                                <span title={!canExecute ? "Execute previous steps first" : isExecuting ? "Step is executing..." : "Run this single step"}>
                                    <Button
                                        variant="ghost"
                                        onClick={handleRunStepClick}
                                        disabled={!canExecute || isExecuting || isFixingStep}
                                        className="h-8 px-3 gap-2"
                                    >
                                        {isExecuting ? (
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        ) : (
                                            <Play className="h-3 w-3" />
                                        )}
                                        <span className="font-medium text-[13px]">Run Step</span>
                                    </Button>
                                </span>
                            </>
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
                                            <JsonCodeEditor
                                                value={inputData.displayString}
                                                readOnly={true}
                                                minHeight="300px"
                                                maxHeight="600px"
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
                                onExecuteStep();
                            }
                        }}>
                            Run Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
});

