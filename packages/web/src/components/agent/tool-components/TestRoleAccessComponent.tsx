"use client";

import { ToolCall } from "@superglue/shared";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { Badge } from "@/src/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

function parseOutput(tool: ToolCall) {
  if (!tool.output) return null;
  try {
    return typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
  } catch {
    return null;
  }
}

export function TestRoleAccessComponent({ tool }: { tool: ToolCall }) {
  const input = typeof tool.input === "string" ? JSON.parse(tool.input || "{}") : tool.input || {};
  const output = parseOutput(tool);

  return (
    <ToolCallWrapper tool={tool} openByDefault>
      <div className="space-y-2">
        {input.expression && (
          <div className="text-xs font-mono bg-muted/40 rounded px-2 py-1.5 border border-border/30">
            {input.expression}
          </div>
        )}

        {output?.error && (
          <Badge variant="glass" className="text-xs font-normal gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            {output.error}
          </Badge>
        )}

        {output && !output.error && (
          <Badge variant="glass" className="text-xs font-normal gap-1.5">
            {output.allowed ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            {output.verdict}
          </Badge>
        )}

        {tool.error && (
          <Badge variant="glass" className="text-xs font-normal gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            {typeof tool.error === "string" ? tool.error : JSON.stringify(tool.error)}
          </Badge>
        )}
      </div>
    </ToolCallWrapper>
  );
}
