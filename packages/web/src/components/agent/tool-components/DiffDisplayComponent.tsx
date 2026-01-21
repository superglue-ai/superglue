"use client";

import { ToolDiff } from "@superglue/shared";
import {
  ChevronDown,
  ChevronUp,
  FileBracesCorner,
  FileInput,
  FileJson,
  FilePlay,
  FileText,
  Globe,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn, getSystemIcon, getSimpleIcon } from "@/src/lib/general-utils";
import {
  DiffLine,
  DiffTarget,
  DiffTargetType,
  EnrichedDiff,
  formatTargetLabel,
} from "@/src/lib/config-diff-utils";
import { useSystems } from "@/src/app/systems-context";

/**
 * Get icon for a diff target type (matches MiniStepCard icons)
 */
function getTargetIcon(type: DiffTargetType) {
  switch (type) {
    case "newStep":
      return <Plus className="h-3.5 w-3.5 text-green-500" />;
    case "finalTransform":
      return <FilePlay className="h-3.5 w-3.5 text-primary" />;
    case "inputSchema":
    case "responseSchema":
      return <FileBracesCorner className="h-3.5 w-3.5 text-primary" />;
    case "toolInput":
      return <FileJson className="h-3.5 w-3.5 text-primary" />;
    case "instruction":
      return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <Globe className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

/**
 * Get system-based icon for a step (matches MiniStepCard)
 */
function SystemIcon({ systemId }: { systemId?: string }) {
  const { systems } = useSystems();

  const simpleIcon = useMemo(() => {
    if (!systemId) return null;
    const system = systems.find((i) => i.id === systemId);
    if (!system) return null;
    const iconName = getSystemIcon(system);
    return iconName ? getSimpleIcon(iconName) : null;
  }, [systemId, systems]);

  if (simpleIcon) {
    return (
      <div className="p-1 rounded-full bg-white dark:bg-gray-100 border border-border/50">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={`#${simpleIcon.hex}`}
          className="flex-shrink-0"
        >
          <path d={simpleIcon.path} />
        </svg>
      </div>
    );
  }

  return <Globe className="h-3.5 w-3.5 text-muted-foreground" />;
}

// Re-export types for consumers
export type { ToolDiff, DiffTarget, EnrichedDiff, DiffLine };

/**
 * Render a single line of a diff with appropriate styling
 */
function DiffLineDisplay({ line, lineNumber }: { line: DiffLine; lineNumber?: number }) {
  const baseClasses = "flex items-start text-[11px] font-mono leading-5";

  const lineNumDisplay =
    lineNumber !== undefined ? (
      <span className="select-none text-muted-foreground/50 w-8 text-right pr-2 flex-shrink-0">
        {lineNumber}
      </span>
    ) : null;

  switch (line.type) {
    case "removed":
      return (
        <div className={cn(baseClasses, "bg-red-50 dark:bg-red-900/20")}>
          {lineNumDisplay}
          <span className="select-none text-red-400 dark:text-red-500 w-4 flex-shrink-0">-</span>
          <span className="text-red-700 dark:text-red-300 whitespace-pre">{line.content}</span>
        </div>
      );
    case "added":
      return (
        <div className={cn(baseClasses, "bg-green-50 dark:bg-green-900/20")}>
          {lineNumDisplay}
          <span className="select-none text-green-400 dark:text-green-500 w-4 flex-shrink-0">
            +
          </span>
          <span className="text-green-700 dark:text-green-300 whitespace-pre">{line.content}</span>
        </div>
      );
    case "context":
    default:
      return (
        <div className={cn(baseClasses, "text-muted-foreground")}>
          {lineNumDisplay}
          <span className="select-none w-4 flex-shrink-0">&nbsp;</span>
          <span className="whitespace-pre">{line.content}</span>
        </div>
      );
  }
}

/**
 * Display a single enriched diff item with header and code lines
 */
function DiffItem({ enrichedDiff }: { enrichedDiff: EnrichedDiff }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullContext, setShowFullContext] = useState(false);
  const { target, lines, contextNew } = enrichedDiff;
  const targetInfo = formatTargetLabel(target);

  // Calculate line numbers for the diff
  // Find the first changed line to determine starting line number
  const firstChangeIndex = lines.findIndex((l) => l.type !== "context");
  const startLineNum = Math.max(1, firstChangeIndex > 0 ? firstChangeIndex : 1);

  // Show first 8 lines by default, expand for more
  const previewLines = lines.slice(0, 8);
  const remainingLines = lines.slice(8);
  const hasMore = remainingLines.length > 0;

  // Full context lines (for "Show full config" mode)
  const fullContextLines = useMemo(() => {
    if (!contextNew) return [];
    return contextNew.split("\n").map((content, i) => ({
      type: "context" as const,
      content,
      lineNumber: i + 1,
    }));
  }, [contextNew]);

  return (
    <div className="text-xs font-mono bg-white dark:bg-neutral-900 rounded border border-border overflow-hidden">
      {/* Header with target info */}
      <div className="px-2 py-1.5 bg-muted/50 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {targetInfo.type === "step" ? (
            <SystemIcon systemId={targetInfo.systemId} />
          ) : (
            getTargetIcon(targetInfo.type)
          )}
          {targetInfo.stepNumber !== undefined && (
            <span className="text-[10px] px-1 py-0.5 rounded font-medium bg-primary/10 text-primary">
              {targetInfo.stepNumber}
            </span>
          )}
          <span className="font-medium text-foreground">
            {targetInfo.stepId || targetInfo.label}
          </span>
          {targetInfo.path && (
            <span className="text-muted-foreground text-[10px]">/{targetInfo.path}</span>
          )}
        </div>
        {contextNew && (
          <button
            onClick={() => setShowFullContext(!showFullContext)}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted/50"
            title={showFullContext ? "Show diff only" : "Show full context"}
          >
            <div className="flex flex-col -space-y-1.5">
              <ChevronUp
                className={cn(
                  "w-3 h-3 transition-opacity",
                  showFullContext ? "opacity-100" : "opacity-40",
                )}
              />
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-opacity",
                  showFullContext ? "opacity-40" : "opacity-100",
                )}
              />
            </div>
          </button>
        )}
      </div>

      {/* Diff lines or full context */}
      {showFullContext ? (
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto scrollbar-hidden">
          <div className="min-w-max">
            {fullContextLines.map((line, i) => (
              <DiffLineDisplay key={i} line={line} lineNumber={line.lineNumber} />
            ))}
          </div>
        </div>
      ) : lines.length > 0 ? (
        <div className="overflow-x-auto scrollbar-hidden">
          <div className="min-w-max">
            {previewLines.map((line, i) => (
              <DiffLineDisplay key={i} line={line} lineNumber={startLineNum + i} />
            ))}

            {/* Expanded lines */}
            {isExpanded &&
              remainingLines.map((line, i) => (
                <DiffLineDisplay key={i + 8} line={line} lineNumber={startLineNum + 8 + i} />
              ))}
          </div>
        </div>
      ) : (
        <div className="px-2 py-2 text-muted-foreground italic">No changes to display</div>
      )}

      {/* Expand/collapse button */}
      {!showFullContext && hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-2 py-1 text-center text-muted-foreground hover:bg-muted/50 border-t flex items-center justify-center gap-1 text-[10px]"
        >
          <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
          {isExpanded ? "Show less" : `${remainingLines.length} more lines`}
        </button>
      )}
    </div>
  );
}

