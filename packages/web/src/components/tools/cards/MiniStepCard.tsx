import { Card } from "@/src/components/ui/card";
import { cn, getIntegrationIcon, getSimpleIcon } from "@/src/lib/general-utils";
import { Integration } from "@superglue/client";
import { FileJson, Globe, Package, RotateCw } from "lucide-react";
import React from "react";

const getStatusInfo = (
  isRunning: boolean,
  isFailed: boolean,
  isCompleted: boolean,
) => {
  if (isRunning)
    return {
      text: "Running",
      color: "text-amber-600 dark:text-amber-400",
      dotColor: "bg-amber-600 dark:bg-amber-400",
      animate: true,
    };
  if (isFailed)
    return {
      text: "Failed",
      color: "text-red-600 dark:text-red-400",
      dotColor: "bg-red-600 dark:bg-red-400",
      animate: false,
    };
  if (isCompleted)
    return {
      text: "Completed",
      color: "text-muted-foreground",
      dotColor: "bg-green-600 dark:bg-green-400",
      animate: false,
    };
  return {
    text: "Pending",
    color: "text-gray-500 dark:text-gray-400",
    dotColor: "bg-gray-500 dark:bg-gray-400",
    animate: false,
  };
};

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
    completedSteps = [],
    failedSteps = [],
    isFirstCard = false,
    isLastCard = false,
    integrations = [],
    hasTransformCompleted = false,
    isPayloadValid = true,
    payloadData,
  }: {
    step: any;
    index: number;
    isActive: boolean;
    onClick: () => void;
    stepId?: string | null;
    isPayload?: boolean;
    isTransform?: boolean;
    isRunningAll?: boolean;
    isTesting?: boolean;
    completedSteps?: string[];
    failedSteps?: string[];
    isFirstCard?: boolean;
    isLastCard?: boolean;
    integrations?: Integration[];
    hasTransformCompleted?: boolean;
    isPayloadValid?: boolean;
    payloadData?: any;
  }) => {
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
              isActive && "ring-2 ring-primary shadow-lg",
              isFirstCard &&
                "rounded-l-2xl bg-gradient-to-br from-primary/5 to-transparent",
              !isPayloadValid &&
                !isActive &&
                "ring-1 ring-amber-500 border-amber-500 shadow-lg shadow-amber-500/20",
            )}
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
                <span className="text-[11px] font-semibold mt-1.5">
                  Tool Input
                </span>
                <span className="text-[9px] text-muted-foreground">
                  Add payload
                </span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {!isPayloadValid ? (
                  <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">
                    Tool Input Required
                  </span>
                ) : (
                  (() => {
                    const isEmptyPayload =
                      !payloadData ||
                      (typeof payloadData === "object" &&
                        Object.keys(payloadData).length === 0) ||
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
      const isCompleted = completedSteps.includes("__final_transform__");
      const isFailed = failedSteps.includes("__final_transform__");
      const isRunning = isTesting || isRunningAll;
      const statusInfo = getStatusInfo(isRunning, isFailed, isCompleted);
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
              isActive && "ring-2 ring-primary shadow-lg",
              isLastCard &&
                !hasTransformCompleted &&
                "rounded-r-2xl bg-gradient-to-bl from-purple-500/5 to-transparent",
            )}
          >
            <div className="h-[88px] flex flex-col items-center justify-between leading-tight">
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="p-2 rounded-full bg-primary/10">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <span className="text-[11px] font-semibold mt-1.5">
                  Tool Result
                </span>
                <span className="text-[9px] text-muted-foreground">
                  Transform
                </span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={cn(
                    "text-[9px] font-medium flex items-center gap-1",
                    statusInfo.color,
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
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
    const isCompleted = stepId ? completedSteps.includes(stepId) : false;
    const isFailed = stepId ? failedSteps.includes(stepId) : false;
    const isRunning = isTesting || (isRunningAll && !!stepId);
    const statusInfo = getStatusInfo(isRunning, isFailed, isCompleted);

    const linkedIntegration = integrations?.find((integration) => {
      if (step.integrationId && integration.id === step.integrationId)
        return true;
      return (
        step.apiConfig?.urlHost &&
        integration.urlHost &&
        step.apiConfig.urlHost.includes(
          integration.urlHost.replace(
            /^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//,
            "",
          ),
        )
      );
    });

    const iconName = linkedIntegration
      ? getIntegrationIcon(linkedIntegration)
      : null;
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
            isActive && "ring-2 ring-primary shadow-lg",
          )}
        >
          <div className="h-[88px] flex flex-col relative">
            <div className="absolute top-0 left-0 flex items-center h-5">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">
                {index}
              </span>
            </div>
            {step?.executionMode === "LOOP" && (
              <div className="absolute top-0 right-0 flex items-center h-5">
                <RotateCw
                  className="h-3 w-3 text-muted-foreground"
                  aria-label="Loop step"
                />
              </div>
            )}
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
                  <span className="text-[9px] text-muted-foreground">
                    {linkedIntegration.id}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={cn(
                    "text-[9px] font-medium flex items-center gap-1",
                    statusInfo.color,
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
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
