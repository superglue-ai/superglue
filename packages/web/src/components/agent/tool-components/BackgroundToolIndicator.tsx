"use client";

import { ToolCall } from "@superglue/shared";
import { Search, BookOpen, LayoutTemplate, Globe, Hammer, Blocks, Save } from "lucide-react";
import { cn } from "@/src/lib/general-utils";
import { MessagePart } from "@superglue/shared";

const BACKGROUND_TOOL_CONFIG: Record<
  string,
  { icon: typeof Search; label: string; activeLabel: string }
> = {
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
  find_system_templates: {
    icon: LayoutTemplate,
    label: "Found templates",
    activeLabel: "Finding templates...",
  },
  find_tool: {
    icon: Hammer,
    label: "Found tool",
    activeLabel: "Finding tool...",
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
};

export const BACKGROUND_TOOL_NAMES = new Set(Object.keys(BACKGROUND_TOOL_CONFIG));

export type GroupedPart =
  | { type: "content"; part: MessagePart }
  | { type: "tool"; part: MessagePart }
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
}

export function BackgroundToolIndicator({ tool }: BackgroundToolIndicatorProps) {
  const config = BACKGROUND_TOOL_CONFIG[tool.name];
  if (!config) return null;

  const isActive = tool.status === "running" || tool.status === "pending";
  const Icon = config.icon;

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
        <span className="font-medium">{config.label}</span>
      )}
    </div>
  );
}

interface BackgroundToolGroupProps {
  tools: ToolCall[];
}

export function BackgroundToolGroup({ tools }: BackgroundToolGroupProps) {
  if (tools.length === 0) return null;

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1">
        {tools.map((tool) => (
          <BackgroundToolIndicator key={tool.id} tool={tool} />
        ))}
      </div>
    </>
  );
}
