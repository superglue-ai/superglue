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
import { Bug, ChevronDown, FileBraces, FileInput, FileOutput, Play, RotateCw, Route, Square, Trash2, Wand2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useToolConfig, useExecution } from '../context';
import { useDataSelector } from '../hooks/use-data-selector';
import { type CategorizedSources } from '../templates/tiptap/TemplateContext';
import { StepConfigTab } from './tabs/StepConfigTab';
import { StepInputTab } from './tabs/StepInputTab';
import { StepResultTab } from './tabs/StepResultTab';

interface SpotlightStepCardProps {
    step: any;
    stepIndex: number;
    categorizedSources?: CategorizedSources;
    onEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onRemove?: (stepId: string) => void;
    onExecuteStep?: () => Promise<void>;
    onExecuteStepWithLimit?: (limit: number) => Promise<void>;
    onOpenFixStepDialog?: () => void;
    onAbort?: () => void;
    isExecuting?: boolean;
    showOutputSignal?: number;
    onConfigEditingChange?: (editing: boolean) => void;
    onDataSelectorChange?: (itemCount: number | null, isInitial: boolean) => void;
    isFirstStep?: boolean;
    isPayloadValid?: boolean;
}

export const SpotlightStepCard = React.memo(({
    step,
    stepIndex,
    categorizedSources,
    onEdit,
    onRemove,
    onExecuteStep,
    onExecuteStepWithLimit,
    onOpenFixStepDialog,
    onAbort,
    isExecuting,
    showOutputSignal,
    onConfigEditingChange,
    onDataSelectorChange,
    isFirstStep = false,
    isPayloadValid = true,
}: SpotlightStepCardProps) => {
    // === CONSUME FROM CONTEXTS ===
    const { integrations } = useToolConfig();
    const {
        isExecutingAny,
        getStepResult,
        isStepFailed,
        canExecuteStep,
        getEvolvingPayload,
    } = useExecution();
    
    const evolvingPayload = getEvolvingPayload(step.id);
    const isGlobalExecuting = isExecutingAny;
    const stepResult = getStepResult(step.id);
    const stepFailed = isStepFailed(step.id);
    const canExecute = canExecuteStep(stepIndex);
    
    const { dataSelectorOutput, dataSelectorError } = useDataSelector({
        stepId: step.id,
        loopSelector: step.loopSelector,
        onDataSelectorChange,
    });
    
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [showInvalidPayloadDialog, setShowInvalidPayloadDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingAction, setPendingAction] = useState<'execute' | null>(null);
    const prevShowOutputSignalRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (showOutputSignal && showOutputSignal !== prevShowOutputSignalRef.current && stepResult != null) {
            setActivePanel('output');
        }
        prevShowOutputSignalRef.current = showOutputSignal;
    }, [showOutputSignal, stepResult]);

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
                        {onExecuteStep && (
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
                        {onOpenFixStepDialog && (
                            <span title={!canExecute ? "Execute previous steps first" : isExecuting ? "Step is executing..." : "Fix this step with AI"}>
                                <div className={`relative flex rounded-md border border-input bg-background ${stepFailed ? 'border-destructive/50' : ''}`}>
                                    <Button
                                        variant="ghost"
                                        onClick={onOpenFixStepDialog}
                                        disabled={!canExecute || isExecuting || isGlobalExecuting}
                                        className={`h-8 px-3 gap-2 border-0 ${stepFailed ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive animate-pulse' : ''}`}
                                    >
                                        <Wand2 className="h-3 w-3" />
                                        <span className="font-medium text-[13px]">Fix Step</span>
                                    </Button>
                                </div>
                            </span>
                        )}
                        {onRemove && (
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
                                onEdit={onEdit}
                                isActive={true}
                            />
                        )}
                        {activePanel === 'config' && (
                            <StepConfigTab
                                step={step}
                                stepIndex={stepIndex}
                                evolvingPayload={evolvingPayload}
                                dataSelectorOutput={dataSelectorOutput}
                                categorizedSources={categorizedSources}
                                onEdit={onEdit}
                                onEditingChange={onConfigEditingChange}
                                onOpenFixStepDialog={onOpenFixStepDialog}
                            />
                        )}
                        {activePanel === 'output' && (
                            <StepResultTab
                                step={step}
                                stepIndex={stepIndex}
                                isExecuting={isExecuting}
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

