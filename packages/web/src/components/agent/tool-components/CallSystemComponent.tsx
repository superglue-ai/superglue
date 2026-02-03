"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { CopyButton } from "@/src/components/tools/shared/CopyButton";
import { UserAction, CallSystemAutoExecute } from "@/src/lib/agent/agent-types";
import { ToolCall } from "@superglue/shared";
import { AlertCircle, ChevronDown, Database, FolderOpen, Loader2, Terminal } from "lucide-react";
import { useState, useEffect } from "react";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { useAgentContext } from "../AgentContextProvider";
import { Button } from "@/src/components/ui/button";

type Protocol = "http" | "postgres" | "sftp";

const getProtocol = (url: string): Protocol => {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres";
  if (url.startsWith("ftp://") || url.startsWith("ftps://") || url.startsWith("sftp://"))
    return "sftp";
  return "http";
};

const maskConnectionString = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return url.replace(/:([^:@]+)@/, ":****@");
  }
};

interface CallSystemComponentProps {
  tool: ToolCall;
  onInputChange: (newInput: any) => void;
  onToolUpdate?: (toolCallId: string, updates: Partial<ToolCall>) => void;
  sendAgentRequest?: (
    userMessage?: string,
    options?: { userActions?: UserAction[] },
  ) => Promise<void>;
  onAbortStream?: () => void;
}

