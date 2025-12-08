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
import { Integration, assertValidArrowFunction, executeWithVMHelpers } from '@superglue/shared';
import { Bug, ChevronDown, FileBraces, FileInput, FileOutput, Play, RotateCw, Route, Square, Trash2, Wand2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { type CategorizedSources } from '../templates/tiptap/TemplateContext';
import { StepInputTab } from './tabs/StepInputTab';
import { StepConfigTab } from './tabs/StepConfigTab';
import { StepResultTab } from './tabs/StepResultTab';

const dataSelectorOutputCache = new Map<string, { output: any; error: string | null }>();
let lastSeenDataSelectorVersion: number | undefined = undefined;

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
    onAbort,
    canExecute,
    isExecuting,
    isGlobalExecuting,
    currentExecutingStepIndex,
    integrations,
    readOnly,
    failedSteps = [],
    abortedSteps = [],
    showOutputSignal,
    onConfigEditingChange,
    onDataSelectorChange,
    isFirstStep = false,
    isPayloadValid = true,
    sourceDataVersion,
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
    onAbort?: () => void;
    canExecute?: boolean;
    isExecuting?: boolean;
    isGlobalExecuting?: boolean;
    currentExecutingStepIndex?: number;
    integrations?: Integration[];
    readOnly?: boolean;
    failedSteps?: string[];
    abortedSteps?: string[];
    stepResultsMap?: Record<string, any>;
    showOutputSignal?: number;
    onConfigEditingChange?: (editing: boolean) => void;
    onDataSelectorChange?: (itemCount: number | null, isInitial: boolean) => void;
    isFirstStep?: boolean;
    isPayloadValid?: boolean;
    sourceDataVersion?: number;
}) => {
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [showInvalidPayloadDialog, setShowInvalidPayloadDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingAction, setPendingAction] = useState<'execute' | null>(null);
    
    const DATA_SELECTOR_DEBOUNCE_MS = 400;
    
    if (sourceDataVersion !== lastSeenDataSelectorVersion) {
        dataSelectorOutputCache.clear();
        lastSeenDataSelectorVersion = sourceDataVersion;
    }
    
    const dataSelectorCacheKey = `${step.id}:${sourceDataVersion}:${step.loopSelector}`;
    const cachedOutput = dataSelectorOutputCache.get(dataSelectorCacheKey);
    
    const [dataSelectorOutput, setDataSelectorOutput] = useState<any | null>(() => cachedOutput?.output ?? null);
    const [dataSelectorError, setDataSelectorError] = useState<string | null>(() => cachedOutput?.error ?? null);
    const lastEvalTimerRef = useRef<number | null>(null);
    const prevShowOutputSignalRef = useRef(showOutputSignal);
    const hasReceivedComputedValueRef = useRef(false);

    useEffect(() => {
        hasReceivedComputedValueRef.current = false;
        const currentCacheKey = `${step.id}:${sourceDataVersion}:${step.loopSelector}`;
        const cached = dataSelectorOutputCache.get(currentCacheKey);
        if (cached) {
            setDataSelectorOutput(cached.output);
            setDataSelectorError(cached.error);
        } else {
            setDataSelectorOutput(null);
            setDataSelectorError(null);
        }
    }, [step.id]);

    useEffect(() => {
        if (showOutputSignal && showOutputSignal !== prevShowOutputSignalRef.current && stepResult != null) {
            setActivePanel('output');
        }
        prevShowOutputSignalRef.current = showOutputSignal;
    }, [showOutputSignal, stepResult]);

    useEffect(() => {
        if (lastEvalTimerRef.current) {
            window.clearTimeout(lastEvalTimerRef.current);
            lastEvalTimerRef.current = null;
        }
        setDataSelectorError(null);
        
        const currentCacheKey = `${step.id}:${sourceDataVersion}:${step.loopSelector}`;
        
        const t = window.setTimeout(() => {
            try {
                const sel = step?.loopSelector;
                assertValidArrowFunction(sel);
                const out = executeWithVMHelpers(sel, evolvingPayload || {});
                
                if (typeof out === 'function') {
                    throw new Error('Data selector returned a function. Did you forget to call it?');
                }
                const normalizedOut = out === undefined ? null : out;
                dataSelectorOutputCache.set(currentCacheKey, { output: normalizedOut, error: null });
                setDataSelectorOutput(normalizedOut);
                setDataSelectorError(null);
            } catch (err: any) {
                setDataSelectorOutput(null);
                let errorMessage = 'Error evaluating data selector';
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
                dataSelectorOutputCache.set(currentCacheKey, { output: null, error: errorMessage });
                setDataSelectorError(errorMessage);
            }
        }, DATA_SELECTOR_DEBOUNCE_MS);
        lastEvalTimerRef.current = t as unknown as number;
        return () => { 
            if (lastEvalTimerRef.current) { 
                window.clearTimeout(lastEvalTimerRef.current); 
                lastEvalTimerRef.current = null; 
            } 
        };
    }, [step.id, step.executionMode, step.loopSelector, evolvingPayload]);

    useEffect(() => {
        const hasValidOutput = !dataSelectorError && dataSelectorOutput != null;
        const isInitialComputation = !hasReceivedComputedValueRef.current;
        
        if (hasValidOutput) {
            hasReceivedComputedValueRef.current = true;
        }
        
        const itemCount = (hasValidOutput && Array.isArray(dataSelectorOutput)) ? dataSelectorOutput.length : null;
        onDataSelectorChange?.(itemCount, isInitialComputation);
    }, [dataSelectorOutput, dataSelectorError, onDataSelectorChange]);

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
                                evolvingPayload={evolvingPayload}
                                canExecute={canExecute}
                                readOnly={readOnly}
                                onEdit={onEdit}
                                isActive={true}
                                sourceDataVersion={sourceDataVersion}
                            />
                        )}
                        {activePanel === 'config' && (
                            <StepConfigTab
                                step={step}
                                evolvingPayload={evolvingPayload}
                                dataSelectorOutput={dataSelectorOutput}
                                categorizedSources={categorizedSources}
                                canExecute={canExecute}
                                integrations={integrations}
                                onEdit={onEdit}
                                onEditingChange={onConfigEditingChange}
                                onOpenFixStepDialog={onOpenFixStepDialog}
                                sourceDataVersion={sourceDataVersion}
                            />
                        )}
                        {activePanel === 'output' && (
                            <StepResultTab
                                step={step}
                                stepIndex={stepIndex}
                                stepResult={stepResult}
                                failedSteps={failedSteps}
                                abortedSteps={abortedSteps}
                                isExecuting={isExecuting}
                                isGlobalExecuting={isGlobalExecuting}
                                currentExecutingStepIndex={currentExecutingStepIndex}
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

