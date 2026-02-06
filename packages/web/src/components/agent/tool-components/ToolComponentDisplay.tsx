"use client";

import { JsonCodeEditor } from "@/src/components/editors/JsonCodeEditor";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { MiniCard } from "@/src/components/ui/mini-card";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { RequestStepConfig, ToolStep, Tool, isRequestConfig } from "@superglue/shared";
import { cn } from "@/src/lib/general-utils";
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  FileJson,
  FilePlay,
  RotateCcw,
  Save,
} from "lucide-react";
import React, { useMemo } from "react";

interface ToolStep {
  id: string;
  systemId: string;
  executionMode: "DIRECT" | "LOOP";
  apiConfig: {
    instruction: string;
    method: string;
    urlHost: string;
    urlPath: string;
  };
}

interface ToolCallToolDisplayProps {
  toolId?: string;
  tool?: {
    id?: string;
    config?: {
      id?: string;
      steps: ToolStep[];
    };
    steps?: ToolStep[]; // Fallback for direct steps
    systemIds?: string[];
    finalTransform?: string;
    instruction?: string;
  };
  payload?: any;
  output?: any; // Can be string (unparsed JSON) or object
  error?: any;
  showOutput?: boolean;
  showToolSteps?: boolean;
  showSaveButton?: boolean;
  onSaveTool?: () => void;
  isSaving?: boolean;
  isRunning?: boolean;
  showSuccessMessage?: boolean;
  hideHeader?: boolean;
  hasOutdatedResults?: boolean;
  showPayload?: boolean;
}