export function CallSystemComponent({
  tool,
  onInputChange,
  onToolUpdate,
  sendAgentRequest,
  onAbortStream,
}: CallSystemComponentProps) {
  const { getToolPolicy, setToolPolicy } = useAgentContext();
  const currentPolicy = (getToolPolicy("call_system")?.autoExecute ||
    "ask_every_time") as CallSystemAutoExecute;

  const handlePolicyChange = (value: CallSystemAutoExecute) => {
    setToolPolicy("call_system", { autoExecute: value });
  };

  const isAwaitingConfirmation = tool.status === "awaiting_confirmation";
  const [detailsExpanded, setDetailsExpanded] = useState(isAwaitingConfirmation);
  const [isExecuting, setIsExecuting] = useState(false);

  const url = tool.input?.url || "";
  const method = tool.input?.method || "GET";
  const headers = tool.input?.headers || {};
  const body = tool.input?.body;

  const protocol = getProtocol(url);

  let parsedBody: any = null;
  try {
    if (body) {
      parsedBody = JSON.parse(body);
    }
  } catch {
    parsedBody = body;
  }

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
  const isDestructive =
    protocol === "http"
      ? ["POST", "PUT", "DELETE", "PATCH"].includes(method)
      : protocol === "postgres" || protocol === "sftp";

  useEffect(() => {
    if (isCompleted || isDeclined) {
      setDetailsExpanded(false);
      setIsExecuting(false);
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

    setIsExecuting(true);
    onAbortStream?.();
    onToolUpdate?.(tool.id, { status: "running" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_confirmation",
          toolCallId: tool.id,
          toolName: "call_system",
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
          toolName: "call_system",
          action: "declined",
        },
      ],
    });
  };

  const renderHttpHeader = () => (
    <div className="flex items-start gap-3">
      <button
        onClick={() => setDetailsExpanded(!detailsExpanded)}
        className="flex-shrink-0 mt-1 hover:bg-muted rounded p-1 -m-1 transition-colors"
        title={detailsExpanded ? "Hide curl command" : "Show curl command"}
      >
        {detailsExpanded ? (
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
      </div>
    </div>
  );

  const renderPostgresHeader = () => {
    const query = parsedBody?.query || body || "";
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Database className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            PostgreSQL
          </span>
        </div>
        <div className="relative rounded border border-border p-3">
          <div className="absolute top-1 right-1">
            <CopyButton text={query} />
          </div>
          <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-words pr-6">
            {query}
          </pre>
        </div>
      </div>
    );
  };

  const renderSftpHeader = () => {
    const operation = parsedBody?.operation || "unknown";
    const path = parsedBody?.path || "";
    return (
      <div className="flex items-start gap-3">
        <button
          onClick={() => setDetailsExpanded(!detailsExpanded)}
          className="flex-shrink-0 mt-1 hover:bg-muted rounded p-1 -m-1 transition-colors"
          title={detailsExpanded ? "Hide details" : "Show details"}
        >
          {detailsExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              SFTP
            </span>
            <span className="text-xs font-medium text-muted-foreground uppercase">{operation}</span>
          </div>
          {path && <pre className="text-sm font-mono text-foreground truncate">{path}</pre>}
        </div>
      </div>
    );
  };

  const renderHttpDetails = () => (
    <div className="bg-muted/50 p-3 rounded-md space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">cURL Command</div>
      </div>
      <div className="relative rounded border border-border bg-background p-3">
        <div className="absolute top-1 right-1">
          <CopyButton getData={generateCurlCommand} />
        </div>
        <pre className="text-xs font-mono overflow-x-auto whitespace-pre max-h-64 pr-6">
          {generateCurlCommand()}
        </pre>
      </div>
    </div>
  );

  const renderSftpDetails = () => {
    const operation = parsedBody?.operation || "unknown";
    const path = parsedBody?.path || "";
    const content = parsedBody?.content;
    return (
      <div className="bg-muted/50 p-3 rounded-md space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">SFTP Operation</div>
          <CopyButton getData={() => JSON.stringify(parsedBody, null, 2)} />
        </div>
        <div className="text-xs space-y-1">
          <div>
            <span className="text-muted-foreground">Operation:</span>{" "}
            <span className="font-mono font-medium uppercase">{operation}</span>
          </div>
          {path && (
            <div>
              <span className="text-muted-foreground">Path:</span>{" "}
              <span className="font-mono">{path}</span>
            </div>
          )}
          {content && (
            <div>
              <span className="text-muted-foreground">Content:</span>
              <pre className="text-xs font-mono overflow-x-auto whitespace-pre bg-background p-2 rounded border border-border mt-1 max-h-32">
                {typeof content === "string" ? content : JSON.stringify(content, null, 2)}
              </pre>
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">Connection: {maskConnectionString(url)}</div>
      </div>
    );
  };

  const renderDataResponse = () => {
    let data = output?.data;
    if (data === undefined || data === null) return null;

    if (typeof data === "object" && "data" in data && !Array.isArray(data)) {
      data = data.data;
    }

    const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    const truncated =
      dataStr.length > 1000 ? dataStr.substring(0, 1000) + "\n\n...(truncated)" : dataStr;

    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">
          {protocol === "postgres" ? "Query Results" : "Response Data"}
        </div>
        <div className="relative rounded border border-border p-3">
          <div className="absolute top-1 right-1">
            <CopyButton text={dataStr} />
          </div>
          <pre className="text-xs font-mono overflow-x-auto whitespace-pre max-h-48 overflow-y-auto pr-6">
            {truncated}
          </pre>
        </div>
      </div>
    );
  };

  const getWarningMessage = () => {
    if (protocol === "http") {
      return `This ${method} request may modify data. Review carefully before confirming.`;
    } else if (protocol === "postgres") {
      return "This database query will be executed. Review carefully before confirming.";
    } else {
      return "This file operation will be executed. Review carefully before confirming.";
    }
  };

  const getRunningMessage = () => {
    if (protocol === "http") return "Executing request...";
    if (protocol === "postgres") return "Executing query...";
    return "Executing operation...";
  };

  return (
    <ToolCallWrapper tool={tool} openByDefault={!isDeclined}>
      <div className="space-y-3">
        {protocol === "http" && renderHttpHeader()}
        {protocol === "postgres" && renderPostgresHeader()}
        {protocol === "sftp" && renderSftpHeader()}

        {detailsExpanded && protocol === "http" && renderHttpDetails()}
        {detailsExpanded && protocol === "sftp" && renderSftpDetails()}

        {isAwaitingConfirmation && (
          <div className="space-y-3">
            {isDestructive && (
              <div className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 text-xs bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>{getWarningMessage()}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" variant="success" onClick={handleConfirm} disabled={isExecuting}>
                {isExecuting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    Executing...
                  </>
                ) : (
                  "Execute"
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={isExecuting}>
                Cancel
              </Button>
              <Select value={currentPolicy} onValueChange={handlePolicyChange}>
                <SelectTrigger className="h-8 w-[140px] text-xs text-muted-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ask_every_time">Ask every time</SelectItem>
                  <SelectItem value="run_gets_only">Run GETs only</SelectItem>
                  <SelectItem value="run_everything">Run everything</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{getRunningMessage()}</span>
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
                {protocol === "http"
                  ? "Request Failed"
                  : protocol === "postgres"
                    ? "Query Failed"
                    : "Operation Failed"}
              </div>
              <div className="text-sm text-red-800 dark:text-red-200 break-words">
                {typeof output.error === "string"
                  ? output.error
                  : JSON.stringify(output.error, null, 2)}
              </div>
            </div>
          </div>
        )}

        {isCompleted && !hasError && output && renderDataResponse()}

        {isCompleted && (
          <div className="flex items-center justify-end pt-2 border-t border-border/50 mt-3">
            <Select value={currentPolicy} onValueChange={handlePolicyChange}>
              <SelectTrigger className="h-7 w-[140px] text-xs text-muted-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask_every_time">Ask every time</SelectItem>
                <SelectItem value="run_gets_only">Run GETs only</SelectItem>
                <SelectItem value="run_everything">Run everything</SelectItem>
              </SelectContent>
            </Select>
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
