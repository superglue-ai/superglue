"use client";

import React from "react";
import { useConfig } from "@/src/app/config-context";
import { useSchedules } from "@/src/app/schedules-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import {
  createEESuperglueClient,
  NotificationSettingsResponse,
} from "@/src/lib/ee-superglue-client";
import { Run, SuperglueClient, RunStatus, RequestSource } from "@superglue/shared";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  Clock,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { RequestSourceBadge } from "@/src/components/runs/RunsList";
import { RunsTable } from "@/src/components/admin/RunsTable";
import cronstrue from "cronstrue";
import Link from "next/link";

function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 0) return "overdue";
  if (diffMins < 60) return `in ${diffMins}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  return date.toLocaleDateString();
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();

  if (diffMs < 1000) return "<1s";
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s`;
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.round((diffMs % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// Triggers to filter for failed runs (scheduler, tool-chain, api, webhook) - defined outside component to avoid recreating on each render
const FAILED_RUN_TRIGGERS = [
  RequestSource.SCHEDULER,
  RequestSource.TOOL_CHAIN,
  RequestSource.API,
  RequestSource.WEBHOOK,
];

export function OverviewView() {
  const config = useConfig();
  const { schedules, isInitiallyLoading: schedulesLoading, refreshSchedules } = useSchedules();

  const [failedRuns, setFailedRuns] = React.useState<Run[]>([]);
  const [runningRuns, setRunningRuns] = React.useState<Run[]>([]);
  const [runsLoading, setRunsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [notificationSettings, setNotificationSettings] =
    React.useState<NotificationSettingsResponse | null>(null);

  // Fetch notification settings
  React.useEffect(() => {
    const fetchNotificationSettings = async () => {
      try {
        const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
        const settings = await client.getNotificationSettings();
        setNotificationSettings(settings);
      } catch (error) {
        // Silently fail - notifications might not be configured
        console.debug("Could not fetch notification settings:", error);
      }
    };
    fetchNotificationSettings();
  }, [config.superglueEndpoint, config.apiEndpoint]);

  // Fetch runs function (reusable for initial load and refresh)
  const fetchRuns = React.useCallback(async () => {
    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

      // Fetch failed runs (last 24h)
      const failedData = await superglueClient.listRuns({
        limit: 10,
        status: "failed",
      });

      // Filter by time (last 24h) and triggers
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const filteredFailed = failedData.items.filter((run: Run) => {
        const startedAt = run.metadata?.startedAt ? new Date(run.metadata.startedAt) : null;
        const inTimeRange = startedAt && startedAt >= twentyFourHoursAgo;
        const matchesTrigger =
          run.requestSource && FAILED_RUN_TRIGGERS.includes(run.requestSource as RequestSource);
        return inTimeRange && matchesTrigger;
      });

      setFailedRuns(filteredFailed);

      // Fetch running runs
      const runningData = await superglueClient.listRuns({
        limit: 10,
        status: "running",
      });

      setRunningRuns(runningData.items);
    } catch (error) {
      console.error("Error fetching runs:", error);
    }
  }, [config.superglueEndpoint, config.apiEndpoint]);

  // Initial fetch
  React.useEffect(() => {
    const initialFetch = async () => {
      setRunsLoading(true);
      await fetchRuns();
      setRunsLoading(false);
    };
    initialFetch();
  }, [fetchRuns]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchRuns(), refreshSchedules()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get upcoming schedules
  const upcomingSchedules = React.useMemo(() => {
    return [...schedules]
      .filter((s) => s.enabled)
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
      .slice(0, 4);
  }, [schedules]);

  // Build URL for runs view with preset filters
  const buildRunsUrl = (params: { status?: string; triggers?: string[]; time?: string }) => {
    const searchParams = new URLSearchParams();
    searchParams.set("view", "runs");
    if (params.status) searchParams.set("status", params.status);
    if (params.triggers && params.triggers.length > 0) {
      searchParams.set("triggers", params.triggers.join(","));
    }
    if (params.time) searchParams.set("time", params.time);
    return `/admin?${searchParams.toString()}`;
  };

  // Check notification status
  const notificationsConfigured =
    notificationSettings?.channels.slack?.enabled &&
    notificationSettings?.channels.slack?.isConfigured;
  const notificationsFailing =
    notificationSettings?.channels.slack?.status === "failing" ||
    notificationSettings?.channels.slack?.status === "disabled";

  return (
    <div className="space-y-6 pb-8">
      {/* Notification Warning Banner */}
      {notificationsFailing && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-800 dark:text-red-200 flex-1">
              Slack notifications{" "}
              {notificationSettings?.channels.slack?.status === "disabled" ? "disabled" : "failing"}
              {notificationSettings?.channels.slack?.lastError && (
                <span className="text-red-600 dark:text-red-400">
                  {" "}
                  — {notificationSettings.channels.slack.lastError}
                </span>
              )}
            </span>
            <Link
              href="/admin?view=notifications"
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 transition-colors whitespace-nowrap"
            >
              Fix
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Control Panel</h1>
          <p className="text-muted-foreground mt-1">
            Monitor runs, manage schedules, and configure your workspace.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Failed Tools - Full Width */}
      <div className="border rounded-lg bg-card">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <h3 className="font-medium">Failed Tools</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Triggered via scheduler, webhook, or API in the last 24 hours
            </p>
          </div>
          <Link
            href="/admin?view=notifications"
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {notificationsConfigured ? (
              <>
                <Bell className="h-3.5 w-3.5 text-green-500" />
                Edit Notifications
              </>
            ) : (
              <>
                <BellOff className="h-3.5 w-3.5" />
                Set Up Notifications
              </>
            )}
          </Link>
        </div>
        <div className="p-4">
          {runsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : failedRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No failed runs in the last 24 hours
            </p>
          ) : (
            <RunsTable runs={failedRuns.slice(0, 5)} />
          )}
        </div>
        <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between">
          <Link
            href={buildRunsUrl({
              status: RunStatus.FAILED,
              triggers: FAILED_RUN_TRIGGERS,
              time: "24h",
            })}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Explore all failed runs
            <ArrowRight className="h-3 w-3" />
          </Link>
          {failedRuns.length > 5 && (
            <span className="text-xs text-muted-foreground">
              +{failedRuns.length - 5} more failed {failedRuns.length - 5 === 1 ? "run" : "runs"}
            </span>
          )}
        </div>
      </div>

      {/* Two Column Layout: Running + Upcoming Schedules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Currently Running */}
        <div className="border rounded-lg bg-card flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-blue-500" />
              <h3 className="font-medium">Currently Running</h3>
            </div>
          </div>
          <div className="p-4 min-h-[160px] flex-1">
            {runsLoading ? (
              <div className="flex items-center justify-center h-full py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : runningRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No tools currently running
              </p>
            ) : (
              <div className="space-y-3">
                {runningRuns.map((run) => (
                  <div key={run.runId} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono text-sm truncate" title={run.toolId}>
                        {run.toolId}
                      </span>
                    </div>
                    <RequestSourceBadge source={run.requestSource} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {run.metadata?.startedAt ? formatDuration(run.metadata.startedAt) : "-"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t bg-muted/30 mt-auto">
            <Link
              href={buildRunsUrl({ status: RunStatus.RUNNING })}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              See details
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Upcoming Schedules */}
        <div className="border rounded-lg bg-card">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <h3 className="font-medium">Upcoming Schedules</h3>
            </div>
          </div>
          <div className="p-4 min-h-[160px]">
            {schedulesLoading ? (
              <div className="flex items-center justify-center h-full py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : upcomingSchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active schedules</p>
            ) : (
              <div className="space-y-3">
                {upcomingSchedules.map((schedule) => (
                  <div key={schedule.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm truncate block" title={schedule.toolId}>
                        {schedule.toolId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {cronstrue.toString(schedule.cronExpression)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimeUntil(new Date(schedule.nextRunAt))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t bg-muted/30">
            <Link
              href="/admin?view=schedules"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View all schedules
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
