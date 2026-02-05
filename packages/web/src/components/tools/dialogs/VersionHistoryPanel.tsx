"use client";

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { DiffDisplay } from "@/src/components/agent/tool-components/DiffDisplayComponent";
import { Button } from "@/src/components/ui/button";
import { ConfirmButton } from "@/src/components/ui/confirm-button";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { createEESuperglueClient } from "@/src/lib/ee-superglue-client";
import { enrichDiffsWithTargets } from "@/src/lib/config-diff-utils";
import { getLatestDraft, onDraftChange, type ToolDraft } from "@/src/lib/storage";
import { Tool, ToolDiff } from "@superglue/shared";
import * as jsonpatch from "fast-json-patch";
import { ArchiveRestore, History, Loader2, FileEdit } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface ToolHistoryEntry {
  version: number;
  createdAt: string;
  createdByUserId?: string;
  createdByEmail?: string;
  tool: Tool;
}

interface VersionHistoryPanelProps {
  savedTool: Tool;
  playgroundTool?: Tool | null;
  onRestoreDraft?: (draft: ToolDraft) => void;
  isActive?: boolean;
}

const tryParseJSON = (v: string) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

// Normalize Tool for comparison (strips metadata fields that shouldn't affect diffs)
const normalizeForComparison = (tool: any) => {
  const { createdAt, updatedAt, name, id, folder, ...rest } = tool;
  return rest;
};

