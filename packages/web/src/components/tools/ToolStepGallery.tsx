import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { buildPreviousStepResults, buildStepInput, cn } from "@/src/lib/general-utils";
import { buildCategorizedSources } from "@/src/lib/templating-utils";
import { ExecutionStep, HttpMethod } from "@superglue/shared";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FinalTransformMiniStepCard } from "./cards/FinalTransformCard";
import { MiniStepCard } from "./cards/MiniStepCard";
import { PayloadMiniStepCard } from "./cards/PayloadCard";
import { SpotlightStepCard } from "./cards/SpotlightStepCard";
import { useExecution, useToolConfig } from "./context";
import { AddStepDialog } from "./dialogs/AddStepDialog";
import { useGalleryNavigation } from "./hooks/use-gallery-navigation";
import { InstructionDisplay } from "./shared/InstructionDisplay";

interface PayloadItem {
  type: "payload";
  data: { payloadText: string; inputSchema: string | null };
  stepResult: undefined;
  transformError: undefined;
  categorizedSources: ReturnType<typeof buildCategorizedSources>;
}

interface StepItem {
  type: "step";
  data: ExecutionStep;
  stepResult: any;
  transformError: undefined;
  categorizedSources: ReturnType<typeof buildCategorizedSources>;
}

interface TransformItem {
  type: "transform";
  data: { transform: string; responseSchema: string };
  stepResult: any;
  transformError: any;
  hasTransformCompleted: boolean;
  categorizedSources: ReturnType<typeof buildCategorizedSources>;
}

type ToolItem = PayloadItem | StepItem | TransformItem;

export interface ToolStepGalleryProps {
  onStepEdit?: (stepId: string, updatedStep: any, isUserInitiated?: boolean) => void;
  onInstructionEdit?: () => void;
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
  onInstructionEdit,
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
  const { tool, steps, payload, systems, inputSchema, responseSchema, finalTransform, setSteps } =
    useToolConfig();

  const {
    isExecutingAny,
    currentExecutingStepIndex,
    finalResult,
    transformStatus,
    stepResultsMap,
    isRunningTransform,
    isFixingTransform,
  } = useExecution();

  // === DERIVED VALUES FROM CONTEXT ===
  const toolId = tool.id;
  const instruction = tool.instruction;
  const payloadText = payload.manualPayloadText;
  const computedPayload = payload.computedPayload || {};
  const filePayloads = payload.filePayloads;
  const hasTransformCompleted = transformStatus === "completed";
  const hasTransformFailed = transformStatus === "failed";

  // Parse manual payload for categorized sources (memoized)
  const manualPayload = useMemo(() => {
    try {
      return JSON.parse(payloadText || "{}");
    } catch {
      return {};
    }
  }, [payloadText]);

  // === LOCAL STATE ===
  const [isAddStepDialogOpen, setIsAddStepDialogOpen] = useState(false);
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number | null>(null);
  const [hiddenLeftCount, setHiddenLeftCount] = useState(0);
  const [hiddenRightCount, setHiddenRightCount] = useState(0);
  const [activeStepItemCount, setActiveStepItemCount] = useState<number | null>(null);

