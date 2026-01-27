"use client";

import { useConfig } from "@/src/app/config-context";
import { useSchedules } from "@/src/app/schedules-context";
import { RunsList } from "@/src/components/runs/RunsList";
import { Button } from "@/src/components/ui/button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { Run } from "@superglue/shared";
import { Calendar, Code, ExternalLink, RefreshCw, Webhook, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CopyButton } from "../shared/CopyButton";
import { useToolCodeSnippets } from "../deploy/useToolCodeSnippets";
import { SdkAccordion } from "../deploy/SdkAccordion";
import ToolSchedulesList from "../deploy/ToolSchedulesList";
import { cn } from "@/src/lib/general-utils";

interface TriggersCardProps {
  toolId: string;
  payload: Record<string, any>;
  /** Compact mode for embedding in gallery (no scroll area wrapper) */
  compact?: boolean;
}

export function TriggersCard({ toolId, payload, compact = false }: TriggersCardProps) {
  const config = useConfig();
  const { getSchedulesForTool } = useSchedules();
  const [activeSection, setActiveSection] = useState<"schedule" | "webhook" | "sdk">("schedule");

  // Webhook runs state
  const [webhookRuns, setWebhookRuns] = useState<Run[]>([]);
  const [webhookRunsLoading, setWebhookRunsLoading] = useState(false);
  const [webhookRunsError, setWebhookRunsError] = useState<string | null>(null);

  const isSavedTool = toolId && !toolId.startsWith("draft_") && toolId !== "new";
  const activeScheduleCount = isSavedTool
    ? getSchedulesForTool(toolId).filter((s) => s.enabled).length
    : 0;

  const snippets = useToolCodeSnippets(toolId, payload);

  // Fetch webhook runs
  const fetchWebhookRuns = useCallback(async () => {
    if (!isSavedTool) return;

    setWebhookRunsLoading(true);
    setWebhookRunsError(null);
    try {
      const client = createSuperglueClient(config.superglueEndpoint);
      const result = await client.listRuns({
        toolId: toolId,
        requestSource: "webhook",
        limit: 10,
      });
      setWebhookRuns(result.items);
    } catch (err: any) {
      setWebhookRunsError(err.message || "Failed to fetch webhook runs");
    } finally {
      setWebhookRunsLoading(false);
    }
  }, [config.superglueEndpoint, toolId, isSavedTool]);

  useEffect(() => {
    if (activeSection === "webhook" && isSavedTool) {
      fetchWebhookRuns();
    }
  }, [activeSection, isSavedTool, fetchWebhookRuns]);

  if (!isSavedTool) {
    return (
      <div className="flex flex-col items-center justify-center h-full pt-28 pb-12 text-center px-4">
        <Zap className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">Save this tool first</p>
        <p className="text-xs text-muted-foreground/70 mt-2 max-w-[240px]">
          Triggers like webhooks, schedules, and API access will be available after saving.
        </p>
      </div>
    );
  }

  const content = (
    <div className={compact ? "space-y-4" : "p-4 space-y-4"}>
      {/* Schedule Section */}
      {activeSection === "schedule" && (
        <>
          <p className="text-xs text-muted-foreground">
            Automate this tool by scheduling it to run at specific times or intervals.
          </p>
          <ToolSchedulesList toolId={toolId} />
          <div className="text-xs text-muted-foreground pt-2">
            <a
              href="https://docs.superglue.cloud/guides/deploying-a-tool#scheduled-execution"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              Learn more about scheduling
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </>
      )}

      {/* Webhook Section */}
      {activeSection === "webhook" && (
        <>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Trigger this tool from external services like Stripe, GitHub, or any system that can
              send HTTP POST requests. The request body becomes the tool's input.
            </p>
            <div className="text-xs font-medium text-muted-foreground">Webhook URL</div>
            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1.5 rounded-md border border-border">
              <code className="text-[10px] font-mono text-foreground flex-1 truncate">
                {snippets.webhookUrl}
              </code>
              <CopyButton text={snippets.webhookUrl} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Replace <code className="bg-muted px-1 rounded">YOUR_API_KEY</code> with your{" "}
              <a href="/api-keys" className="underline hover:text-foreground">
                API key
              </a>
              .
            </p>
          </div>

          {/* Recent Webhook Runs */}
          <div className="space-y-2 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Recent Webhook Requests
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchWebhookRuns}
                disabled={webhookRunsLoading}
                className="h-6 px-2"
              >
                <RefreshCw className={`h-3 w-3 ${webhookRunsLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {webhookRunsError ? (
              <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2">
                {webhookRunsError}
              </div>
            ) : (
              <RunsList
                runs={webhookRuns}
                loading={webhookRunsLoading}
                emptyMessage="No webhook requests yet."
              />
            )}
          </div>

          <div className="text-xs text-muted-foreground pt-2">
            <a
              href="https://docs.superglue.cloud/api/overview#webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              Learn more about webhooks
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </>
      )}

      {/* SDK/API Section */}
      {activeSection === "sdk" && (
        <>
          <p className="text-xs text-muted-foreground">
            Call this tool programmatically using our SDK or REST API.
          </p>
          <SdkAccordion
            typescriptCode={snippets.typescriptCode}
            pythonCode={snippets.pythonCode}
            curlCommand={snippets.curlCommand}
            variant="card"
          />
        </>
      )}
    </div>
  );

  return (
    <div className={compact ? "bg-card border rounded-lg shadow-md p-4" : "flex flex-col h-full"}>
      {/* Header */}
      {compact && (
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-amber-500" />
          <h3 className="text-lg font-semibold">Triggers</h3>
        </div>
      )}
      {/* Section tabs */}
      <Tabs
        value={activeSection}
        onValueChange={(v) => setActiveSection(v as "schedule" | "webhook" | "sdk")}
        className={compact ? "mb-3" : ""}
      >
        <TabsList className={cn("h-9 p-1 rounded-md", compact ? "" : "mx-3 my-2")}>
          <TabsTrigger
            value="schedule"
            className="h-full px-3 text-xs flex items-center gap-1.5 rounded-sm data-[state=active]:rounded-sm"
          >
            <Calendar className="h-3.5 w-3.5" />
            Schedule
            {activeScheduleCount > 0 && (
              <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 min-w-[1rem] text-center">
                {activeScheduleCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="webhook"
            className="h-full px-3 text-xs flex items-center gap-1.5 rounded-sm data-[state=active]:rounded-sm"
          >
            <Webhook className="h-3.5 w-3.5" />
            Webhook
          </TabsTrigger>
          <TabsTrigger
            value="sdk"
            className="h-full px-3 text-xs flex items-center gap-1.5 rounded-sm data-[state=active]:rounded-sm"
          >
            <Code className="h-3.5 w-3.5" />
            SDK/API
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {compact ? content : <ScrollArea className="flex-1">{content}</ScrollArea>}
    </div>
  );
}
