"use client";

import { useConfig } from "@/src/app/config-context";
import { CopyButton } from "@/src/components/tools/shared/CopyButton";
import { Badge } from "@/src/components/ui/badge";
import { JsonCodeEditor } from "@/src/components/editors/JsonCodeEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import { createEESuperglueClient } from "@/src/lib/ee-superglue-client";
import { RequestSource, RunStatus, StoredRunResults } from "@superglue/shared";

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
  Play,
  Webhook,
  XCircle,
} from "lucide-react";
import React from "react";
import { formatDurationShort } from "@/src/lib/general-utils";

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
        <Play className="h-3 w-3" />
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

export const RunDetails = ({ run }: { run: any }) => {
  const config = useConfig();
  const [loadedResults, setLoadedResults] = React.useState<StoredRunResults | null>(null);
  const [isLoadingResults, setIsLoadingResults] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<string>("config");

  const runId = run?.runId;
  const hasStoredResults = !!run?.resultStorageUri;

  // Auto-load results from S3 when available
  React.useEffect(() => {
    if (!hasStoredResults || loadedResults || isLoadingResults || loadError || !runId || !run) {
      return;
    }

    const loadResults = async () => {
      setIsLoadingResults(true);
      setLoadError(null);
      try {
        const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
        const results = await client.getRunResults(runId);
        setLoadedResults(results);
        if (!results) {
          setLoadError("No results available for this run");
        }
      } catch (err: any) {
        setLoadError(err.message || "Failed to load results");
      } finally {
        setIsLoadingResults(false);
      }
    };

    loadResults();
  }, [
    hasStoredResults,
    loadedResults,
    isLoadingResults,
    loadError,
    runId,
    config.superglueEndpoint,
    config.apiEndpoint,
  ]);

  // Use loaded results if available, otherwise fall back to run data
  const displayStepResults = loadedResults?.stepResults || run.stepResults;
  const displayToolResult = loadedResults?.data || run.data;
  const displayToolPayload = loadedResults?.toolPayload || run.toolPayload;

  const cleanedToolConfig = run.tool ? removeNullFields(run.tool) : null;
  const cleanedOptions = run.options ? removeNullFields(run.options) : null;
  const cleanedToolResult = displayToolResult ? removeNullFields(displayToolResult) : null;
  const cleanedToolPayload = displayToolPayload ? removeNullFields(displayToolPayload) : null;

  const hasToolConfig = cleanedToolConfig && Object.keys(cleanedToolConfig).length > 0;
  const hasOptions = cleanedOptions && Object.keys(cleanedOptions).length > 0;
  const hasToolResult =
    cleanedToolResult &&
    (Array.isArray(cleanedToolResult)
      ? cleanedToolResult.length > 0
      : Object.keys(cleanedToolResult).length > 0);
  const hasToolPayload = cleanedToolPayload && Object.keys(cleanedToolPayload).length > 0;
  const hasStepResults = displayStepResults && displayStepResults.length > 0;
  const isFailed =
    run.status === RunStatus.FAILED || run.status?.toString().toUpperCase() === "FAILED";

  const startedAt = run.metadata?.startedAt ? new Date(run.metadata.startedAt) : null;
  const completedAt = run.metadata?.completedAt ? new Date(run.metadata.completedAt) : null;

  // Build tabs array - order: input, steps, result (config removed from overview)
  const tabs: { key: string; label: string; badge?: React.ReactNode; content: React.ReactNode }[] =
    [];

  if (hasToolPayload) {
    tabs.push({
      key: "payload",
      label: "Input",
      content: (
        <JsonCodeEditor
          value={JSON.stringify(cleanedToolPayload, null, 2)}
          readOnly
          maxHeight="500px"
        />
      ),
    });
  }

  if (hasStepResults) {
    displayStepResults.forEach((step: any, index: number) => {
      tabs.push({
        key: `step-${step.stepId}`,
        label: step.stepId,
        badge: step.success ? (
          <CheckCircle className="ml-1 h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <XCircle className="ml-1 h-3.5 w-3.5 text-destructive" />
        ),
        content: (
          <div className="space-y-2 min-w-0">
            <div className="text-xs text-muted-foreground font-medium">{step.stepId}</div>
            {step.error && (
              <div className="p-2 bg-muted/50 border border-border rounded text-xs">
                <pre className="text-foreground whitespace-pre-wrap font-mono">{step.error}</pre>
              </div>
            )}
            {step.data && (
              <JsonCodeEditor
                value={JSON.stringify(removeNullFields(step.data), null, 2)}
                readOnly
                maxHeight="500px"
              />
            )}
          </div>
        ),
      });
    });
  }

  if (hasToolResult) {
    tabs.push({
      key: "result",
      label: "Result",
      badge: isFailed ? (
        <XCircle className="ml-1 h-3.5 w-3.5 text-destructive" />
      ) : (
        <CheckCircle className="ml-1 h-3.5 w-3.5 text-emerald-500" />
      ),
      content: (
        <JsonCodeEditor
          value={JSON.stringify(cleanedToolResult, null, 2)}
          readOnly
          maxHeight="400px"
        />
      ),
    });
  }

  // Set default tab to first available
  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  return (
    <div className="p-4 space-y-4 overflow-y-auto [scrollbar-gutter:stable] min-w-0">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Run ID</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono truncate" title={run.runId}>
              {run.runId}
            </span>
            <CopyButton text={run.runId} />
          </div>
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Started</h4>
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs">{startedAt ? startedAt.toLocaleString() : "-"}</span>
          </div>
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Completed</h4>
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs">{completedAt ? completedAt.toLocaleString() : "-"}</span>
          </div>
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Duration</h4>
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs">
              {run.metadata?.durationMs != null
                ? formatDurationShort(run.metadata.durationMs)
                : "-"}
            </span>
          </div>
        </div>
      </div>
      {loadError && (
        <div className="p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-400">{loadError}</p>
        </div>
      )}

      {isFailed && run.error && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground">Error Message</h4>
          <div className="p-2 bg-muted/50 border border-border rounded-lg">
            <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">{run.error}</pre>
          </div>
        </div>
      )}

      {tabs.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto p-1.5 bg-muted/40 rounded-lg gap-1.5 flex-wrap justify-start w-full">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="h-8 px-3 text-xs font-medium flex items-center gap-1 rounded-md bg-background border border-border/60 shadow-md hover:shadow-lg active:translate-y-[1px] active:shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary/50 transition-all"
              >
                {tab.label}
                {tab.badge}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="mt-3">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      )}
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
    (a, b) =>
      new Date(b.metadata?.startedAt ?? 0).getTime() -
      new Date(a.metadata?.startedAt ?? 0).getTime(),
  );

  return (
    <div className="space-y-2">
      {sortedRuns.map((run) => {
        const runId = run.runId;
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
                {run.metadata?.startedAt
                  ? new Date(run.metadata.startedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
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
