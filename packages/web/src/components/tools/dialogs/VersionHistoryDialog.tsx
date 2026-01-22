"use client";

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { DiffDisplay } from "@/src/components/agent/tool-components/DiffDisplayComponent";
import { Button } from "@/src/components/ui/button";
import { ConfirmButton } from "@/src/components/ui/confirm-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { createEESuperglueClient } from "@/src/lib/ee-superglue-client";
import { enrichDiffsWithTargets } from "@/src/lib/config-diff-utils";
import { Tool, ToolDiff } from "@superglue/shared";
import * as jsonpatch from "fast-json-patch";
import { ArchiveRestore, History, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface ToolHistoryEntry {
  version: number;
  createdAt: string;
  createdByUserId?: string;
  createdByEmail?: string;
  tool: Tool;
}

interface VersionHistoryDialogProps {
  tool: Tool | null;
  isOpen: boolean;
  onClose: () => void;
  onRestored?: () => void;
}

const tryParseJSON = (v: string) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

const PAGINATION_TYPE_MAP: Record<string, string> = {
  OFFSET_BASED: "offsetBased",
  PAGE_BASED: "pageBased",
  CURSOR_BASED: "cursorBased",
  DISABLED: "disabled",
};

const mapPaginationType = (type?: string) => {
  if (!type) return undefined;
  return PAGINATION_TYPE_MAP[type] || type.toLowerCase();
};

// Normalize archived tool (from history API, already in OpenAPI format)
// Explicitly lists all fields to ensure consistent structure with normalizeToOpenAPI
const normalizeArchived = (tool: any) => {
  const { createdAt, updatedAt, name, id, ...rest } = tool;
  const parseField = (val: any) => (typeof val === "string" ? tryParseJSON(val) : val);
  return {
    version: rest.version || "1.0.0",
    instruction: rest.instruction,
    inputSchema: rest.inputSchema,
    outputSchema: rest.outputSchema,
    steps: (rest.steps || []).map((step: any) => ({
      id: step.id,
      url: step.url,
      method: step.method || "GET",
      queryParams: parseField(step.queryParams) || null,
      headers: parseField(step.headers) || null,
      body: parseField(step.body) || null,
      systemId: step.systemId ?? step.integrationId ?? null,
      instruction: step.instruction || null,
      modify: step.modify ?? null,
      dataSelector: step.dataSelector || null,
      failureBehavior: step.failureBehavior || null,
      pagination: step.pagination ?? null,
    })),
    outputTransform: rest.outputTransform,
    archived: rest.archived ?? false,
  };
};

// Normalize tool to OpenAPI format (matches what mapToolToOpenAPI does on the backend)
// Always includes all fields (even null) to ensure consistent comparison with archived versions
const normalizeToOpenAPI = (tool: Tool) => {
  const t = tool as any;
  return {
    version: t.version || "1.0.0",
    instruction: t.instruction,
    inputSchema: t.inputSchema,
    outputSchema: t.responseSchema,
    steps: (t.steps || []).map((step: any) => {
      const apiConfig = step.apiConfig || {};
      const parseField = (val: any) => (typeof val === "string" ? tryParseJSON(val) : val);
      return {
        id: step.id,
        url: (apiConfig.urlHost || "") + (apiConfig.urlPath || ""),
        method: apiConfig.method || "GET",
        queryParams: parseField(apiConfig.queryParams) || null,
        headers: parseField(apiConfig.headers) || null,
        body: parseField(apiConfig.body) || null,
        systemId: step.systemId ?? step.integrationId ?? null,
        instruction: apiConfig.instruction || null,
        modify: step.modify ?? null,
        dataSelector: step.loopSelector || null,
        failureBehavior: step.failureBehavior || null,
        pagination: apiConfig.pagination
          ? {
              ...apiConfig.pagination,
              type: mapPaginationType(apiConfig.pagination.type),
            }
          : null,
      };
    }),
    outputTransform: t.finalTransform,
    archived: t.archived ?? false,
  };
};

function CurrentVersionItem({
  currentTool,
  latestArchived,
}: {
  currentTool: Tool;
  latestArchived: Tool | null;
}) {
  const [showChanges, setShowChanges] = useState(false);

  const enrichedDiffs = useMemo(() => {
    if (!latestArchived) return [];

    const archivedNorm = normalizeArchived(latestArchived);
    const diffs = jsonpatch.compare(archivedNorm, normalizeToOpenAPI(currentTool)) as ToolDiff[];

    const enriched = enrichDiffsWithTargets(diffs, archivedNorm as any);
    return enriched.filter((d) => d.lines.length > 0);
  }, [currentTool, latestArchived]);

  const hasChanges = enrichedDiffs.length > 0;

  return (
    <div className="border rounded-lg px-4 py-3 border-primary/50 bg-primary/5">
      <div className="flex items-center gap-3">
        <span className="text-sm flex-1">Latest version</span>
        {hasChanges ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChanges(!showChanges)}
            className="h-7 text-xs"
          >
            {showChanges ? "Hide" : "Show"} changes
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">No changes</span>
        )}
      </div>
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

  // Compare against previous archived version to show what changed
  const { enrichedDiffs, isFirstVersion } = useMemo(() => {
    if (!previousVersion) {
      return { enrichedDiffs: [], isFirstVersion: true };
    }

    const prevNorm = normalizeArchived(previousVersion);
    const currNorm = normalizeArchived(entry.tool);
    const diffs = jsonpatch.compare(prevNorm, currNorm) as ToolDiff[];
    const enriched = enrichDiffsWithTargets(diffs, prevNorm as any);
    return { enrichedDiffs: enriched.filter((d) => d.lines.length > 0), isFirstVersion: false };
  }, [entry.tool, previousVersion]);

  const hasChanges = enrichedDiffs.length > 0 || isFirstVersion;

  return (
    <div className="border rounded-lg px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">v{entry.version}</span>
        <span className="text-sm flex-1">
          {formatDate(entry.createdAt)}
          {entry.createdByEmail && (
            <span className="text-muted-foreground"> · {entry.createdByEmail}</span>
          )}
        </span>
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

export function VersionHistoryDialog({
  tool,
  isOpen,
  onClose,
  onRestored,
}: VersionHistoryDialogProps) {
  const config = useConfig();
  const { refreshTools } = useTools();
  const [history, setHistory] = useState<ToolHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && tool) {
      fetchHistory();
    }
  }, [isOpen, tool?.id, tool?.updatedAt]);

  const fetchHistory = async () => {
    if (!tool) return;

    setIsLoading(true);
    setError(null);
    try {
      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      const historyData = await client.listToolHistory(tool.id);
      setHistory(historyData);
    } catch (err: any) {
      console.error("Failed to fetch tool history:", err);
      setError(err.message || "Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (version: number) => {
    if (!tool) return;

    setIsRestoring(version);
    try {
      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      await client.restoreToolVersion(tool.id, version);
      await refreshTools();
      onRestored?.();
      onClose();
    } catch (err: any) {
      console.error("Failed to restore version:", err);
      setError(err.message || "Failed to restore version");
    } finally {
      setIsRestoring(null);
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            {tool ? `Version history for "${tool.id}"` : "Loading..."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No version history available</p>
            <p className="text-sm mt-1">History will appear after you save changes to this tool</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-2">
              <CurrentVersionItem currentTool={tool!} latestArchived={history[0]?.tool || null} />
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
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
