import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { MiniCard, StatusIndicator, TriggerCard } from "@/src/components/ui/mini-card";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { buildPreviousStepResults, cn } from "@/src/lib/general-utils";
import { buildCategorizedSources } from "@/src/lib/templating-utils";
import {
  Blocks,
  ChevronLeft,
  ChevronRight,
  FileJson,
  FilePlay,
  OctagonAlert,
  Plus,
  RotateCw,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FinalTransformMiniStepCard, TransformItem } from "./cards/FinalTransformCard";
import { PayloadMiniStepCard, PayloadItem } from "./cards/PayloadCard";
import { SpotlightStepCard, StepItem } from "./cards/SpotlightStepCard";
import { useExecution, useToolConfig } from "./context";
import { useGalleryNavigation } from "./hooks/use-gallery-navigation";
import { InstructionDisplay } from "./shared/InstructionDisplay";
import { TriggersCard } from "./cards/TriggersCard";
import { useRightSidebar } from "../sidebar/RightSidebarContext";

const RUNNING_STATUS = {
  text: "Running",
  color: "text-amber-600 dark:text-amber-400",
  dotColor: "bg-amber-600 dark:bg-amber-400",
  animate: true,
} as const;

export type ToolItem = PayloadItem | StepItem | TransformItem;

export interface ToolStepGalleryProps {
  onStepEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
  onExecuteStep?: (stepIndex: number) => Promise<void>;
  onExecuteStepWithLimit?: (stepIndex: number, limit: number) => Promise<void>;
  onExecuteTransform?: (schema: string, transform: string) => Promise<void>;
  onAbort?: () => void;

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
  onExecuteStep,
  onExecuteStepWithLimit,
  onExecuteTransform,
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
  // === CONTEXT ===
  const {
    tool,
    steps,
    payload,
    systems,
    inputSchema,
    responseSchema,
    finalTransform,
    setSteps,
    setInstruction,
    isPayloadReferenced,
  } = useToolConfig();

  const {
    isExecutingAny,
    currentExecutingStepIndex,
    finalResult,
    transformStatus,
    stepResultsMap,
    isRunningTransform,
    isFixingTransform,
    getStepStatusInfo,
  } = useExecution();

  // === DERIVED VALUES FROM CONTEXT ===
  const toolId = tool.id;
  const instruction = tool.instruction;
  const payloadText = payload.manualPayloadText;
  const computedPayload = payload.computedPayload || {};
  const filePayloads = payload.filePayloads;
  const hasTransformCompleted = transformStatus === "completed";
  const hasTransformFailed = transformStatus === "failed";
  const isSavedTool = toolId && !toolId.startsWith("draft_") && toolId !== "new";

  // Parse manual payload for categorized sources (memoized)
  const manualPayload = useMemo(() => {
    try {
      return JSON.parse(payloadText || "{}");
    } catch {
      return {};
    }
  }, [payloadText]);

  // === LOCAL STATE ===
  const [hiddenLeftCount, setHiddenLeftCount] = useState(0);
  const [hiddenRightCount, setHiddenRightCount] = useState(0);
  const [activeStepItemCount, setActiveStepItemCount] = useState<number | null>(null);

  // === AGENT SIDEBAR ===
  const { sendMessageToAgent } = useRightSidebar();

