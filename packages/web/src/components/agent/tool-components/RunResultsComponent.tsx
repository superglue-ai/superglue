"use client";

import { ToolCall, Run } from "@superglue/shared";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { CopyButton } from "@/src/components/tools/shared/CopyButton";
import { ErrorMessage } from "@/src/components/ui/error-message";

interface RunResultsComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
}

interface GetRunsOutput {
  success: boolean;
  toolId?: string;
  total?: number;
  runs?: Run[];
  note?: string;
  error?: string;
}

export function RunResultsComponent({ tool, onInputChange }: RunResultsComponentProps) {
  const [activeTab, setActiveTab] = useState<"input" | "output">("output");

  // Parse output
  let output: GetRunsOutput | null = null;
  try {
    if (typeof tool.output === "string") {
      output = JSON.parse(tool.output);
    } else if (tool.output) {
      output = tool.output as GetRunsOutput;
    }
  } catch {
    // Not valid JSON - will show fallback view
  }

  // Auto-switch to output tab when completed
  useEffect(() => {
    if ((tool.status === "completed" || tool.status === "error") && tool.output) {
      setActiveTab("output");
    }
  }, [tool.status, tool.output]);

  // If still loading or no valid output, show default view
  if (tool.status === "pending" || tool.status === "running") {
    return (
      <ToolCallWrapper tool={tool}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching runs...
        </div>
      </ToolCallWrapper>
    );
  }

  if (!output || !output.success || !output.runs) {
    // Fall back to default JSON view
    return (
      <ToolCallWrapper tool={tool}>
        <div className="space-y-4">
          {tool.input && (
            <div>
              <div className="text-sm font-medium mb-2">Input</div>
              <div className="bg-muted/50 p-3 rounded-md">
                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-64">
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
              </div>
            </div>
          )}
          {tool.output && (
            <div>
              <div className="text-sm font-medium mb-2">Output</div>
              <div className="bg-muted/50 p-3 rounded-md">
                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-64">
                  {typeof tool.output === "string"
                    ? tool.output
                    : JSON.stringify(tool.output, null, 2)}
                </pre>
              </div>
            </div>
          )}
          {tool.error && (
            <ErrorMessage
              message={
                typeof tool.error === "string" ? tool.error : JSON.stringify(tool.error, null, 2)
              }
            />
          )}
        </div>
      </ToolCallWrapper>
    );
  }

  const runs = output.runs;

  return (
    <ToolCallWrapper tool={tool} openByDefault={true}>
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-border">
          {tool.input && (
            <button
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors relative -mb-[2px] ${
                activeTab === "input"
                  ? "text-foreground border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/50"
              }`}
              onClick={() => setActiveTab("input")}
            >
              Filters
            </button>
          )}
          <button
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors relative -mb-[2px] ${
              activeTab === "output"
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/50"
            }`}
            onClick={() => setActiveTab("output")}
          >
            Results ({runs.length} of {output.total || runs.length})
          </button>
        </div>

        {/* Input tab */}
        {activeTab === "input" && tool.input && (
          <div className="bg-muted/50 p-3 rounded-md relative">
            <CopyButton getData={() => tool.input} className="absolute top-2 right-2" />
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-32 pr-8">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
        )}

        {/* Output tab - Runs */}
        {activeTab === "output" && (
          <div className="bg-muted/50 p-3 rounded-md">
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-96">
              {JSON.stringify(runs, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}
