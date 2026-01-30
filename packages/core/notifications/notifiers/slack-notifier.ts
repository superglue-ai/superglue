import type { SlackChannelConfig } from "@superglue/shared";
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
          text: "This is a test notification. Below is an example of what a real failure notification looks like. Use the buttons at the bottom to quickly view run details or have the AI agent investigate the failure.",
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

  private async sendViaWebhook(blocks: any[], text: string): Promise<NotifierResult> {
    if (!this.config.webhookUrl) {
      return { success: false, error: "Webhook URL not configured" };
    }

    return this.sendWithRetry(async () => {
      const response = await axios.post(
        this.config.webhookUrl!,
        { blocks, text },
        {
          headers: { "Content-Type": "application/json" },
          timeout: SLACK_TIMEOUT_MS,
          validateStatus: null, // Don't throw on any status
        },
      );

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

  private async sendViaBotToken(blocks: any[], text: string): Promise<NotifierResult> {
    if (!this.config.botToken || !this.config.channelId) {
      return { success: false, error: "Bot token or channel ID not configured" };
    }

    return this.sendWithRetry(async () => {
      const response = await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel: this.config.channelId,
          blocks,
          text,
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

      // Slack API always returns 200, check the ok field
      const data = response.data;
      if (data.ok) {
        return { success: true };
      }

      // Certain errors are not retryable (auth, channel not found, etc.)
      const nonRetryableErrors = [
        "invalid_auth",
        "account_inactive",
        "token_revoked",
        "channel_not_found",
        "not_in_channel",
        "is_archived",
        "invalid_arguments",
      ];
      const isRetryable = !nonRetryableErrors.includes(data.error);

      return {
        success: false,
        error: `Slack API error: ${data.error || "Unknown error"}`,
        isRetryable,
      };
    });
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
