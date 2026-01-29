"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Run, RunStatus } from "@superglue/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { RequestSourceBadge, StatusBadge, RunDetails } from "@/src/components/runs/RunsList";
import { formatDurationShort } from "@/src/lib/general-utils";
import { ChevronRight, Hammer, Loader2 } from "lucide-react";
import { default as HatGlasses } from "lucide-react/dist/esm/icons/hat-glasses";
import { useTools } from "@/src/app/tools-context";
import { useToast } from "@/src/hooks/use-toast";

interface RunsTableProps {
  runs: Run[];
  loading?: boolean;
  initialExpandedRunId?: string | null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `Completed in ${ms}ms`;
  if (ms < 60000) return `Completed in ${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `Completed in ${mins}m ${secs}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `Completed in ${hours}h ${mins}m`;
}

export function RunsTable({ runs, loading, initialExpandedRunId }: RunsTableProps) {
  const router = useRouter();
  const { tools } = useTools();
  const { toast } = useToast();
  const [expandedRunId, setExpandedRunId] = React.useState<string | null>(
    initialExpandedRunId || null,
  );

  // Auto-expand run from URL param when runs load
  React.useEffect(() => {
    if (initialExpandedRunId && runs.some((run) => run.runId === initialExpandedRunId)) {
      setExpandedRunId(initialExpandedRunId);
    }
  }, [initialExpandedRunId, runs]);

  const handleRunClick = async (run: Run) => {
    if (expandedRunId === run.runId) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(run.runId);
  };

  const handleInvestigate = (e: React.MouseEvent, run: Run) => {
    e.stopPropagation();
    router.push(`/agent/investigate?runId=${run.runId}`);
  };

  const handleViewTool = (e: React.MouseEvent, toolId: string) => {
    e.stopPropagation();
    const toolExists = tools.some((tool) => tool.id === toolId);
    if (toolExists) {
      router.push(`/tools/${toolId}`);
    } else {
      toast({
        title: "Tool not found",
        description: `The tool "${toolId}" no longer exists.`,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runs.length === 0) {
    return null;
  }

  const sortedRuns = [...runs].sort(
    (a, b) =>
      new Date(b.metadata?.startedAt ?? 0).getTime() -
      new Date(a.metadata?.startedAt ?? 0).getTime(),
  );

  const isFailed = (run: Run) =>
    run.status === RunStatus.FAILED || run.status?.toString().toUpperCase() === "FAILED";

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead className="w-[160px]">Started At</TableHead>
            <TableHead className="w-[220px]">Tool</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[110px]">Trigger</TableHead>
            <TableHead className="w-[180px]">Details</TableHead>
            <TableHead className="w-[200px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRuns.map((run) => {
            const startedAt = run.metadata?.startedAt ? new Date(run.metadata.startedAt) : null;
            const isExpanded = expandedRunId === run.runId;
            const runIsFailed = isFailed(run);

            return (
              <React.Fragment key={run.runId}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleRunClick(run)}
                >
                  <TableCell>
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="text-sm">{startedAt ? startedAt.toLocaleString() : "-"}</span>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <span className="font-mono text-sm truncate block" title={run.toolId}>
                      {run.toolId || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>
                    <RequestSourceBadge source={run.requestSource} />
                  </TableCell>
                  <TableCell className="max-w-0">
                    {runIsFailed && run.error ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm text-red-600 dark:text-red-400 truncate block">
                              {run.error}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[500px]">
                            <pre className="whitespace-pre-wrap text-xs">{run.error}</pre>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {run.metadata?.durationMs ? formatDuration(run.metadata.durationMs) : "-"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {runIsFailed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleInvestigate(e, run)}
                          className="gap-1 h-8"
                        >
                          <HatGlasses className="h-3 w-3" />
                          Investigate Failure
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleViewTool(e, run.toolId)}
                        className="gap-1 h-8"
                      >
                        <Hammer className="h-3 w-3" />
                        View Tool
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/10 p-0">
                      <RunDetails run={run} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
