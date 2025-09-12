import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { canExecuteStep } from '@/src/lib/client-utils';
import { type UploadedFileInfo } from '@/src/lib/file-utils';
import { buildEvolvingPayload, cn, isEmptyData, truncateForDisplay, truncateLines } from '@/src/lib/utils';
import { Integration } from "@superglue/client";
import { inferJsonSchema } from '@superglue/shared';
import { ChevronLeft, ChevronRight, Database, FileJson, Package, Play, Settings, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { CopyButton, FinalResultsCard, FinalTransformMiniStepCard, InstructionDisplay, JsonCodeEditor, MiniStepCard, PayloadMiniStepCard } from './WorkflowMiniStepCards';
import { WorkflowStepConfigurator } from './WorkflowStepConfigurator';

interface WorkflowStepGalleryProps {
    steps: any[];
    stepResults?: Record<string, any>;
    finalTransform?: string;
    finalResult?: any;
    responseSchema?: string;
    workflowId?: string;
    instruction?: string;
    onStepsChange?: (steps: any[]) => void;
    onStepEdit?: (stepId: string, updatedStep: any) => void;
    onFinalTransformChange?: (transform: string) => void;
    onResponseSchemaChange?: (schema: string) => void;
    onPayloadChange?: (payload: string) => void;
    onWorkflowIdChange?: (id: string) => void;
    onInstructionEdit?: () => void;
    onExecuteStep?: (stepIndex: number) => Promise<void>;
    onExecuteAllSteps?: () => Promise<void>;
    onExecuteTransform?: (schema: string, transform: string) => Promise<void>;
    completedSteps?: string[];
    failedSteps?: string[];
    integrations?: Integration[];
    isExecuting?: boolean;
    isExecutingStep?: number;
    isExecutingTransform?: boolean;
    currentExecutingStepIndex?: number;
    transformResult?: any;
    readOnly?: boolean;
    payloadText?: string;
    inputSchema?: string | null;
    onInputSchemaChange?: (schema: string | null) => void;
    headerActions?: React.ReactNode;
    navigateToFinalSignal?: number;
    showStepOutputSignal?: number;
    focusStepId?: string | null;
    uploadedFiles?: UploadedFileInfo[];
    onFilesUpload?: (files: File[]) => Promise<void>;
    onFileRemove?: (key: string) => void;
    isProcessingFiles?: boolean;
    totalFileSize?: number;
    filePayloads?: Record<string, any>;
}

const MAX_DISPLAY_LINES = 3000;
const MAX_DISPLAY_SIZE = 1024 * 1024;
const SpotlightStepCard = ({
    step,
    stepIndex,
    evolvingPayload,
    stepResult,
    onEdit,
    onRemove,
    onExecuteStep,
    canExecute,
    isExecuting,
    integrations,
    readOnly,
    failedSteps = [],
    showOutputSignal,
    onConfigEditingChange
}: {
    step: any;
    stepIndex: number;
    evolvingPayload: any;
    stepResult?: any;
    onEdit?: (stepId: string, updatedStep: any) => void;
    onRemove?: (stepId: string) => void;
    onExecuteStep?: () => Promise<void>;
    canExecute?: boolean;
    isExecuting?: boolean;
    integrations?: Integration[];
    readOnly?: boolean;
    failedSteps?: string[];
    stepResultsMap?: Record<string, any>;
    showOutputSignal?: number;
    onConfigEditingChange?: (editing: boolean) => void;
}) => {
    const [activePanel, setActivePanel] = useState<'input' | 'config' | 'output'>('config');
    const [inputViewMode, setInputViewMode] = useState<'preview' | 'schema'>('preview');
    const [outputViewMode, setOutputViewMode] = useState<'preview' | 'schema'>('preview');

    // Switch to output tab when signal changes
    useEffect(() => {
        if (showOutputSignal) {
            setActivePanel('output');
        }
    }, [showOutputSignal]);

    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md bg-accent/10 dark:bg-accent/5 border border-accent/30 dark:border-accent/20">
            <div className="p-3">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
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
                                <Button
                                    size="sm"
                                    onClick={onExecuteStep}
                                    disabled={!canExecute || isExecuting}
                                    title={!canExecute ? "Execute previous steps first" : "Test this step (no self-healing)"}
                                >
                                    {isExecuting ? (
                                        <>
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                                            Running...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-3 w-3 mr-1" />
                                            Run Step
                                        </>
                                    )}
                                </Button>
                                <HelpTooltip text="Executes this step configuration directly without instruction validation or self-healing. Useful for quick testing." />
                            </>
                        )}
                        {!readOnly && onRemove && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onRemove(step.id)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
                                    <FileJson className="h-4 w-4" /> Step Input
                                </TabsTrigger>
                                <TabsTrigger value="config" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                                    <Settings className="h-4 w-4" /> Step Config
                                </TabsTrigger>
                                <TabsTrigger value="output" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                                    <Package className="h-4 w-4" /> Step Output
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {activePanel === 'input' && (
                        <div>
                            {(() => {
                                let inputString = '';
                                let isTruncated = false;
                                if (inputViewMode === 'schema') {
                                    const schemaObj = inferJsonSchema(evolvingPayload || {});
                                    inputString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                                } else {
                                    const displayData = truncateForDisplay(evolvingPayload);
                                    inputString = displayData.value;
                                    isTruncated = displayData.truncated;
                                }
                                return (
                                    <>
                                        <JsonCodeEditor
                                            value={inputString}
                                            readOnly={true}
                                            minHeight="150px"
                                            maxHeight="300px"
                                            resizable={true}
                                            overlay={
                                                <div className="flex items-center gap-1">
                                                    <Tabs value={inputViewMode} onValueChange={(v) => setInputViewMode(v as 'preview' | 'schema')} className="w-auto">
                                                        <TabsList className="h-6 p-0.5 rounded-md">
                                                            <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                                            <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                                        </TabsList>
                                                    </Tabs>
                                                    <CopyButton text={inputString} />
                                                </div>
                                            }
                                        />
                                        {isTruncated && inputViewMode === 'preview' && (
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
                            <WorkflowStepConfigurator
                                step={step}
                                isLast={true}
                                onEdit={onEdit}
                                onRemove={() => { }}
                                integrations={integrations}
                            />
                        </div>
                    )}

                    {activePanel === 'output' && (
                        <div>
                            {(() => {
                                // Check if step has failed and we should show error
                                const stepFailed = failedSteps?.includes(step.id);
                                const errorResult = stepFailed && (!stepResult || typeof stepResult === 'string');

                                // Check if result is pending
                                const isPending = !stepFailed && stepResult === undefined;

                                let outputString = '';
                                let isTruncated = false;
                                if (!isPending) {
                                    if (errorResult) {
                                        // Show error message if step failed
                                        if (stepResult) {
                                            if (typeof stepResult === 'string') {
                                                // Truncate long error strings
                                                outputString = stepResult.length > MAX_DISPLAY_SIZE ?
                                                    stepResult.substring(0, MAX_DISPLAY_SIZE) + '\n... [Error message truncated]' :
                                                    stepResult;
                                            } else {
                                                const displayData = truncateForDisplay(stepResult);
                                                outputString = displayData.value;
                                            }
                                        } else {
                                            outputString = '{\n  "error": "Step execution failed"\n}';
                                        }
                                    } else if (outputViewMode === 'schema') {
                                        const schemaObj = inferJsonSchema(stepResult || {});
                                        outputString = truncateLines(JSON.stringify(schemaObj, null, 2), MAX_DISPLAY_LINES);
                                    } else {
                                        const displayData = truncateForDisplay(stepResult);
                                        outputString = displayData.value;
                                        isTruncated = displayData.truncated;
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
                                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border rounded-md bg-muted/5">
                                                <Database className="h-6 w-6 mb-2 opacity-50" />
                                                <p className="text-xs">No output yet</p>
                                                <p className="text-[10px] mt-1">Test this step to see its output</p>
                                            </div>
                                        ) : (
                                            <>
                                                <JsonCodeEditor
                                                    value={outputString}
                                                    readOnly={true}
                                                    minHeight="150px"
                                                    maxHeight="300px"
                                                    resizable={true}
                                                    overlay={
                                                        <div className="flex items-center gap-1">
                                                            {!errorResult && (
                                                                <Tabs value={outputViewMode} onValueChange={(v) => setOutputViewMode(v as 'preview' | 'schema')} className="w-auto">
                                                                    <TabsList className="h-6 p-0.5 rounded-md">
                                                                        <TabsTrigger value="preview" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Preview</TabsTrigger>
                                                                        <TabsTrigger value="schema" className="h-full px-2 text-[11px] rounded-sm data-[state=active]:rounded-sm">Schema</TabsTrigger>
                                                                    </TabsList>
                                                                </Tabs>
                                                            )}
                                                            <CopyButton text={outputString} />
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
        </Card>
    );
};



export function WorkflowStepGallery({
    steps,
    stepResults = {},
    finalTransform,
    finalResult,
    responseSchema,
    workflowId,
    instruction,
    onStepsChange,
    onStepEdit: originalOnStepEdit,
    onFinalTransformChange,
    onResponseSchemaChange,
    onPayloadChange,
    onWorkflowIdChange,
    onInstructionEdit,
    onExecuteStep,
    onExecuteAllSteps,
    onExecuteTransform,
    completedSteps = [],
    failedSteps = [],
    integrations,
    isExecuting,
    isExecutingStep,
    isExecutingTransform,
    currentExecutingStepIndex,
    transformResult,
    readOnly = false,
    payloadText,
    inputSchema,
    onInputSchemaChange,
    headerActions,
    navigateToFinalSignal,
    showStepOutputSignal,
    focusStepId,
    uploadedFiles,
    onFilesUpload,
    onFileRemove,
    isProcessingFiles,
    totalFileSize,
    filePayloads
}: WorkflowStepGalleryProps) {
    const [activeIndex, setActiveIndex] = useState(1); // Default to first workflow step, not payload
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const [containerWidth, setContainerWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [isConfiguratorEditing, setIsConfiguratorEditing] = useState<boolean>(false);

    // Local workflowId editor state to reduce re-renders
    const [localWorkflowId, setLocalWorkflowId] = useState<string>(workflowId ?? '');
    const [isEditingWorkflowId, setIsEditingWorkflowId] = useState<boolean>(false);
    useEffect(() => {
        if (!isEditingWorkflowId) {
            setLocalWorkflowId(workflowId ?? '');
        }
    }, [workflowId, isEditingWorkflowId]);
    const commitWorkflowIdIfChanged = () => {
        if (onWorkflowIdChange && localWorkflowId !== (workflowId ?? '')) {
            onWorkflowIdChange(localWorkflowId);
        }
        setIsEditingWorkflowId(false);
    };

    // Update window width on resize
    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Observe container width (e.g., when logs panel opens/closes) to responsively adjust cards
    useEffect(() => {
        const container = listRef.current?.parentElement?.parentElement as HTMLElement | null;
        if (!container || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = (entry.contentRect?.width || container.getBoundingClientRect().width);
                if (w && Math.abs(w - containerWidth) > 1) setContainerWidth(w);
            }
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, [listRef.current, containerWidth]);


    const [rawPayloadText, setRawPayloadText] = useState<string>(payloadText || '');
    // Initialize workingPayload with filePayloads if available
    const [workingPayload, setWorkingPayload] = useState<any>(() => {
        const trimmed = (payloadText || '').trim();
        if (trimmed === '') {
            return filePayloads || {};
        }
        try {
            const parsed = JSON.parse(payloadText);
            return filePayloads ? { ...parsed, ...filePayloads } : parsed;
        } catch {
            return filePayloads || {};
        }
    });

    useEffect(() => {
        const trimmed = (rawPayloadText || '').trim();
        if (trimmed === '') {
            // Even with empty manual payload, include file payloads
            setWorkingPayload(filePayloads || {});
            return;
        }
        try {
            const parsed = JSON.parse(rawPayloadText);
            // Merge manual payload with file payloads
            const merged = filePayloads ? { ...parsed, ...filePayloads } : parsed;
            setWorkingPayload(merged);
        } catch {
            // On parse error, still include file payloads
            setWorkingPayload(filePayloads || {});
        }
    }, [rawPayloadText, filePayloads]);

    // Keep local payload text in sync with external prop so uploads reflect immediately
    useEffect(() => {
        if (typeof payloadText === 'string') {
            setRawPayloadText(payloadText);
        }
    }, [payloadText]);

    const handlePayloadJsonChange = (jsonString: string) => {
        setRawPayloadText(jsonString);
        onPayloadChange?.(jsonString);
        try {
            const parsed = JSON.parse(jsonString);
            // Always merge with file payloads when manually editing
            const merged = filePayloads ? { ...parsed, ...filePayloads } : parsed;
            setWorkingPayload(merged);
        } catch {
            // On parse error, still include file payloads
            setWorkingPayload(filePayloads || {});
        }
    };

    const stepResultsMap = Array.isArray(stepResults)
        ? stepResults.reduce((acc: Record<string, any>, result: any) => {
            if (result.stepId) {
                acc[result.stepId] = result.data || result.transformedData || result;
            }
            return acc;
        }, {})
        : stepResults;

    // Build the complete workflow items including payload card
    const workflowItems = [
        // Initial payload card
        {
            type: 'payload',
            data: { payloadText: rawPayloadText, inputSchema },
            stepResult: undefined,
            evolvingPayload: workingPayload || {}
        },
        // Regular steps
        ...steps.map((step, index) => ({
            type: 'step',
            data: step,
            stepResult: stepResultsMap[step.id],
            evolvingPayload: buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, index - 1)
        })),
        ...(finalTransform !== undefined ? [{
            type: 'transform',
            data: { transform: finalTransform, responseSchema },
            stepResult: finalResult,
            evolvingPayload: buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, steps.length - 1)
        }] : []),
        {
            type: 'final',
            data: { result: transformResult || finalResult },
            stepResult: transformResult || finalResult,
            evolvingPayload: buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, steps.length)
        }
    ];

    // Compute current item
    const currentItem = workflowItems[activeIndex];
    const indicatorIndices = workflowItems.map((_, idx) => idx);

    const handleNavigation = (direction: 'prev' | 'next') => {
        if (isConfiguratorEditing) return;
        const newIndex = direction === 'prev'
            ? Math.max(0, activeIndex - 1)
            : Math.min(workflowItems.length - 1, activeIndex + 1);

        // Add a small delay to make the transition feel smoother
        setTimeout(() => {
            setActiveIndex(newIndex);
            // Snap the new active card into view
            const container = listRef.current;
            const card = container?.children?.[newIndex] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }, 50);
    };

    const handleCardClick = (globalIndex: number) => {
        if (isConfiguratorEditing) return;

        setTimeout(() => {
            setActiveIndex(globalIndex);
            const container = listRef.current;
            const card = container?.children?.[globalIndex] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }, 50);
    };

    const handleRemoveStep = (stepId: string) => {
        if (!onStepsChange) return;
        const newSteps = steps.filter(step => step.id !== stepId);
        onStepsChange(newSteps);
        // Adjust active index if needed
        if (activeIndex >= workflowItems.length - 1) {
            setActiveIndex(Math.max(0, activeIndex - 1));
        }
    };

    // Wrap onStepEdit to reset completion status when a step is edited
    const onStepEdit = (stepId: string, updatedStep: any) => {
        if (originalOnStepEdit) {
            originalOnStepEdit(stepId, updatedStep);
            // The parent component should handle resetting the completion status
            // by clearing the stepId from completedSteps array
        }
    };

    // Auto-select first workflow step on mount (index 1, not 0 which is payload)
    useEffect(() => {
        setActiveIndex(steps.length > 0 ? 1 : 0);
    }, []);

    // Navigate to final card when requested
    useEffect(() => {
        if (navigateToFinalSignal) {
            setActiveIndex(workflowItems.length - 1);
            const container = listRef.current;
            const card = container?.children?.[workflowItems.length - 1] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
    }, [navigateToFinalSignal]);

    useEffect(() => {
        if (!showStepOutputSignal || !focusStepId) return;
        const idx = steps.findIndex((s: any) => s.id === focusStepId);
        if (idx >= 0) {
            const globalIdx = idx + 1; // +1 to account for payload card at index 0
            setActiveIndex(globalIdx);
            const container = listRef.current;
            const card = container?.children?.[globalIdx] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showStepOutputSignal, focusStepId]);

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 w-full">
                        {(onWorkflowIdChange || typeof workflowId !== 'undefined') && (
                            <div className="flex w-full items-center justify-between gap-3">
                                <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/50 rounded-md border h-[36px]">
                                    <span className="text-sm text-muted-foreground">Workflow ID:</span>
                                    <Input
                                        value={localWorkflowId}
                                        onChange={(e) => {
                                            setLocalWorkflowId(e.target.value);
                                            setIsEditingWorkflowId(true);
                                        }}
                                        onBlur={commitWorkflowIdIfChanged}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                commitWorkflowIdIfChanged();
                                            } else if (e.key === 'Escape') {
                                                setLocalWorkflowId(workflowId ?? '');
                                                setIsEditingWorkflowId(false);
                                            }
                                        }}
                                        className="h-5 font-mono text-sm w-[200px] md:w-[280px] border-0 bg-transparent p-0 focus:ring-0"
                                        readOnly={readOnly || !onWorkflowIdChange}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    {headerActions ?? null}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {instruction && (
                    <div className="w-full">
                        <InstructionDisplay
                            instruction={instruction}
                            onEdit={onInstructionEdit}
                            showEditButton={!readOnly && !!onInstructionEdit}
                        />
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleNavigation('prev')}
                        disabled={activeIndex === 0}
                        className="shrink-0 h-9 w-9"
                        title="Previous"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <div className="flex-1 overflow-hidden px-2 sm:px-4 md:px-6 lg:px-8 xl:px-10 2xl:px-12">
                        <div className="relative">
                            <div
                                ref={listRef}
                                className="flex gap-2 justify-center items-center overflow-visible py-3"
                                style={{ minHeight: '150px' }}
                            >
                                {(() => {
                                    const totalCards = workflowItems.length;
                                    let startIdx = 0;
                                    let endIdx = totalCards;
                                    const CARD_WIDTH = 228; // px (matches card classes above)
                                    const ARROW_WIDTH = 24; // px (ChevronRight ~20px, add buffer)
                                    const GUTTER = 8; // px
                                    const BLOCK_WIDTH = CARD_WIDTH + ARROW_WIDTH;
                                    const cardsToShow = Math.max(1, Math.min(
                                        workflowItems.length,
                                        Math.floor((((containerWidth || windowWidth) + GUTTER) / (BLOCK_WIDTH + GUTTER)))
                                    ));

                                    if (totalCards <= cardsToShow) {
                                        // Show all cards if we have fewer than cardsToShow
                                        startIdx = 0;
                                        endIdx = totalCards;
                                    } else {
                                        const halfWindow = Math.floor(cardsToShow / 2);
                                        startIdx = Math.max(0, Math.min(activeIndex - halfWindow, totalCards - cardsToShow));
                                        endIdx = startIdx + cardsToShow;
                                    }

                                    const visibleItems = workflowItems.slice(startIdx, endIdx);
                                    const visibleIndices = visibleItems.map((_, i) => startIdx + i);
                                    const hasHiddenLeft = startIdx > 0;
                                    const hasHiddenRight = endIdx < totalCards;

                                    return (
                                        <>
                                            {hasHiddenLeft && null}

                                            {visibleItems.map((item, idx) => {
                                                const globalIdx = visibleIndices[idx];
                                                const showArrow = idx < visibleItems.length - 1;
                                                return (
                                                    <React.Fragment key={globalIdx}>
                                                        <div
                                                            className="flex items-center justify-center px-1"
                                                            style={{
                                                                flex: `0 0 ${100 / cardsToShow}%`,
                                                                minWidth: `${100 / cardsToShow}%`,
                                                                maxWidth: `${100 / cardsToShow}%`
                                                            }}
                                                        >
                                                            <MiniStepCard
                                                                step={item.data}
                                                                index={globalIdx}
                                                                isActive={globalIdx === activeIndex}
                                                                onClick={() => handleCardClick(globalIdx)}
                                                                stepId={item.type === 'step' ? item.data.id : undefined}
                                                                isPayload={item.type === 'payload'}
                                                                isTransform={item.type === 'transform'}
                                                                isFinal={item.type === 'final'}
                                                                isRunningAll={isExecuting && currentExecutingStepIndex === (globalIdx - 1)}
                                                                isTesting={
                                                                    item.type === 'step' ? isExecutingStep === (globalIdx - 1) :
                                                                        item.type === 'transform' ? isExecutingTransform :
                                                                            false
                                                                }
                                                                completedSteps={completedSteps}
                                                                failedSteps={failedSteps}
                                                            />
                                                        </div>
                                                        {showArrow && (
                                                            <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}

                                            {hasHiddenRight && null}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleNavigation('next')}
                        disabled={activeIndex === workflowItems.length - 1}
                        className="shrink-0 h-9 w-9"
                        title="Next"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex justify-center items-center gap-2">
                    <div className="flex gap-1">
                        {indicatorIndices.map((globalIdx) => (
                            <button
                                key={`dot-${globalIdx}`}
                                onClick={() => { if (isConfiguratorEditing) return; setActiveIndex(globalIdx); }}
                                className={cn(
                                    "w-1.5 h-1.5 rounded-full transition-colors",
                                    globalIdx === activeIndex ? "bg-primary" : "bg-muted"
                                )}
                                aria-label={`Go to item ${globalIdx + 1}`}
                                title={`Go to item ${globalIdx + 1}`}
                            />
                        ))}
                    </div>
                </div>

                <div className="min-h-[220px] max-w-6xl mx-auto">
                    {currentItem && (
                        currentItem.type === 'payload' ? (
                            <PayloadMiniStepCard
                                payloadText={currentItem.data.payloadText}
                                inputSchema={currentItem.data.inputSchema}
                                onChange={handlePayloadJsonChange}
                                onInputSchemaChange={onInputSchemaChange}
                                readOnly={readOnly}
                                onFilesUpload={onFilesUpload}
                                uploadedFiles={uploadedFiles}
                                onFileRemove={onFileRemove}
                                isProcessingFiles={isProcessingFiles}
                                totalFileSize={totalFileSize}
                            />
                        ) : currentItem.type === 'transform' ? (
                            <FinalTransformMiniStepCard
                                transform={currentItem.data.transform}
                                responseSchema={currentItem.data.responseSchema}
                                onTransformChange={onFinalTransformChange}
                                onResponseSchemaChange={onResponseSchemaChange}
                                readOnly={readOnly}
                                onExecuteTransform={onExecuteTransform}
                                isExecutingTransform={isExecutingTransform}
                                canExecute={steps.every((s: any) => completedSteps.includes(s.id))}
                                transformResult={transformResult || finalResult}
                                stepInputs={currentItem.evolvingPayload}
                            />
                        ) : currentItem.type === 'final' ? (
                            <FinalResultsCard
                                result={currentItem.data.result}
                            />
                        ) : (
                            <SpotlightStepCard
                                step={currentItem.data}
                                stepIndex={activeIndex - 1} // Adjust for payload card
                                evolvingPayload={currentItem.evolvingPayload || {}}
                                stepResult={currentItem.stepResult}
                                onEdit={!readOnly ? onStepEdit : undefined}
                                onRemove={!readOnly && currentItem.type === 'step' ? handleRemoveStep : undefined}
                                onExecuteStep={onExecuteStep ? () => onExecuteStep(activeIndex - 1) : undefined}
                                canExecute={canExecuteStep(activeIndex - 1, completedSteps, { steps } as any, stepResultsMap)}
                                isExecuting={isExecutingStep === activeIndex - 1}
                                integrations={integrations}
                                readOnly={readOnly}
                                failedSteps={failedSteps}
                                showOutputSignal={showStepOutputSignal}
                                onConfigEditingChange={setIsConfiguratorEditing}
                            />
                        )
                    )}
                </div>
            </div>
        </div>
    );
}