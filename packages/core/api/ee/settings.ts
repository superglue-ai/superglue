import type {
  NotificationRule,
  NotificationSettings,
  SlackAuthType,
  SlackChannelConfig,
} from "@superglue/shared";
import { NotificationService } from "../../notifications/index.js";
import { credentialEncryption } from "../../utils/encryption.js";
import { logMessage } from "../../utils/logs.js";
import { registerApiModule } from "../registry.js";
import { addTraceHeader, sendError } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";

// Validate Slack webhook URL format
export function isValidSlackWebhookUrl(url: string): boolean {
  return url.startsWith("https://hooks.slack.com/services/");
}

// Validate Slack bot token format
export function isValidSlackBotToken(token: string): boolean {
  return token.startsWith("xoxb-");
}

// Default rate limit settings
const DEFAULT_RATE_LIMIT = {
  maxPerHour: 50,
  currentCount: 0,
  windowStart: new Date().toISOString(),
};

// Map internal settings to API response format
export function mapNotificationSettingsToResponse(settings: NotificationSettings | undefined): any {
  if (!settings) {
    return {
      channels: {
        slack: null,
      },
      rateLimit: DEFAULT_RATE_LIMIT,
    };
  }

  const slack = settings.channels.slack;

  return {
    channels: {
      slack: slack
        ? {
            enabled: slack.enabled,
            authType: slack.authType,
            webhookUrl: slack.webhookUrl,
            botToken: slack.botToken,
            channelId: slack.channelId,
            isConfigured: !!(slack.webhookUrl || slack.botToken),
            status: slack.status || "active",
            lastError: slack.lastError,
            lastErrorAt: slack.lastErrorAt,
            consecutiveFailures: slack.consecutiveFailures || 0,
            rules: slack.rules || [],
          }
        : null,
    },
    rateLimit: settings.rateLimit || DEFAULT_RATE_LIMIT,
  };
}

// GET /settings/notifications - Get notification settings
const getNotificationSettings: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;

  try {
    const settings = await authReq.datastore.getOrgSettings({
      orgId: authReq.authInfo.orgId,
    });

    const response = mapNotificationSettingsToResponse(settings?.notifications);
    return addTraceHeader(reply, authReq.traceId).code(200).send(response);
  } catch (error) {
    logMessage("error", `Failed to get notification settings: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to get notification settings");
  }
};

// PUT /settings/notifications - Update notification settings
const updateNotificationSettings: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as {
    channels?: {
      slack?: {
        enabled?: boolean;
        authType?: SlackAuthType;
        webhookUrl?: string;
        botToken?: string;
        channelId?: string;
        rules?: NotificationRule[];
      };
    };
  };

  try {
    // Get existing settings
    const existing = await authReq.datastore.getOrgSettings({
      orgId: authReq.authInfo.orgId,
    });

    const existingNotifications: NotificationSettings = existing?.notifications || {
      channels: {},
      rateLimit: DEFAULT_RATE_LIMIT,
    };

    // Build updated notifications
    const updatedNotifications: NotificationSettings = {
      ...existingNotifications,
      channels: { ...existingNotifications.channels },
    };

    // Handle Slack channel updates
    if (body.channels?.slack) {
      const slackInput = body.channels.slack;
      const existingSlack = existingNotifications.channels.slack;

      // Validate webhook URL if provided
      if (slackInput.webhookUrl && !isValidSlackWebhookUrl(slackInput.webhookUrl)) {
        return sendError(
          reply,
          400,
          "Invalid Slack webhook URL. Must start with https://hooks.slack.com/services/",
        );
      }

      // Validate bot token if provided
      if (slackInput.botToken && !isValidSlackBotToken(slackInput.botToken)) {
        return sendError(reply, 400, "Invalid Slack bot token. Must start with xoxb-");
      }

      // Encrypt bot token if provided
      let encryptedBotToken = existingSlack?.botToken;
      if (slackInput.botToken) {
        encryptedBotToken = credentialEncryption.encrypt({ token: slackInput.botToken }).token;
      }

      const updatedSlack: SlackChannelConfig = {
        enabled: slackInput.enabled ?? existingSlack?.enabled ?? true,
        authType: slackInput.authType ?? existingSlack?.authType ?? "webhook",
        webhookUrl: slackInput.webhookUrl ?? existingSlack?.webhookUrl,
        botToken: encryptedBotToken,
        channelId: slackInput.channelId ?? existingSlack?.channelId,
        rules: slackInput.rules ?? existingSlack?.rules ?? [],
        // Reset circuit breaker when config changes (but not when just updating rules)
        status:
          slackInput.webhookUrl || slackInput.botToken || slackInput.authType
            ? "active"
            : (existingSlack?.status ?? "active"),
        consecutiveFailures:
          slackInput.webhookUrl || slackInput.botToken || slackInput.authType
            ? 0
            : (existingSlack?.consecutiveFailures ?? 0),
        lastError:
          slackInput.webhookUrl || slackInput.botToken || slackInput.authType
            ? undefined
            : existingSlack?.lastError,
        lastErrorAt:
          slackInput.webhookUrl || slackInput.botToken || slackInput.authType
            ? undefined
            : existingSlack?.lastErrorAt,
      };

      updatedNotifications.channels.slack = updatedSlack;
    }

    // Save updated settings
    const updated = await authReq.datastore.upsertOrgSettings({
      orgId: authReq.authInfo.orgId,
      settings: { notifications: updatedNotifications },
    });

    const response = mapNotificationSettingsToResponse(updated.notifications);
    return addTraceHeader(reply, authReq.traceId).code(200).send(response);
  } catch (error) {
    logMessage("error", `Failed to update notification settings: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to update notification settings");
  }
};

