"use client";

import { ErrorMessage } from "@/src/components/ui/error-message";
import { ToolCall, Tool } from "@superglue/shared";
import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ToolCallToolDisplay } from "./ToolComponentDisplay";
import { ToolCallPendingState } from "./ToolCallPendingState";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { TruncatableInstruction } from "./TruncatableInstruction";

interface RunToolComponentProps {
  tool: ToolCall;
  isPlayground?: boolean;
}

export function RunToolComponent({ tool }: RunToolComponentProps) {
  const [currentConfig, setCurrentConfig] = useState<Tool | null>(null);
  const [runResult, setRunResult] = useState<{
    success: boolean;
    data?: any;
    error?: string;
  } | null>(null);

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
    if (tool.status === "completed" && parsedOutput) {
      setRunResult({
        success: parsedOutput.success,
        data: parsedOutput.data,
        error: parsedOutput.error,
      });
    }
  }, [parsedOutput, tool.status]);

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

        {tool.status === "completed" && isSuccess && currentConfig && (
          <ToolCallToolDisplay
            toolId={currentConfig.id}
            tool={currentConfig}
            payload={tool.input?.payload}
            output={runResult?.success ? runResult.data : undefined}
            showOutput={!!runResult?.success}
            showToolSteps={true}
            showPayload={true}
          />
        )}

        {(tool.status === "error" || (tool.status === "completed" && !isSuccess)) && (
          <div className="space-y-3">
            {(parsedOutput?.config || currentConfig) && (
              <ToolCallToolDisplay
                toolId={(parsedOutput?.config || currentConfig)?.id}
                tool={parsedOutput?.config || currentConfig}
                payload={tool.input?.payload}
                error={parsedOutput?.error || tool.error}
                showOutput={false}
                showToolSteps={true}
                showPayload={true}
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
