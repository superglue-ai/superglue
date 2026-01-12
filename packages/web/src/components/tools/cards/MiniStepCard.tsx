import { Card } from "@/src/components/ui/card";
import { cn, getIntegrationIcon, getSimpleIcon } from "@/src/lib/general-utils";
import { FileJson, FilePlay, Globe, OctagonAlert, RotateCw } from "lucide-react";
import React from "react";
import { useToolConfig, useExecution } from "../context";

const ACTIVE_CARD_STYLE = "ring-1 shadow-lg" as const;
const ACTIVE_CARD_INLINE_STYLE = {
  borderColor: "#FFA500",
  boxShadow:
    "0 10px 15px -3px rgba(255, 165, 0, 0.1), 0 4px 6px -4px rgba(255, 165, 0, 0.1), 0 0 0 1px #FFA500",
};

const RUNNING_STATUS = {
  text: "Running",
  color: "text-amber-600 dark:text-amber-400",
  dotColor: "bg-amber-600 dark:bg-amber-400",
  animate: true,
} as const;

interface MiniStepCardProps {
  step: any;
  index: number;
  isActive: boolean;
  onClick: () => void;
  stepId?: string | null;
  isPayload?: boolean;
  isTransform?: boolean;
  isRunningAll?: boolean;
  isTesting?: boolean;
  isFirstCard?: boolean;
  isLastCard?: boolean;
  hasTransformCompleted?: boolean;
  isPayloadValid?: boolean;
  payloadData?: any;
  isLoopStep?: boolean;
}

