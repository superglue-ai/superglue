"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { CopyButton } from "@/src/components/tools/shared/CopyButton";
import { JsonCodeEditor } from "@/src/components/editors/JsonCodeEditor";
import { UserAction, CallSystemAutoExecute } from "@/src/lib/agent/agent-types";
import { ToolCall, getConnectionProtocol } from "@superglue/shared";
import { ChevronDown, FolderOpen, Globe, Loader2, Terminal } from "lucide-react";
import { useState, useEffect } from "react";
import { ToolCallPendingState } from "./ToolCallPendingState";
import { ToolCallWrapper } from "./ToolComponentWrapper";
import { useAgentContext } from "../AgentContextProvider";
import { Button } from "@/src/components/ui/button";
import { ErrorMessage } from "@/src/components/ui/error-message";

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

  const protocol = getConnectionProtocol(url);

  let parsedBody: any = null;
  try {
    if (body) {
      parsedBody = JSON.parse(body);
    }
  } catch {
    parsedBody = body;
  }

  let output = null;
  let outputParseError = false;
  const outputRaw = tool.output ?? null;
  try {
    output = outputRaw ? (typeof outputRaw === "string" ? JSON.parse(outputRaw) : outputRaw) : null;
  } catch (e) {
    outputParseError = true;
    console.error("Failed to parse tool output:", e);
  }

  const isPending = tool.status === "pending";
  const isRunning = tool.status === "running";
  const isCompleted = tool.status === "completed";
  const isDeclined = tool.status === "declined";
  const hasError = output?.success === false && output?.error && !isDeclined;

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
    onToolUpdate?.(tool.id, { status: "running" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_event",
          toolCallId: tool.id,
          toolName: "call_system",
          event: "confirmed",
        },
      ],
    });
  };

  const handleCancel = () => {
    if (!sendAgentRequest) return;

    onToolUpdate?.(tool.id, { status: "declined" });

    sendAgentRequest(undefined, {
      userActions: [
        {
          type: "tool_event",
          toolCallId: tool.id,
          toolName: "call_system",
          event: "declined",
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
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium flex-shrink-0">{method}</span>
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

  const renderSmbHeader = () => {
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
              SMB
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

  const renderSmbDetails = () => {
    const operation = parsedBody?.operation || "unknown";
    const path = parsedBody?.path || "";
    const content = parsedBody?.content;
    return (
      <div className="bg-muted/50 p-3 rounded-md space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">SMB Operation</div>
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
    if (
      (data === undefined || data === null) &&
      outputParseError &&
      typeof outputRaw === "string"
    ) {
      data = outputRaw;
    }
    if (data === undefined || data === null) return null;

    if (typeof data === "object" && "data" in data && !Array.isArray(data)) {
      data = data.data;
    }

    const tryParseJson = (value: string): any | null => {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };

    const normalizeDisplayData = (value: any): { data: any; isJson: boolean } => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const hasTruncation = value._truncated === true;
        const preview = typeof value.preview === "string" ? value.preview : null;
        if (hasTruncation && preview) {
          const parsedPreview = tryParseJson(preview);
          return parsedPreview
            ? { data: parsedPreview, isJson: true }
            : { data: preview, isJson: false };
        }

        const cleaned = { ...value };
        if ("_note" in cleaned) delete cleaned._note;
        if ("_truncated" in cleaned) delete cleaned._truncated;
        if ("preview" in cleaned && preview) delete cleaned.preview;
        return { data: cleaned, isJson: true };
      }

      if (typeof value === "string") {
        const cleaned = value
          .replace(/\n\n\[Truncated from .* chars\]$/u, "")
          .replace(/\n\n\.\.\. \[Output truncated - result too large\]$/u, "")
          .replace(/\n\n\.\.\. \[Data truncated - exceeds size limit\]$/u, "")
          .replace(/\n\n\.\.\. \[Truncated - too many lines\]$/u, "");
        const parsed = tryParseJson(cleaned);
        return parsed ? { data: parsed, isJson: true } : { data: cleaned, isJson: false };
      }

      return { data: value, isJson: typeof value === "object" };
    };

    const normalized = normalizeDisplayData(data);
    const dataStr =
      typeof normalized.data === "string"
        ? normalized.data
        : JSON.stringify(normalized.data, null, 2);

    const lineCount = dataStr.split("\n").length;
    const estimatedHeight = Math.min(140, Math.max(80, lineCount * 18 + 24));

    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">
          {protocol === "postgres" ? "Query Results" : "Response Data"}
        </div>
        {normalized.isJson ? (
          <JsonCodeEditor
            value={dataStr}
            readOnly
            maxHeight={`${estimatedHeight}px`}
            overlayPlacement="corner"
          />
        ) : (
          <div className="relative rounded border border-border p-3">
            <div className="absolute top-1 right-1">
              <CopyButton text={dataStr} />
            </div>
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto pr-6">
              {dataStr}
            </pre>
          </div>
        )}
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
        {isPending && <ToolCallPendingState icon={Terminal} label="Calling system..." />}

        {!isPending && protocol === "http" && renderHttpHeader()}
        {!isPending && protocol === "postgres" && renderPostgresHeader()}
        {!isPending && protocol === "sftp" && renderSftpHeader()}
        {!isPending && protocol === "smb" && renderSmbHeader()}

        {detailsExpanded && protocol === "http" && renderHttpDetails()}
        {detailsExpanded && protocol === "sftp" && renderSftpDetails()}
        {detailsExpanded && protocol === "smb" && renderSmbDetails()}

        {isAwaitingConfirmation && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="glass"
                className="!bg-[#ffa500] hover:!bg-[#ffd700] dark:!bg-[#ffa500] dark:hover:!bg-[#ffd700] !text-black !border-amber-400/50 dark:!border-amber-500/50 font-semibold"
                onClick={handleConfirm}
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    Confirming...
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
              <Button size="sm" variant="glass" onClick={handleCancel} disabled={isExecuting}>
                Cancel
              </Button>
              <Select value={currentPolicy} onValueChange={handlePolicyChange}>
                <SelectTrigger className="h-8 w-[140px] text-xs text-muted-foreground bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm border-border/50 shadow-sm">
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
          <ErrorMessage
            title={
              protocol === "http"
                ? "Request returned an error"
                : protocol === "postgres"
                  ? "Query returned an error"
                  : "Operation returned an error"
            }
            message={
              typeof output.error === "string"
                ? output.error
                : JSON.stringify(output.error, null, 2)
            }
          />
        )}

        {isCompleted && !hasError && output && renderDataResponse()}

        {isCompleted && (
          <div className="flex items-center justify-end pt-2 border-t border-border/50 mt-3">
            <Select value={currentPolicy} onValueChange={handlePolicyChange}>
              <SelectTrigger className="h-7 w-[140px] text-xs text-muted-foreground bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm border-border/50 shadow-sm">
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
