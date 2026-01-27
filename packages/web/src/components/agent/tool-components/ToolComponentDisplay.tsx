"use client";

import { JsonCodeEditor } from "@/src/components/editors/JsonCodeEditor";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { SystemIcon } from "@/src/components/ui/system-icon";
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Code,
  Copy,
  Database,
  RotateCcw,
  Save,
} from "lucide-react";
import React, { useMemo, useState } from "react";

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
  const [copied, setCopied] = useState<string | null>(null);

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

  // Compute result display height (max 500px)
  const resultDisplayHeight = useMemo(() => {
    if (!displayOutput || hasParseError) return "300px";
    const resultJson = JSON.stringify(displayOutput, null, 2);
    return `${Math.min(Math.max(resultJson.split("\n").length * 18 + 24, 60), 500)}px`;
  }, [displayOutput, hasParseError]);

  // Get steps from the correct location in the data structure
  // For execute_tool, the tool IS the config, so steps are directly on tool
  const steps = displayTool?.steps || displayTool?.config?.steps || [];

  // Get the effective tool ID - either from props or from the tool object
  const effectiveToolId = toolId || tool?.id || tool?.config?.id;

  const copyToClipboard = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case "GET":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "POST":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "PUT":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "DELETE":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "PATCH":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
    }
  };

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
              <Card className="p-4 w-64 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span className="font-medium text-sm">Payload</span>
                  </div>
                  {payload && (
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(payload, null, 2), "payload")}
                      className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy payload"
                    >
                      {copied === "payload" ? (
                        <div className="w-4 h-4 text-green-500">✓</div>
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {payload
                    ? typeof payload === "string"
                      ? payload
                      : "JSON Object"
                    : "Optional payload - none provided"}
                </div>
              </Card>

              {/* Arrow after payload */}
              <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 self-center" />

              {/* Tool Steps */}
              {steps.map((step, index) => (
                <React.Fragment key={step.id || `step-${index}`}>
                  <Card className="p-4 w-64 flex-shrink-0 relative">
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        {/* System Icon - Left of Step ID */}
                        <SystemIcon
                          system={{ id: step.systemId, urlHost: step.apiConfig?.urlHost }}
                          size={16}
                        />
                        <span className="font-medium text-sm">{step.id || "New Step"}</span>

                        {/* Loop Icon - Right side (if LOOP) */}
                        {step.executionMode === "LOOP" && (
                          <RotateCcw className="w-4 h-4 text-orange-500 ml-auto" />
                        )}
                      </div>
                      {step.apiConfig?.method && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${getMethodColor(step.apiConfig.method)}`}
                        >
                          {step.apiConfig.method}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        <div className="font-medium">System:</div>
                        <div className="truncate">{step.systemId || "Not configured"}</div>
                      </div>
                    </div>
                  </Card>

                  {/* Arrow after each step (except the last one) */}
                  {index < steps.length - 1 && (
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 self-center" />
                  )}
                </React.Fragment>
              ))}

              {/* Arrow before final transform (if there are steps) */}
              {steps.length > 0 && (
                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 self-center" />
              )}

              {/* Final Transform Step - Always show on the right */}
              <Card className="p-4 w-64 flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <Code className="w-4 h-4" />
                  <span className="font-medium text-sm">Final Transform</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {displayTool.finalTransform ? "Transform applied" : "No transform configured"}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Tool Input display */}
      {showPayload && payloadDisplayInfo && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4" />
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
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
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
        <Card className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-sm font-semibold text-red-800 dark:text-red-200">
              Execution Error
            </span>
          </div>
          <div className="text-sm text-red-700 dark:text-red-300">
            {typeof error === "string" ? error : JSON.stringify(error, null, 2)}
          </div>
        </Card>
      )}
    </div>
  );
}