export const MiniStepCard = React.memo(
  ({
    step,
    index,
    isActive,
    onClick,
    stepId,
    isPayload = false,
    isTransform = false,
    isRunningAll = false,
    isTesting = false,
    isFirstCard = false,
    isLastCard = false,
    hasTransformCompleted,
    isPayloadValid = true,
    payloadData,
    isLoopStep = false,
  }: MiniStepCardProps) => {
    const { integrations } = useToolConfig();
    const { transformStatus, getStepStatusInfo } = useExecution();

    const isTransformCompleted = transformStatus === "completed";
    if (isTransform && hasTransformCompleted === undefined) {
      hasTransformCompleted = isTransformCompleted;
    }
    if (isPayload) {
      return (
        <div
          className={cn(
            "cursor-pointer transition-all duration-300 ease-out transform flex items-center",
            "opacity-90 hover:opacity-100 hover:scale-[1.01]",
          )}
          onClick={onClick}
          style={{ height: "100%" }}
        >
          <Card
            className={cn(
              "w-[180px] h-[110px] flex-shrink-0",
              isActive ? "pt-3 px-3 pb-3" : "pt-3 px-3 pb-[18px]",
              isActive && ACTIVE_CARD_STYLE,
              isFirstCard && "rounded-l-2xl bg-gradient-to-br from-primary/5 to-transparent",
            )}
            style={isActive ? ACTIVE_CARD_INLINE_STYLE : undefined}
          >
            <div className="h-[88px] flex flex-col items-center justify-between leading-tight">
              <div className="flex-1 flex flex-col items-center justify-center">
                <div
                  className={cn(
                    "p-2 rounded-full",
                    !isPayloadValid ? "bg-amber-500/20" : "bg-primary/10",
                  )}
                >
                  {!isPayloadValid ? (
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
                <span className="text-[11px] font-semibold mt-1.5">Tool Input</span>
                <span className="text-[9px] text-muted-foreground">Add payload</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {!isPayloadValid ? (
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse" />
                    Input Required
                  </span>
                ) : (
                  (() => {
                    const isEmptyPayload =
                      !payloadData ||
                      (typeof payloadData === "object" && Object.keys(payloadData).length === 0) ||
                      (typeof payloadData === "string" &&
                        (!payloadData.trim() || payloadData.trim() === "{}"));

                    if (isEmptyPayload) {
                      return (
                        <span className="text-[9px] font-medium text-muted-foreground">
                          No Input
                        </span>
                      );
                    } else {
                      return (
                        <span className="text-[9px] font-medium text-muted-foreground">
                          Input Provided
                        </span>
                      );
                    }
                  })()
                )}
              </div>
            </div>
          </Card>
        </div>
      );
    }
    if (isTransform) {
      const statusInfo = getStepStatusInfo("__final_transform__");
      return (
        <div
          className={cn(
            "cursor-pointer transition-all duration-300 ease-out transform",
            "opacity-90 hover:opacity-100 hover:scale-[1.01]",
          )}
          onClick={onClick}
          style={{ height: "100%" }}
        >
          <Card
            className={cn(
              "w-[180px] h-[110px] flex-shrink-0",
              isActive ? "pt-3 px-3 pb-3" : "pt-3 px-3 pb-[18px]",
              isActive && ACTIVE_CARD_STYLE,
              isLastCard &&
                !hasTransformCompleted &&
                "rounded-r-2xl bg-gradient-to-bl from-purple-500/5 to-transparent",
            )}
            style={isActive ? ACTIVE_CARD_INLINE_STYLE : undefined}
          >
            <div className="h-[88px] flex flex-col items-center justify-between leading-tight">
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="p-2 rounded-full bg-primary/10">
                  <FilePlay className="h-4 w-4 text-primary" />
                </div>
                <span className="text-[11px] font-semibold mt-1.5">Tool Result</span>
                <span className="text-[9px] text-muted-foreground">Transform</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={cn(
                    "text-[10px] font-semibold flex items-center gap-1.5",
                    statusInfo.color,
                  )}
                >
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      statusInfo.dotColor,
                      statusInfo.animate && "animate-pulse",
                    )}
                  />
                  {statusInfo.text}
                </span>
              </div>
            </div>
          </Card>
        </div>
      );
    }
    const isRunning = isTesting || (isRunningAll && !!stepId);
    const baseStatusInfo = stepId
      ? getStepStatusInfo(stepId)
      : {
          text: "Pending",
          color: "text-gray-500 dark:text-gray-400",
          dotColor: "bg-gray-500 dark:bg-gray-400",
          animate: false,
        };
    const statusInfo = isRunning ? RUNNING_STATUS : baseStatusInfo;

    const linkedIntegration =
      step.integrationId && integrations
        ? integrations.find((integration) => integration.id === step.integrationId)
        : undefined;

    const iconName = linkedIntegration ? getIntegrationIcon(linkedIntegration) : null;
    const simpleIcon = iconName ? getSimpleIcon(iconName) : null;

    return (
      <div
        className={cn(
          "cursor-pointer transition-all duration-300 ease-out transform",
          "opacity-90 hover:opacity-100 hover:scale-[1.01]",
        )}
        onClick={onClick}
      >
        <Card
          className={cn(
            "w-[180px] h-[110px] flex-shrink-0",
            isActive ? "pt-3 px-3 pb-3" : "pt-3 px-3 pb-[18px]",
            isActive && ACTIVE_CARD_STYLE,
          )}
          style={isActive ? ACTIVE_CARD_INLINE_STYLE : undefined}
        >
          <div className="h-[88px] flex flex-col relative">
            <div className="absolute top-0 left-0 flex items-center h-5">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">
                {index}
              </span>
            </div>
            <div className="absolute top-0 right-0 flex items-center gap-1 h-5">
              {step?.modify === true && (
                <OctagonAlert
                  className="h-4 w-4 text-amber-500 dark:text-amber-400"
                  aria-label="Modifies data"
                />
              )}
              {isLoopStep && !(step?.modify === true) && (
                <RotateCw
                  className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                  aria-label="Loop step"
                />
              )}
            </div>
            <div className="flex-1 flex flex-col items-center justify-between leading-tight">
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="p-2 rounded-full bg-white dark:bg-gray-100 border border-border/50">
                  {simpleIcon ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill={`#${simpleIcon.hex}`}
                      className="flex-shrink-0"
                    >
                      <path d={simpleIcon.path} />
                    </svg>
                  ) : (
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <span
                  className="text-[11px] font-semibold mt-1.5 truncate max-w-[140px]"
                  title={step.id || `Step ${index}`}
                >
                  {step.id || `Step ${index}`}
                </span>
                {linkedIntegration && (
                  <span className="text-[9px] text-muted-foreground">{linkedIntegration.id}</span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={cn(
                    "text-[10px] font-semibold flex items-center gap-1.5",
                    statusInfo.color,
                  )}
                >
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      statusInfo.dotColor,
                      statusInfo.animate && "animate-pulse",
                    )}
                  />
                  {statusInfo.text}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  },
);
