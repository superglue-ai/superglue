import type {
  NotificationRule,
  NotificationSummaryPayload,
  RequestSource,
  Run,
  RunStatus,
} from "@superglue/shared";
import { RunStatus as RS } from "@superglue/shared";
import type { DataStore } from "../datastore/types.js";
import { NotificationService } from "../notifications/notification-service.js";
import { logMessage } from "../utils/logs.js";

// Default time to send summaries (9 AM UTC)
const DEFAULT_SUMMARY_HOUR_UTC = 9;

// Intervals in milliseconds
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

export class NotificationSummaryWorker {
  private datastore: DataStore;
  private notificationService: NotificationService;
  private dailyTimeoutId: NodeJS.Timeout | null = null;
  private weeklyTimeoutId: NodeJS.Timeout | null = null;
  private dailyIntervalId: NodeJS.Timeout | null = null;
  private weeklyIntervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(datastore: DataStore) {
    this.datastore = datastore;
    this.notificationService = new NotificationService(datastore);
  }

  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Schedule daily summaries
    const msUntilDailyRun = this.getMsUntilNextDailyRun();
    logMessage(
      "info",
      `NOTIFICATION SUMMARY: Scheduling daily summaries in ${Math.round(msUntilDailyRun / 1000 / 60)} minutes`,
    );
    this.dailyTimeoutId = setTimeout(() => {
      this.sendDailySummaries();
      // After first run, set up interval for subsequent runs
      this.dailyIntervalId = setInterval(() => this.sendDailySummaries(), ONE_DAY_MS);
    }, msUntilDailyRun);

    // Schedule weekly summaries
    const msUntilWeeklyRun = this.getMsUntilNextWeeklyRun();
    logMessage(
      "info",
      `NOTIFICATION SUMMARY: Scheduling weekly summaries in ${Math.round(msUntilWeeklyRun / 1000 / 60 / 60)} hours`,
    );
    this.weeklyTimeoutId = setTimeout(() => {
      this.sendWeeklySummaries();
      // After first run, set up interval for subsequent runs
      this.weeklyIntervalId = setInterval(() => this.sendWeeklySummaries(), ONE_WEEK_MS);
    }, msUntilWeeklyRun);

