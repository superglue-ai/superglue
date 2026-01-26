"use client";

import { useConfig } from "@/src/app/config-context";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Run, SuperglueClient } from "@superglue/shared";
import { ChevronRight, Loader2 } from "lucide-react";
import React from "react";
import { RequestSourceBadge, RunDetails, StatusBadge } from "./RunsList";

const RunsTable = ({ id }: { id?: string }) => {
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [expandedRunId, setExpandedRunId] = React.useState<string | null>(null);
  const [runDetails, setRunDetails] = React.useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);
  const [currentPage, setCurrentPage] = React.useState(0);
  const pageSize = 50;
  const config = useConfig();

  // Reset to first page when toolId changes
  React.useEffect(() => {
    setCurrentPage(0);
  }, [id]);

  React.useEffect(() => {
    const getRuns = async () => {
      try {
        setLoading(true);

        const superglueClient = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken(),
          apiEndpoint: config.apiEndpoint,
        });
        const data = await superglueClient.listRuns({
          limit: pageSize,
          page: currentPage + 1,
          toolId: id,
        });
        setRuns(data.items);
      } catch (error) {
        console.error("Error fetching runs:", error);
      } finally {
        setLoading(false);
      }
    };

    getRuns();
  }, [currentPage, id, config.superglueEndpoint, config.apiEndpoint]);

  const handleRunClick = async (run: Run) => {
    // Toggle expansion
    if (expandedRunId === run.runId) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(run.runId);

    // If we already have details, don't fetch again
    if (runDetails[run.runId]) {
      return;
    }

    setLoadingDetails((prev) => ({ ...prev, [run.runId]: true }));

    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

      // Get the detailed run data - try to get more details via getRun
      const detailedRun = await superglueClient.getRun(run.runId);
      setRunDetails((prev) => ({ ...prev, [run.runId]: detailedRun || run }));
    } catch (error) {
      console.error("Error fetching run details:", error);
      // Fall back to the basic run data if we can't get details
      setRunDetails((prev) => ({ ...prev, [run.runId]: run }));
    } finally {
      setLoadingDetails((prev) => ({ ...prev, [run.runId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading runs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tool Runs</h1>
      </div>

      <div className="border rounded-lg">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">Tool ID</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[120px]">Run trigger</TableHead>
              <TableHead className="w-[180px]">Started At</TableHead>
              <TableHead className="w-[180px]">Completed At</TableHead>
              <TableHead className="w-[100px]">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...runs]
              .sort(
                (a, b) =>
                  new Date(b.metadata?.startedAt ?? 0).getTime() -
                  new Date(a.metadata?.startedAt ?? 0).getTime(),
              )
              .map((run) => (
                <React.Fragment key={run.runId}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleRunClick(run)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 max-w-[360px]">
                        <ChevronRight
                          className={`h-4 w-4 flex-shrink-0 transition-transform ${expandedRunId === run.runId ? "rotate-90" : ""}`}
                        />
                        <span className="truncate" title={run.toolId ?? "undefined"}>
                          {run.toolId ?? "undefined"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>
                      <RequestSourceBadge source={run.requestSource} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(run.metadata?.startedAt ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {run.metadata?.completedAt
                        ? new Date(run.metadata.completedAt).toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {run.metadata?.durationMs != null ? `${run.metadata.durationMs}ms` : "-"}
                    </TableCell>
                  </TableRow>

                  {/* Expanded Details Row */}
                  {expandedRunId === run.runId && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/10 p-0">
                        {loadingDetails[run.runId] ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <RunDetails run={runDetails[run.runId] || run} />
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-center gap-2 mt-4">
        <button
          onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
          disabled={currentPage === 0}
          className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-input rounded-md transition-colors disabled:opacity-50"
        >
          Previous
        </button>
        <span className="px-4 py-2 text-sm font-medium bg-secondary rounded-md">
          Page {currentPage + 1}
        </span>
        <button
          onClick={() => setCurrentPage((p) => p + 1)}
          disabled={runs.length < pageSize}
          className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-input rounded-md transition-colors disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export { RunsTable };