// POST /settings/notifications/test - Send test notification
const testNotification: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as { channel: "slack" };

  if (!body.channel || body.channel !== "slack") {
    return sendError(reply, 400, "Invalid channel. Currently only 'slack' is supported.");
  }

  try {
    const notificationService = new NotificationService(authReq.datastore);
    const result = await notificationService.testNotification(authReq.authInfo.orgId, body.channel);

    if (result.success) {
      return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true });
    } else {
      return addTraceHeader(reply, authReq.traceId).code(200).send({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logMessage("error", `Failed to send test notification: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to send test notification");
  }
};

// Supported notification channels
const SUPPORTED_CHANNELS = ["slack"] as const;
type NotificationChannel = (typeof SUPPORTED_CHANNELS)[number];

function isValidChannel(channel: string): channel is NotificationChannel {
  return SUPPORTED_CHANNELS.includes(channel as NotificationChannel);
}

// DELETE /settings/notifications/channels/:channelId - Remove a notification channel configuration
const deleteNotificationChannel: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const { channelId } = request.params as { channelId: string };

  if (!isValidChannel(channelId)) {
    return sendError(
      reply,
      400,
      `Invalid channel: ${channelId}. Supported channels: ${SUPPORTED_CHANNELS.join(", ")}`,
    );
  }

  try {
    const existing = await authReq.datastore.getOrgSettings({
      orgId: authReq.authInfo.orgId,
    });

    if (!existing?.notifications?.channels?.[channelId]) {
      return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true });
    }

    const updatedNotifications: NotificationSettings = {
      ...existing.notifications,
      channels: {
        ...existing.notifications.channels,
        [channelId]: undefined,
      },
    };

    await authReq.datastore.upsertOrgSettings({
      orgId: authReq.authInfo.orgId,
      settings: { notifications: updatedNotifications },
    });

    return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true });
  } catch (error) {
    logMessage("error", `Failed to delete ${channelId} config: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, `Failed to delete ${channelId} configuration`);
  }
};

registerApiModule({
  name: "settings",
  routes: [
    {
      method: "GET",
      path: "/settings/notifications",
      handler: getNotificationSettings,
      permissions: { type: "read", resource: "settings", allowRestricted: false },
    },
    {
      method: "PUT",
      path: "/settings/notifications",
      handler: updateNotificationSettings,
      permissions: { type: "write", resource: "settings", allowRestricted: false },
    },
    {
      method: "POST",
      path: "/settings/notifications/test",
      handler: testNotification,
      permissions: { type: "write", resource: "settings", allowRestricted: false },
    },
    {
      method: "DELETE",
      path: "/settings/notifications/channels/:channelId",
      handler: deleteNotificationChannel,
      permissions: { type: "delete", resource: "settings", allowRestricted: false },
    },
  ],
});
