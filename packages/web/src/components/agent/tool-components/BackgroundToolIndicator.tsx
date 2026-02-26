"use client";

import { ToolCall } from "@superglue/shared";
import {
  Search,
  BookOpen,
  Globe,
  Hammer,
  Blocks,
  Save,
  History,
  GraduationCap,
  Eye,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/src/lib/general-utils";
import { MessagePart } from "@superglue/shared";
import { useState } from "react";

interface BackgroundToolConfig {
  icon: typeof Search;
  label: string | ((tool: ToolCall) => string);
  activeLabel: string;
}

const BACKGROUND_TOOL_CONFIG: Record<string, BackgroundToolConfig> = {
  web_search: {
    icon: Globe,
    label: "Searched web",
    activeLabel: "Searching web...",
  },
  search_documentation: {
    icon: BookOpen,
    label: "Read documentation",
    activeLabel: "Reading documentation...",
  },
  find_tool: {
    icon: Hammer,
    label: "Found tools",
    activeLabel: "Finding tools...",
  },
  find_system: {
    icon: Blocks,
    label: "Found system",
    activeLabel: "Finding system...",
  },
  save_tool: {
    icon: Save,
    label: "Saved tool",
    activeLabel: "Saving tool...",
  },
  find_system_templates: {
    icon: Search,
    label: "Found templates",
    activeLabel: "Finding templates...",
  },
  read_skill: {
    icon: GraduationCap,
    label: (tool: ToolCall) => {
      const loaded = tool.output?.loaded as string[] | undefined;
      if (loaded?.length) return `Loaded ${loaded.join(", ")}`;
      return "Loaded skills";
    },
    activeLabel: "Loading skills...",
  },
  inspect_tool: {
    icon: Eye,
    label: "Inspected tool",
    activeLabel: "Inspecting tool...",
  },
};

export const BACKGROUND_TOOL_NAMES = new Set(Object.keys(BACKGROUND_TOOL_CONFIG));

export type GroupedPart =
  | { type: "content"; part: MessagePart }
  | { type: "tool"; part: MessagePart }
  | { type: "error"; part: MessagePart }
  | { type: "background_tools"; tools: ToolCall[] };

export function groupMessageParts(parts: MessagePart[]): GroupedPart[] {
  const grouped: GroupedPart[] = [];
  let currentBackgroundTools: ToolCall[] = [];

  const flushBackgroundTools = () => {
    if (currentBackgroundTools.length > 0) {
      grouped.push({ type: "background_tools", tools: [...currentBackgroundTools] });
      currentBackgroundTools = [];
    }
  };

  for (const part of parts) {
    if (part.type === "tool" && part.tool && BACKGROUND_TOOL_NAMES.has(part.tool.name)) {
      currentBackgroundTools.push(part.tool);
    } else {
      flushBackgroundTools();
      if (part.type === "content") {
        grouped.push({ type: "content", part });
      } else if (part.type === "tool") {
        grouped.push({ type: "tool", part });
      } else if (part.type === "error") {
        grouped.push({ type: "error", part });
      }
    }
  }
  flushBackgroundTools();

  return grouped;
}

function ShimmerText({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer-text",
        "bg-gradient-to-r from-muted-foreground/60 via-muted-foreground via-muted-foreground/60 to-muted-foreground/60",
        className,
      )}
      style={{
        backgroundSize: "200% 100%",
      }}
    >
      {text}
    </span>
  );
}

interface BackgroundToolIndicatorProps {
  tool: ToolCall;
  count?: number;
}

export function BackgroundToolIndicator({ tool, count }: BackgroundToolIndicatorProps) {
  const config = BACKGROUND_TOOL_CONFIG[tool.name];
  if (!config) return null;

  const isActive = tool.status === "running" || tool.status === "pending";
  const Icon = config.icon;
  const label = typeof config.label === "function" ? config.label(tool) : config.label;
  const displayLabel = label;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs py-0.5",
        isActive ? "text-muted-foreground" : "text-muted-foreground/60",
      )}
    >
      <Icon className={cn("w-3 h-3", isActive && "animate-shimmer-icon")} />
      {isActive ? (
        <ShimmerText text={config.activeLabel} className="font-medium" />
      ) : (
        <span className="font-medium">{displayLabel}</span>
      )}
    </div>
  );
}

interface DeduplicatedTool {
  tool: ToolCall;
  count: number;
}

function deduplicateTools(tools: ToolCall[]): DeduplicatedTool[] {
  const seen = new Map<string, DeduplicatedTool>();
  for (const tool of tools) {
    const existing = seen.get(tool.name);
    if (existing) {
      existing.count++;
    } else {
      seen.set(tool.name, { tool, count: 1 });
    }
  }
  return Array.from(seen.values());
}

interface BackgroundToolGroupProps {
  tools: ToolCall[];
}

export function BackgroundToolGroup({ tools }: BackgroundToolGroupProps) {
  const [expanded, setExpanded] = useState(false);
  if (tools.length === 0) return null;

  const hasAnyActive = tools.some((t) => t.status === "running" || t.status === "pending");

  const deduplicated = deduplicateTools(tools);
  const showCollapsible = deduplicated.length > 1 && !hasAnyActive;

  return (
    <>
      <style jsx global>{`
        @keyframes shimmer-text {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }
        @keyframes shimmer-icon {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }
        .animate-shimmer-text {
          animation: shimmer-text 2s ease-in-out infinite;
        }
        .animate-shimmer-icon {
          animation: shimmer-icon 1.5s ease-in-out infinite;
        }
      `}</style>
      {showCollapsible ? (
        <div className="py-0.5">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground/80 transition-colors cursor-pointer select-none"
          >
            <ChevronRight
              className={cn("w-3 h-3 transition-transform duration-150", expanded && "rotate-90")}
            />
            <span className="font-medium">{tools.length} background actions</span>
          </div>
          {expanded && (
            <div className="flex flex-col gap-0.5 pl-4 pt-0.5">
              {deduplicated.map(({ tool, count }) => (
                <BackgroundToolIndicator key={tool.name} tool={tool} count={count} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 py-0.5">
          {deduplicated.map(({ tool, count }) => (
            <BackgroundToolIndicator key={tool.name} tool={tool} count={count} />
          ))}
        </div>
      )}
    </>
  );
}
