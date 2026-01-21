"use client";

import { ToolCall } from "@superglue/shared";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useMemo } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface SaveToolComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
}

export function SaveToolComponent({ tool }: SaveToolComponentProps) {
  const parsedOutput = useMemo(() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
    } catch {
      return null;
    }
  }, [tool.output]);

  const isSuccess = parsedOutput?.success === true;

  return (
    <ToolCallWrapper tool={tool}>
      <div className="space-y-4">
        {/* Saving indicator */}
        {tool.status === "running" && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <div>
              <div className="font-medium text-blue-800 dark:text-blue-200">Saving Tool</div>
              <div className="text-sm text-blue-600 dark:text-blue-400">
                Persisting to database...
              </div>
            </div>
          </div>
        )}

        {/* Success state */}
        {tool.status === "completed" && isSuccess && (
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm text-muted-foreground">
              Tool saved successfully
              {parsedOutput?.toolId && (
                <span className="font-mono ml-1">({parsedOutput.toolId})</span>
              )}
            </span>
          </div>
        )}

        {/* Error state */}
        {(tool.status === "error" || (tool.status === "completed" && !isSuccess)) && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-800 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-red-800 dark:text-red-200">Save Failed</div>
              <div className="text-sm text-red-600 dark:text-red-400">
                {parsedOutput?.error || tool.error || "Unknown error"}
              </div>
              {parsedOutput?.suggestion && (
                <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                  {parsedOutput.suggestion}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}
