"use client";

import { useSystems } from "@/src/app/systems-context";
import { ToolCall } from "@superglue/shared";
import { AlertCircle, CheckCircle, Edit3 } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface ModifySystemComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
}

interface ModifySystemInput {
  id: string;
  [key: string]: any; // Other fields that are being modified
}

interface ModifySystemOutput {
  success: boolean;
  note?: string;
  system: {
    id: string;
    [key: string]: any;
  };
}

function ModifySystemComponentImpl({ tool, onInputChange }: ModifySystemComponentProps) {
  const { refreshSystems } = useSystems();
  const hasRefreshedRef = useRef(false);

  // Parse input and output
  const input = (() => {
    if (!tool.input) return null;
    try {
      return typeof tool.input === "string"
        ? JSON.parse(tool.input)
        : (tool.input as ModifySystemInput);
    } catch {
      return null;
    }
  })();

  const output = (() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string"
        ? JSON.parse(tool.output)
        : (tool.output as ModifySystemOutput);
    } catch {
      return null;
    }
  })();

  const isCompleted = tool.status === "completed" && output?.success;
  const isToolInProgress = tool.status === "running" || tool.status === "pending";
  const hasError = tool.status === "error" || (output && !output.success);

  // Refresh systems when modification is complete
  useEffect(() => {
    if (isCompleted && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      refreshSystems();
    }
  }, [isCompleted, refreshSystems]);

  // Extract the changes from input (exclude the id field)
  const changes = useMemo(() => {
    if (!input) return [];
    return Object.entries(input)
      .filter(([key]) => key !== "id")
      .map(([key, value]) => ({ key, value }));
  }, [input]);

  if (!input) {
    return (
      <ToolCallWrapper tool={tool}>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
            <div className="w-2 h-2 bg-amber-600 dark:bg-amber-400 rounded-full" />
          </div>
          <div className="text-sm text-muted-foreground">No input data available</div>
        </div>
      </ToolCallWrapper>
    );
  }

  return (
    <ToolCallWrapper tool={tool} openByDefault={true}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {isCompleted ? (
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : hasError ? (
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          ) : isToolInProgress ? (
            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <div className="w-2 h-2 bg-amber-600 dark:bg-amber-400 rounded-full" />
            </div>
          )}
          <div>
            <div className="text-sm font-medium">
              {isCompleted
                ? "Updated System successfully"
                : hasError
                  ? "Update Failed"
                  : isToolInProgress
                    ? "Updating System"
                    : "System Update"}
            </div>
            <div className="text-lg font-semibold flex items-center gap-2">
              <span className="text-xs bg-muted-foreground/10 text-muted-foreground px-2 py-1 rounded">
                System ID
              </span>
              {input.id}
            </div>
          </div>
        </div>

        {/* Changes Section */}
        <div
          className={`bg-background border rounded-lg p-4 ${
            hasError
              ? "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10"
              : isToolInProgress
                ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10"
                : "border-border"
          }`}
        >
          {/* Status indicator */}
          {(isToolInProgress || hasError) && (
            <div
              className={`mb-3 text-xs px-2 py-1 rounded ${
                hasError
                  ? "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30"
                  : "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30"
              }`}
            >
              {hasError
                ? "Update failed - showing requested changes"
                : "Updating system - showing requested changes"}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {isCompleted ? "Changes made:" : "Changes to be made:"}
              </span>
            </div>

            {changes.length > 0 ? (
              <div className="space-y-2">
                {changes.map((change, index) => (
                  <div key={index} className="flex items-start gap-3 p-2 bg-muted/30 rounded">
                    <div className="text-xs bg-muted-foreground/20 text-foreground px-2 py-1 rounded whitespace-nowrap flex-shrink-0">
                      {change.key}
                    </div>
                    <div className="text-sm font-mono bg-muted/50 px-2 py-1 rounded min-w-0 flex-1">
                      <span className="break-words">
                        {typeof change.value === "string"
                          ? `"${change.value}"`
                          : JSON.stringify(change.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">No changes specified</div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {hasError && tool.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="text-sm text-red-800 dark:text-red-200">
              {typeof tool.error === "string" ? tool.error : "Update failed"}
            </div>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const ModifySystemComponent = memo(ModifySystemComponentImpl);
