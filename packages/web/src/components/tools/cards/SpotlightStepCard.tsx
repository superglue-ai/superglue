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
import { Integration } from '@superglue/shared';
import { assertValidArrowFunction } from '@superglue/shared';
import { Bug, ChevronDown, FileBraces, FileInput, FileOutput, Play, RotateCw, Route, Square, Trash2, Wand2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { type CategorizedSources } from '../templates/tiptap/TemplateContext';
import { StepInputTab } from './tabs/StepInputTab';
import { StepConfigTab } from './tabs/StepConfigTab';
import { StepResultTab } from './tabs/StepResultTab';

const loopItemsCache = new Map<string, { items: any; error: string | null }>();

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
    onLoopInfoChange,
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
    onLoopInfoChange?: (loopCount: number | null) => void;
    isFirstStep?: boolean;
    isPayloadValid?: boolean;
    sourceDataVersion?: number;
}) => {
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [showInvalidPayloadDialog, setShowInvalidPayloadDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingAction, setPendingAction] = useState<'execute' | null>(null);
    
    const DATA_SELECTOR_DEBOUNCE_MS = 400;
    const loopItemsCacheKey = `${step.id}:${sourceDataVersion}:${step.loopSelector}`;
    const cachedLoopItems = loopItemsCache.get(loopItemsCacheKey);
    
    const [loopItems, setLoopItems] = useState<any | null>(() => cachedLoopItems?.items ?? null);
    const [loopItemsError, setLoopItemsError] = useState<string | null>(() => cachedLoopItems?.error ?? null);
    const lastEvalTimerRef = useRef<number | null>(null);
    const prevShowOutputSignalRef = useRef(showOutputSignal);

    useEffect(() => {
        const cached = loopItemsCache.get(loopItemsCacheKey);
        if (cached) {
            setLoopItems(cached.items);
            setLoopItemsError(cached.error);
        }
    }, [loopItemsCacheKey]);

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
        setLoopItemsError(null);
        
        const currentCacheKey = `${step.id}:${sourceDataVersion}:${step.loopSelector}`;
        
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
                loopItemsCache.set(currentCacheKey, { items: normalizedOut, error: null });
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
                loopItemsCache.set(currentCacheKey, { items: null, error: errorMessage });
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
    }, [step.id, step.executionMode, step.loopSelector, evolvingPayload, sourceDataVersion]);

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
                                        <div className={`relative flex rounded-md border border-input bg-background ${loopItems && Array.isArray(loopItems) && loopItems.length > 1 && onExecuteStepWithLimit ? '' : ''}`}>
                                            <Button
                                                variant="ghost"
                                                onClick={handleRunStepClick}
                                                disabled={!canExecute || isExecuting || isGlobalExecuting}
                                                className={`h-8 pl-3 gap-2 border-0 ${loopItems && Array.isArray(loopItems) && loopItems.length > 1 && onExecuteStepWithLimit ? 'pr-2 rounded-r-none' : 'pr-3'}`}
                                            >
                                                {loopItems && Array.isArray(loopItems) && loopItems.length > 1 ? (
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
                                loopItems={loopItems}
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