  // Item count: payload (1) + steps + transform (if exists)
  const itemCount = 1 + steps.length + (finalTransform !== undefined ? 1 : 0);

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
    initialIndex: steps.length > 0 && isPayloadValid ? 1 : 0,
    itemCount,
    embedded,
  });

  const handleDataSelectorChange = useCallback((itemCount: number | null, isInitial: boolean) => {
    setActiveStepItemCount(itemCount);
  }, []);

  // === TOOL ITEMS ===
  const toolItems = useMemo(
    (): ToolItem[] => [
      {
        type: "payload",
        data: { payloadText, inputSchema },
        stepResult: undefined,
        transformError: undefined,
        categorizedSources: buildCategorizedSources({
          manualPayload,
          filePayloads: filePayloads || {},
        }),
      } as PayloadItem,
      ...steps.map(
        (step, index): StepItem => ({
          type: "step",
          data: step,
          stepResult: stepResultsMap[step.id],
          transformError: undefined,
          categorizedSources: buildCategorizedSources({
            manualPayload,
            filePayloads: filePayloads || {},
            previousStepResults: buildPreviousStepResults(steps, stepResultsMap, index - 1),
          }),
        }),
      ),
      ...(finalTransform !== undefined
        ? [
            {
              type: "transform",
              data: { transform: finalTransform, responseSchema },
              stepResult: finalResult,
              transformError: hasTransformFailed ? stepResultsMap["__final_transform__"] : null,
              hasTransformCompleted,
              categorizedSources: buildCategorizedSources({
                manualPayload,
                filePayloads: filePayloads || {},
                previousStepResults: buildPreviousStepResults(
                  steps,
                  stepResultsMap,
                  steps.length - 1,
                ),
              }),
            } as TransformItem,
          ]
        : []),
    ],
    [
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
    ],
  );

  const currentItem = toolItems[activeIndex];
  const indicatorIndices = toolItems.map((_, idx) => idx);

  // === VISIBLE CARDS CALCULATION ===
  const visibleCardsData = useMemo(() => {
    const totalCards = toolItems.length;
    const CARD_WIDTH = 180;
    const ARROW_WIDTH = 24;
    const GUTTER = 16;
    const SAFE_MARGIN = 12;
    const available = Math.max(0, containerWidth - SAFE_MARGIN);

    let cardsToShow = 1;
    const maxCandidates = Math.min(totalCards, 12);
    for (let c = 1; c <= maxCandidates; c++) {
      const needed = c * CARD_WIDTH + (c - 1) * (ARROW_WIDTH + GUTTER);
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
    const sepWidth = ARROW_WIDTH + GUTTER;
    const count = Math.max(1, visibleItems.length);
    const innerAvailable = Math.max(
      0,
      containerWidth - SAFE_MARGIN - 2 * sepWidth - (count - 1) * sepWidth,
    );
    const baseCardWidth = Math.floor(innerAvailable / count);
    const widthRemainder = innerAvailable - baseCardWidth * count;

    return {
      visibleItems,
      visibleIndices,
      startIdx,
      endIdx,
      totalCards,
      hiddenLeft: startIdx,
      hiddenRight: totalCards - endIdx,
      sepWidth,
      baseCardWidth,
      widthRemainder,
    };
  }, [toolItems, containerWidth, activeIndex]);

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

  const handleInsertStep = (afterIndex: number) => {
    if (!setSteps) return;
    setPendingInsertIndex(afterIndex);
    setIsAddStepDialogOpen(true);
  };

  const insertStepsAndNavigate = (stepsToInsert: ExecutionStep[]) => {
    if (pendingInsertIndex === null || !setSteps) return;
    const newSteps = [...steps];
    newSteps.splice(pendingInsertIndex, 0, ...stepsToInsert);
    setSteps(newSteps);
    const insertedIndex = pendingInsertIndex;
    setIsAddStepDialogOpen(false);
    setPendingInsertIndex(null);
    setTimeout(() => navigateToIndex(insertedIndex + 1), 100);
  };

  const handleConfirmInsertStep = (stepId: string, instruction: string, systemId?: string) => {
    const selectedSystem = systemId ? systems?.find((s) => s.id === systemId) : undefined;
    const newStep: ExecutionStep = {
      id: stepId,
      systemId: systemId || "",
      apiConfig: {
        id: stepId,
        instruction,
        urlHost: selectedSystem?.urlHost || "",
        urlPath: selectedSystem?.urlPath || "",
        method: "GET" as HttpMethod,
        headers: {},
        queryParams: {},
        body: "",
      },
      executionMode: "DIRECT",
    };
    insertStepsAndNavigate([newStep]);
  };

  const handleConfirmInsertTool = (toolSteps: ExecutionStep[]) => insertStepsAndNavigate(toolSteps);

  const handleConfirmGenerateStep = (step: ExecutionStep) => insertStepsAndNavigate([step]);

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
              onEdit={onInstructionEdit}
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
          <div className="flex items-center gap-0">
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleNavigation("prev")}
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
                    !isPayloadValid
                      ? "bg-amber-500 text-white"
                      : "bg-primary text-primary-foreground",
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
                  style={{ minHeight: "150px" }}
                >
                  {!isHydrated ? (
                    <div className="flex items-center justify-center">
                      <div className="w-48 h-24 bg-muted/20 rounded-md animate-pulse" />
                    </div>
                  ) : (
                    <>
                      {visibleCardsData.visibleItems.length > 0 && (
                        <div
                          style={{
                            flex: `0 0 ${visibleCardsData.sepWidth}px`,
                            width: `${visibleCardsData.sepWidth}px`,
                          }}
                        />
                      )}
                      {visibleCardsData.visibleItems.map((item, idx) => {
                        const globalIdx = visibleCardsData.visibleIndices[idx];
                        const showArrow = idx < visibleCardsData.visibleItems.length - 1;
                        const cardWidth =
                          visibleCardsData.baseCardWidth +
                          (idx < visibleCardsData.widthRemainder ? 1 : 0);
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
                              <MiniStepCard
                                step={item.data}
                                index={globalIdx}
                                isActive={globalIdx === activeIndex}
                                onClick={() => handleCardClick(globalIdx)}
                                stepId={item.type === "step" ? item.data.id : undefined}
                                isPayload={item.type === "payload"}
                                isTransform={item.type === "transform"}
                                isRunningAll={
                                  isExecutingAny && currentExecutingStepIndex === globalIdx - 1
                                }
                                isTesting={
                                  item.type === "step"
                                    ? currentExecutingStepIndex === globalIdx - 1
                                    : item.type === "transform"
                                      ? isRunningTransform || isFixingTransform
                                      : false
                                }
                                isFirstCard={globalIdx === 0}
                                isLastCard={globalIdx === visibleCardsData.totalCards - 1}
                                isPayloadValid={isPayloadValid}
                                payloadData={item.type === "payload" ? computedPayload : undefined}
                                isLoopStep={
                                  globalIdx === activeIndex &&
                                  activeStepItemCount !== null &&
                                  activeStepItemCount > 0
                                }
                              />
                            </div>
                            {showArrow && (
                              <div
                                style={{
                                  flex: `0 0 ${visibleCardsData.sepWidth}px`,
                                  width: `${visibleCardsData.sepWidth}px`,
                                }}
                                className="flex items-center justify-center"
                              >
                                {setSteps ? (
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
                                ) : (
                                  <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                                )}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {visibleCardsData.visibleItems.length > 0 && (
                        <div
                          style={{
                            flex: `0 0 ${visibleCardsData.sepWidth}px`,
                            width: `${visibleCardsData.sepWidth}px`,
                          }}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleNavigation("next")}
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
            {currentItem &&
              (currentItem.type === "payload" ? (
                <PayloadMiniStepCard
                  onFilesUpload={onFilesUpload}
                  onFileRemove={onFileRemove}
                  isProcessingFiles={isProcessingFiles}
                  totalFileSize={totalFileSize}
                  isPayloadValid={isPayloadValid}
                />
              ) : currentItem.type === "transform" ? (
                <FinalTransformMiniStepCard
                  onExecuteTransform={onExecuteTransform}
                  onAbort={isRunningTransform || isFixingTransform ? onAbort : undefined}
                />
              ) : (
                <SpotlightStepCard
                  key={currentItem.data.id}
                  step={currentItem.data}
                  stepIndex={activeIndex - 1}
                  onEdit={onStepEdit}
                  onRemove={currentItem.type === "step" ? handleRemoveStep : undefined}
                  onExecuteStep={onExecuteStep ? () => onExecuteStep(activeIndex - 1) : undefined}
                  onExecuteStepWithLimit={
                    onExecuteStepWithLimit
                      ? (limit) => onExecuteStepWithLimit(activeIndex - 1, limit)
                      : undefined
                  }
                  onAbort={currentExecutingStepIndex === activeIndex - 1 ? onAbort : undefined}
                  isExecuting={currentExecutingStepIndex === activeIndex - 1}
                  showOutputSignal={
                    focusStepId === currentItem.data.id ? showStepOutputSignal : undefined
                  }
                  onConfigEditingChange={setIsConfiguratorEditing}
                  onDataSelectorChange={handleDataSelectorChange}
                  isFirstStep={activeIndex === 1}
                  isPayloadValid={isPayloadValid}
                />
              ))}
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
        stepInput={
          pendingInsertIndex !== null
            ? buildStepInput(computedPayload, steps, stepResultsMap, pendingInsertIndex - 1)
            : undefined
        }
        currentToolId={toolId}
      />
    </div>
  );
}
