"use client";

import { CopyButton } from "@/src/components/tools/shared/CopyButton";
import { Badge } from "@/src/components/ui/badge";
import { RequestSource, RunStatus } from "@superglue/shared";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Cpu,
  Link,
  Loader2,
  MousePointerClick,
  Webhook,
  XCircle,
} from "lucide-react";
import React from "react";

// Helper function to recursively remove null values from objects
export const removeNullFields = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeNullFields).filter((item) => item !== undefined);
  }

  if (typeof obj === "object" && obj !== null) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = removeNullFields(value);
      if (cleanedValue !== undefined && cleanedValue !== null) {
        cleaned[key] = cleanedValue;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  return obj;
};

export const getRequestSourceLabel = (source?: RequestSource | string) => {
  switch (source) {
    case RequestSource.API:
      return "API";
    case RequestSource.FRONTEND:
      return "Manual";
    case RequestSource.SCHEDULER:
      return "Scheduler";
    case RequestSource.MCP:
      return "MCP";
    case RequestSource.TOOL_CHAIN:
      return "Tool chain";
    case RequestSource.WEBHOOK:
      return "Webhook";
    default:
      return source ? String(source) : "-";
  }
};

export const getRequestSourceBadgeClassName = (_source?: RequestSource | string) => {
  return "bg-muted-foreground/70 hover:bg-muted-foreground/70";
};

export const RequestSourceIcon = ({ source }: { source?: RequestSource | string }) => {
  const className = "h-3 w-3";
  switch (source) {
    case RequestSource.API:
      return <Code className={className} />;
    case RequestSource.FRONTEND:
      return <MousePointerClick className={className} />;
    case RequestSource.SCHEDULER:
      return <Clock className={className} />;
    case RequestSource.MCP:
      return <Cpu className={className} />;
    case RequestSource.TOOL_CHAIN:
      return <Link className={className} />;
    case RequestSource.WEBHOOK:
      return <Webhook className={className} />;
    default:
      return null;
  }
};

