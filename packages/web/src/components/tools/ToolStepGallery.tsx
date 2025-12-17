import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { buildEvolvingPayload, buildPreviousStepResults, cn } from '@/src/lib/general-utils';
import { buildCategorizedSources } from '@/src/lib/templating-utils';
import { AuthType, ExecutionStep, HttpMethod } from "@superglue/shared";
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FinalTransformMiniStepCard } from './cards/FinalTransformCard';
import { MiniStepCard } from './cards/MiniStepCard';
import { PayloadMiniStepCard } from './cards/PayloadCard';
import { SpotlightStepCard } from './cards/SpotlightStepCard';
import { useToolConfig, useExecution } from './context';
import { AddStepDialog } from './dialogs/AddStepDialog';
import { InstructionDisplay } from './shared/InstructionDisplay';

interface PayloadItem {
    type: 'payload';
    data: { payloadText: string; inputSchema: string | null };
    stepResult: undefined;
    transformError: undefined;
    categorizedSources: ReturnType<typeof buildCategorizedSources>;
}

interface StepItem {
    type: 'step';
    data: ExecutionStep;
    stepResult: any;
    transformError: undefined;
    categorizedSources: ReturnType<typeof buildCategorizedSources>;
}

interface TransformItem {
    type: 'transform';
    data: { transform: string; responseSchema: string };
    stepResult: any;
    transformError: any;
    hasTransformCompleted: boolean;
    categorizedSources: ReturnType<typeof buildCategorizedSources>;
}

type ToolItem = PayloadItem | StepItem | TransformItem;

export interface ToolStepGalleryProps {
    // Callbacks that trigger parent logic
    onStepEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
    onInstructionEdit?: () => void;
    onExecuteStep?: (stepIndex: number) => Promise<void>;
    onExecuteStepWithLimit?: (stepIndex: number, limit: number) => Promise<void>;
    onOpenFixStepDialog?: (stepIndex: number) => void;
    onExecuteTransform?: (schema: string, transform: string) => Promise<void>;
    onOpenFixTransformDialog?: () => void;
    onAbort?: () => void;
    
    // File handling callbacks
    onFilesUpload?: (files: File[]) => Promise<void>;
    onFileRemove?: (key: string) => void;
    
    // UI-specific props
    toolActionButtons?: React.ReactNode;
    headerActions?: React.ReactNode;
    navigateToFinalSignal?: number;
    showStepOutputSignal?: number;
    focusStepId?: string | null;
    isProcessingFiles?: boolean;
    totalFileSize?: number;
    isPayloadValid?: boolean;
    embedded?: boolean;
    
}

