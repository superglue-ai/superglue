import { Card } from "@/src/components/ui/card";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { cn } from "@/src/lib/general-utils";
import { ExecutionStep } from "@superglue/shared";
import { FileJson, FilePlay, Globe, OctagonAlert, RotateCw, Zap } from "lucide-react";
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

export type CardType = "payload" | "step" | "transform" | "trigger";

interface BaseCardProps {
  index: number;
  isActive: boolean;
  onClick: () => void;
  isFirstCard?: boolean;
  isLastCard?: boolean;
}

interface PayloadCardProps extends BaseCardProps {
  type: "payload";
  isPayloadValid?: boolean;
  payloadData?: any;
}

interface StepCardProps extends BaseCardProps {
  type: "step";
  step: ExecutionStep;
  stepNumber: number;
  isRunning?: boolean;
  isLoopStep?: boolean;
}

interface TransformCardProps extends BaseCardProps {
  type: "transform";
  isRunning?: boolean;
}

interface TriggerCardProps extends BaseCardProps {
  type: "trigger";
}

export type MiniStepCardProps =
  | PayloadCardProps
  | StepCardProps
  | TransformCardProps
  | TriggerCardProps;

export const MiniStepCard = React.memo((props: MiniStepCardProps) => {
  const { type, index, isActive, onClick, isFirstCard = false, isLastCard = false } = props;
  const { systems } = useToolConfig();
  const { transformStatus, getStepStatusInfo } = useExecution();

  const cardWrapper = (children: React.ReactNode) => (
    <div
      className={cn(
        "cursor-pointer transition-all duration-300 ease-out transform flex items-center",
        "opacity-90 hover:opacity-100 hover:scale-[1.01]",
      )}
      onClick={onClick}
      style={{ height: "100%" }}
    >
      {children}
    </div>
  );

  // Trigger - just icon and text, no card
  if (type === "trigger") {
    return (
      <div
        className={cn(
          "cursor-pointer transition-all duration-300 ease-out transform flex flex-col items-center justify-center",
          "h-[100px] group",
        )}
        onClick={onClick}
      >
        <button
          className={cn(
            "relative flex items-center justify-center h-8 w-8 rounded-full border transition-colors",
            isActive
              ? "border-transparent"
              : "border-muted-foreground/30 group-hover:border-primary/50 group-hover:bg-primary/10",
          )}
          style={isActive ? ACTIVE_CARD_INLINE_STYLE : undefined}
          title="Triggers"
        >
          <Zap
            className={cn(
              "h-4 w-4 absolute transition-colors",
              isActive ? "text-[#FFA500]" : "text-muted-foreground group-hover:text-primary",
            )}
          />
        </button>
      </div>
    );
  }

  // Payload card
  if (type === "payload") {
    const { isPayloadValid = true, payloadData } = props;
    return cardWrapper(
      <Card
        className={cn(
          "w-[150px] h-[100px] flex-shrink-0",
          isActive ? "pt-2 px-2 pb-2" : "pt-2 px-2 pb-[14px]",
          isActive && ACTIVE_CARD_STYLE,
          isFirstCard && "rounded-l-2xl bg-gradient-to-br from-primary/5 to-transparent",
        )}
        style={isActive ? ACTIVE_CARD_INLINE_STYLE : undefined}
      >
        <div className="h-[80px] flex flex-col items-center justify-between leading-tight">
          <div className="flex-1 flex flex-col items-center justify-center">
            <div
              className={cn(
                "p-1.5 rounded-full",
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
            <span className="text-[10px] font-semibold mt-1">Test Input</span>
          </div>
          <div className="flex items-center gap-1">
            {!isPayloadValid ? (
              <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse" />
                Required
              </span>
            ) : (
              (() => {
                const isEmptyPayload =
                  !payloadData ||
                  (typeof payloadData === "object" && Object.keys(payloadData).length === 0) ||
                  (typeof payloadData === "string" &&
                    (!payloadData.trim() || payloadData.trim() === "{}"));

                return (
                  <span className="text-[9px] font-medium text-muted-foreground">
                    {isEmptyPayload ? "Empty" : "Provided"}
                  </span>
                );
              })()
            )}
          </div>
        </div>
      </Card>,
    );
  }

  // Transform card
  if (type === "transform") {
    const { isRunning = false } = props;
    const hasTransformCompleted = transformStatus === "completed";
    const baseStatusInfo = getStepStatusInfo("__final_transform__");
    const statusInfo = isRunning ? RUNNING_STATUS : baseStatusInfo;

    return cardWrapper(
      <Card
        className={cn(
          "w-[150px] h-[100px] flex-shrink-0",
          isActive ? "pt-2 px-2 pb-2" : "pt-2 px-2 pb-[14px]",
          isActive && ACTIVE_CARD_STYLE,
          isLastCard &&
            !hasTransformCompleted &&
            "rounded-r-2xl bg-gradient-to-bl from-purple-500/5 to-transparent",
        )}
        style={isActive ? ACTIVE_CARD_INLINE_STYLE : undefined}
      >
        <div className="h-[80px] flex flex-col items-center justify-between leading-tight">
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="p-1.5 rounded-full bg-primary/10">
              <FilePlay className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[10px] font-semibold mt-1">Result</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={cn("text-[9px] font-semibold flex items-center gap-1", statusInfo.color)}
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
      </Card>,
    );
  }

  // Step card (type === "step")
  const { step, stepNumber, isRunning = false, isLoopStep = false } = props;
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
    step.systemId && systems ? systems.find((sys) => sys.id === step.systemId) : undefined;

  return cardWrapper(
    <Card
      className={cn(
        "w-[150px] h-[100px] flex-shrink-0",
        isActive ? "pt-2 px-2 pb-2" : "pt-2 px-2 pb-[14px]",
        isActive && ACTIVE_CARD_STYLE,
      )}
      style={isActive ? ACTIVE_CARD_INLINE_STYLE : undefined}
    >
      <div className="h-[80px] flex flex-col relative">
        <div className="absolute top-0 left-0 flex items-center h-4">
          <span className="text-[9px] px-1 py-0.5 rounded font-medium bg-primary/10 text-primary">
            {stepNumber + 1}
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
        <div className="flex-1 flex flex-col items-center justify-between leading-tight">
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="p-1.5 rounded-full bg-white dark:bg-gray-100 border border-border/50">
              {linkedSystem ? (
                <SystemIcon system={linkedSystem} size={14} />
              ) : (
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <span
              className="text-[10px] font-semibold mt-1 truncate max-w-[120px]"
              title={step.id || `Step ${index}`}
            >
              {step.id || `Step ${index}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={cn("text-[9px] font-semibold flex items-center gap-1", statusInfo.color)}
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
    </Card>,
  );
});