  // === TOOL ITEMS ===
  const toolItems = useMemo((): ToolItem[] => {
    const items: ToolItem[] = [];

    // Payload
    items.push({
      type: "payload",
      data: { payloadText, inputSchema },
      stepResult: undefined,
      transformError: undefined,
      categorizedSources: buildCategorizedSources({
        manualPayload,
        filePayloads: filePayloads || {},
      }),
    } as PayloadItem);

    // Steps
    steps.forEach((step, index) => {
      items.push({
        type: "step",
        data: step,
        stepResult: stepResultsMap[step.id],
        transformError: undefined,
        categorizedSources: buildCategorizedSources({
          manualPayload,
          filePayloads: filePayloads || {},
          previousStepResults: buildPreviousStepResults(steps, stepResultsMap, index - 1),
        }),
      } as StepItem);
    });

    // Transform
    if (finalTransform !== undefined) {
      items.push({
        type: "transform",
        data: { transform: finalTransform, responseSchema },
        stepResult: finalResult,
        transformError: hasTransformFailed ? stepResultsMap["__final_transform__"] : null,
        hasTransformCompleted,
        categorizedSources: buildCategorizedSources({
          manualPayload,
          filePayloads: filePayloads || {},
          previousStepResults: buildPreviousStepResults(steps, stepResultsMap, steps.length - 1),
        }),
      } as TransformItem);
    }

    return items;
  }, [
    payloadText,
    inputSchema,
    steps,
    stepResultsMap,
    finalTransform,
    responseSchema,
    finalResult,
    hasTransformCompleted,
    hasTransformFailed,
    manualPayload,
    filePayloads,
  ]);

  // Trigger is separate from navigation - it's a visual prefix to the first card
  const [showTriggerContent, setShowTriggerContent] = useState(false);

  // Item count is now dynamic based on toolItems
  const itemCount = toolItems.length;

  // Calculate initial index - start at first step if valid, otherwise payload
  const initialNavIndex = useMemo(() => {
    if (steps.length > 0 && isPayloadValid) {
      return 1; // first step
    }
    return 0; // payload
  }, [steps.length, isPayloadValid]);

  // === NAVIGATION ===
  const {
    activeIndex,
    setActiveIndex,
    navigateToIndex,
    handleNavigation,
    handleCardClick,
    listRef,
    scrollContainerRef,
    containerWidth,
    isHydrated,
    isNavigatingRef,
    isConfiguratorEditing,
    setIsConfiguratorEditing,
  } = useGalleryNavigation({
    initialIndex: initialNavIndex,
    itemCount,
    embedded,
  });

  const handleDataSelectorChange = useCallback((itemCount: number | null, isInitial: boolean) => {
    setActiveStepItemCount(itemCount);
  }, []);

