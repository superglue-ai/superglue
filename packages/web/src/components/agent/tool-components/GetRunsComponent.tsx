"use client";

import { RunsList } from "@/src/components/runs/RunsList";
import { ToolCall } from "@superglue/shared";
import { Loader2 } from "lucide-react";
import { ToolCallWrapper } from "./ToolComponentWrapper";

interface GetRunsComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
}

export function GetRunsComponent({ tool, onInputChange }: GetRunsComponentProps) {
  const isLoading = tool.status === "pending" || tool.status === "running";
  const toolId = tool.input?.toolId || "";

  let output: any = null;
  try {
    output = typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
  } catch {
    output = null;
  }

  // Add toolId to each run for display
  const runs = (output?.runs || []).map((run: any) => ({
    ...run,
    toolId: run.toolId || toolId,
  }));
  const total = output?.total || 0;

  return (
    <ToolCallWrapper tool={tool}>
      <div className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Fetching runs...</span>
          </div>
        )}

        {tool.status === "completed" && (
          <>
            {runs.length > 0 && (
              <div className="text-xs text-muted-foreground">{total} total runs</div>
            )}
            <RunsList runs={runs} emptyMessage="No runs found for this tool." />
          </>
        )}

        {tool.error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
            {typeof tool.error === "string" ? tool.error : JSON.stringify(tool.error, null, 2)}
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}
