"use client";

import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Calendar, Code, Webhook, Zap } from "lucide-react";
import { useState } from "react";
import { useToolCodeSnippets } from "../deploy/useToolCodeSnippets";
import { SdkAccordion } from "../deploy/SdkAccordion";
import { cn } from "@/src/lib/general-utils";
import { EnterpriseFeatureCard } from "../../ui/enterprise-feature-card";

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

  if (!isSavedTool) {
    return (
      <div className="flex flex-col items-center justify-center h-full pt-28 pb-12 text-center px-4">
        <Zap className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">Save this tool first</p>
        <p className="text-xs text-muted-foreground/70 mt-2 max-w-[240px]">
          API access will be available after saving. Scheduling and webhooks are available in the
          Enterprise edition.
        </p>
      </div>
    );
  }

  const content = (
    <div className={compact ? "space-y-4" : "p-4 space-y-4"}>
      {/* Schedule Section */}
      <div className={activeSection === "schedule" ? "" : "hidden"}>
        <EnterpriseFeatureCard
          title="Scheduled Triggers"
          description="Recurring executions and schedule management are available in the Enterprise edition."
        />
      </div>

      {/* Webhook Section */}
      <div className={activeSection === "webhook" ? "" : "hidden"}>
        <EnterpriseFeatureCard
          title="Webhook Triggers"
          description="Incoming webhooks and webhook-triggered run history are available in the Enterprise edition."
        />
      </div>

      {/* SDK/API Section */}
      <div className={activeSection === "sdk" ? "" : "hidden"}>
        <p className="text-xs text-muted-foreground">
          Call this tool programmatically using our SDK or REST API.
        </p>
        <SdkAccordion
          typescriptCode={snippets.typescriptCode}
          pythonCode={snippets.pythonCode}
          curlCommand={snippets.curlCommand}
          variant="card"
        />
      </div>
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
