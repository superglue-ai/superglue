"use client";

import { Button } from "@/src/components/ui/button";
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
  compact?: boolean;
}

function EnterpriseBanner({ feature }: { feature: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
      <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium">{feature} is an Enterprise feature</p>
        <p className="text-sm text-muted-foreground mt-1">
          Upgrade to superglue Enterprise to use {feature.toLowerCase()}s. Visit{" "}
          <a
            href="https://superglue.cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            superglue.ai
          </a>{" "}
          to learn more.
        </p>
      </div>
    </div>
  );
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
          Triggers like webhooks, schedules, and API access will be available after saving.
        </p>
      </div>
    );
  }

  const content = (
    <div className={compact ? "space-y-4" : "p-4 space-y-4"}>
      <div className={activeSection === "schedule" ? "" : "hidden"}>
        <EnterpriseBanner feature="Scheduling" />
      </div>

      <div className={activeSection === "webhook" ? "" : "hidden"}>
        <EnterpriseBanner feature="Webhooks" />
      </div>

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
      {compact && (
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-amber-500" />
          <h3 className="text-lg font-semibold">Triggers</h3>
        </div>
      )}
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
