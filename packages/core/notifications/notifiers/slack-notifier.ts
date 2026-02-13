import type { NotificationSummaryPayload, SlackChannelConfig } from "@superglue/shared";
import axios from "axios";
import { logMessage } from "../../utils/logs.js";
import type { NotificationPayload, NotifierResult } from "../types.js";
import { BaseNotifier } from "./base-notifier.js";

const SLACK_TIMEOUT_MS = 10000;
const SLACK_MAX_RETRIES = 2;
const SLACK_RETRY_DELAY_MS = 1000;

export class SlackNotifier extends BaseNotifier {
  constructor(private config: SlackChannelConfig) {
    super();
  }

  async send(payload: NotificationPayload): Promise<NotifierResult> {
    try {
      const blocks = this.buildMessageBlocks(payload);
      const fallbackText = this.buildFallbackText(payload);

      if (this.config.authType === "webhook" && this.config.webhookUrl) {
        return await this.sendViaWebhook(blocks, fallbackText);
      } else if (this.config.authType === "bot_token" && this.config.botToken) {
        return await this.sendViaBotToken(blocks, fallbackText);
      }

      return { success: false, error: "Slack not configured properly" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage("error", `Slack notification failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  async test(baseUrl?: string): Promise<NotifierResult> {
    try {
      const blocks = this.buildTestMessageBlocks(baseUrl);
      const fallbackText = "Test notification from Superglue - your Slack integration is working!";

      if (this.config.authType === "webhook" && this.config.webhookUrl) {
        return await this.sendViaWebhook(blocks, fallbackText);
      } else if (this.config.authType === "bot_token" && this.config.botToken) {
        return await this.sendViaBotToken(blocks, fallbackText);
      }

      return { success: false, error: "Slack not configured properly" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage("error", `Slack test notification failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  async sendSummary(payload: NotificationSummaryPayload): Promise<NotifierResult> {
    try {
      const { blocks, attachments } = this.buildSummaryMessageBlocksWithTable(payload);
      const fallbackText = this.buildSummaryFallbackText(payload);

      if (this.config.authType === "webhook" && this.config.webhookUrl) {
        return await this.sendViaWebhook(blocks, fallbackText, attachments);
      } else if (this.config.authType === "bot_token" && this.config.botToken) {
        return await this.sendViaBotToken(blocks, fallbackText, attachments);
      }

      return { success: false, error: "Slack not configured properly" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage("error", `Slack summary notification failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  private buildSummaryFallbackText(payload: NotificationSummaryPayload): string {
    const periodLabel = payload.period === "daily" ? "Daily" : "Weekly";
    const totalSuccess = payload.toolStats.reduce((sum, t) => sum + t.successCount, 0);
    const totalFailed = payload.toolStats.reduce((sum, t) => sum + t.failedCount, 0);
    return `${periodLabel} Summary: ${totalSuccess} successful, ${totalFailed} failed runs`;
  }

  private buildSummaryMessageBlocksWithTable(payload: NotificationSummaryPayload): {
    blocks: any[];
    attachments?: any[];
  } {
    const periodLabel = payload.period === "daily" ? "Daily" : "Weekly";

    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Superglue ${periodLabel} Summary`,
          emoji: false,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Here's how your deployed tools performed from ${this.formatDate(payload.periodStart)} to ${this.formatDate(payload.periodEnd)}.`,
        },
      },
    ];

    let attachments: any[] | undefined;

    // Build the table if there are any tool stats
    if (payload.toolStats.length > 0) {
      // Build table rows using Slack's table block format
      // First row is the header
      const tableRows: any[][] = [
        [
          { type: "raw_text", text: "Tool ID" },
          { type: "raw_text", text: "Success" },
          { type: "raw_text", text: "Failed" },
        ],
      ];

      // Add data rows (limit to 20 tools to stay within Slack's 100 row limit and message size)
      const displayStats = payload.toolStats.slice(0, 20);
      for (const stat of displayStats) {
        tableRows.push([
          { type: "raw_text", text: stat.toolId },
          { type: "raw_text", text: String(stat.successCount) },
          { type: "raw_text", text: String(stat.failedCount) },
        ]);
      }

      // Slack table block must be sent via attachments
      attachments = [
        {
          blocks: [
            {
              type: "table",
              column_settings: [
                { is_wrapped: true }, // Tool ID column wraps
                { align: "right" }, // Success count right-aligned
                { align: "right" }, // Failed count right-aligned
              ],
              rows: tableRows,
            },
          ],
        },
      ];

      if (payload.toolStats.length > 20) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Showing 20 of ${payload.toolStats.length} tools_`,
            },
          ],
        });
      }
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "_No runs during this period._",
        },
      });
    }

    // Add link to admin dashboard
    if (payload.adminUrl && payload.adminUrl !== "#") {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View All Runs",
              emoji: false,
            },
            url: payload.adminUrl,
          },
        ],
      });
    }

    return { blocks, attachments };
  }

  // Keep the old method for backwards compatibility (unused but safe to keep)
  private buildSummaryMessageBlocks(payload: NotificationSummaryPayload): any[] {
    return this.buildSummaryMessageBlocksWithTable(payload).blocks;
  }

  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  private buildFallbackText(payload: NotificationPayload): string {
    const toolName = payload.toolName || payload.toolId;
    if (payload.status === "failed") {
      return `${toolName}: Run Failed${payload.error ? ` - ${this.truncateError(payload.error, 100)}` : ""}`;
    }
    return `${toolName}: Run Succeeded`;
  }

  private buildTestMessageBlocks(baseUrl?: string): any[] {
    const testRunId = "00000000-0000-0000-0000-000000000000";
    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Test Notification",
          emoji: false,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "This is a test notification. Below is an example of what a real failure notification looks like. Use the buttons at the bottom to quickly view run details or have superglue investigate the failure.",
        },
      },
      {
        type: "divider",
      },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "example-sync-tool: Run Failed",
          emoji: false,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error:*\n\`\`\`Connection timeout: Failed to reach external API after 30s\`\`\``,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Failed Step:*\nfetch-data - Fetch user data from external API`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Run ID: \`${testRunId}\` | Scheduled run | ${this.formatTimestamp(new Date().toISOString())}`,
          },
        ],
      },
    ];

    // Add action buttons if baseUrl is provided
    if (baseUrl) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Details",
              emoji: false,
            },
            url: `${baseUrl}/admin?view=runs`,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Investigate Failure",
              emoji: false,
            },
            url: `${baseUrl}/agent/investigate?runId=${testRunId}`,
          },
        ],
      });
    }

    return blocks;
  }

  private buildMessageBlocks(payload: NotificationPayload): any[] {
    const toolName = payload.toolName || payload.toolId;
    const headerText =
      payload.status === "failed" ? `${toolName}: Run Failed` : `${toolName}: Run Succeeded`;

    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: headerText,
          emoji: false,
        },
      },
    ];

    if (payload.error) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Error:*\n\`\`\`${this.truncateError(payload.error)}\`\`\``,
        },
      });
    }

    if (payload.failedStepId) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Failed Step:*\n${payload.failedStepId}${payload.failedStepInstruction ? ` - ${payload.failedStepInstruction}` : ""}`,
        },
      });
    }

    // Build context line with optional source info for scheduled runs
    const contextParts = [`Run ID: \`${payload.runId}\``];
    if (payload.requestSource === "scheduler") {
      contextParts.push("Scheduled run");
    }
    contextParts.push(this.formatTimestamp(payload.timestamp));

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: contextParts.join(" | "),
        },
      ],
    });

    // Only add action buttons if URLs are not placeholder "#"
    if (payload.adminUrl !== "#" || payload.agentUrl !== "#") {
      const actions: any[] = [];

      if (payload.adminUrl !== "#") {
        actions.push({
          type: "button",
          text: {
            type: "plain_text",
            text: "View Details",
            emoji: false,
          },
          url: payload.adminUrl,
        });
      }

      if (payload.agentUrl !== "#") {
        actions.push({
          type: "button",
          text: {
            type: "plain_text",
            text: "Investigate Failure",
            emoji: false,
          },
          url: payload.agentUrl,
        });
      }

      if (actions.length > 0) {
        blocks.push({
          type: "actions",
          elements: actions,
        });
      }
    }

    return blocks;
  }

  private truncateError(error: string, maxLength = 500): string {
    if (error.length <= maxLength) return error;
    return error.substring(0, maxLength) + "...";
  }

  private async sendViaWebhook(
    blocks: any[],
    text: string,
    attachments?: any[],
  ): Promise<NotifierResult> {
    if (!this.config.webhookUrl) {
      return { success: false, error: "Webhook URL not configured" };
    }

    return this.sendWithRetry(async () => {
      const payload: any = { blocks, text };
      if (attachments) {
        payload.attachments = attachments;
      }

      const response = await axios.post(this.config.webhookUrl!, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: SLACK_TIMEOUT_MS,
        validateStatus: null, // Don't throw on any status
      });

      // Slack webhooks return "ok" as text on success, or error messages
      if (response.status >= 200 && response.status < 300) {
        const responseText =
          typeof response.data === "string" ? response.data : String(response.data);
        if (responseText === "ok" || responseText === "") {
          return { success: true };
        }
        // Webhook returned 200 but with an error message (e.g., "no_text", "invalid_payload")
        return {
          success: false,
          error: `Slack webhook error: ${responseText}`,
          isRetryable: false,
        };
      }

      // 4xx errors are config issues - don't retry
      if (response.status >= 400 && response.status < 500) {
        return {
          success: false,
          error: `Slack webhook returned status ${response.status}: ${response.data}`,
          isRetryable: false,
        };
      }

      // 5xx errors are server issues - retry
      return {
        success: false,
        error: `Slack webhook returned status ${response.status}: ${response.data}`,
        isRetryable: true,
      };
    });
  }

  private async sendViaBotToken(
    blocks: any[],
    text: string,
    attachments?: any[],
  ): Promise<NotifierResult> {
    if (!this.config.botToken || !this.config.channelId) {
      return { success: false, error: "Bot token or channel ID not configured" };
    }

    return this.sendWithRetry(async () => {
      const payload: any = {
        channel: this.config.channelId,
        blocks,
        text,
      };
      if (attachments) {
        payload.attachments = attachments;
      }

      const response = await axios.post("https://slack.com/api/chat.postMessage", payload, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.botToken}`,
        },
        timeout: SLACK_TIMEOUT_MS,
        validateStatus: null,
      });

      // Slack API always returns 200, check the ok field
      const data = response.data;
      if (data.ok) {
        return { success: true };
      }

      // If bot is not in channel, try to auto-join (works for public channels only)
      if (data.error === "not_in_channel") {
        const joinResult = await this.tryJoinChannel();
        if (joinResult.success) {
          // Retry the message after joining - reuse the same payload
          const retryResponse = await axios.post(
            "https://slack.com/api/chat.postMessage",
            payload,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.config.botToken}`,
              },
              timeout: SLACK_TIMEOUT_MS,
              validateStatus: null,
            },
          );
          if (retryResponse.data.ok) {
            return { success: true };
          }
          return {
            success: false,
            error: `Slack API error after join: ${retryResponse.data.error || "Unknown error"}`,
            isRetryable: false,
          };
        }
        // Join failed - return helpful error message
        return {
          success: false,
          error:
            joinResult.error ||
            "Bot is not in channel and could not auto-join. For private channels, please invite the bot manually with /invite @botname",
          isRetryable: false,
        };
      }

      // Certain errors are not retryable (auth, channel not found, etc.)
      const nonRetryableErrors = [
        "invalid_auth",
        "account_inactive",
        "token_revoked",
        "channel_not_found",
        "is_archived",
        "invalid_arguments",
      ];
      const isRetryable = !nonRetryableErrors.includes(data.error);

      // Provide user-friendly error messages
      const errorMessages: Record<string, string> = {
        invalid_auth: "Invalid bot token - please check your token and try again",
        account_inactive: "Slack account is inactive or disabled",
        token_revoked: "Bot token has been revoked - please generate a new one",
        channel_not_found: "Channel not found - please check the channel ID",
        is_archived: "Channel is archived and cannot receive messages",
        invalid_arguments: "Invalid request - please check your configuration",
        missing_scope: "Bot is missing required permissions - add chat:write scope",
        ratelimited: "Rate limited by Slack - please try again later",
      };

      const friendlyError =
        errorMessages[data.error] || `Slack error: ${data.error || "Unknown error"}`;

      return {
        success: false,
        error: friendlyError,
        isRetryable,
      };
    });
  }

  private async tryJoinChannel(): Promise<NotifierResult> {
    try {
      const response = await axios.post(
        "https://slack.com/api/conversations.join",
        {
          channel: this.config.channelId,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.botToken}`,
          },
          timeout: SLACK_TIMEOUT_MS,
          validateStatus: null,
        },
      );

      if (response.data.ok) {
        logMessage("info", `Bot auto-joined Slack channel ${this.config.channelId}`);
        return { success: true };
      }

      // Common errors: missing_scope (needs channels:join), channel_not_found, is_archived
      // method_not_supported_for_channel_type means it's a private channel
      const error = response.data.error;
      if (error === "missing_scope") {
        return {
          success: false,
          error:
            "Bot cannot auto-join: missing 'channels:join' scope. Please add this scope to your Slack app or invite the bot manually.",
        };
      }
      if (error === "method_not_supported_for_channel_type" || error === "channel_not_found") {
        return {
          success: false,
          error:
            "Cannot auto-join private channels. Please invite the bot manually with /invite @botname",
        };
      }

      return {
        success: false,
        error: `Failed to join channel: ${error}`,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to join channel: ${errorMessage}` };
    }
  }

  private async sendWithRetry(
    fn: () => Promise<NotifierResult & { isRetryable?: boolean }>,
  ): Promise<NotifierResult> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= SLACK_MAX_RETRIES; attempt++) {
      try {
        const result = await fn();

        if (result.success) {
          return { success: true };
        }

        lastError = result.error;

        // Don't retry if the error is not retryable
        if (!result.isRetryable) {
          return { success: false, error: result.error };
        }

        // Don't wait after the last attempt
        if (attempt < SLACK_MAX_RETRIES) {
          await this.sleep(SLACK_RETRY_DELAY_MS * (attempt + 1));
        }
      } catch (error) {
        // Network errors are retryable
        lastError = error instanceof Error ? error.message : String(error);

        if (attempt < SLACK_MAX_RETRIES) {
          await this.sleep(SLACK_RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    return { success: false, error: lastError || "Unknown error after retries" };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
