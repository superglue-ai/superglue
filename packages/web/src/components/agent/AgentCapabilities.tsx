"use client";

import { Badge } from "@/src/components/ui/badge";
import {
  Sheet,
  SheetOverlay,
  SheetPortal,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/src/components/ui/sheet";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/src/lib/general-utils";
import { AgentType } from "@/src/lib/agent/registry/agents";
import {
  AGENT_SUMMARIES,
  APPROVAL_LABELS,
  getGroupedToolsForAgent,
  type ApprovalMode,
} from "@/src/lib/agent/registry/tool-metadata";
import { Info, X } from "lucide-react";
import React, { useMemo } from "react";

const APPROVAL_STYLES: Record<ApprovalMode, string> = {
  auto: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  approval_after: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  approval_before: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
};

interface AgentCapabilitiesProps {
  agentType: AgentType;
  triggerClassName?: string;
  compact?: boolean;
}

export function AgentCapabilities({
  agentType,
  triggerClassName,
  compact = false,
}: AgentCapabilitiesProps) {
  const summary = AGENT_SUMMARIES[agentType];
  const groups = useMemo(() => getGroupedToolsForAgent(agentType), [agentType]);
  const toolCount = useMemo(() => groups.reduce((acc, g) => acc + g.tools.length, 0), [groups]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center justify-center rounded-xl transition-all duration-200",
            "text-muted-foreground/70 hover:text-foreground",
            "bg-muted/30 hover:bg-muted/60 border border-border/40 hover:border-border/60",
            compact ? "h-7 w-7" : "h-9 w-9",
            triggerClassName,
          )}
          title="Agent capabilities"
        >
          <Info className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        </button>
      </SheetTrigger>
      <SheetPortal>
        <SheetOverlay className="fixed inset-0 z-50 bg-background/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className={cn(
            "fixed z-50 inset-y-0 right-0 h-full w-[380px] sm:max-w-[380px]",
            "overflow-y-auto p-6 shadow-lg",
            "bg-gradient-to-b from-background to-muted/20",
            "border-l border-border/50",
            "transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          )}
        >
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
          <SheetHeader className="pb-4 border-b border-border/30">
            <SheetTitle className="text-base font-semibold">{summary?.title ?? "Agent"}</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground leading-relaxed">
              {summary?.description}
            </SheetDescription>
            <div className="pt-1">
              <span className="text-xs text-muted-foreground/60">{toolCount} tools available</span>
            </div>
          </SheetHeader>

          <div className="space-y-5 pt-5">
            {groups.map((group) => (
              <div key={group.category}>
                <h3 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider mb-2.5 px-1">
                  {group.label}
                </h3>
                <div className="space-y-1">
                  {group.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className={cn(
                        "group rounded-xl px-3 py-2.5 transition-colors duration-150",
                        "hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-foreground/90">
                              {tool.meta.displayName}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground/70 leading-relaxed">
                            {tool.meta.summary}
                          </p>
                        </div>
                        <Badge
                          className={cn(
                            "text-[10px] font-medium px-1.5 py-0 h-5 shrink-0 mt-0.5 rounded-md",
                            APPROVAL_STYLES[tool.approval],
                          )}
                        >
                          {APPROVAL_LABELS[tool.approval]}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 pb-2">
            <div className="rounded-xl bg-muted/30 border border-border/30 p-3">
              <h4 className="text-xs font-medium text-muted-foreground/70 mb-2">Approval legend</h4>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0 h-5 rounded-md",
                      APPROVAL_STYLES.auto,
                    )}
                  >
                    {APPROVAL_LABELS.auto}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground/60">
                    No confirmation needed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0 h-5 rounded-md",
                      APPROVAL_STYLES.approval_after,
                    )}
                  >
                    {APPROVAL_LABELS.approval_after}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground/60">
                    Runs first, then asks to apply
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0 h-5 rounded-md",
                      APPROVAL_STYLES.approval_before,
                    )}
                  >
                    {APPROVAL_LABELS.approval_before}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground/60">
                    Waits for your confirmation
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