  // Custom keyboard navigation that includes trigger
  useEffect(() => {
    if (!isSavedTool) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      )
        return;

      if (isConfiguratorEditing) return;

      const activeElement = document.activeElement;
      if (
        activeElement?.closest("[data-radix-popper-content-wrapper]") ||
        activeElement?.closest(".monaco-editor")
      )
        return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (showTriggerContent) {
          return;
        } else if (activeIndex === 0) {
          setShowTriggerContent(true);
        } else {
          handleNavigation("prev");
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (showTriggerContent) {
          setShowTriggerContent(false);
        } else {
          handleNavigation("next");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isSavedTool, showTriggerContent, activeIndex, isConfiguratorEditing, handleNavigation]);

  const currentItem = toolItems[activeIndex];
  const indicatorIndices = toolItems.map((_, idx) => idx);

  // Compute the step index for the current item (if it's a step)
  const currentStepIndex = useMemo(() => {
    if (currentItem?.type !== "step") return -1;
    return toolItems.slice(0, activeIndex).filter((i) => i.type === "step").length;
  }, [currentItem, toolItems, activeIndex]);

  // === VISIBLE CARDS CALCULATION ===
  const visibleCardsData = useMemo(() => {
    const totalCards = toolItems.length;
    const CARD_WIDTH = 170;
    const BUTTON_SIZE = 32;
    const BUTTON_SPACING = 18;
    const SEPARATOR_WIDTH = BUTTON_SIZE + BUTTON_SPACING * 2;
    const EDGE_PADDING = 16;
    const TRIGGER_WIDTH = 32;
    const TRIGGER_GAP = 32;
    const triggerSpace = isSavedTool ? TRIGGER_WIDTH + TRIGGER_GAP : 0;
    const available = Math.max(0, containerWidth - EDGE_PADDING * 2 - triggerSpace);

    let cardsToShow = 1;
    const maxCandidates = Math.min(totalCards, 12);
    for (let c = 1; c <= maxCandidates; c++) {
      const needed = c * CARD_WIDTH + (c - 1) * SEPARATOR_WIDTH;
      if (needed <= available) {
        cardsToShow = c;
      } else {
        break;
      }
    }
    cardsToShow = Math.max(1, cardsToShow);

    let startIdx = 0;
    let endIdx = totalCards;
    if (totalCards > cardsToShow) {
      const halfWindow = Math.floor(cardsToShow / 2);
      startIdx = Math.max(0, Math.min(activeIndex - halfWindow, totalCards - cardsToShow));
      endIdx = startIdx + cardsToShow;
    }

    const visibleItems = toolItems.slice(startIdx, endIdx);
    const visibleIndices = visibleItems.map((_, i) => startIdx + i);

    return {
      visibleItems,
      visibleIndices,
      startIdx,
      endIdx,
      totalCards,
      hiddenLeft: startIdx,
      hiddenRight: totalCards - endIdx,
      sepWidth: SEPARATOR_WIDTH,
      cardWidth: CARD_WIDTH,
    };
  }, [toolItems, containerWidth, activeIndex, isSavedTool]);

  // Update hidden counts for badges
  useEffect(() => {
    if (visibleCardsData.hiddenLeft !== hiddenLeftCount)
      setHiddenLeftCount(visibleCardsData.hiddenLeft);
    if (visibleCardsData.hiddenRight !== hiddenRightCount)
      setHiddenRightCount(visibleCardsData.hiddenRight);
  }, [
    visibleCardsData.hiddenLeft,
    visibleCardsData.hiddenRight,
    hiddenLeftCount,
    hiddenRightCount,
  ]);

  const handleRemoveStep = (stepId: string) => {
    if (!setSteps) return;
    const newSteps = steps.filter((step) => step.id !== stepId);
    setSteps(newSteps);
    // Adjust active index if needed
    if (activeIndex >= toolItems.length - 1) {
      setActiveIndex(Math.max(0, activeIndex - 1));
    }
  };

  const handleAddStep = useCallback(
    (afterStepIndex: number) => {
      const position =
        afterStepIndex === -1
          ? "at the beginning"
          : `after step "${steps[afterStepIndex]?.id || afterStepIndex + 1}"`;

      sendMessageToAgent(
        `Please add a new step ${position}. Ask me what the step should do if you need more information.`,
      );
    },
    [steps, sendMessageToAgent],
  );

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

  // === EXTERNAL NAVIGATION SIGNALS ===
  useEffect(() => {
    if (navigateToFinalSignal) {
      navigateToIndex(toolItems.length - 1);
    }
  }, [navigateToFinalSignal]);

  useEffect(() => {
    if (!showStepOutputSignal || !focusStepId) return;
    const idx = steps.findIndex((s: any) => s.id === focusStepId);
    if (idx >= 0) {
      navigateToIndex(idx + 1); // +1 for payload
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStepOutputSignal, focusStepId]);

  return (
    <div className="flex flex-col h-full">
      {/* Fixed header section */}
      <div className="flex-shrink-0 space-y-1.5 mb-6">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 w-full">
            {typeof toolId !== "undefined" && (
              <div className="flex w-full items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <h1 className="text-xl font-semibold truncate">{toolId || "Untitled Tool"}</h1>
                  {toolActionButtons}
                </div>
                <div className="flex items-center gap-2">{headerActions ?? null}</div>
              </div>
            )}
          </div>
        </div>
        {instruction && (
          <div className="w-full">
            <InstructionDisplay
              instruction={instruction}
              onSave={setInstruction}
              showEditButton={true}
            />
          </div>
        )}
      </div>

      {/* Scrollable content section */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pr-4"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setShowTriggerContent(false);
                  handleNavigation("prev");
                }}
                disabled={activeIndex === 0}
                className={cn(
                  "shrink-0 h-9 w-9",
                  hiddenLeftCount > 0 &&
                    !isPayloadValid &&
                    "ring-1 ring-amber-500 border-amber-500 shadow-lg shadow-amber-500/30 animate-pulse",
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
                    !isPayloadValid || !isPayloadReferenced
                      ? "bg-amber-500 text-white"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {hiddenLeftCount}
                </Badge>
              )}
            </div>

            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="relative">
                <div
                  ref={listRef}
                  className="flex justify-center items-center py-3 relative z-10"
                  style={{ minHeight: "140px" }}
                >
                  {!isHydrated ? (
                    <div className="flex items-center justify-center">
                      <div className="w-40 h-24 bg-muted/20 rounded-md animate-pulse" />
                    </div>
                  ) : (
                    <>
                      {/* Trigger button - shown as prefix when first visible card is payload */}
                      {isSavedTool && visibleCardsData.startIdx === 0 && (
                        <>
                          <TriggerCard
                            isActive={showTriggerContent}
                            onClick={() => setShowTriggerContent(!showTriggerContent)}
                            icon={
                              <Zap
                                className={cn(
                                  "h-4 w-4 absolute transition-colors",
                                  showTriggerContent
                                    ? "text-[#FFA500]"
                                    : "text-muted-foreground group-hover:text-primary",
                                )}
                              />
                            }
                          />
                          <div className="w-8" />
                        </>
                      )}
                      {visibleCardsData.visibleItems.map((item, idx) => {
                        const globalIdx = visibleCardsData.visibleIndices[idx];
                        const cardWidth = visibleCardsData.cardWidth;
                        const isActive = globalIdx === activeIndex && !showTriggerContent;
                        const handleClick = () => {
                          setShowTriggerContent(false);
                          handleCardClick(globalIdx);
                        };

                        const canShowAddButton = setSteps && item.type !== "transform";

                        const getInsertIndex = () => {
                          if (item.type === "payload") return -1;
                          if (item.type === "step") {
                            return (
                              toolItems.slice(0, globalIdx + 1).filter((i) => i.type === "step")
                                .length - 1
                            );
                          }
                          return -1;
                        };

                        const showSeparator = idx < visibleCardsData.visibleItems.length - 1;

                        const renderCardContent = () => {
                          if (item.type === "payload") {
                            const isEmptyPayload =
                              !computedPayload ||
                              (typeof computedPayload === "object" &&
                                Object.keys(computedPayload).length === 0) ||
                              (typeof computedPayload === "string" &&
                                (!(computedPayload as string).trim() ||
                                  (computedPayload as string).trim() === "{}"));

                            const showUnreferencedWarning =
                              isPayloadValid && !isPayloadReferenced && !isEmptyPayload;

                            return (
                              <MiniCard isActive={isActive} onClick={handleClick}>
                                <div className="flex-1 flex flex-col items-center justify-center">
                                  <div
                                    className={cn(
                                      "p-2 rounded-full",
                                      !isPayloadValid || showUnreferencedWarning
                                        ? "bg-amber-500/20"
                                        : "bg-primary/10",
                                    )}
                                  >
                                    {!isPayloadValid || showUnreferencedWarning ? (
                                      <svg
                                        className="h-4 w-4 text-amber-600 dark:text-amber-400"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                      </svg>
                                    ) : (
                                      <FileJson className="h-4 w-4 text-primary" />
                                    )}
                                  </div>
                                  <span className="text-[11px] font-semibold mt-1.5">
                                    Tool Input
                                  </span>
                                </div>
                                <div className="flex items-center justify-center">
                                  {!isPayloadValid ? (
                                    <StatusIndicator
                                      text="Required"
                                      color="text-amber-600 dark:text-amber-400"
                                      dotColor="bg-amber-600 dark:bg-amber-400"
                                      animate
                                    />
                                  ) : showUnreferencedWarning ? (
                                    <StatusIndicator
                                      text="Unused in tool"
                                      color="text-amber-600 dark:text-amber-400"
                                      dotColor="bg-amber-600 dark:bg-amber-400"
                                    />
                                  ) : (
                                    <span className="text-[9px] font-medium text-muted-foreground">
                                      {isEmptyPayload ? "Empty" : "Provided"}
                                    </span>
                                  )}
                                </div>
                              </MiniCard>
                            );
                          }

                          if (item.type === "transform") {
                            const isRunning = isRunningTransform || isFixingTransform;
                            const baseStatusInfo = getStepStatusInfo("__final_transform__");
                            const statusInfo = isRunning ? RUNNING_STATUS : baseStatusInfo;

                            return (
                              <MiniCard isActive={isActive} onClick={handleClick}>
                                <div className="flex-1 flex flex-col items-center justify-center">
                                  <div className="p-2 rounded-full bg-primary/10">
                                    <FilePlay className="h-4 w-4 text-primary" />
                                  </div>
                                  <span className="text-[11px] font-semibold mt-1.5">
                                    Tool Result
                                  </span>
                                </div>
                                <div className="flex items-center justify-center">
                                  <StatusIndicator
                                    text={statusInfo.text}
                                    color={statusInfo.color}
                                    dotColor={statusInfo.dotColor}
                                    animate={statusInfo.animate}
                                  />
                                </div>
                              </MiniCard>
                            );
                          }

                          const stepItem = item as StepItem;
                          const step = stepItem.data;
                          const stepsBeforeThis = toolItems
                            .slice(0, globalIdx)
                            .filter((i) => i.type === "step").length;
                          const isRunning =
                            isExecutingAny && currentExecutingStepIndex === stepsBeforeThis;
                          const isLoopStep =
                            globalIdx === activeIndex &&
                            activeStepItemCount !== null &&
                            activeStepItemCount > 0;

                          const baseStatusInfo = step.id
                            ? getStepStatusInfo(step.id)
                            : {
                                text: "Pending",
                                color: "text-gray-500 dark:text-gray-400",
                                dotColor: "bg-gray-500 dark:bg-gray-400",
                                animate: false,
                              };
                          const statusInfo = isRunning ? RUNNING_STATUS : baseStatusInfo;
                          const linkedSystem =
                            step.systemId && systems
                              ? systems.find((sys) => sys.id === step.systemId)
                              : undefined;

                          return (
                            <MiniCard isActive={isActive} onClick={handleClick}>
                              <div className="h-full flex flex-col relative w-full">
                                <div className="absolute top-0 left-0 flex items-center h-4">
                                  <span className="text-[9px] px-1 py-0.5 rounded font-medium bg-primary/10 text-primary">
                                    {stepsBeforeThis + 1}
                                  </span>
                                </div>
                                <div className="absolute top-0 right-0 flex items-center gap-0.5 h-4">
                                  {step?.modify === true && (
                                    <OctagonAlert
                                      className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400"
                                      aria-label="Modifies data"
                                    />
                                  )}
                                  {isLoopStep && !(step?.modify === true) && (
                                    <RotateCw
                                      className="h-3 w-3 text-amber-600 dark:text-amber-400"
                                      aria-label="Loop step"
                                    />
                                  )}
                                </div>
                                <div className="flex-1 flex flex-col items-center justify-center">
                                  <div className="p-2 rounded-full bg-white dark:bg-gray-100 border border-border/50">
                                    {linkedSystem ? (
                                      <SystemIcon system={linkedSystem} size={18} />
                                    ) : (
                                      <Blocks className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                  {step.systemId && (
                                    <span
                                      className="text-[9px] text-muted-foreground mt-1 truncate max-w-[140px]"
                                      title={step.systemId}
                                    >
                                      {step.systemId}
                                    </span>
                                  )}
                                  <span
                                    className="text-[11px] font-semibold mt-1 truncate max-w-[140px]"
                                    title={step.id || `Step ${globalIdx}`}
                                  >
                                    {step.id || `Step ${globalIdx}`}
                                  </span>
                                </div>
                                <div className="flex items-center justify-center">
                                  <StatusIndicator
                                    text={statusInfo.text}
                                    color={statusInfo.color}
                                    dotColor={statusInfo.dotColor}
                                    animate={statusInfo.animate}
                                  />
                                </div>
                              </div>
                            </MiniCard>
                          );
                        };

                        return (
                          <React.Fragment key={globalIdx}>
                            <div
                              className="flex items-center justify-center"
                              style={{
                                flex: `0 0 ${cardWidth}px`,
                                width: `${cardWidth}px`,
                                maxWidth: `${cardWidth}px`,
                              }}
                            >
                              {renderCardContent()}
                            </div>
                            {showSeparator && (
                              <div
                                style={{
                                  flex: `0 0 ${visibleCardsData.sepWidth}px`,
                                  width: `${visibleCardsData.sepWidth}px`,
                                }}
                                className="flex items-center justify-center"
                              >
                                {canShowAddButton ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddStep(getInsertIndex());
                                    }}
                                    className="group relative flex items-center justify-center h-8 w-8 rounded-full border border-muted-foreground/15 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                                    title="Add step here"
                                  >
                                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:opacity-0 transition-opacity" />
                                    <Plus className="h-4 w-4 text-primary absolute opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="relative flex-shrink-0">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setShowTriggerContent(false);
                  handleNavigation("next");
                }}
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
                  onClick={() => {
                    if (isConfiguratorEditing) return;
                    setShowTriggerContent(false);
                    navigateToIndex(globalIdx);
                  }}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    globalIdx === activeIndex ? "bg-primary" : "bg-muted",
                  )}
                  aria-label={`Go to item ${globalIdx + 1}`}
                  title={`Go to item ${globalIdx + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="min-h-[220px] max-w-6xl mx-auto">
            {isSavedTool && (
              <div className={showTriggerContent ? "" : "hidden"}>
                <TriggersCard toolId={toolId} payload={computedPayload} compact />
              </div>
            )}
            {!showTriggerContent && currentItem && currentItem.type === "payload" ? (
              <PayloadMiniStepCard
                onFilesUpload={onFilesUpload}
                onFileRemove={onFileRemove}
                isProcessingFiles={isProcessingFiles}
                totalFileSize={totalFileSize}
                isPayloadValid={isPayloadValid}
              />
            ) : !showTriggerContent && currentItem && currentItem.type === "transform" ? (
              <FinalTransformMiniStepCard
                onExecuteTransform={onExecuteTransform}
                onAbort={isRunningTransform || isFixingTransform ? onAbort : undefined}
              />
            ) : !showTriggerContent && currentItem && currentItem.type === "step" ? (
              <SpotlightStepCard
                key={currentItem.data.id}
                step={currentItem.data}
                stepIndex={currentStepIndex}
                onEdit={onStepEdit}
                onRemove={() => handleRemoveStep(currentItem.data.id)}
                onExecuteStep={onExecuteStep ? () => onExecuteStep(currentStepIndex) : undefined}
                onExecuteStepWithLimit={
                  onExecuteStepWithLimit
                    ? (limit) => onExecuteStepWithLimit(currentStepIndex, limit)
                    : undefined
                }
                onAbort={currentExecutingStepIndex === currentStepIndex ? onAbort : undefined}
                isExecuting={currentExecutingStepIndex === currentStepIndex}
                showOutputSignal={
                  focusStepId === currentItem.data.id ? showStepOutputSignal : undefined
                }
                onConfigEditingChange={setIsConfiguratorEditing}
                onDataSelectorChange={handleDataSelectorChange}
                isFirstStep={currentStepIndex === 0}
                isPayloadValid={isPayloadValid}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
