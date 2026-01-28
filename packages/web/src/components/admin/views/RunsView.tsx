"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Run, SuperglueClient, RunStatus } from "@superglue/shared";
import { CheckCircle2, Loader2 } from "lucide-react";
import { RunsTable } from "../RunsTable";
import { RunFilters, FilterState } from "../RunFilters";

const timeRangeLabels: Record<string, string> = {
  "1h": "last hour",
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  all: "all time",
};

export function RunsView() {
  const searchParams = useSearchParams();
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [currentPage, setCurrentPage] = React.useState(0);
  const [hasNextPage, setHasNextPage] = React.useState(false);
  const pageSize = 25;
  const config = useConfig();

  // Parse URL params for initial filter state
  // Defaults: all statuses, all time (no filters) when coming directly
  // URL params override defaults when coming from overview with preset filters
  const initialFilters = React.useMemo((): FilterState => {
    const status = searchParams.get("status") || "all";
    const triggersParam = searchParams.get("triggers");
    const triggers = triggersParam ? triggersParam.split(",").filter(Boolean) : [];
    const timeRange = searchParams.get("time") || "all";
    const toolId = searchParams.get("toolId") || "";

    return { status, triggers, timeRange, toolId };
  }, [searchParams]);

  const [filters, setFilters] = React.useState<FilterState>(initialFilters);

  // Update filters when URL params change (e.g., navigating from overview)
  React.useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  // Calculate time filter
  const getTimeFilter = React.useCallback(() => {
    const now = new Date();
    switch (filters.timeRange) {
      case "1h":
        return new Date(now.getTime() - 60 * 60 * 1000);
      case "24h":
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case "7d":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "30d":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case "all":
        return null; // No time filter
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }, [filters.timeRange]);

  // Fetch runs from API (status, triggers, toolId, and time range trigger API calls)
  React.useEffect(() => {
    const fetchRuns = async () => {
      try {
        setLoading(true);

        const superglueClient = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken(),
          apiEndpoint: config.apiEndpoint,
        });

        const params: any = {
          limit: pageSize,
          page: currentPage + 1,
        };

        // Only add status filter if not "all"
        if (filters.status !== "all") {
          params.status = filters.status;
        }

        // Add triggers filter (requestSources) if any selected
        if (filters.triggers.length > 0) {
          params.requestSources = filters.triggers;
        }

        // Add toolId filter if set
        if (filters.toolId.trim()) {
          params.toolId = filters.toolId.trim();
        }

        const data = await superglueClient.listRuns(params);

        // Filter by time on client side (skip if "all time")
        const timeFilter = getTimeFilter();
        let filteredRuns = timeFilter
          ? data.items.filter((run: Run) => {
              const startedAt = run.metadata?.startedAt ? new Date(run.metadata.startedAt) : null;
              return startedAt && startedAt >= timeFilter;
            })
          : data.items;

        // Determine if there's a next page based on filtered results
        const apiReturnedFullPage = data.items.length === pageSize;
        const allItemsPassedFilter = filteredRuns.length === data.items.length;
        setHasNextPage(apiReturnedFullPage && allItemsPassedFilter);

        setRuns(filteredRuns);
      } catch (error) {
        console.error("Error fetching runs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [
    currentPage,
    filters.status,
    filters.triggers,
    filters.toolId,
    filters.timeRange,
    config.superglueEndpoint,
    config.apiEndpoint,
    getTimeFilter,
  ]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(0);
  }, [filters.status, filters.triggers, filters.toolId, filters.timeRange]);

  if (loading && runs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading runs...</p>
        </div>
      </div>
    );
  }

  // Show pagination if there's a reason to (more than one page exists)
  const showPagination = currentPage > 0 || hasNextPage;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Runs</h1>

      <RunFilters filters={filters} onFiltersChange={setFilters} />

      <RunsTable runs={runs} loading={loading} />

      {showPagination && (
        <div className="flex justify-center gap-2 mt-4 pb-8">
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
            disabled={!hasNextPage}
            className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-input rounded-md transition-colors disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {!loading && runs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {filters.status === RunStatus.FAILED &&
          !filters.toolId.trim() &&
          filters.triggers.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <div className="text-foreground font-medium">
                No failures in the {timeRangeLabels[filters.timeRange] || filters.timeRange}
              </div>
              <div className="text-muted-foreground text-sm">All runs completed successfully</div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">
              No runs found for the selected filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
