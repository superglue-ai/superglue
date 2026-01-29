"use client";

import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { UserAction, CallEndpointAutoExecute } from "@/src/lib/agent/agent-types";
import { ToolCall } from "@superglue/shared";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Terminal,
} from "lucide-react";
import { useState, useEffect } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { useAgentContext } from "../AgentContextProvider";

interface CallEndpointComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  onAbortStream?: () => void;
}

export function CallEndpointComponent({
  tool,
  onInputChange,
  onToolUpdate,
  sendAgentRequest,
  onAbortStream,
}: CallEndpointComponentProps) {
  const { getToolPolicy, setToolPolicy } = useAgentContext();
  const currentPolicy = (getToolPolicy("call_endpoint")?.autoExecute ||
    "ask_every_time") as CallEndpointAutoExecute;

  const handlePolicyChange = (value: CallEndpointAutoExecute) => {
    setToolPolicy("call_endpoint", { autoExecute: value });
  };

  const isAwaitingConfirmation = tool.status === "awaiting_confirmation";
  const [curlExpanded, setCurlExpanded] = useState(isAwaitingConfirmation);
  const [responseHeadersExpanded, setResponseHeadersExpanded] = useState(false);
  const [copied, setCopied] = useState<"curl" | "response" | null>(null);

  const method = tool.input?.method || "GET";
  const url = tool.input?.url || "";
  const headers = tool.input?.headers || {};
  const body = tool.input?.body;
  const systemId = tool.input?.systemId;

  let output = null;
  try {
    output = tool.output
      ? typeof tool.output === "string"
        ? JSON.parse(tool.output)
        : tool.output
      : null;
  } catch (e) {
    console.error("Failed to parse tool output:", e);
  }

  const isRunning = tool.status === "running";
  const isCompleted = tool.status === "completed";
  const isDeclined = tool.status === "declined";
  const hasError = output?.success === false && output?.error && !isDeclined;
  const isDestructive = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

  useEffect(() => {
    if (isCompleted || isDeclined) {
      setCurlExpanded(false);
    }
  }, [isCompleted, isDeclined]);

  const generateCurlCommand = () => {
    let curl = `curl -X ${method}`;

    if (Object.keys(headers).length > 0) {
      Object.entries(headers).forEach(([key, value]) => {
        curl += ` \\\n  -H "${key}: ${value}"`;
      });
    }

    if (body) {
      const escapedBody = body.replace(/"/g, '\\"');
      curl += ` \\\n  -d "${escapedBody}"`;
    }

    curl += ` \\\n  "${url}"`;

    return curl;
  };

  const handleConfirm = () => {
    if (!sendAgentRequest) return;

    onAbortStream?.();
    onToolUpdate?.(tool.id, { status: "running" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_confirmation",
          toolCallId: tool.id,
          toolName: "call_endpoint",
          action: "confirmed",
        },
      ],
    });
  };

  const handleCancel = () => {
    if (!sendAgentRequest) return;

    onAbortStream?.();
    onToolUpdate?.(tool.id, { status: "declined" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_confirmation",
          toolCallId: tool.id,
          toolName: "call_endpoint",
          action: "declined",
        },
      ],
    });
  };

  const copyToClipboard = async (content: string, type: "curl" | "response") => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const generateTerminalOutput = () => {
    if (!output || !output.status) return "";

    let terminal = `HTTP/${output.status >= 200 ? "1.1" : "1.0"} ${output.status} ${output.statusText}\n`;

    if (output.headers) {
      const importantHeaders = ["content-type", "content-length", "date"];
      Object.entries(output.headers)
        .filter(([key]) => importantHeaders.includes(key.toLowerCase()))
        .forEach(([key, value]) => {
          terminal += `${key}: ${value}\n`;
        });
    }

    terminal += "\n";

    if (output.body) {
      let bodyStr;
      if (typeof output.body === "object" && output.body._truncated) {
        bodyStr = output.body.preview || "";
        terminal += bodyStr;
        terminal += `\n\n...(response truncated - ${output.body._note})`;
      } else {
        bodyStr =
          typeof output.body === "string" ? output.body : JSON.stringify(output.body, null, 2);
        const truncated = bodyStr.length > 500 ? bodyStr.substring(0, 500) : bodyStr;
        terminal += truncated;
        if (bodyStr.length > 500) {
          terminal += "\n\n...(preview truncated for display)";
        }
      }
    }

    return terminal;
  };

  return (
    <ToolCallWrapper tool={tool} openByDefault={!isDeclined}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setCurlExpanded(!curlExpanded)}
            className="flex-shrink-0 mt-1 hover:bg-muted rounded p-1 -m-1 transition-colors"
            title={curlExpanded ? "Hide curl command" : "Show curl command"}
          >
            {curlExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Terminal className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-medium">{method}</span>
              <span className="text-sm font-mono text-muted-foreground truncate">{url}</span>
            </div>
            {systemId && (
              <div className="text-xs text-muted-foreground mt-1">
                System: <span className="font-mono">{systemId}</span>
              </div>
            )}
          </div>
          <Select value={currentPolicy} onValueChange={handlePolicyChange}>
            <SelectTrigger className="h-5 w-[140px] text-xs text-muted-foreground border-0 bg-transparent hover:bg-muted/50 focus:ring-0 focus:ring-offset-0 flex-shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ask_every_time">Ask every time</SelectItem>
              <SelectItem value="run_gets_only">Run GETs only</SelectItem>
              <SelectItem value="run_everything">Run everything</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {curlExpanded && (
          <div className="bg-muted/50 p-3 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">cURL Command</div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => copyToClipboard(generateCurlCommand(), "curl")}
              >
                {copied === "curl" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre bg-background p-3 rounded border border-border max-h-64">
              {generateCurlCommand()}
            </pre>
          </div>
        )}

        {isAwaitingConfirmation && (
          <div className="space-y-3">
            {isDestructive && (
              <div className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 text-xs bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>
                  This {method} request may modify data. Review carefully before confirming.
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" variant="success" onClick={handleConfirm}>
                Execute
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Executing request...</span>
          </div>
        )}

        {isDeclined && (
          <div className="bg-muted/50 p-3 rounded-md">
            <div className="text-sm text-muted-foreground">Request declined by user</div>
          </div>
        )}

        {isCompleted && hasError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
                Request Failed
              </div>
              <div className="text-sm text-red-800 dark:text-red-200">{output.error}</div>
              {output.duration !== undefined && (
                <div className="text-xs text-red-700 dark:text-red-300 mt-1">
                  Failed after {output.duration}ms
                </div>
              )}
            </div>
          </div>
        )}

        {isCompleted && !hasError && output && output.status && (
          <div className="space-y-3">
            <div className="bg-muted/50 p-3 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Response Preview</div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`font-mono font-medium ${
                        output.status >= 200 && output.status < 300
                          ? "text-green-600 dark:text-green-400"
                          : output.status >= 400
                            ? "text-red-600 dark:text-red-400"
                            : "text-yellow-600 dark:text-yellow-400"
                      }`}
                    >
                      {output.status}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{output.duration}ms</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    onClick={() => {
                      const responseText = JSON.stringify(
                        {
                          status: output.status,
                          statusText: output.statusText,
                          headers: output.headers,
                          body: output.body,
                        },
                        null,
                        2,
                      );
                      copyToClipboard(responseText, "response");
                    }}
                  >
                    {copied === "response" ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>

              <pre className="text-xs font-mono overflow-x-auto whitespace-pre bg-background p-3 rounded border border-border max-h-32 overflow-y-auto">
                {generateTerminalOutput()}
              </pre>

              {output.headers && Object.keys(output.headers).length > 0 && (
                <div>
                  <button
                    onClick={() => setResponseHeadersExpanded(!responseHeadersExpanded)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {responseHeadersExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    All Headers ({Object.keys(output.headers).length})
                  </button>
                  {responseHeadersExpanded && (
                    <div className="mt-2 pl-4 space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
                      {Object.entries(output.headers).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-muted-foreground">{key}:</span>{" "}
                          <span className="text-foreground">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
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
