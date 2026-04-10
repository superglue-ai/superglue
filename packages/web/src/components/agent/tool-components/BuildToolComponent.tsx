"use client";

import { ErrorMessage } from "@/src/components/ui/error-message";
import { safeStringify, Tool, ToolCall } from "@superglue/shared";
import { Hammer } from "lucide-react";
import { useMemo } from "react";
import { ToolCallToolDisplay } from "./ToolComponentDisplay";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { ToolCallPendingState } from "./ToolCallPendingState";
import { TruncatableInstruction } from "./TruncatableInstruction";

interface BuildToolComponentProps {
  tool: ToolCall;
}

export function BuildToolComponent({ tool }: BuildToolComponentProps) {
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
  const currentConfig: Tool | null = parsedOutput?.config || null;

  return (
    <ToolCallWrapper tool={tool} openByDefault={true} hideStatusIcon={isToolPending}>
      <div className="space-y-4">
        {isToolPending && (
          <ToolCallPendingState
            icon={Hammer}
            label={tool.input ? "Building tool..." : "Building tool..."}
          >
            {tool.input && (
              <pre className="text-xs font-mono text-muted-foreground/60 whitespace-pre-wrap overflow-hidden">
                {safeStringify(tool.input, 2)}
              </pre>
            )}
          </ToolCallPendingState>
        )}

        {isToolRunning && (
          <ToolCallPendingState icon={Hammer} label="Building tool...">
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
            {parsedOutput?.saveError ? (
              <ErrorMessage
                title="Tool built, but auto-save failed"
                message={parsedOutput.saveError}
                truncateAt={300}
              />
            ) : parsedOutput?.persistence !== "saved" ? (
              <div className="text-xs text-muted-foreground">
                Draft only. Tool is not saved yet.
              </div>
            ) : null}

            {currentConfig && (
              <ToolCallToolDisplay
                toolId={currentConfig.id}
                tool={currentConfig}
                payload={tool.input?.payload}
                output={undefined}
                showOutput={false}
                showToolSteps={true}
              />
            )}
          </>
        )}

        {(tool.status === "error" || (tool.status === "completed" && !isSuccess)) && (
          <div className="space-y-3">
            <ErrorMessage
              title="Build encountered an issue"
              message={parsedOutput?.error || tool.error || "Unknown error"}
              truncateAt={300}
            />
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