export function ToolStepGallery({
    onStepEdit: originalOnStepEdit,
    onInstructionEdit,
    onExecuteStep,
    onExecuteStepWithLimit,
    onOpenFixStepDialog,
    onExecuteTransform,
    onOpenFixTransformDialog,
    onAbort,
    onFilesUpload,
    onFileRemove,
    toolActionButtons,
    headerActions,
    navigateToFinalSignal,
    showStepOutputSignal,
    focusStepId,
    isProcessingFiles,
    totalFileSize,
    isPayloadValid = true,
    embedded = false,
}: ToolStepGalleryProps) {
    
    const {
        tool,
        steps,
        payload,
        integrations,
        inputSchema,
        responseSchema,
        finalTransform,
        setSteps,
        setPayloadText,
    } = useToolConfig();
    
    const {
        isExecutingAny,
        currentExecutingStepIndex,
        finalResult,
        transformStatus,
        incrementSourceDataVersion,
        getStepResultsMap,
        isRunningTransform,
        isFixingTransform,
    } = useExecution();
    
    const isExecutingStep = currentExecutingStepIndex;
    
    // Derive values from context
    const toolId = tool.id;
    const instruction = tool.instruction;
    const payloadText = payload.manualPayloadText;
    const computedPayload = payload.computedPayload;
    const filePayloads = payload.filePayloads;
    const isExecuting = isExecutingAny;
    const stepResultsMap = getStepResultsMap();
    
    
    const [activeIndex, setActiveIndex] = useState(1); // Default to first tool step, not payload
    const [windowWidth, setWindowWidth] = useState(1200);
    const [containerWidth, setContainerWidth] = useState<number>(1200);
    const [isHydrated, setIsHydrated] = useState(false);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [isConfiguratorEditing, setIsConfiguratorEditing] = useState<boolean>(false);

    const [isAddStepDialogOpen, setIsAddStepDialogOpen] = useState(false);
    const [pendingInsertIndex, setPendingInsertIndex] = useState<number | null>(null);
    const isConfiguratorEditingRef = useRef<boolean>(false);
    const [hiddenLeftCount, setHiddenLeftCount] = useState(0);
    const [hiddenRightCount, setHiddenRightCount] = useState(0);
    const [activeStepItemCount, setActiveStepItemCount] = useState<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    
    const handleDataSelectorChange = useCallback((itemCount: number | null, isInitial: boolean) => {
        setActiveStepItemCount(itemCount);
        if (!isInitial) {
            incrementSourceDataVersion?.();
        }
    }, [incrementSourceDataVersion]);
    
    useEffect(() => {
        isConfiguratorEditingRef.current = isConfiguratorEditing;
    }, [isConfiguratorEditing]);

    const isNavigatingRef = useRef<boolean>(false);
    const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const NAV_SUPPRESS_MS = 300;
    const NAV_DELAY_MS = 50;

    const navigateToIndex = (nextIndex: number) => {
        isNavigatingRef.current = true;
        if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = setTimeout(() => {
            isNavigatingRef.current = false;
        }, NAV_SUPPRESS_MS);

        setTimeout(() => {
            setActiveIndex(nextIndex);
            const container = listRef.current;
            const card = container?.children?.[nextIndex] as HTMLElement | undefined;
            if (container && card) {
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
            
            // Scroll to top based on mode
            if (embedded) {
                // In embedded mode, find the nearest scrollable parent
                let scrollParent = scrollContainerRef.current?.parentElement;
                while (scrollParent && scrollParent !== document.body) {
                    const { overflowY } = window.getComputedStyle(scrollParent);
                    if (overflowY === 'auto' || overflowY === 'scroll') {
                        scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
                        break;
                    }
                    scrollParent = scrollParent.parentElement;
                }
                // Fallback: scroll window
                if (!scrollParent || scrollParent === document.body) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else if (scrollContainerRef.current) {
                // Non-embedded mode: use local scroll container
                scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, NAV_DELAY_MS);
    };

    // Hydration effect
    useEffect(() => {
        setIsHydrated(true);
        setWindowWidth(window.innerWidth);
        setContainerWidth(window.innerWidth);
    }, []);

    // Update window width on resize
    useEffect(() => {
        if (!isHydrated) return;
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isHydrated]);

    // Observe container width (e.g., when logs panel opens/closes) to responsively adjust cards
    useEffect(() => {
        if (!isHydrated) return;
        const container = listRef.current?.parentElement?.parentElement as HTMLElement | null;
        if (!container || typeof ResizeObserver === 'undefined') return;
        const RESIZE_THRESHOLD = 50; // Increased from 1px to reduce sensitivity and prevent cascading re-renders
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = (entry.contentRect?.width || container.getBoundingClientRect().width);
                if (w && Math.abs(w - containerWidth) > RESIZE_THRESHOLD) setContainerWidth(w);
            }
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, [isHydrated, listRef.current, containerWidth]);


    const [rawPayloadText, setRawPayloadText] = useState<string>(payloadText || '');

    // Keep local payload text in sync with external prop
    useEffect(() => {
        if (typeof payloadText === 'string') {
            setRawPayloadText(payloadText);
        }
    }, [payloadText]);
    
    // Use computed payload from context (already merged manual + files)
    const workingPayload = computedPayload || {};

    const manualPayload = useMemo(() => { try { return JSON.parse(rawPayloadText || '{}'); } catch { return {}; } }, [rawPayloadText]);
    const hasTransformCompleted = transformStatus === 'completed';
    const hasTransformFailed = transformStatus === 'failed';

    const toolItems = useMemo((): ToolItem[] => [
        {
            type: 'payload',
            data: { payloadText: rawPayloadText, inputSchema },
            stepResult: undefined,
            transformError: undefined,
            categorizedSources: buildCategorizedSources({ manualPayload, filePayloads: filePayloads || {} })
        } as PayloadItem,
        ...steps.map((step, index): StepItem => ({
            type: 'step',
            data: step,
            stepResult: stepResultsMap[step.id],
            transformError: undefined,
            categorizedSources: buildCategorizedSources({
                manualPayload,
                filePayloads: filePayloads || {},
                previousStepResults: buildPreviousStepResults(steps, stepResultsMap, index - 1),
            })
        })),
        ...(finalTransform !== undefined ? [{
            type: 'transform',
            data: { transform: finalTransform, responseSchema },
            stepResult: finalResult,
            transformError: hasTransformFailed ? stepResultsMap['__final_transform__'] : null,
            hasTransformCompleted,
            categorizedSources: buildCategorizedSources({
                manualPayload,
                filePayloads: filePayloads || {},
                previousStepResults: buildPreviousStepResults(steps, stepResultsMap, steps.length - 1),
            })
        } as TransformItem] : [])
    ], [rawPayloadText, inputSchema, steps, stepResultsMap, finalTransform, responseSchema, finalResult, hasTransformCompleted, hasTransformFailed, manualPayload, filePayloads]);

    const currentItem = toolItems[activeIndex];
    const indicatorIndices = toolItems.map((_, idx) => idx);

    const activeEvolvingPayload = useMemo(() => {
        if (!currentItem) return workingPayload || {};
        if (currentItem.type === 'payload') return workingPayload || {};
        if (currentItem.type === 'transform') {
            return buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, steps.length - 1);
        }
        const stepIndex = steps.findIndex(s => s.id === currentItem.data.id);
        return buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, stepIndex - 1);
    }, [currentItem, workingPayload, steps, stepResultsMap]);

    const handleNavigation = (direction: 'prev' | 'next') => {
        if (isConfiguratorEditing) return;
        const newIndex = direction === 'prev'
            ? Math.max(0, activeIndex - 1)
            : Math.min(toolItems.length - 1, activeIndex + 1);
        if (newIndex === activeIndex) return;
        navigateToIndex(newIndex);
    };

    const handleCardClick = (globalIndex: number) => {
        if (isConfiguratorEditing) return;
        navigateToIndex(globalIndex);
    };

    const handleRemoveStep = (stepId: string) => {
        if (!setSteps) return;
        const newSteps = steps.filter(step => step.id !== stepId);
        setSteps(newSteps);
        // Adjust active index if needed
        if (activeIndex >= toolItems.length - 1) {
            setActiveIndex(Math.max(0, activeIndex - 1));
        }
    };

    const handleInsertStep = (afterIndex: number) => {
        if (!setSteps) return;

        setPendingInsertIndex(afterIndex);
        setIsAddStepDialogOpen(true);
    };

    const handleConfirmInsertStep = (stepId: string, instruction: string, integrationId?: string) => {
        if (pendingInsertIndex === null || !setSteps) return;

        const selectedIntegration = integrationId 
            ? integrations?.find(i => i.id === integrationId)
            : undefined;

        const newStep: ExecutionStep = {
            id: stepId,
            integrationId: integrationId || '',
            apiConfig: {
                id: stepId,
                instruction: instruction,
                urlHost: selectedIntegration?.urlHost || '',
                urlPath: selectedIntegration?.urlPath || '',
                method: 'GET' as HttpMethod,
                headers: {},
                queryParams: {},
                body: '',
                authentication: 'NONE' as AuthType
            },
            executionMode: 'DIRECT'
        };

        const newSteps = [...steps];
        newSteps.splice(pendingInsertIndex, 0, newStep);
        setSteps(newSteps);

        const insertedIndex = pendingInsertIndex;
        setIsAddStepDialogOpen(false);
        setPendingInsertIndex(null);
        setTimeout(() => navigateToIndex(insertedIndex + 1), 100);
    };

    const handleConfirmInsertTool = (toolSteps: any[]) => {
        if (pendingInsertIndex === null || !setSteps) return;

        const newSteps = [...steps];
        newSteps.splice(pendingInsertIndex, 0, ...toolSteps);
        setSteps(newSteps);

        const insertedIndex = pendingInsertIndex;
        setIsAddStepDialogOpen(false);
        setPendingInsertIndex(null);

        // Navigate to the first newly inserted step
        setTimeout(() => navigateToIndex(insertedIndex + 1), 100);
    };

    const handleConfirmGenerateStep = (step: any) => {
        if (pendingInsertIndex === null || !setSteps) return;

        const newSteps = [...steps];
        newSteps.splice(pendingInsertIndex, 0, step);
        setSteps(newSteps);

        const insertedIndex = pendingInsertIndex;
        setIsAddStepDialogOpen(false);
        setPendingInsertIndex(null);

        // Navigate to the newly inserted step
        setTimeout(() => navigateToIndex(insertedIndex + 1), 100);
    };

    const onStepEdit = (stepId: string, updatedStep: any, isUserInitiated: boolean = false) => {
        // Suppress user-initiated edits during navigation to prevent spurious resets
        if (isNavigatingRef.current && isUserInitiated) {
            if (originalOnStepEdit) {
                originalOnStepEdit(stepId, updatedStep, false);
            }
        } else if (originalOnStepEdit) {
            originalOnStepEdit(stepId, updatedStep, isUserInitiated);
        }
    };

    useEffect(() => {
        setActiveIndex(steps.length > 0 && isPayloadValid ? 1 : 0);
    }, []);

    // Keyboard navigation with arrow keys
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle if not typing in an input/textarea/contenteditable
            if (e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target as HTMLElement).isContentEditable) {
                return;
            }

            // Don't navigate when editing step config
            if (isConfiguratorEditing) {
                return;
            }

            // Don't navigate when inside a popover (e.g., template code editor)
            const activeElement = document.activeElement;
            if (activeElement?.closest('[data-radix-popper-content-wrapper]') ||
                activeElement?.closest('.monaco-editor')) {
                return;
            }

            if (e.key === 'ArrowLeft' && activeIndex > 0) {
                e.preventDefault();
                handleNavigation('prev');
            } else if (e.key === 'ArrowRight' && activeIndex < toolItems.length - 1) {
                e.preventDefault();
                handleNavigation('next');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeIndex, toolItems.length, isConfiguratorEditing]);

    useEffect(() => {
        if (navigateToFinalSignal) {
            navigateToIndex(toolItems.length - 1);
        }
    }, [navigateToFinalSignal]);

    useEffect(() => {
        if (!showStepOutputSignal || !focusStepId) return;
        const idx = steps.findIndex((s: any) => s.id === focusStepId);
        if (idx >= 0) {
            navigateToIndex(idx + 1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showStepOutputSignal, focusStepId]);

    return (
        <div className="flex flex-col h-full">
            {/* Fixed header section */}
            <div className="flex-shrink-0 space-y-1.5 mb-6">
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 w-full">
                        {typeof toolId !== 'undefined' && (
                            <div className="flex w-full items-center justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <h1 className="text-2xl font-bold truncate">
                                        {toolId || 'Untitled Tool'}
                                    </h1>
                                    {toolActionButtons}
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
                            showEditButton={!!onInstructionEdit}
                        />
                    </div>
                )}
            </div>

            {/* Scrollable content section */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-4" style={{ scrollbarGutter: 'stable' }}>
                <div className="space-y-6">
                    <div className="flex items-center gap-0">
                        <div className="relative">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleNavigation('prev')}
                                disabled={activeIndex === 0}
                                className={cn(
                                    "shrink-0 h-9 w-9",
                                    hiddenLeftCount > 0 && !isPayloadValid && "ring-1 ring-amber-500 border-amber-500 shadow-lg shadow-amber-500/30 animate-pulse"
                                )}
                                title="Previous"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            {hiddenLeftCount > 0 && (
                                <Badge
                                    variant="default"
                                    className={cn(
                                        "absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] font-bold flex items-center justify-center",
                                        !isPayloadValid ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"
                                    )}
                                >
                                    {hiddenLeftCount}
                                </Badge>
                            )}
                        </div>

                        <div className="flex-1 overflow-hidden px-0">
                            <div className="relative">
                                <div
                                    ref={listRef}
                                    className="flex justify-center items-center overflow-visible py-3"
                                    style={{ minHeight: '150px' }}
                                >
                                    {!isHydrated ? (
                                        // Show a simple loading state during hydration
                                        <div className="flex items-center justify-center">
                                            <div className="w-48 h-24 bg-muted/20 rounded-md animate-pulse" />
                                        </div>
                                    ) : (() => {
                                        const totalCards = toolItems.length;
                                        let startIdx = 0;
                                        let endIdx = totalCards;
                                        const CARD_WIDTH = 180; // px (matches card classes)
                                        const ARROW_WIDTH = 24; // px (ChevronRight ~20px, add buffer)
                                        const GUTTER = 16; // px (doubled spacing)
                                        const SAFE_MARGIN = 12; // px extra space to avoid clipping
                                        const available = Math.max(0, (containerWidth || windowWidth) - SAFE_MARGIN);
                                        let cardsToShow = 1;
                                        const maxCandidates = Math.min(toolItems.length, 12);
                                        for (let c = 1; c <= maxCandidates; c++) {
                                            const needed = (c * CARD_WIDTH) + ((c - 1) * (ARROW_WIDTH + GUTTER));
                                            if (needed <= available) {
                                                cardsToShow = c;
                                            } else {
                                                break;
                                            }
                                        }

                                        cardsToShow = Math.max(1, cardsToShow);

                                        if (totalCards <= cardsToShow) {
                                            // Show all cards if we have fewer than cardsToShow
                                            startIdx = 0;
                                            endIdx = totalCards;
                                        } else {
                                            const halfWindow = Math.floor(cardsToShow / 2);
                                            startIdx = Math.max(0, Math.min(activeIndex - halfWindow, totalCards - cardsToShow));
                                            endIdx = startIdx + cardsToShow;
                                        }

                                        const visibleItems = toolItems.slice(startIdx, endIdx);
                                        const visibleIndices = visibleItems.map((_, i) => startIdx + i);
                                        const hasHiddenLeft = startIdx > 0;
                                        const hasHiddenRight = endIdx < totalCards;
                                        const hiddenLeft = startIdx;
                                        const hiddenRight = totalCards - endIdx;

                                        // Update state for badges (use ref to avoid re-render loop)
                                        if (hiddenLeft !== hiddenLeftCount) setHiddenLeftCount(hiddenLeft);
                                        if (hiddenRight !== hiddenRightCount) setHiddenRightCount(hiddenRight);
                                        const sepWidth = ARROW_WIDTH + GUTTER;
                                        const edgeWidth = sepWidth;
                                        const count = Math.max(1, visibleItems.length);
                                        const innerAvailable = Math.max(0, (containerWidth || windowWidth) - SAFE_MARGIN - (2 * edgeWidth) - ((count - 1) * sepWidth));
                                        const baseCardWidth = Math.floor(innerAvailable / count);
                                        const widthRemainder = innerAvailable - (baseCardWidth * count);

                                        return (
                                            <>
                                                {hasHiddenLeft && null}

                                                {visibleItems.length > 0 && (
                                                    <div style={{ flex: `0 0 ${sepWidth}px`, width: `${sepWidth}px` }} />
                                                )}
                                                {visibleItems.map((item, idx) => {
                                                    const globalIdx = visibleIndices[idx];
                                                    const showArrow = idx < visibleItems.length - 1;
                                                    return (
                                                        <React.Fragment key={globalIdx}>
                                                            <div
                                                                className="flex items-center justify-center"
                                                                style={{
                                                                    flex: `0 0 ${baseCardWidth + (idx < widthRemainder ? 1 : 0)}px`,
                                                                    width: `${baseCardWidth + (idx < widthRemainder ? 1 : 0)}px`,
                                                                    maxWidth: `${baseCardWidth + (idx < widthRemainder ? 1 : 0)}px`
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
                                                                    isRunningAll={isExecuting && currentExecutingStepIndex === (globalIdx - 1)}
                                                                    isTesting={
                                                                        item.type === 'step' ? (isExecutingStep === (globalIdx - 1)) :
                                                                            item.type === 'transform' ? (isRunningTransform || isFixingTransform) :
                                                                                false
                                                                    }
                                                                    isFirstCard={globalIdx === 0}
                                                                    isLastCard={globalIdx === totalCards - 1}
                                                                    isPayloadValid={isPayloadValid}
                                                                    payloadData={item.type === 'payload' ? workingPayload : undefined}
                                                                    isLoopStep={globalIdx === activeIndex && activeStepItemCount !== null && activeStepItemCount > 0}
                                                                />
                                                            </div>
                                                            {showArrow && (
                                                                <div style={{ flex: `0 0 ${sepWidth}px`, width: `${sepWidth}px` }} className="flex items-center justify-center">
                                                                    {setSteps && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleInsertStep(globalIdx);
                                                                            }}
                                                                            className="group relative flex items-center justify-center h-8 w-8 rounded-full hover:bg-primary/10 transition-colors"
                                                                            title="Add step here"
                                                                        >
                                                                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:opacity-0 transition-opacity" />
                                                                            <Plus className="h-4 w-4 text-primary absolute opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                        </button>
                                                                    )}
                                                                    {!setSteps && (
                                                                        <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                {visibleItems.length > 0 && (
                                                    <div style={{ flex: `0 0 ${sepWidth}px`, width: `${sepWidth}px` }} />
                                                )}

                                                {hasHiddenRight && null}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        <div className="relative">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleNavigation('next')}
                                disabled={activeIndex === toolItems.length - 1}
                                className="shrink-0 h-9 w-9"
                                title="Next"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            {hiddenRightCount > 0 && (
                                <Badge
                                    variant="default"
                                    className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] font-bold flex items-center justify-center bg-primary text-primary-foreground"
                                >
                                    {hiddenRightCount}
                                </Badge>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-center items-center gap-2">
                        <div className="flex gap-1">
                            {indicatorIndices.map((globalIdx) => (
                                <button
                                    key={`dot-${globalIdx}`}
                                    onClick={() => { if (isConfiguratorEditing) return; navigateToIndex(globalIdx); }}
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
                                    onFilesUpload={onFilesUpload}
                                    onFileRemove={onFileRemove}
                                    isProcessingFiles={isProcessingFiles}
                                    totalFileSize={totalFileSize}
                                    isPayloadValid={isPayloadValid}
                                />
                            ) : currentItem.type === 'transform' ? (
                                <FinalTransformMiniStepCard
                                    onExecuteTransform={onExecuteTransform}
                                    onOpenFixTransformDialog={onOpenFixTransformDialog}
                                    onAbort={(isRunningTransform || isFixingTransform) ? onAbort : undefined}
                                />
                            ) : (
                                <SpotlightStepCard
                                    key={currentItem.data.id}
                                    step={currentItem.data}
                                    stepIndex={activeIndex - 1}
                                    evolvingPayload={activeEvolvingPayload}
                                    categorizedSources={currentItem.categorizedSources}
                                    onEdit={onStepEdit}
                                    onRemove={currentItem.type === 'step' ? handleRemoveStep : undefined}
                                    onExecuteStep={onExecuteStep ? () => onExecuteStep(activeIndex - 1) : undefined}
                                    onExecuteStepWithLimit={onExecuteStepWithLimit ? (limit) => onExecuteStepWithLimit(activeIndex - 1, limit) : undefined}
                                    onOpenFixStepDialog={onOpenFixStepDialog ? () => onOpenFixStepDialog(activeIndex - 1) : undefined}
                                    onAbort={isExecutingStep === activeIndex - 1 ? onAbort : undefined}
                                    isExecuting={isExecutingStep === activeIndex - 1}
                                    showOutputSignal={focusStepId === currentItem.data.id ? showStepOutputSignal : undefined}
                                    onConfigEditingChange={setIsConfiguratorEditing}
                                    onDataSelectorChange={handleDataSelectorChange}
                                    isFirstStep={activeIndex === 1}
                                    isPayloadValid={isPayloadValid}
                                />
                            )
                        )}
                    </div>
                </div>
            </div>

            <AddStepDialog
                open={isAddStepDialogOpen}
                onOpenChange={setIsAddStepDialogOpen}
                onConfirm={handleConfirmInsertStep}
                onConfirmTool={handleConfirmInsertTool}
                onConfirmGenerate={handleConfirmGenerateStep}
                existingStepIds={steps.map((s: any) => s.id)}
                stepInput={pendingInsertIndex !== null ? buildEvolvingPayload(workingPayload || {}, steps, stepResultsMap, pendingInsertIndex - 1) : undefined}
                currentToolId={toolId}
            />
        </div>
    );
}