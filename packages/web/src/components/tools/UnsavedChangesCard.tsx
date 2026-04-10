"use client";

import { useQuery } from "@tanstack/react-query";
import { DiffDisplay } from "@/src/components/agent/tool-components/DiffDisplayComponent";
import { Popover, PopoverContent, PopoverTrigger } from "@/src/components/ui/popover";
import { computeToolDiffs, EnrichedDiff } from "@/src/lib/config-diff-utils";
import { cn } from "@/src/lib/general-utils";
import { useEESuperglueClient } from "@/src/queries/use-client";
import { Tool } from "@superglue/shared";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

interface UnsavedChangesCardProps {
  hasUnsavedChanges: boolean;
  savedTool: Tool | null;
  currentTool: Tool;
  className?: string;
}

const DIFF_SUMMARY_INSTRUCTION = `
</instructions>
<output_format>One sentence, max 15 words, mentioning specific values that changed.</output_format>`;

function formatValue(val: any, maxLen = 80): string {
  if (val === undefined || val === null) return "(none)";
  if (typeof val === "string") {
    return val.length > maxLen ? val.slice(0, maxLen) + "..." : val;
  }
  const str = JSON.stringify(val);
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

function simplifyPath(path: string): string {
  return path
    .replace(/^\//, "")
    .replace(/steps\/(\d+)/g, (_, n) => `Step ${parseInt(n) + 1}`)
    .replace(/\//g, " > ")
    .replace(/config > /g, "")
    .replace(/properties > /g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

function buildDiffSummaryPrompt(toolId: string, enrichedDiffs: EnrichedDiff[]): string {
  const changes: string[] = [];

  for (const enriched of enrichedDiffs) {
    const { diff, oldValue, newValue } = enriched;
    const field = simplifyPath(diff.path);
    const op = diff.op;

    if (op === "add") {
      changes.push(`<change type="added" field="${field}">${formatValue(newValue)}</change>`);
    } else if (op === "remove") {
      changes.push(`<change type="removed" field="${field}">${formatValue(oldValue)}</change>`);
    } else if (op === "replace") {
      changes.push(`<change type="modified" field="${field}">
  <before>${formatValue(oldValue)}</before>
  <after>${formatValue(newValue)}</after>
</change>`);
    }
  }

  return `<instructions>Summarize the tool configuration changes below.</instructions>
<changes>
${changes.join("\n")}
</changes>
${DIFF_SUMMARY_INSTRUCTION}`;
}

function createDiffCacheKey(toolId: string, enrichedDiffs: EnrichedDiff[]): string {
  // Include values in the key so different edits to the same field get different cache entries
  const diffContent = enrichedDiffs
    .map((d) => `${d.diff.op}:${d.diff.path}:${JSON.stringify(d.diff.value ?? "")}`)
    .join("|");
  // Simple hash to keep key manageable
  let hash = 0;
  for (let i = 0; i < diffContent.length; i++) {
    hash = (hash << 5) - hash + diffContent.charCodeAt(i);
    hash |= 0;
  }
  return `diff:${toolId}:${hash}`;
}

export function UnsavedChangesCard({
  hasUnsavedChanges,
  savedTool,
  currentTool,
  className,
}: UnsavedChangesCardProps) {
  const createEEClient = useEESuperglueClient();
  const [isOpen, setIsOpen] = useState(false);

  const enrichedDiffs = useMemo(() => {
    if (!savedTool || !hasUnsavedChanges) return [];

    try {
      return computeToolDiffs(savedTool, currentTool);
    } catch (error) {
      console.error("Failed to compute diffs:", error);
      return [];
    }
  }, [savedTool, currentTool, hasUnsavedChanges]);

  const toolId = currentTool.id;
  const cacheKey = useMemo(
    () => createDiffCacheKey(toolId, enrichedDiffs),
    [toolId, enrichedDiffs],
  );

  const summaryQuery = useQuery({
    queryKey: ["tool-diff-summary", toolId, cacheKey],
    queryFn: async () => {
      const prompt = buildDiffSummaryPrompt(toolId, enrichedDiffs);
      const result = await createEEClient().summarize(prompt);
      return result.summary;
    },
    enabled: isOpen && enrichedDiffs.length > 0,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });

  const ChevronIcon = isOpen ? ChevronDown : ChevronRight;

  if (!hasUnsavedChanges) {
    return (
      <div className={cn("text-right", className)}>
        <div className="invisible inline-flex items-center gap-1.5 px-2.5 py-1 bg-background border rounded-full">
          <span className="h-2 w-2 rounded-full" />
          <span className="text-xs font-medium">Unsaved Changes</span>
          <ChevronRight className="h-3 w-3" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("text-right", className)}>
      <Popover onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-background border border-amber-300 dark:border-amber-700 shadow-sm rounded-full hover:shadow transition-shadow">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-medium">Unsaved Changes</span>
            <ChevronIcon className="h-3 w-3 text-muted-foreground transition-transform" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[500px] p-0">
          <div className="p-3 border-b">
            <h4 className="text-sm font-medium">Pending Changes</h4>
            {summaryQuery.isLoading || summaryQuery.isFetching ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Summarizing changes...</span>
              </div>
            ) : summaryQuery.data ? (
              <p className="text-xs text-muted-foreground mt-0.5">{summaryQuery.data}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                {enrichedDiffs.length} change{enrichedDiffs.length !== 1 ? "s" : ""} not yet saved
              </p>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto p-3">
            {enrichedDiffs.length > 0 ? (
              <DiffDisplay enrichedDiffs={enrichedDiffs} compact />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">
                Changes detected but no diff available
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
