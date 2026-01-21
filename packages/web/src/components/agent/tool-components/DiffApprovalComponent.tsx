"use client";

import { Button } from "@/src/components/ui/button";
import { SystemIcon } from "@/src/components/ui/system-icon";
import { cn } from "@/src/lib/general-utils";
import {
  Check,
  CheckCircle,
  ChevronDown,
  FileJson,
  FilePlay,
  FileText,
  Globe,
  Loader2,
  Play,
  Plus,
  Square,
  X,
  XCircle,
} from "lucide-react";
import { JsonCodeEditor } from "@/src/components/editors/JsonCodeEditor";
import { useCallback, useMemo, useState } from "react";
import { ToolDiff } from "@superglue/shared";
import {
  DiffLine,
  DiffTargetType,
  EnrichedDiff,
  formatTargetLabel,
} from "@/src/lib/config-diff-utils";
import { useSystems } from "@/src/app/systems-context";

type DiffApprovalState = "pending" | "approved" | "rejected";

function getTargetIcon(type: DiffTargetType) {
  switch (type) {
    case "newStep":
      return <Plus className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />;
    case "finalTransform":
      return <FilePlay className="h-3.5 w-3.5 text-primary flex-shrink-0" />;
    case "inputSchema":
    case "responseSchema":
      return <FileJson className="h-3.5 w-3.5 text-primary flex-shrink-0" />;
    case "instruction":
      return <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
    default:
      return <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
  }
}

function StepSystemIcon({ systemId }: { systemId?: string }) {
  const { systems } = useSystems();

  const system = useMemo(() => {
    if (!systemId) return null;
    return systems.find((i) => i.id === systemId) || null;
  }, [systemId, systems]);

  if (system) {
    return (
      <div className="p-1 rounded-full bg-white dark:bg-gray-100 border border-border/50 flex-shrink-0">
        <SystemIcon system={system} size={14} />
      </div>
    );
  }

  return <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
}

interface DiffApprovalComponentProps {
  enrichedDiffs: EnrichedDiff[];
  onComplete: (result: {
    approved: boolean;
    partial: boolean;
    approvedDiffs: ToolDiff[];
    rejectedDiffs: ToolDiff[];
  }) => void;
  onRunWithDiffs?: (approvedDiffs: ToolDiff[]) => void;
  onAbortTest?: () => void;
  isRunning?: boolean;
  testLogs?: Array<{ message: string; timestamp: Date }>;
  testResult?: { success: boolean; data?: any; error?: string } | null;
}

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

function DiffApprovalItem({
  enrichedDiff,
  state,
  onApprove,
  onReject,
}: {
  enrichedDiff: EnrichedDiff;
  state: DiffApprovalState;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { target, lines } = enrichedDiff;
  const targetInfo = formatTargetLabel(target);

  // Calculate starting line number (find first changed line)
  const firstChangeIndex = lines.findIndex((l) => l.type !== "context");
  const startLineNum = Math.max(1, firstChangeIndex > 0 ? firstChangeIndex : 1);

  // Show first 6 lines by default
  const previewLines = lines.slice(0, 6);
  const remainingLines = lines.slice(6);
  const hasMore = remainingLines.length > 0;

  const stateStyles = {
    pending: "border-green-300 dark:border-green-700 bg-green-50/30 dark:bg-green-900/10",
    approved: "border-green-300 dark:border-green-700 bg-green-50/30 dark:bg-green-900/10",
    rejected: "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/10 opacity-60",
  };

  return (
    <div
      className={cn(
        "text-xs font-mono rounded border overflow-hidden transition-all",
        stateStyles[state],
      )}
    >
      {/* Header */}
      <div className="px-2 py-1.5 bg-muted/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {targetInfo.type === "step" ? (
            <StepSystemIcon systemId={targetInfo.systemId} />
          ) : (
            getTargetIcon(targetInfo.type)
          )}
          {targetInfo.stepNumber !== undefined && (
            <span className="text-[10px] px-1 py-0.5 rounded font-medium bg-primary/10 text-primary flex-shrink-0">
              {targetInfo.stepNumber}
            </span>
          )}
          <span className="font-medium text-foreground text-xs truncate">
            {targetInfo.stepId || targetInfo.label}
          </span>
          {targetInfo.path && (
            <span className="text-muted-foreground text-[10px] truncate">/{targetInfo.path}</span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onReject}
            className={cn(
              "p-1 rounded transition-colors",
              state === "rejected"
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                : "hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400",
            )}
            title={state === "rejected" ? "Click to undo rejection" : "Reject this change"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onApprove}
            className={cn(
              "p-1 rounded transition-colors",
              state === "approved"
                ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                : "hover:bg-green-100 dark:hover:bg-green-900/30 text-muted-foreground hover:text-green-600 dark:hover:text-green-400",
            )}
            title={state === "approved" ? "Click to undo approval" : "Approve this change"}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Diff lines preview */}
      {lines.length > 0 ? (
        <div
          className={cn(
            "overflow-x-auto scrollbar-hidden",
            state === "rejected" && "line-through decoration-red-400/50",
          )}
        >
          <div className="min-w-max">
            {previewLines.map((line, i) => (
              <DiffLineDisplay key={i} line={line} lineNumber={startLineNum + i} />
            ))}

            {/* Expanded lines */}
            {isExpanded &&
              remainingLines.map((line, i) => (
                <DiffLineDisplay key={i + 6} line={line} lineNumber={startLineNum + 6 + i} />
              ))}
          </div>
        </div>
      ) : (
        <div className="px-2 py-2 text-muted-foreground italic text-[11px]">
          No content to display
        </div>
      )}

      {/* Expand/collapse button */}
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-2 py-0.5 text-center text-muted-foreground hover:bg-muted/50 border-t flex items-center justify-center gap-1 text-[10px]"
        >
          <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
          {isExpanded ? "Show less" : `${remainingLines.length} more lines`}
        </button>
      )}
    </div>
  );
}