/**
 * Display a list of enriched diffs (read-only, no approval controls)
 */
export function DiffDisplay({ enrichedDiffs }: { enrichedDiffs: EnrichedDiff[] }) {
  if (!enrichedDiffs || enrichedDiffs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {enrichedDiffs.map((enrichedDiff, index) => (
        <DiffItem key={index} enrichedDiff={enrichedDiff} />
      ))}
    </div>
  );
}

/**
 * Legacy DiffDisplay that takes raw ToolDiff[] - kept for backwards compatibility
 * but won't show line-by-line diffs without original config
 */
export function DiffDisplayLegacy({ diffs }: { diffs: ToolDiff[] }) {
  if (!diffs || diffs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {diffs.map((diff, index) => (
        <div
          key={index}
          className="text-xs font-mono bg-white dark:bg-neutral-900 rounded border border-border overflow-hidden"
        >
          <div className="px-2 py-1.5 bg-muted/50 border-b flex items-center gap-2">
            <span className="font-medium text-foreground">{diff.path}</span>
            <span className="text-muted-foreground text-[10px]">({diff.op})</span>
          </div>
          {diff.value !== undefined && (
            <div className="px-2 py-1 overflow-x-auto scrollbar-hidden">
              <pre className="text-[11px] whitespace-pre-wrap">
                {typeof diff.value === "string" ? diff.value : JSON.stringify(diff.value, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
