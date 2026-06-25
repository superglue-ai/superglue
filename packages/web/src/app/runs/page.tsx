"use client";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/lib/general-utils";
import { useRuns } from "@/src/queries/runs";
import type { Run } from "@superglue/shared";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "aborted", label: "Aborted" },
];

const STATUS_STYLES: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  success: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  aborted: "bg-muted text-muted-foreground border-border/50",
};

function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn("capitalize whitespace-nowrap", STATUS_STYLES[key] ?? STATUS_STYLES.aborted)}
    >
      {key}
    </Badge>
  );
}

function formatDuration(run: Run): string {
  const ms =
    run.metadata?.durationMs ??
    (run.metadata?.completedAt && run.metadata?.startedAt
      ? new Date(run.metadata.completedAt).getTime() - new Date(run.metadata.startedAt).getTime()
      : undefined);

  if (ms === undefined || Number.isNaN(ms)) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  // Round to whole seconds first, then carry into minutes so we never render "Xm 60s"
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatTimestamp(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function RunsPage() {
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to first page whenever filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, status]);

  const { data, isLoading, isError, error, isFetching, refetch } = useRuns({
    page,
    pageSize: 25,
    search: debouncedSearch || undefined,
    status,
  });

  const runs = useMemo(() => data?.items ?? [], [data]);
  const hasMore = data?.hasMore ?? false;

  return (
    <div className="p-8 max-w-none w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 gap-2 flex-shrink-0">
        <h1 className="text-2xl font-bold">Runs</h1>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 flex-shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by run ID, tool, or error..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>Run ID</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50 ml-auto"
                  title="Refresh Runs"
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground",
                      isFetching && "animate-spin",
                    )}
                  />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-foreground inline-block" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-destructive">
                    <span>Failed to load runs</span>
                    <span className="text-xs text-muted-foreground">
                      {error instanceof Error ? error.message : "Please try again."}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <span>No runs found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow
                  key={run.runId}
                  className="hover:bg-secondary cursor-pointer"
                  onClick={() => setSelectedRun(run)}
                >
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="font-medium max-w-[220px]">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block truncate">{run.tool?.id || run.toolId}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{run.tool?.id || run.toolId}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <span className="font-mono text-xs text-muted-foreground truncate block">
                      {run.runId}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {run.requestSource || "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(run.metadata?.startedAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDuration(run)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4 flex-shrink-0">
        <span className="text-sm text-muted-foreground mr-2">Page {page + 1}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || isFetching}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore || isFetching}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <RunDetailDialog run={selectedRun} onClose={() => setSelectedRun(null)} />
    </div>
  );
}

function RunDetailDialog({ run, onClose }: { run: Run | null; onClose: () => void }) {
  return (
    <Dialog open={!!run} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {run && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span>{run.tool?.id || run.toolId}</span>
                <StatusBadge status={run.status} />
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Run ID</dt>
                <dd className="font-mono text-xs break-all">{run.runId}</dd>

                <dt className="text-muted-foreground">Source</dt>
                <dd>{run.requestSource || "-"}</dd>

                {run.userId && (
                  <>
                    <dt className="text-muted-foreground">User</dt>
                    <dd className="break-all">{run.userId}</dd>
                  </>
                )}

                <dt className="text-muted-foreground">Started</dt>
                <dd>{formatTimestamp(run.metadata?.startedAt)}</dd>

                <dt className="text-muted-foreground">Completed</dt>
                <dd>{formatTimestamp(run.metadata?.completedAt)}</dd>

                <dt className="text-muted-foreground">Duration</dt>
                <dd>{formatDuration(run)}</dd>
              </dl>

              {run.error && (
                <div>
                  <div className="text-muted-foreground mb-1">Error</div>
                  <pre className="bg-destructive/10 text-destructive rounded-md p-3 text-xs whitespace-pre-wrap break-words">
                    {run.error}
                  </pre>
                </div>
              )}

              {run.data != null && (
                <div>
                  <div className="text-muted-foreground mb-1">Result</div>
                  <pre className="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap break-words max-h-64 overflow-auto">
                    {JSON.stringify(run.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