export function DiffApprovalComponent({
  enrichedDiffs,
  onComplete,
  onRunWithDiffs,
  onAbortTest,
  isRunning = false,
  testLogs,
  testResult,
}: DiffApprovalComponentProps) {
  const [diffStates, setDiffStates] = useState<Map<number, DiffApprovalState>>(
    () => new Map(enrichedDiffs.map((_, i) => [i, "approved"])),
  );

  const approvedCount = useMemo(
    () => [...diffStates.values()].filter((s) => s === "approved").length,
    [diffStates],
  );

  const rejectedCount = useMemo(
    () => [...diffStates.values()].filter((s) => s === "rejected").length,
    [diffStates],
  );

  const handleApprove = useCallback((index: number) => {
    setDiffStates((prev) => new Map(prev).set(index, "approved"));
  }, []);

  const handleReject = useCallback((index: number) => {
    setDiffStates((prev) => new Map(prev).set(index, "rejected"));
  }, []);

  const handleRejectAll = useCallback(() => {
    if (isRunning && onAbortTest) {
      onAbortTest();
    }

    // Immediately complete with all rejected
    onComplete({
      approved: false,
      partial: false,
      approvedDiffs: [],
      rejectedDiffs: enrichedDiffs.map((ed) => ed.diff),
    });
  }, [enrichedDiffs, onComplete, isRunning, onAbortTest]);

  const handleConfirm = useCallback(() => {
    if (isRunning && onAbortTest) {
      onAbortTest();
    }

    const approvedDiffs: ToolDiff[] = [];
    const rejectedDiffs: ToolDiff[] = [];

    for (const [index, state] of diffStates) {
      if (state === "approved") {
        approvedDiffs.push(enrichedDiffs[index].diff);
      } else if (state === "rejected") {
        rejectedDiffs.push(enrichedDiffs[index].diff);
      }
    }

    const allApproved = rejectedDiffs.length === 0 && approvedDiffs.length > 0;
    const allRejected = approvedDiffs.length === 0 && rejectedDiffs.length > 0;
    const partial = approvedDiffs.length > 0 && rejectedDiffs.length > 0;

    onComplete({
      approved: allApproved,
      partial,
      approvedDiffs,
      rejectedDiffs,
    });
  }, [diffStates, enrichedDiffs, onComplete, isRunning, onAbortTest]);

  const handleRunWithApproved = useCallback(() => {
    const approvedDiffs: ToolDiff[] = [];
    for (const [index, state] of diffStates) {
      if (state === "approved") {
        approvedDiffs.push(enrichedDiffs[index].diff);
      }
    }
    onRunWithDiffs?.(approvedDiffs);
  }, [diffStates, enrichedDiffs, onRunWithDiffs]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-xs text-muted-foreground">
          {enrichedDiffs.length} change{enrichedDiffs.length !== 1 ? "s" : ""}
          {approvedCount > 0 && (
            <span className="text-green-600 dark:text-green-400"> • {approvedCount} approved</span>
          )}
          {rejectedCount > 0 && (
            <span className="text-red-600 dark:text-red-400"> • {rejectedCount} rejected</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {enrichedDiffs.map((enrichedDiff, index) => (
          <DiffApprovalItem
            key={index}
            enrichedDiff={enrichedDiff}
            state={diffStates.get(index) || "pending"}
            onApprove={() => handleApprove(index)}
            onReject={() => handleReject(index)}
          />
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {approvedCount > 0 &&
          onRunWithDiffs &&
          (isRunning ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onAbortTest}
              className="h-7 text-xs text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900/20"
            >
              <Square className="w-3 h-3 mr-1" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunWithApproved}
              className="h-7 text-xs"
            >
              <Play className="w-3 h-3 mr-1" />
              Test {approvedCount} change{approvedCount !== 1 ? "s" : ""}
            </Button>
          ))}
        <Button
          size="sm"
          variant="outline"
          onClick={handleRejectAll}
          className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
        >
          <X className="w-3 h-3 mr-1" />
          Reject all
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={approvedCount === 0}
          className="h-7 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50"
        >
          <Check className="w-3 h-3 mr-1" />
          Apply {approvedCount} change{approvedCount !== 1 ? "s" : ""}
        </Button>
      </div>

      {/* Test run status */}
      {(isRunning || testResult) && (
        <div className="mt-3 border-t pt-3">
          {/* Running state - single line log display */}
          {isRunning && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              <span className="flex-shrink-0">Testing changes...</span>
              {testLogs && testLogs.length > 0 && (
                <>
                  <span className="flex-shrink-0">•</span>
                  <span className="truncate font-mono text-[10px]">
                    {(() => {
                      const msg = testLogs[testLogs.length - 1].message;
                      return msg.length > 80 ? msg.substring(0, 80) + "..." : msg;
                    })()}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Completed state - show result */}
          {!isRunning && testResult && (
            <div className="space-y-2">
              {testResult.success ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                    <span className="text-xs font-medium">Test Results</span>
                  </div>
                  <JsonCodeEditor
                    value={JSON.stringify(testResult.data, null, 2)}
                    readOnly
                    maxHeight="200px"
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2 p-2 bg-red-50/50 dark:bg-red-950/20 rounded border border-red-200/60 dark:border-red-900/40">
                  <XCircle className="w-3 h-3 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-red-600/80 dark:text-red-400/80 break-words">
                    {testResult.error && testResult.error.length > 300
                      ? `${testResult.error.slice(0, 300)}...`
                      : testResult.error}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
