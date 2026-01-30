import type {
  NotificationRule,
  NotificationSettings,
  RequestSource,
  Run,
  SlackChannelConfig,
} from "@superglue/shared";
import { RequestSource as RS } from "@superglue/shared";
import type { DataStore } from "../datastore/types.js";
import { logMessage } from "../utils/logs.js";
import { SlackNotifier } from "./notifiers/slack-notifier.js";
import { RateLimiter } from "./rate-limiter.js";
import type { NotificationContext, NotificationPayload, NotifierResult } from "./types.js";

// Sources that should NOT trigger notifications
const EXCLUDED_SOURCES: RequestSource[] = [RS.FRONTEND, RS.MCP];

export class NotificationService {
  private rateLimiter: RateLimiter;

  constructor(private datastore: DataStore) {
    this.rateLimiter = new RateLimiter(datastore);
  }

  async processRunCompletion(context: NotificationContext): Promise<void> {
    const { run, orgId, requestSource } = context;

    // Skip excluded sources
    if (EXCLUDED_SOURCES.includes(requestSource)) {
      return;
    }

    try {
      const settings = await this.datastore.getOrgSettings({ orgId });
      if (!settings?.notifications) {
        return;
      }

      const notifications = settings.notifications;

      // Check rate limit (global)
      if (!(await this.rateLimiter.canSend(orgId))) {
        logMessage("warn", "Rate limit exceeded for notifications", { orgId });
        return;
      }

      // Process each enabled channel
      await this.processSlackChannel(notifications, context);
      // Future: await this.processEmailChannel(notifications, context);
    } catch (error) {
      logMessage("error", `Notification processing failed: ${error}`, { orgId });
    }
  }

  private async processSlackChannel(
    settings: NotificationSettings,
    context: NotificationContext,
  ): Promise<void> {
    const slack = settings.channels.slack;
    if (!slack?.enabled) return;

    // Check circuit breaker
    if (slack.status === "disabled") {
      logMessage("debug", "Slack notifications disabled due to repeated failures", {
        orgId: context.orgId,
      });
      return;
    }

    // Check if any rule matches for this channel
    const matchingRule = this.findMatchingRule(slack.rules, context);
    if (!matchingRule) return;

    // Send notification with circuit breaker handling
    await this.sendSlackNotificationWithCircuitBreaker(settings, slack, context);
  }

  private findMatchingRule(
    rules: NotificationRule[],
    context: NotificationContext,
  ): NotificationRule | null {
    const { run, requestSource } = context;
    const runStatus = run.status?.toLowerCase() as "failed" | "success";

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const conditions = rule.conditions;

      // Check status condition
      if (conditions.status !== "any" && conditions.status !== runStatus) {
        continue;
      }

      // Check tool ID pattern
      if (conditions.toolIdPattern) {
        if (!this.matchesPattern(run.toolId, conditions.toolIdPattern)) {
          continue;
        }
      }

      // Check request source
      if (conditions.requestSources && conditions.requestSources.length > 0) {
        if (!conditions.requestSources.includes(requestSource)) {
          continue;
        }
      }

      return rule;
    }

