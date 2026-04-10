"use client";

import { ErrorMessage } from "@/src/components/ui/error-message";
import { JsonEditor } from "@/src/components/editors/JsonEditor";
import { ToolCall, Tool } from "@superglue/shared";
import { FilePlay, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ToolCallToolDisplay } from "./ToolComponentDisplay";
import { ToolCallPendingState } from "./ToolCallPendingState";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { TruncatableInstruction } from "./TruncatableInstruction";

interface RunToolComponentProps {
  tool: ToolCall;
  isPlayground?: boolean;
}

function toolFromSummary(summary: any): Partial<Tool> {
  return {
    id: summary.id,
    outputTransform: summary.hasOutputTransform ? "true" : undefined,
    steps: (summary.steps || []).map((s: any) => ({
      id: s.id,
      config: { type: s.type, ...(s.systemId ? { systemId: s.systemId } : {}) },
    })),
  };
}

export function RunToolComponent({ tool }: RunToolComponentProps) {
  const [currentConfig, setCurrentConfig] = useState<Tool | null>(null);

  const displayInstruction = tool.input?.instruction;

  const parsedOutput = useMemo(() => {
    if (!tool.output) return null;
    try {
      return typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
    } catch {
      return null;
    }
  }, [tool.output]);

  const isSuccess = parsedOutput?.success === true;
  const isToolRunning = tool.status === "running";
  const isToolPending = tool.status === "pending";

  useEffect(() => {
    if (parsedOutput?.config && (tool.status === "completed" || tool.status === "error")) {
      setCurrentConfig(parsedOutput.config);
    }
  }, [parsedOutput, tool.status]);

  const displayTool =
    currentConfig ?? (parsedOutput?.toolSummary ? toolFromSummary(parsedOutput.toolSummary) : null);

  const resultData = parsedOutput?.data;
  const resultDisplayHeight = useMemo(() => {
    if (!resultData) return "150px";
    const json = JSON.stringify(resultData, null, 2);
    return `${Math.min(Math.max(json.split("\n").length * 18 + 24, 60), 200)}px`;
  }, [resultData]);

  return (
    <ToolCallWrapper tool={tool} openByDefault={true} hideStatusIcon={isToolPending}>
      <div className="space-y-4">
        {isToolPending && (
          <ToolCallPendingState icon={Play} label="Running tool...">
            {tool.input && (
              <pre className="text-xs font-mono text-muted-foreground/60 whitespace-pre-wrap overflow-hidden">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            )}
          </ToolCallPendingState>
        )}

        {isToolRunning && (
          <ToolCallPendingState icon={Play} label="Running tool...">
            {displayInstruction && (
              <TruncatableInstruction
                text={displayInstruction}
                className="text-sm text-muted-foreground/70"
              />
            )}
          </ToolCallPendingState>
        )}

        {tool.status === "completed" && isSuccess && (
          <>
            {displayTool && (
              <ToolCallToolDisplay
                toolId={displayTool.id}
                tool={displayTool as Tool}
                payload={tool.input?.payload}
                showOutput={false}
                showToolSteps={true}
                showPayload={true}
              />
            )}

            {resultData && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FilePlay className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Tool Output</span>
                </div>
                <JsonEditor
                  value={JSON.stringify(resultData, null, 2)}
                  readOnly
                  maxHeight={resultDisplayHeight}
                  tableEnabled
                  defaultView="table"
                />
              </div>
            )}
          </>
        )}

        {(tool.status === "error" || (tool.status === "completed" && !isSuccess)) && (
          <div className="space-y-3">
            {displayTool && (
              <ToolCallToolDisplay
                toolId={displayTool.id}
                tool={displayTool as Tool}
                payload={tool.input?.payload}
                error={parsedOutput?.error || tool.error}
                showOutput={false}
                showToolSteps={true}
                showPayload={true}
              />
            )}
            {!displayTool && (parsedOutput?.error || tool.error) && (
              <ErrorMessage
                title="Execution failed"
                message={
                  typeof (parsedOutput?.error || tool.error) === "string"
                    ? parsedOutput?.error || tool.error
                    : JSON.stringify(parsedOutput?.error || tool.error, null, 2)
                }
              />
            )}
            {parsedOutput?.inputSchema?.required && (
              <div className="p-3 bg-muted/50 rounded border border-border/50">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Required Inputs:
                </div>
                <div className="space-y-1">
                  {parsedOutput.inputSchema.required.map((field: string) => (
                    <div key={field} className="text-xs text-muted-foreground">
                      • <span className="font-mono">{field}</span>
                      {parsedOutput.inputSchema.properties?.[field]?.description && (
                        <span className="text-muted-foreground/70">
                          {" — "}
                          {parsedOutput.inputSchema.properties[field].description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolCallWrapper>
  );
}