export function ToolCallToolDisplay({
  toolId,
  tool,
  payload,
  output,
  error,
  showOutput = false,
  showToolSteps = true,
  showSaveButton = false,
  onSaveTool,
  isSaving = false,
  isRunning = false,
  showSuccessMessage = false,
  hideHeader = false,
  hasOutdatedResults = false,
  showPayload = false,
}: ToolCallToolDisplayProps) {
  // Parse output if it's a string (unified logic from ExecuteToolToolCall)
  const parsedOutput = useMemo(() => {
    if (!output) return null;

    // If it's already an object, return it
    if (typeof output === "object") {
      return output;
    }

    // If it's a string, try to parse it
    if (typeof output === "string") {
      try {
        const parsed = JSON.parse(output);
        return parsed;
      } catch (error) {
        return { parseError: true, rawOutput: output };
      }
    }

    // If it's something else (like an array), return as-is
    return output;
  }, [output]);

  // Compute payload display height
  const payloadDisplayInfo = useMemo(() => {
    if (!payload || Object.keys(payload).length === 0) return null;
    const payloadJson = JSON.stringify(payload, null, 2);
    const height = `${Math.min(Math.max(payloadJson.split("\n").length * 18 + 24, 60), 300)}px`;
    return { payloadJson, height };
  }, [payload]);

  // Check if we have valid tool data (either from props or parsed output)
  const displayTool = tool || parsedOutput?.config;
  const displayOutput = parsedOutput?.data || parsedOutput;
  const hasParseError = parsedOutput?.parseError;

  // Compute result display height (max 200px - smaller for agent context)
  const resultDisplayHeight = useMemo(() => {
    if (!displayOutput || hasParseError) return "150px";
    const resultJson = JSON.stringify(displayOutput, null, 2);
    return `${Math.min(Math.max(resultJson.split("\n").length * 18 + 24, 60), 200)}px`;
  }, [displayOutput, hasParseError]);

  // Get steps from the correct location in the data structure
  // For execute_tool, the tool IS the config, so steps are directly on tool
  const steps = displayTool?.steps || displayTool?.config?.steps || [];

  // Get the effective tool ID - either from props or from the tool object
  const effectiveToolId = toolId || tool?.id || tool?.config?.id;

  return (
    <div className="space-y-4">
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          <div>
            <div className="text-sm font-medium">Tool Completed Successfully</div>
          </div>
        </div>
      )}

      {/* Tool Info */}
      {effectiveToolId && !hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Tool ID:</span>
            <Badge variant="outline" className="font-mono text-xs">
              {effectiveToolId}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* Save Button */}
            {showSaveButton && onSaveTool && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSaveTool}
                disabled={isSaving}
                className="h-6 bg-amber-500 hover:bg-amber-400 text-black border-amber-500 hover:border-amber-400"
              >
                <Save className="w-4 h-4 mr-1" />
                {isSaving ? "Saving..." : "Save Tool"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Raw Output Display */}
      {hasParseError && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
            <span className="text-sm font-semibold text-foreground">
              Raw Output{" "}
              <span className="text-xs text-muted-foreground font-normal">(invalid JSON)</span>
            </span>
          </div>
          <div className="font-mono bg-muted p-4 rounded-lg border overflow-auto max-h-64">
            <pre className="whitespace-pre-wrap text-xs leading-relaxed">
              {parsedOutput?.rawOutput || "No output available"}
            </pre>
          </div>
        </Card>
      )}

      {/* Tool Steps Gallery */}
      {showToolSteps && displayTool && (
        <div className="space-y-4">
          {/* Tool Steps */}
          <div className="overflow-x-auto">
            <div className="flex items-stretch gap-2 pb-2 min-w-max">
              {/* Payload Step - Always show on the left */}
              <MiniCard isActive={false} onClick={() => {}} width={170} height={125}>
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="p-2 rounded-full bg-primary/10">
                    <FileJson className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-[11px] font-semibold mt-1.5">Tool Input</span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-[9px] font-medium text-muted-foreground">
                    {payload && Object.keys(payload).length > 0 ? "Provided" : "Empty"}
                  </span>
                </div>
              </MiniCard>

              {/* Arrow after payload */}
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 self-center" />

              {/* Tool Steps */}
              {steps.map((step: ToolStep, index: number) => {
                const stepConfig =
                  step.config && isRequestConfig(step.config)
                    ? (step.config as RequestStepConfig)
                    : null;
                const systemId = stepConfig?.systemId;
                return (
                  <React.Fragment key={step.id || `step-${index}`}>
                    <MiniCard isActive={false} onClick={() => {}} width={170} height={125}>
                      <div className="h-full flex flex-col relative w-full">
                        <div className="absolute top-0 left-0 flex items-center h-4">
                          <span className="text-[9px] px-1 py-0.5 rounded font-medium bg-primary/10 text-primary">
                            {index + 1}
                          </span>
                        </div>
                        {step.dataSelector && (
                          <div className="absolute top-0 right-0 flex items-center h-4">
                            <RotateCcw className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                          </div>
                        )}
                        <div className="flex-1 flex flex-col items-center justify-center">
                          <div className="p-2 rounded-full bg-white dark:bg-gray-100 border border-border/50">
                            <SystemIcon system={{ id: systemId }} size={18} />
                          </div>
                          {systemId && (
                            <span
                              className="text-[9px] text-muted-foreground mt-1 truncate max-w-[140px]"
                              title={systemId}
                            >
                              {systemId}
                            </span>
                          )}
                          <span
                            className="text-[11px] font-semibold mt-1 truncate max-w-[140px]"
                            title={step.id || `Step ${index + 1}`}
                          >
                            {step.id || `Step ${index + 1}`}
                          </span>
                        </div>
                      </div>
                    </MiniCard>

                    {index < steps.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 self-center" />
                    )}
                  </React.Fragment>
                );
              })}

              {/* Arrow before final transform (if there are steps) */}
              {steps.length > 0 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 self-center" />
              )}

              {/* Final Transform Step - Always show on the right */}
              <MiniCard isActive={false} onClick={() => {}} width={170} height={125}>
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="p-2 rounded-full bg-primary/10">
                    <FilePlay className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-[11px] font-semibold mt-1.5">Tool Result</span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-[9px] font-medium text-muted-foreground">
                    {displayTool.outputTransform ? "Transform applied" : "No transform"}
                  </span>
                </div>
              </MiniCard>
            </div>
          </div>
        </div>
      )}

      {/* Tool Input display */}
      {showPayload && payloadDisplayInfo && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileJson className="w-4 h-4" />
            <span className="font-medium text-sm">Tool Input</span>
          </div>
          <JsonCodeEditor
            value={payloadDisplayInfo.payloadJson}
            readOnly
            minHeight={payloadDisplayInfo.height}
            maxHeight={payloadDisplayInfo.height}
          />
        </div>
      )}

      {/* Output Card - Always show when showOutput is true */}
      {showOutput && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FilePlay className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-sm">Execution Results</span>
            {hasOutdatedResults && (
              <span className="text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                outdated
              </span>
            )}
          </div>
          {displayOutput && !hasParseError ? (
            <JsonCodeEditor
              value={JSON.stringify(displayOutput, null, 2)}
              readOnly
              maxHeight={resultDisplayHeight}
            />
          ) : (
            <div className="text-xs text-muted-foreground">No output data available yet</div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="border border-red-200/40 dark:border-red-700/40 p-3 rounded-md flex items-start gap-2 overflow-hidden">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
              Execution Error
            </div>
            <div className="text-sm text-red-800 dark:text-red-200 break-words max-h-40 overflow-y-auto">
              {typeof error === "string" ? error : JSON.stringify(error, null, 2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
