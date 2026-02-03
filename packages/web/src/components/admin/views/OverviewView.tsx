"use client";

import React from "react";
import { useConfig, useSupabaseClient } from "@/src/app/config-context";
import { useSchedules } from "@/src/app/schedules-context";
import { useSystems } from "@/src/app/systems-context";
import { useTools } from "@/src/app/tools-context";
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
  Blocks,
  Clock,
  Hammer,
  History,
  Key,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { RunsTable } from "@/src/components/admin/RunsTable";
import { fetchApiKeys } from "@/src/supabase/client-utils";
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

// Colors for pie chart segments
const SOURCE_COLORS: Record<string, string> = {
  api: "#3b82f6", // blue
  frontend: "#8b5cf6", // purple
  scheduler: "#f59e0b", // amber
  mcp: "#10b981", // emerald
  "tool-chain": "#ec4899", // pink
  webhook: "#06b6d4", // cyan
};

const SOURCE_LABELS: Record<string, string> = {
  api: "API",
  frontend: "Manual",
  scheduler: "Scheduler",
  mcp: "MCP",
  "tool-chain": "Tool Chain",
  webhook: "Webhook",
};

// Simple donut chart component
function DonutChart({
  data,
  size = 80,
}: {
  data: { source: string; count: number }[];
  size?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return (
      <div
        className="rounded-full bg-muted flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-muted-foreground">No data</span>
      </div>
    );
  }

  let cumulativePercent = 0;
  const segments = data
    .filter((d) => d.count > 0)
    .map((d) => {
      const percent = (d.count / total) * 100;
      const startPercent = cumulativePercent;
      cumulativePercent += percent;
      return { ...d, percent, startPercent };
    });

  // Build conic-gradient
  const gradientStops = segments
    .map((s) => {
      const color = SOURCE_COLORS[s.source] || "#6b7280";
      return `${color} ${s.startPercent}% ${s.startPercent + s.percent}%`;
    })
    .join(", ");

  return (
    <div className="flex items-center gap-3">
      <div
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${gradientStops})`,
          mask: `radial-gradient(circle at center, transparent 55%, black 55%)`,
          WebkitMask: `radial-gradient(circle at center, transparent 55%, black 55%)`,
        }}
      />
      <div className="flex flex-col gap-0.5">
        {segments.slice(0, 4).map((s) => (
          <div key={s.source} className="flex items-center gap-1.5 text-xs">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: SOURCE_COLORS[s.source] || "#6b7280" }}
            />
            <span className="text-muted-foreground">
              {SOURCE_LABELS[s.source] || s.source}: {s.count}
            </span>
          </div>
        ))}
        {segments.length > 4 && (
          <span className="text-xs text-muted-foreground">+{segments.length - 4} more</span>
        )}
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  loading?: boolean;
  href?: string;
}) {
  const content = (
    <div className="border rounded-lg bg-card p-4 flex items-center gap-4 h-full">
      <div className="p-2.5 rounded-md bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground truncate">{label}</p>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
        ) : (
          <p className="text-2xl font-semibold truncate">{value}</p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="hover:opacity-80 transition-opacity h-full">
        {content}
      </Link>
    );
  }
  return content;
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
  const supabase = useSupabaseClient();
  const { schedules, isInitiallyLoading: schedulesLoading, refreshSchedules } = useSchedules();
  const { systems, loading: systemsLoading } = useSystems();
  const { tools, isInitiallyLoading: toolsLoading } = useTools();

  const [failedRuns, setFailedRuns] = React.useState<Run[]>([]);
  const [recentRuns, setRecentRuns] = React.useState<Run[]>([]);
  const [runsLoading, setRunsLoading] = React.useState(true);
  const [apiKeyCount, setApiKeyCount] = React.useState<number>(0);
  const [apiKeysLoading, setApiKeysLoading] = React.useState(true);
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

      // Fetch all runs (for 7-day metrics and failed runs)
      const allRunsData = await superglueClient.listRuns({
        limit: 1000,
      });

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Filter for 7-day runs
      const runsLast7Days = allRunsData.items.filter((run: Run) => {
        const startedAt = run.metadata?.startedAt ? new Date(run.metadata.startedAt) : null;
        return startedAt && startedAt >= sevenDaysAgo;
      });
      setRecentRuns(runsLast7Days);

      // Filter for failed runs (last 24h) with specific triggers
      const filteredFailed = allRunsData.items.filter((run: Run) => {
        const startedAt = run.metadata?.startedAt ? new Date(run.metadata.startedAt) : null;
        const inTimeRange = startedAt && startedAt >= twentyFourHoursAgo;
        const matchesTrigger =
          run.requestSource && FAILED_RUN_TRIGGERS.includes(run.requestSource as RequestSource);
        const isFailed = run.status === RunStatus.FAILED;
        return inTimeRange && matchesTrigger && isFailed;
      });

      setFailedRuns(filteredFailed);
    } catch (error) {
      console.error("Error fetching runs:", error);
    }
  }, [config.superglueEndpoint, config.apiEndpoint]);

  // Fetch API keys
  const fetchApiKeysData = React.useCallback(async () => {
    if (!supabase) {
      setApiKeysLoading(false);
      return;
    }
    try {
      const keys = await fetchApiKeys(supabase);
      setApiKeyCount(keys?.length ?? 0);
    } catch (error) {
      console.error("Error fetching API keys:", error);
    } finally {
      setApiKeysLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  React.useEffect(() => {
    const initialFetch = async () => {
      setRunsLoading(true);
      await fetchRuns();
      setRunsLoading(false);
    };
    initialFetch();
  }, [fetchRuns]);

  // Fetch API keys
  React.useEffect(() => {
    fetchApiKeysData();
  }, [fetchApiKeysData]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchRuns(), refreshSchedules(), fetchApiKeysData()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get upcoming schedules
  const upcomingSchedules = React.useMemo(() => {
    return [...schedules]
      .filter((s) => s.enabled)
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
      .slice(0, 5);
  }, [schedules]);

  // Calculate run sources for pie chart
  const runsBySource = React.useMemo(() => {
    const counts: Record<string, number> = {};
    recentRuns.forEach((run) => {
      const source = run.requestSource || "api";
      counts[source] = (counts[source] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }, [recentRuns]);

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
    notificationSettings?.channels?.slack?.enabled &&
    notificationSettings?.channels?.slack?.isConfigured;
  const notificationsFailing =
    notificationSettings?.channels?.slack?.status === "failing" ||
    notificationSettings?.channels?.slack?.status === "disabled";

  return (
    <div className="space-y-4 pb-4">
      {/* Notification Warning Banner */}
      {notificationsFailing && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-800 dark:text-red-200 flex-1">
              Slack notifications{" "}
              {notificationSettings?.channels?.slack?.status === "disabled"
                ? "disabled"
                : "failing"}
              {notificationSettings?.channels?.slack?.lastError && (
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
          <p className="text-muted-foreground text-sm">
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

      {/* Usage Section */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Usage</h2>
        <div className="grid grid-cols-5 gap-3">
          <StatCard
            icon={Blocks}
            label="Systems"
            value={systems.length}
            loading={systemsLoading}
            href="/systems"
          />
          <StatCard
            icon={Hammer}
            label="Tools"
            value={tools.filter((t) => !t.archived).length}
            loading={toolsLoading}
            href="/tools"
          />
          <StatCard
            icon={History}
            label="Tool Runs (7d)"
            value={recentRuns.length}
            loading={runsLoading}
            href="/admin?view=runs"
          />
          <StatCard
            icon={Key}
            label="API Keys"
            value={apiKeyCount}
            loading={apiKeysLoading}
            href="/admin?view=api-keys"
          />
          {/* Pie Chart */}
          <div className="border rounded-lg bg-card p-4 flex items-center justify-center h-full">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground mb-2">Run Triggers (7d)</p>
              {runsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <DonutChart data={runsBySource} size={60} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Failed Tools Section */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Failed Runs</h2>
        <div className="border rounded-lg bg-card">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-xs text-muted-foreground">
                Triggered via scheduler, webhook, or API in the last 24 hours
              </p>
            </div>
            <Link
              href="/admin?view=notifications"
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {notificationsConfigured ? (
                <>
                  <Bell className="h-3 w-3 text-green-500" />
                  Edit Notifications
                </>
              ) : (
                <>
                  <BellOff className="h-3 w-3" />
                  Set Up Notifications
                </>
              )}
            </Link>
          </div>
          <div className="p-3">
            {runsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : failedRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">
                No failed runs in the last 24 hours
              </p>
            ) : (
              <RunsTable runs={failedRuns.slice(0, 4)} />
            )}
          </div>
          <div className="px-3 py-2 border-t bg-muted/30 flex items-center justify-between">
            <Link
              href={buildRunsUrl({
                status: RunStatus.FAILED,
                triggers: FAILED_RUN_TRIGGERS,
                time: "24h",
              })}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              Explore all failed runs
              <ArrowRight className="h-3 w-3" />
            </Link>
            {failedRuns.length > 4 && (
              <span className="text-xs text-muted-foreground">
                +{failedRuns.length - 4} more failed {failedRuns.length - 4 === 1 ? "run" : "runs"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Upcoming Schedules Section */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Upcoming Schedules</h2>
        <div className="border rounded-lg bg-card">
          {schedulesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : upcomingSchedules.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No active schedules
            </div>
          ) : (
            <div className="divide-y">
              {upcomingSchedules.map((schedule) => {
                const nextRun = new Date(schedule.nextRunAt);
                const timeLabel = formatTimeUntil(nextRun);

                return (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-medium w-20 text-muted-foreground">
                        {timeLabel}
                      </div>
                      <span className="font-mono text-sm">{schedule.toolId}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {cronstrue.toString(schedule.cronExpression)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="px-3 py-2 border-t bg-muted/30">
            <Link
              href="/admin?view=schedules"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
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
