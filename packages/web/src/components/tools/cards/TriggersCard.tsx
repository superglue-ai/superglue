"use client";

import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Calendar, Code, ExternalLink, Info, Webhook, Zap } from "lucide-react";
import { useState } from "react";
import { useToolCodeSnippets } from "../deploy/useToolCodeSnippets";
import { SdkAccordion } from "../deploy/SdkAccordion";
import { cn } from "@/src/lib/general-utils";

interface TriggersCardProps {
  toolId: string;
  payload: Record<string, any>;
  /** Compact mode for embedding in gallery (no scroll area wrapper) */
  compact?: boolean;
}

export function TriggersCard({ toolId, payload, compact = false }: TriggersCardProps) {
  const [activeSection, setActiveSection] = useState<"schedule" | "webhook" | "sdk">("sdk");

  const isSavedTool = toolId && !toolId.startsWith("draft_") && toolId !== "new";

  const snippets = useToolCodeSnippets(toolId, payload);

  // Fetch webhook runs
  const fetchWebhookRuns = useCallback(async () => {
    if (!isSavedTool) return;

    setWebhookRunsLoading(true);
    setWebhookRunsError(null);
    try {
      const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      const result = await client.listRuns({
        toolId: toolId,
        requestSources: ["webhook"],
        limit: 10,
      });
      setWebhookRuns(result.items);
      setWebhookRunsLastUpdated(new Date());
      setHasFetchedWebhookRuns(true);
    } catch (err: any) {
      setWebhookRunsError(err.message || "Failed to fetch webhook runs");
    } finally {
      setWebhookRunsLoading(false);
    }
  }, [config.superglueEndpoint, toolId, isSavedTool]);

  useEffect(() => {
    if (activeSection === "webhook" && isSavedTool && !hasFetchedWebhookRuns) {
      fetchWebhookRuns();
    }
  }, [activeSection, isSavedTool, hasFetchedWebhookRuns, fetchWebhookRuns]);

  useEffect(() => {
    setHasFetchedWebhookRuns(false);
    setWebhookRuns([]);
    setWebhookRunsLastUpdated(null);
  }, [toolId]);

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

  const enterpriseInfoBox = (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50 p-3">
      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
      <div className="text-xs">
        <p className="font-medium text-blue-900 dark:text-blue-100">Enterprise Feature</p>
        <p className="text-blue-700 dark:text-blue-300 mt-1">
          This feature is available on our Enterprise plan.{" "}
          <a
            href="https://cal.com/superglue/superglue-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-900 dark:hover:text-blue-100 inline-flex items-center gap-1"
          >
            Book a demo
            <ExternalLink className="h-3 w-3" />
          </a>{" "}
          to learn more.
        </p>
      </div>
    </div>
  );

  const content = (
    <div className={compact ? "space-y-4" : "p-4 space-y-4"}>
      {/* Schedule Section */}
      {activeSection === "schedule" && (
        <>
          <p className="text-xs text-muted-foreground">
            Automate this tool by scheduling it to run at specific times or intervals.
          </p>
          {enterpriseInfoBox}
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
          <p className="text-xs text-muted-foreground">
            Trigger this tool from external services like Stripe, GitHub, or any system that can
            send HTTP POST requests. The request body becomes the tool's input.
          </p>
          {enterpriseInfoBox}
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