    logMessage("info", "NOTIFICATION SUMMARY: Worker started");
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.dailyTimeoutId) {
      clearTimeout(this.dailyTimeoutId);
      this.dailyTimeoutId = null;
    }
    if (this.dailyIntervalId) {
      clearInterval(this.dailyIntervalId);
      this.dailyIntervalId = null;
    }
    if (this.weeklyTimeoutId) {
      clearTimeout(this.weeklyTimeoutId);
      this.weeklyTimeoutId = null;
    }
    if (this.weeklyIntervalId) {
      clearInterval(this.weeklyIntervalId);
      this.weeklyIntervalId = null;
    }

    logMessage("info", "NOTIFICATION SUMMARY: Worker stopped");
  }

  private getMsUntilNextDailyRun(): number {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(DEFAULT_SUMMARY_HOUR_UTC, 0, 0, 0);

    // If we've already passed the target time today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    return nextRun.getTime() - now.getTime();
  }

  private getMsUntilNextWeeklyRun(): number {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(DEFAULT_SUMMARY_HOUR_UTC, 0, 0, 0);

    // Find next Monday
    const currentDay = nextRun.getUTCDay();
    const daysUntilMonday = currentDay === 0 ? 1 : currentDay === 1 ? 0 : 8 - currentDay;
    nextRun.setUTCDate(nextRun.getUTCDate() + daysUntilMonday);

    // If it's Monday but we've passed the target time, schedule for next Monday
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 7);
    }

    return nextRun.getTime() - now.getTime();
  }

  private async sendDailySummaries(): Promise<void> {
    logMessage("info", "NOTIFICATION SUMMARY: Starting daily summary run");

    try {
      const allOrgSettings = await this.datastore.listAllOrgSettings();

      for (const orgSettings of allOrgSettings) {
        try {
          await this.processSummariesForOrg(orgSettings.orgId, "daily_summary");
        } catch (error) {
          logMessage(
            "error",
            `NOTIFICATION SUMMARY: Failed to process daily summary for org ${orgSettings.orgId}: ${error}`,
          );
        }
      }

      logMessage("info", "NOTIFICATION SUMMARY: Daily summary run completed");
    } catch (error) {
      logMessage("error", `NOTIFICATION SUMMARY: Daily summary run failed: ${error}`);
    }
  }

  private async sendWeeklySummaries(): Promise<void> {
    logMessage("info", "NOTIFICATION SUMMARY: Starting weekly summary run");

    try {
      const allOrgSettings = await this.datastore.listAllOrgSettings();

      for (const orgSettings of allOrgSettings) {
        try {
          await this.processSummariesForOrg(orgSettings.orgId, "weekly_summary");
        } catch (error) {
          logMessage(
            "error",
            `NOTIFICATION SUMMARY: Failed to process weekly summary for org ${orgSettings.orgId}: ${error}`,
          );
        }
      }

      logMessage("info", "NOTIFICATION SUMMARY: Weekly summary run completed");
    } catch (error) {
      logMessage("error", `NOTIFICATION SUMMARY: Weekly summary run failed: ${error}`);
    }
  }

  private async processSummariesForOrg(
    orgId: string,
    mode: "daily_summary" | "weekly_summary",
  ): Promise<void> {
    const settings = await this.datastore.getOrgSettings({ orgId });
    if (!settings?.notifications?.channels?.slack?.enabled) {
      return;
    }

    const slack = settings.notifications.channels.slack;
    const rules = slack.rules || [];

    // Find all enabled rules with the matching mode
    const matchingRules = rules.filter((rule) => rule.enabled && rule.mode === mode);

    if (matchingRules.length === 0) {
      return;
    }

    // Process each matching rule
    for (const rule of matchingRules) {
      try {
        const payload = await this.buildSummaryPayload(orgId, rule, mode);

        // Skip sending if there are no runs in the period
        if (payload.toolStats.length === 0) {
          logMessage(
            "info",
            `NOTIFICATION SUMMARY: Skipping ${mode} for org ${orgId} (rule ${rule.id}) - no runs in period`,
            { orgId },
          );
          continue;
        }

        const result = await this.notificationService.sendSummaryNotification(orgId, payload);

        if (result.success) {
          logMessage(
            "info",
            `NOTIFICATION SUMMARY: Sent ${mode} for org ${orgId} (rule ${rule.id})`,
            {
              orgId,
            },
          );
        } else {
          logMessage(
            "warn",
            `NOTIFICATION SUMMARY: Failed to send ${mode} for org ${orgId}: ${result.error}`,
            { orgId },
          );
        }
      } catch (error) {
        logMessage(
          "error",
          `NOTIFICATION SUMMARY: Error building/sending ${mode} for org ${orgId}: ${error}`,
          { orgId },
        );
      }
    }
  }

  private async buildSummaryPayload(
    orgId: string,
    rule: NotificationRule,
    mode: "daily_summary" | "weekly_summary",
  ): Promise<NotificationSummaryPayload> {
    const now = new Date();
    const period = mode === "daily_summary" ? "daily" : "weekly";

    // Calculate period start and end
    let periodStart: Date;
    let periodEnd: Date;

    if (period === "daily") {
      // Yesterday 00:00 UTC to today 00:00 UTC
      periodEnd = new Date(now);
      periodEnd.setUTCHours(0, 0, 0, 0);
      periodStart = new Date(periodEnd);
      periodStart.setUTCDate(periodStart.getUTCDate() - 1);
    } else {
      // Last Monday 00:00 UTC to this Monday 00:00 UTC
      periodEnd = new Date(now);
      periodEnd.setUTCHours(0, 0, 0, 0);
      // Go back to Monday
      const currentDay = periodEnd.getUTCDay();
      const daysToSubtract = currentDay === 0 ? 6 : currentDay - 1;
      periodEnd.setUTCDate(periodEnd.getUTCDate() - daysToSubtract);
      periodStart = new Date(periodEnd);
      periodStart.setUTCDate(periodStart.getUTCDate() - 7);
    }

    // Get request sources from rule conditions
    const requestSources = rule.conditions.requestSources || [];

    // Query runs for the period
    const { items: runs } = await this.datastore.listRunsForPeriod({
      orgId,
      startTime: periodStart,
      endTime: periodEnd,
      requestSources: requestSources.length > 0 ? requestSources : undefined,
    });

    // Aggregate stats by tool
    const toolStatsMap = new Map<string, { successCount: number; failedCount: number }>();

    for (const run of runs) {
      const toolId = run.toolId || run.tool?.id || "unknown";
      const existing = toolStatsMap.get(toolId) || { successCount: 0, failedCount: 0 };

      if (run.status === RS.SUCCESS) {
        existing.successCount++;
      } else if (run.status === RS.FAILED) {
        existing.failedCount++;
      }
      // Ignore RUNNING and ABORTED statuses

      toolStatsMap.set(toolId, existing);
    }

    // Convert to array and sort by total runs (descending)
    const toolStats = Array.from(toolStatsMap.entries())
      .map(([toolId, stats]) => ({
        toolId,
        successCount: stats.successCount,
        failedCount: stats.failedCount,
      }))
      .sort((a, b) => {
        const totalA = a.successCount + a.failedCount;
        const totalB = b.successCount + b.failedCount;
        return totalB - totalA;
      });

    const baseUrl = process.env.SUPERGLUE_APP_URL || "https://app.superglue.cloud";

    return {
      period,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      requestSources,
      toolStats,
      adminUrl: `${baseUrl}/admin?view=runs`,
    };
  }
}
