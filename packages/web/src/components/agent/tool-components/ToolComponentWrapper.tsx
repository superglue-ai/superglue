"use client";

import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/lib/general-utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@radix-ui/react-collapsible";
import { ToolCall } from "@superglue/shared";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

interface ToolCallWrapperProps {
  tool: ToolCall;
  children: ReactNode;
  openByDefault?: boolean;
  hideStatusIcon?: boolean;
  statusOverride?: "running" | "completed" | "error" | null;
  manualRunLogs?: Array<{ message: string; timestamp: Date }>;
}

export function ToolCallWrapper({
  tool,
  children,
  openByDefault = false,
  hideStatusIcon = false,
  statusOverride,
  manualRunLogs,
}: ToolCallWrapperProps) {
  const [isExpanded, setIsExpanded] = useState(openByDefault);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState<number>(0);

  useEffect(() => {
    if (!openByDefault) {
      setIsExpanded(false);
    }
  }, [openByDefault]);

  useEffect(() => {
    if (tool.status === "declined" || tool.status === "stopped") {
      setIsExpanded(false);
    }
  }, [tool.status]);

  const displayStatus = (() => {
    // If statusOverride is provided, use it (for manual runs)
    if (statusOverride) {
      return statusOverride;
    }

    if (tool.status === "awaiting_confirmation") {
      return tool.status;
    }

    if (tool.status !== "pending" && tool.status !== "running") {
      return tool.status;
    }

    // Check if this is in the last message and less than 5 minutes old
    const isRecentAndInLastMessage = (() => {
      // If no startTime, assume it's stale
      if (!tool.startTime) return false;

      // Check if it's less than 5 minutes old
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const isRecent = tool.startTime.getTime() > fiveMinutesAgo;

      // For now, assume if it's recent it's likely in the last message
      // (We don't have direct access to message context here)
      return isRecent;
    })();

    // If it's not recent or not in last message, show as error
    return isRecentAndInLastMessage ? tool.status : "error";
  })();

  // Live timer effect for running tools
  useEffect(() => {
    if (displayStatus === "running" && tool.startTime) {
      const interval = setInterval(() => {
        setLiveElapsed(Date.now() - tool.startTime!.getTime());
      }, 100); // Update every 100ms for smooth updates

      return () => {
        clearInterval(interval);
      };
    } else {
      // Reset live elapsed when tool stops running
      setLiveElapsed(0);
    }
  }, [displayStatus, tool.startTime]);

  // Format elapsed time for display
  const formatElapsedTime = (durationMs: number, live: boolean = false) => {
    if (durationMs < 1000 && !live) {
      return `${Math.round(durationMs)}ms`;
    } else if (durationMs < 60000) {
      return `${Math.floor(durationMs / 1000)}s`;
    } else {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "error":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "running":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "stopped":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "declined":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "awaiting_confirmation":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      case "pending":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      case "running":
        return "Running";
      case "stopped":
        return "Stopped";
      case "awaiting_confirmation":
        return "Awaiting Confirmation";
      case "declined":
        return "Declined";
      case "pending":
        return "Generating Tool Call Inputs";
      default:
        return "Unknown";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 className="w-3 h-3 animate-spin" />;
      default:
        return null;
    }
  };

  // Get latest log message for running status
  const latestLogMessage = (() => {
    // For manual runs with statusOverride, use manualRunLogs
    if (statusOverride === "running" && manualRunLogs && manualRunLogs.length > 0) {
      const latestLog = manualRunLogs[manualRunLogs.length - 1];
      const message = latestLog.message;
      return message.length > 100 ? message.substring(0, 100) + "..." : message;
    }
    // For agent tool runs, use tool.logs
    if (tool.status === "running" && tool.logs && tool.logs.length > 0) {
      const latestLog = tool.logs[tool.logs.length - 1];
      const message = latestLog.message;
      return message.length > 100 ? message.substring(0, 100) + "..." : message;
    }
    return null;
  })();

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border border-border/50 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/40 dark:to-muted/20 backdrop-blur-sm">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-shrink-0">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
              <Badge
                className={cn(
                  "text-xs font-medium hover:bg-inherit flex-shrink-0",
                  getStatusColor(displayStatus),
                )}
              >
                {(() => {
                  const displayNames: Record<string, string> = {
                    edit_tool: "Edit Tool",
                    edit_payload: "Edit Tool Input",
                  };
                  return (
                    displayNames[tool.name] ||
                    tool.name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                  );
                })()}
              </Badge>
              {!hideStatusIcon && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 overflow-hidden">
                  {getStatusIcon(displayStatus)}
                  <span className="capitalize flex-shrink-0">{getStatusName(displayStatus)}</span>
                  {displayStatus === "running" && latestLogMessage && (
                    <>
                      <span className="mx-1 hidden sm:inline-block flex-shrink-0">•</span>
                      <span className="truncate hidden sm:inline-block">{latestLogMessage}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            {(() => {
              if (displayStatus === "running" && tool.startTime && liveElapsed > 0) {
                return (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatElapsedTime(liveElapsed, true)}
                  </span>
                );
              }

              if (tool.startTime && tool.endTime) {
                const durationMs = Math.round(tool.endTime.getTime() - tool.startTime.getTime());
                return (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatElapsedTime(durationMs, false)}
                  </span>
                );
              }

              return null;
            })()}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            {displayStatus === "completed" &&
              tool.name !== "call_endpoint" &&
              tool.name !== "edit_tool" &&
              tool.name !== "build_tool" &&
              tool.name !== "run_tool" &&
              tool.output &&
              (() => {
                try {
                  const parsed =
                    typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
                  if (parsed && parsed.success === false && !hideStatusIcon) {
                    return (
                      <div className="space-y-4 mb-4">
                        <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <svg
                                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                                Task failed
                              </div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                Error:{" "}
                                {parsed.message || parsed.error || "An unknown error occurred"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                } catch {
                  // If parsing fails, don't show error box
                }
                return null;
              })()}

            {/* Show stopped message for stopped tool calls */}
            {displayStatus === "stopped" && (
              <div className="space-y-4 mb-4">
                <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-orange-600 dark:text-orange-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zM8 13a1 1 0 112 0 1 1 0 01-2 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
                        Tool call stopped
                      </div>
                    </div>
                  </div>
                </div>

                {/* Show collapsible input when tool is stopped */}
                {tool.input && (
                  <div>
                    <Collapsible open={isInputExpanded} onOpenChange={setIsInputExpanded}>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                          {isInputExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          Input used
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 bg-muted/50 border border-border p-3 rounded-md">
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(tool.input, null, 2)}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </div>
            )}

            {/* Show warning message for stale/incomplete tool calls (not for execution failures with statusOverride) */}
            {displayStatus === "error" && !statusOverride && (
              <div className="space-y-4 mb-4">
                <div className="bg-muted/50 border border-border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-muted-foreground"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground">
                        Tool call{" "}
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                          {tool.id}
                        </code>{" "}
                        did not complete.
                        <span className="text-xs ml-1">(connection issue or tab closed)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Show collapsible input when tool fails */}
                {tool.input && (
                  <div>
                    <Collapsible open={isInputExpanded} onOpenChange={setIsInputExpanded}>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                          {isInputExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          Input used
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 bg-muted/50 border border-border p-3 rounded-md">
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(tool.input, null, 2)}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </div>
            )}

            {/* Show children only if not failed, stopped, error, or stale */}
            {(() => {
              // Don't show children for stopped tools (unless it's a statusOverride)
              if (displayStatus === "stopped" && !statusOverride) {
                return null;
              }

              // Don't show children for error tools (unless it's a statusOverride - manual run errors should still show children)
              if (displayStatus === "error" && !statusOverride) {
                return null;
              }

              // Don't show children for stale tools (when displayStatus differs from actual status AND no statusOverride)
              if (!statusOverride && displayStatus !== tool.status) {
                return null;
              }

              return children;
            })()}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