export const StatusBadge = ({ status }: { status?: RunStatus | string }) => {
  const statusUpper = status?.toString().toUpperCase();

  if (statusUpper === "SUCCESS" || status === RunStatus.SUCCESS) {
    return (
      <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-500 gap-1">
        <CheckCircle className="h-3 w-3" />
        Success
      </Badge>
    );
  }
  if (statusUpper === "RUNNING" || status === RunStatus.RUNNING) {
    return (
      <Badge variant="default" className="bg-blue-500 hover:bg-blue-500 gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </Badge>
    );
  }
  if (statusUpper === "ABORTED" || status === RunStatus.ABORTED) {
    return (
      <Badge variant="default" className="bg-amber-500 hover:bg-amber-500 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Aborted
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="hover:bg-destructive gap-1">
      <XCircle className="h-3 w-3" />
      Failed
    </Badge>
  );
};

export const RequestSourceBadge = ({ source }: { source?: RequestSource | string }) => {
  return (
    <Badge
      variant="default"
      className={`${getRequestSourceBadgeClassName(source)} gap-1`}
      title={source ?? "unknown"}
    >
      <RequestSourceIcon source={source} />
      {getRequestSourceLabel(source)}
    </Badge>
  );
};

const CollapsibleSection = ({
  title,
  children,
  defaultOpen = false,
  isFirst = false,
  isLast = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div
      className={`border-x border-t ${isLast && !isOpen ? "border-b" : ""} ${isFirst ? "rounded-t-lg" : ""} ${isLast ? "rounded-b-lg" : ""}`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {isOpen && (
        <div className={`px-3 pb-3 ${isLast ? "border-b rounded-b-lg" : "border-b"}`}>
          {children}
        </div>
      )}
    </div>
  );
};

export const RunDetails = ({ run }: { run: any }) => {
  if (!run) return null;

  const cleanedToolConfig = run.toolConfig ? removeNullFields(run.toolConfig) : null;
  const cleanedOptions = run.options ? removeNullFields(run.options) : null;
  const cleanedToolResult = run.toolResult ? removeNullFields(run.toolResult) : null;
  const cleanedToolPayload = run.toolPayload ? removeNullFields(run.toolPayload) : null;

  const hasToolConfig = cleanedToolConfig && Object.keys(cleanedToolConfig).length > 0;
  const hasOptions = cleanedOptions && Object.keys(cleanedOptions).length > 0;
  const hasToolResult =
    cleanedToolResult &&
    (Array.isArray(cleanedToolResult)
      ? cleanedToolResult.length > 0
      : Object.keys(cleanedToolResult).length > 0);
  const hasToolPayload = cleanedToolPayload && Object.keys(cleanedToolPayload).length > 0;
  const hasStepResults = run.stepResults && run.stepResults.length > 0;
  const isFailed =
    run.status === RunStatus.FAILED || run.status?.toString().toUpperCase() === "FAILED";

  return (
    <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto [scrollbar-gutter:stable]">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Run ID</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono truncate" title={run.id || run.runId}>
              {run.id || run.runId}
            </span>
            <CopyButton text={run.id || run.runId} />
          </div>
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Run trigger</h4>
          <RequestSourceBadge source={run.requestSource} />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Duration</h4>
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs">
              {run.completedAt
                ? `${new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()}ms`
                : "-"}
            </span>
          </div>
        </div>
      </div>

      {isFailed && run.error && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Error Message</h4>
          <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
            <pre className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap font-mono">
              {run.error}
            </pre>
          </div>
        </div>
      )}

      {(() => {
        const sections = [
          hasToolPayload && {
            key: "payload",
            title: "Tool Payload (received input)",
            defaultOpen: true,
            content: (
              <div className="relative">
                <div className="absolute top-2 right-2">
                  <CopyButton getData={() => JSON.stringify(cleanedToolPayload, null, 2)} />
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 pr-10 rounded-md max-h-[200px] overflow-y-auto">
                  {JSON.stringify(cleanedToolPayload, null, 2)}
                </pre>
              </div>
            ),
          },
          hasOptions && {
            key: "options",
            title: "Execution Options",
            content: (
              <div className="relative">
                <div className="absolute top-2 right-2">
                  <CopyButton getData={() => JSON.stringify(cleanedOptions, null, 2)} />
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 pr-10 rounded-md">
                  {JSON.stringify(cleanedOptions, null, 2)}
                </pre>
              </div>
            ),
          },
          hasStepResults && {
            key: "steps",
            title: `Step Results (${run.stepResults.length})`,
            content: (
              <div className="space-y-2">
                {run.stepResults.map((step: any, index: number) => (
                  <div key={step.stepId} className="p-2 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-xs">
                        Step {index + 1}: {step.stepId}
                      </span>
                      <Badge
                        variant={step.success ? "default" : "destructive"}
                        className={
                          step.success
                            ? "bg-emerald-500 hover:bg-emerald-500"
                            : "hover:bg-destructive"
                        }
                      >
                        {step.success ? "Success" : "Failed"}
                      </Badge>
                    </div>
                    {step.error && (
                      <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded text-xs">
                        <pre className="text-red-600 dark:text-red-500 whitespace-pre-wrap font-mono">
                          {step.error}
                        </pre>
                      </div>
                    )}
                    {step.data && (
                      <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-2 rounded-md max-h-[150px] overflow-y-auto">
                        {JSON.stringify(removeNullFields(step.data), null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ),
          },
          hasToolResult && {
            key: "result",
            title: "Tool Result",
            content: (
              <div className="relative">
                <div className="absolute top-2 right-2 z-10">
                  <CopyButton getData={() => JSON.stringify(cleanedToolResult, null, 2)} />
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 pr-10 rounded-md max-h-[200px] overflow-y-auto">
                  {JSON.stringify(cleanedToolResult, null, 2)}
                </pre>
              </div>
            ),
          },
          hasToolConfig && {
            key: "config",
            title: "Tool Configuration",
            content: (
              <div className="relative">
                <div className="absolute top-2 right-2">
                  <CopyButton getData={() => JSON.stringify(cleanedToolConfig, null, 2)} />
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 pr-10 rounded-md max-h-[200px] overflow-y-auto">
                  {JSON.stringify(cleanedToolConfig, null, 2)}
                </pre>
              </div>
            ),
          },
        ].filter(Boolean) as {
          key: string;
          title: string;
          content: React.ReactNode;
          defaultOpen?: boolean;
        }[];

        if (sections.length === 0) return null;

        return (
          <div>
            {sections.map((section, idx) => (
              <CollapsibleSection
                key={section.key}
                title={section.title}
                defaultOpen={section.defaultOpen}
                isFirst={idx === 0}
                isLast={idx === sections.length - 1}
              >
                {section.content}
              </CollapsibleSection>
            ))}
          </div>
        );
      })()}
    </div>
  );
};

interface RunsListProps {
  runs: any[];
  loading?: boolean;
  emptyMessage?: string;
}

export function RunsList({
  runs,
  loading = false,
  emptyMessage = "No runs found.",
}: RunsListProps) {
  const [expandedRunId, setExpandedRunId] = React.useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading runs...</p>
        </div>
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return <div className="text-sm text-muted-foreground py-4 text-center">{emptyMessage}</div>;
  }

  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return (
    <div className="space-y-2">
      {sortedRuns.map((run) => {
        const runId = run.id || run.runId;
        const toolId = run.toolId;
        const isExpanded = expandedRunId === runId;

        return (
          <div key={runId} className="border rounded-lg overflow-hidden bg-background">
            {/* Run Header */}
            <button
              onClick={() => setExpandedRunId(isExpanded ? null : runId)}
              className="w-full px-3 py-2 flex items-center gap-4 hover:bg-muted/50 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}

              {toolId && (
                <span className="text-xs font-mono truncate" title={toolId}>
                  {toolId}
                </span>
              )}

              <StatusBadge status={run.status} />
              <RequestSourceBadge source={run.requestSource} />

              <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                {new Date(run.startedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t">
                <RunDetails run={run} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}