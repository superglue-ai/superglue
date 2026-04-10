"use client";

import { ToolCall } from "@superglue/shared";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { Badge } from "@/src/components/ui/badge";
import { Check, X } from "lucide-react";

function parseOutput(tool: ToolCall) {
  if (!tool.output) return null;
  try {
    return typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
  } catch {
    return null;
  }
}

interface EditRoleComponentProps {
  tool: ToolCall;
}

export function EditRoleComponent({ tool }: EditRoleComponentProps) {
  const output = parseOutput(tool);
  const explanation = output?.explanation || tool.input?.explanation;
  const isError = tool.status === "error" || output?.success === false;

  return (
    <ToolCallWrapper tool={tool}>
      <div className="space-y-2">
        {explanation && <p className="text-xs text-muted-foreground">{explanation}</p>}
        {isError && output?.error && <p className="text-xs text-red-500/80">{output.error}</p>}
        {!isError && tool.status === "completed" && (
          <Badge variant="glass" className="text-xs font-normal gap-1">
            <Check className="h-3 w-3 text-foreground/50" /> Applied to draft
          </Badge>
        )}
        {tool.status === "error" && (
          <Badge variant="glass" className="text-xs font-normal gap-1">
            <X className="h-3 w-3 text-foreground/50" /> Failed
          </Badge>
        )}
      </div>
    </ToolCallWrapper>
  );
}
