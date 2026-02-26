"use client";

import { useTools } from "@/src/app/tools-context";
import { SaveToolDialog } from "@/src/components/tools/dialogs/SaveToolDialog";
import { Button } from "@/src/components/ui/button";
import { ErrorMessage } from "@/src/components/ui/error-message";
import { UserAction } from "@/src/lib/agent/agent-types";
import { Tool, ToolCall } from "@superglue/shared";
import { ChevronDown, Hammer, Play, Save, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { JsonCodeEditor } from "../../editors/JsonCodeEditor";
import { DeployButton } from "../../tools/deploy/DeployButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../../ui/dropdown-menu";
import { ToolCallToolDisplay } from "./ToolComponentDisplay";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { ToolCallPendingState } from "./ToolCallPendingState";
import { TruncatableInstruction } from "./TruncatableInstruction";
import { useToolExecution } from "./hooks/use-tool-execution";

interface BuildToolComponentProps {
  tool: ToolCall;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  bufferAction?: (action: UserAction) => void;
  isPlayground?: boolean;
  filePayloads?: Record<string, any>;
}

export function BuildToolComponent({
  tool,
  sendAgentRequest,
  bufferAction,
  isPlayground = false,
  filePayloads,
}: BuildToolComponentProps) {
  const { refreshTools } = useTools();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<Tool | null>(null);
  const [toolSaved, setToolSaved] = useState(false);
  const [editablePayload, setEditablePayload] = useState<string>("");
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const { isRunning, runResult, manualRunLogs, executeToolConfig, handleStopExecution } =
    useToolExecution({
      tool,
      editablePayload,
      filePayloads,
      bufferAction,
    });

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

  useEffect(() => {
    if (tool.status === "completed" || tool.status === "awaiting_confirmation") {
      const initialPayload = tool.input?.payload || {};
      setEditablePayload(JSON.stringify(initialPayload, null, 2));
    }
  }, [tool.status, tool.input?.payload]);

  const handleRunTool = useCallback(() => {
    if (!currentConfig) return;
    executeToolConfig({
      toolConfig: currentConfig,
      toolNameForFeedback: currentConfig?.id || "draft",
      toolIdForFeedback: currentConfig?.id,
      onFailure: (result) => {
        if (!sendAgentRequest) return;
        sendAgentRequest(undefined, {
          userActions: [
            {
              type: "tool_event",
              toolCallId: tool.id,
              toolName: "build_tool",
              event: "manual_run_failure",
              payload: { error: result.error, toolId: currentConfig?.id },
            },
          ],
        });
      },
    });
  }, [currentConfig, executeToolConfig, sendAgentRequest, tool.id]);

  const handleToolSaved = (savedTool: any) => {
    setCurrentConfig(savedTool);
    setToolSaved(true);
    refreshTools();
    bufferAction?.({
      type: "tool_event",
      toolCallId: tool.id,
      toolName: "build_tool",
      event: "manual_save_success",
      payload: { toolId: savedTool?.id },
    });
  };

  const statusOverride = (() => {
    if (tool.status !== "completed") return null;
    if (isRunning) return "running" as const;
    return null;
  })();

  return (
    <ToolCallWrapper
      tool={tool}
      openByDefault={true}
      hideStatusIcon={isToolPending}
      statusOverride={statusOverride}
      manualRunLogs={manualRunLogs}
    >
      <div className="space-y-4">
        {isToolPending && (
          <ToolCallPendingState
            icon={Hammer}
            label={tool.input ? "Building tool..." : "Building tool..."}
          >
            {tool.input && (
              <pre className="text-xs font-mono text-muted-foreground/60 whitespace-pre-wrap overflow-hidden">
                {JSON.stringify(tool.input, null, 2)}
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
            {currentConfig && (
              <ToolCallToolDisplay
                toolId={currentConfig.id}
                tool={currentConfig}
                payload={tool.input?.payload}
                output={runResult?.success ? runResult.data : undefined}
                showOutput={!!runResult?.success}
                showToolSteps={true}
              />
            )}

            {runResult && !runResult.success && runResult.error && (
              <ErrorMessage
                title="Test run returned an error"
                message={runResult.error}
                truncateAt={300}
              />
            )}

            {currentConfig && !isPlayground && (
              <div className="flex gap-2 flex-wrap">
                {isRunning ? (
                  <Button
                    variant="glass"
                    onClick={handleStopExecution}
                    className="h-9 px-3 text-sm font-medium"
                  >
                    <Square className="w-4 h-4 mr-1.5" />
                    Stop
                  </Button>
                ) : (
                  <DropdownMenu>
                    <div className="flex">
                      <Button
                        variant={!runResult ? "glass-primary" : "glass"}
                        onClick={() => handleRunTool()}
                        disabled={!!payloadError}
                        className="h-9 px-3 text-sm font-medium rounded-r-none"
                      >
                        <Play className="w-4 h-4 mr-1.5" />
                        Run Tool
                      </Button>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={!runResult ? "glass-primary" : "glass"}
                          className="h-9 px-2 text-sm font-medium rounded-l-none border-l-0"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </div>
                    <DropdownMenuContent align="start" className="w-[400px] p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Test Payload</span>
                          {payloadError && (
                            <span className="text-xs text-red-500">(Invalid JSON)</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Edit the payload to test with different inputs.
                        </p>
                        <JsonCodeEditor
                          value={editablePayload}
                          onChange={(val) => {
                            setEditablePayload(val || "");
                            try {
                              if (val?.trim()) {
                                JSON.parse(val);
                                setPayloadError(null);
                              } else {
                                setPayloadError(null);
                              }
                            } catch (e) {
                              setPayloadError((e as Error).message);
                            }
                          }}
                          readOnly={false}
                          maxHeight="200px"
                          resizable={true}
                          showValidation={true}
                        />
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {!toolSaved ? (
                  <Button
                    variant={runResult?.success ? "default" : "glass"}
                    onClick={() => setShowSaveDialog(true)}
                    disabled={isRunning}
                    className="h-9 px-3 text-sm font-medium hidden md:flex"
                  >
                    <Save className="w-4 h-4 mr-1.5" />
                    Save
                  </Button>
                ) : (
                  <DeployButton
                    tool={currentConfig}
                    payload={tool.input?.payload || {}}
                    disabled={isRunning}
                    className="h-9 px-3 text-sm font-medium hidden md:flex"
                  />
                )}
              </div>
            )}

            <SaveToolDialog
              tool={currentConfig}
              isOpen={showSaveDialog}
              onClose={() => setShowSaveDialog(false)}
              onSaved={handleToolSaved}
            />
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