    return null;
  }

  private matchesPattern(toolId: string, pattern: string): boolean {
    // Support simple glob patterns: * matches any characters
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except *
      .replace(/\*/g, ".*"); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(toolId);
  }

  private async sendSlackNotificationWithCircuitBreaker(
    settings: NotificationSettings,
    slack: SlackChannelConfig,
    context: NotificationContext,
  ): Promise<void> {
    const { orgId } = context;

    try {
      const result = await this.sendSlackNotification(slack, context);

      if (result.success) {
        // Success - reset circuit breaker if there were previous failures
        if (slack.consecutiveFailures > 0) {
          await this.datastore.upsertOrgSettings({
            orgId,
            settings: {
              notifications: {
                ...settings,
                channels: {
                  ...settings.channels,
                  slack: {
                    ...slack,
                    status: "active",
                    consecutiveFailures: 0,
                    lastError: undefined,
                    lastErrorAt: undefined,
                  },
                },
              },
            },
          });
        }

        // Increment rate limit counter
        await this.rateLimiter.incrementCounter(orgId);
      } else {
        // Failure - update circuit breaker
        await this.handleSlackFailure(orgId, settings, slack, result.error || "Unknown error");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.handleSlackFailure(orgId, settings, slack, errorMessage);
    }
  }

  private async handleSlackFailure(
    orgId: string,
    settings: NotificationSettings,
    slack: SlackChannelConfig,
    error: string,
  ): Promise<void> {
    const failures = (slack.consecutiveFailures || 0) + 1;
    const newStatus = failures >= 3 ? "disabled" : "failing";

    await this.datastore.upsertOrgSettings({
      orgId,
      settings: {
        notifications: {
          ...settings,
          channels: {
            ...settings.channels,
            slack: {
              ...slack,
              status: newStatus,
              consecutiveFailures: failures,
              lastError: error,
              lastErrorAt: new Date().toISOString(),
            },
          },
        },
      },
    });

    logMessage("warn", `Slack notification failed (${failures}/3): ${error}`, { orgId });
  }

  private async sendSlackNotification(
    slack: SlackChannelConfig,
    context: NotificationContext,
  ): Promise<NotifierResult> {
    const { run, requestSource, toolName } = context;

    const baseUrl = process.env.SUPERGLUE_APP_URL || "https://app.superglue.cloud";

    const payload: NotificationPayload = {
      runId: run.runId,
      toolId: run.toolId,
      toolName: toolName || run.tool?.id,
      status: run.status === "FAILED" ? "failed" : "success",
      error: run.error,
      requestSource,
      failedStepId: this.getFailedStepId(run),
      failedStepInstruction: this.getFailedStepInstruction(run),
      timestamp: new Date().toISOString(),
      adminUrl: `${baseUrl}/admin?view=runs&run_id=${run.runId}`,
      agentUrl: `${baseUrl}/agent/investigate?runId=${run.runId}`,
    };

    const notifier = new SlackNotifier(slack);
    return notifier.send(payload);
  }

  private getFailedStepId(run: Run): string | undefined {
    if (!run.stepResults) return undefined;
    const failedStep = run.stepResults.find((step) => !step.success);
    return failedStep?.stepId;
  }

  private getFailedStepInstruction(run: Run): string | undefined {
    if (!run.stepResults || !run.tool?.steps) return undefined;
    const failedStep = run.stepResults.find((step) => !step.success);
    if (!failedStep) return undefined;

    const stepConfig = run.tool.steps.find((s) => s.id === failedStep.stepId);
    return stepConfig?.apiConfig?.instruction;
  }

  // Public method for testing notifications
  async testNotification(
    orgId: string,
    channel: "slack",
    baseUrl?: string,
  ): Promise<NotifierResult> {
    const settings = await this.datastore.getOrgSettings({ orgId });
    if (!settings?.notifications) {
      return { success: false, error: "Notifications not configured" };
    }

    if (channel === "slack") {
      const slack = settings.notifications.channels.slack;
      if (!slack) {
        return { success: false, error: "Slack not configured" };
      }

      const notifier = new SlackNotifier(slack);
      const result = await notifier.test(baseUrl);

      // If test succeeds, reset circuit breaker
      if (result.success && slack.consecutiveFailures > 0) {
        await this.datastore.upsertOrgSettings({
          orgId,
          settings: {
            notifications: {
              ...settings.notifications,
              channels: {
                ...settings.notifications.channels,
                slack: {
                  ...slack,
                  status: "active",
                  consecutiveFailures: 0,
                  lastError: undefined,
                  lastErrorAt: undefined,
                },
              },
            },
          },
        });
      } else if (!result.success) {
        // Update failure status
        await this.handleSlackFailure(
          orgId,
          settings.notifications,
          slack,
          result.error || "Test failed",
        );
      }

      return result;
    }

    return { success: false, error: `Unknown channel: ${channel}` };
  }
}