function CurrentVersionItem({
  currentTool,
  latestArchived,
  formatDate,
}: {
  currentTool: Tool;
  latestArchived: Tool | null;
  formatDate: (dateStr: string) => string;
}) {
  const [showChanges, setShowChanges] = useState(false);

  const enrichedDiffs = useMemo(() => {
    if (!latestArchived) return [];

    const archivedNorm = normalizeForComparison(latestArchived);
    const currentNorm = normalizeForComparison(currentTool);
    const diffs = jsonpatch.compare(archivedNorm, currentNorm) as ToolDiff[];

    const enriched = enrichDiffsWithTargets(diffs, archivedNorm as any);
    return enriched.filter((d) => d.lines.length > 0);
  }, [currentTool, latestArchived]);

  const hasChanges = enrichedDiffs.length > 0;

  const toolDate = currentTool.updatedAt || currentTool.createdAt;
  const toolDateStr = toolDate
    ? typeof toolDate === "string"
      ? toolDate
      : new Date(toolDate).toISOString()
    : null;

  return (
    <div className="border rounded-lg px-3 sm:px-4 py-3 border-primary/50 bg-primary/5">
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-sm min-w-0 flex-1">
          <span className="font-medium">Saved version</span>
          {toolDateStr && (
            <span className="text-muted-foreground"> · {formatDate(toolDateStr)}</span>
          )}
        </span>
      </div>
      {hasChanges ? (
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChanges(!showChanges)}
            className="h-7 text-xs"
          >
            {showChanges ? "Hide" : "Show"} changes
          </Button>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">No changes</div>
      )}
      <div
        className={`grid transition-all duration-200 ${showChanges && hasChanges ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="mt-3 max-h-80 overflow-y-auto">
            <DiffDisplay enrichedDiffs={enrichedDiffs} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftItem({
  draft,
  currentTool,
  isRestoring,
  isRestoringDraft,
  canRestore,
  onRestore,
  formatDate,
  showRestore = true,
}: {
  draft: ToolDraft;
  currentTool: Tool;
  isRestoring: boolean;
  isRestoringDraft: boolean;
  canRestore: boolean;
  onRestore: () => void;
  formatDate: (dateStr: string) => string;
  showRestore?: boolean;
}) {
  const [showChanges, setShowChanges] = useState(false);

  const draftTool: Tool = useMemo(() => {
    return {
      id: draft.toolId,
      steps: draft.steps,
      instruction: draft.instruction,
      outputTransform: draft.outputTransform ?? draft.outputTransform,
      inputSchema: draft.inputSchema ? tryParseJSON(draft.inputSchema) : null,
      outputSchema:
        draft.outputSchema ?? (draft.outputSchema ? tryParseJSON(draft.outputSchema) : null),
    } as Tool;
  }, [draft]);

  const enrichedDiffs = useMemo(() => {
    const baseNorm = normalizeForComparison(currentTool);
    const draftNorm = normalizeForComparison(draftTool);
    const diffs = jsonpatch.compare(baseNorm, draftNorm) as ToolDiff[];
    const enriched = enrichDiffsWithTargets(diffs, baseNorm as any);
    return enriched.filter((d) => d.lines.length > 0);
  }, [draftTool, currentTool]);

  const hasChanges = enrichedDiffs.length > 0;

  // Don't show if draft is same as current tool
  if (!hasChanges) return null;

  return (
    <div className="border rounded-lg px-3 sm:px-4 py-3 border-amber-500/50 bg-amber-500/5">
      <div className="flex items-center gap-2 sm:gap-3">
        <FileEdit className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <span className="text-xs font-mono bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded flex-shrink-0">
          Draft
        </span>
        <span className="text-sm min-w-0 truncate text-muted-foreground">
          {formatDate(new Date(draft.createdAt).toISOString())}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        {hasChanges && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChanges(!showChanges)}
            className="h-7 text-xs"
          >
            {showChanges ? "Hide" : "Show"} changes
          </Button>
        )}
        <div className="flex-1" />
        {showRestore && (
          <ConfirmButton
            onConfirm={onRestore}
            disabled={isRestoring || !canRestore || !hasChanges}
            isLoading={isRestoringDraft}
            className="h-7 text-xs text-primary"
          >
            <span className="flex items-center">
              <ArchiveRestore className="h-3 w-3 mr-1" />
              Restore
            </span>
          </ConfirmButton>
        )}
      </div>
      <div
        className={`grid transition-all duration-200 ${showChanges && hasChanges ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="mt-3 max-h-80 overflow-y-auto">
            {enrichedDiffs.length > 0 ? (
              <DiffDisplay enrichedDiffs={enrichedDiffs} />
            ) : (
              <div className="text-sm text-muted-foreground">
                No differences from current version
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryItem({
  entry,
  previousVersion,
  isRestoring,
  onRestore,
  formatDate,
}: {
  entry: ToolHistoryEntry;
  previousVersion: Tool | null;
  isRestoring: number | null;
  onRestore: (version: number) => void;
  formatDate: (dateStr: string) => string;
}) {
  const [showChanges, setShowChanges] = useState(false);

  const { enrichedDiffs, isFirstVersion } = useMemo(() => {
    if (!previousVersion) {
      return { enrichedDiffs: [], isFirstVersion: true };
    }

    const prevNorm = normalizeForComparison(previousVersion);
    const currNorm = normalizeForComparison(entry.tool);
    const diffs = jsonpatch.compare(prevNorm, currNorm) as ToolDiff[];
    const enriched = enrichDiffsWithTargets(diffs, prevNorm as any);
    return { enrichedDiffs: enriched.filter((d) => d.lines.length > 0), isFirstVersion: false };
  }, [entry.tool, previousVersion]);

  const hasChanges = enrichedDiffs.length > 0 || isFirstVersion;

  return (
    <div className="border rounded-lg px-3 sm:px-4 py-3">
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded flex-shrink-0">
          v{entry.version}
        </span>
        <span className="text-sm min-w-0 truncate">
          {formatDate(entry.createdAt)}
          {entry.createdByEmail && (
            <span className="text-muted-foreground"> · {entry.createdByEmail}</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        {hasChanges && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChanges(!showChanges)}
            className="h-7 text-xs"
          >
            {showChanges ? "Hide" : "Show"} changes
          </Button>
        )}
        <div className="flex-1" />
        <ConfirmButton
          onConfirm={() => onRestore(entry.version)}
          disabled={isRestoring !== null}
          isLoading={isRestoring === entry.version}
          className="h-7 text-xs text-primary"
        >
          <span className="flex items-center">
            <ArchiveRestore className="h-3 w-3 mr-1" />
            Restore
          </span>
        </ConfirmButton>
      </div>
      <div
        className={`grid transition-all duration-200 ${showChanges ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="mt-3 max-h-80 overflow-y-auto">
            {enrichedDiffs.length > 0 ? (
              <DiffDisplay enrichedDiffs={enrichedDiffs} />
            ) : isFirstVersion ? (
              <div className="text-sm text-muted-foreground">Initial saved version</div>
            ) : (
              <div className="text-sm text-muted-foreground italic">No differences</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VersionHistoryPanel({
  savedTool,
  playgroundTool,
  onRestoreDraft,
  isActive = true,
}: VersionHistoryPanelProps) {
  const config = useConfig();
  const { refreshTools } = useTools();
  const [history, setHistory] = useState<ToolHistoryEntry[]>([]);
  const [draft, setDraft] = useState<ToolDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState<number | null>(null);
  const [isRestoringDraft, setIsRestoringDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftCompareTool = playgroundTool || savedTool;

  const fetchDraft = useCallback(async () => {
    if (!savedTool) return;

    try {
      const latestDraft = await getLatestDraft(savedTool.id);
      setDraft(latestDraft);
    } catch (err: any) {
      console.error("Failed to fetch draft:", err);
    }
  }, [savedTool?.id]);

  // Subscribe to draft changes
  useEffect(() => {
    if (!savedTool?.id) return;

    return onDraftChange((changedToolId) => {
      if (changedToolId === savedTool.id) {
        fetchDraft();
      }
    });
  }, [savedTool?.id, fetchDraft]);

  useEffect(() => {
    if (savedTool && isActive) {
      fetchHistory();
      fetchDraft();
    }
  }, [savedTool?.id, savedTool?.updatedAt, isActive, fetchDraft]);

  const fetchHistory = async () => {
    if (!savedTool) return;

    setIsLoading(true);
    setError(null);
    try {
      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      const historyData = await client.listToolHistory(savedTool.id);
      setHistory(historyData);
    } catch (err: any) {
      console.error("Failed to fetch tool history:", err);
      setError(err.message || "Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (version: number) => {
    if (!savedTool) return;

    setIsRestoring(version);
    try {
      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      await client.restoreToolVersion(savedTool.id, version);
      await refreshTools();
    } catch (err: any) {
      console.error("Failed to restore version:", err);
      setError(err.message || "Failed to restore version");
    } finally {
      setIsRestoring(null);
    }
  };

  const handleRestoreDraft = async (draft: ToolDraft) => {
    if (!savedTool) return;

    if (!onRestoreDraft) {
      console.warn("onRestoreDraft callback not provided");
      setError("Restore callback not available. Please refresh the page.");
      return;
    }

    setIsRestoringDraft(draft.id);
    try {
      onRestoreDraft(draft);
      // Don't delete draft on restore - it will be deleted on save
    } catch (err: any) {
      console.error("Failed to restore draft:", err);
      setError(err.message || "Failed to restore draft");
    } finally {
      setIsRestoringDraft(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="mx-4 mt-4 bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          {error}
        </div>
      )}

      <ScrollArea className="flex-1 px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 && !draft ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No version history available</p>
            <p className="text-sm mt-1">History will appear after you save changes to this tool</p>
          </div>
        ) : (
          <div className="space-y-2">
            {draft &&
              draftCompareTool &&
              (() => {
                const draftTool: Tool = {
                  id: draft.toolId,
                  steps: draft.steps,
                  instruction: draft.instruction,
                  outputTransform: draft.outputTransform ?? draft.outputTransform,
                  inputSchema: draft.inputSchema ? tryParseJSON(draft.inputSchema) : null,
                  outputSchema:
                    draft.outputSchema ??
                    (draft.outputSchema ? tryParseJSON(draft.outputSchema) : null),
                } as Tool;

                const savedNorm = normalizeForComparison(savedTool);
                const draftNorm = normalizeForComparison(draftTool);
                const savedDiffs = jsonpatch.compare(savedNorm, draftNorm) as ToolDiff[];
                const savedEnriched = enrichDiffsWithTargets(savedDiffs, savedNorm as any).filter(
                  (d) => d.lines.length > 0,
                );
                const showDraft = savedEnriched.length > 0;

                if (!showDraft) return null;

                const compareNorm = normalizeForComparison(draftCompareTool);
                const restoreDiffs = jsonpatch.compare(compareNorm, draftNorm) as ToolDiff[];
                const restoreEnriched = enrichDiffsWithTargets(
                  restoreDiffs,
                  compareNorm as any,
                ).filter((d) => d.lines.length > 0);
                const showRestore = restoreEnriched.length > 0;

                return (
                  <DraftItem
                    draft={draft}
                    currentTool={savedTool}
                    isRestoring={isRestoring !== null}
                    isRestoringDraft={isRestoringDraft === draft.id}
                    canRestore={!!onRestoreDraft}
                    onRestore={() => handleRestoreDraft(draft)}
                    formatDate={formatDate}
                    showRestore={showRestore}
                  />
                );
              })()}
            {savedTool && (
              <CurrentVersionItem
                currentTool={savedTool}
                latestArchived={history[0]?.tool || null}
                formatDate={formatDate}
              />
            )}
            {history.map((entry, idx) => (
              <HistoryItem
                key={entry.version}
                entry={entry}
                previousVersion={idx < history.length - 1 ? history[idx + 1]?.tool : null}
                isRestoring={isRestoring}
                onRestore={handleRestore}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
