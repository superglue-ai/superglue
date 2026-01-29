import { describe, expect, it, vi } from "vitest";
import {
  isValidSlackWebhookUrl,
  isValidSlackBotToken,
  mapNotificationSettingsToResponse,
} from "./settings.js";

// Test webhook URL prefix - actual values are constructed in tests
const WEBHOOK_PREFIX = "https://hooks.slack.com/services/";

describe("settings API", () => {
  describe("isValidSlackWebhookUrl", () => {
    it("should return true for valid Slack webhook URLs", () => {
      expect(isValidSlackWebhookUrl(`${WEBHOOK_PREFIX}T/B/X`)).toBe(true);
      expect(isValidSlackWebhookUrl(`${WEBHOOK_PREFIX}abc/def/ghi`)).toBe(true);
    });

    it("should return false for invalid Slack webhook URLs", () => {
      expect(isValidSlackWebhookUrl("https://example.com/webhook")).toBe(false);
      expect(isValidSlackWebhookUrl("http://hooks.slack.com/services/abc")).toBe(false);
      expect(isValidSlackWebhookUrl("https://hooks.slack.com/other/path")).toBe(false);
      expect(isValidSlackWebhookUrl("")).toBe(false);
    });
  });

  describe("isValidSlackBotToken", () => {
    it("should return true for valid Slack bot tokens", () => {
      // Token prefix that passes validation
      const botPrefix = "xoxb-";
      expect(isValidSlackBotToken(`${botPrefix}fake-test-value`)).toBe(true);
      expect(isValidSlackBotToken(`${botPrefix}test`)).toBe(true);
    });

    it("should return false for invalid Slack bot tokens", () => {
      expect(isValidSlackBotToken("xoxa-123456789")).toBe(false);
      expect(isValidSlackBotToken("invalid-token")).toBe(false);
      expect(isValidSlackBotToken("")).toBe(false);
      expect(isValidSlackBotToken("xoxb")).toBe(false);
    });
  });

  describe("mapNotificationSettingsToResponse", () => {
    it("should return default settings when undefined", () => {
      const result = mapNotificationSettingsToResponse(undefined);

      expect(result.channels.slack).toBeNull();
      expect(result.rateLimit.maxPerHour).toBe(50);
      expect(result.rateLimit.currentCount).toBe(0);
      expect(result.rateLimit.windowStart).toBeDefined();
    });

    it("should map basic notification settings with slack channel", () => {
      const settings = {
        channels: {
          slack: {
            enabled: true,
            authType: "webhook" as const,
            webhookUrl: `${WEBHOOK_PREFIX}T/B/X`,
            status: "active" as const,
            consecutiveFailures: 0,
            rules: [
              {
                id: "rule-1",
                enabled: true,
                conditions: { status: "failed" as const },
              },
            ],
          },
        },
        rateLimit: { maxPerHour: 100, currentCount: 5, windowStart: "2024-01-01T00:00:00Z" },
      };

      const result = mapNotificationSettingsToResponse(settings as any);

      expect(result.channels.slack).not.toBeNull();
      expect(result.channels.slack!.rules).toHaveLength(1);
      expect(result.channels.slack!.rules[0].conditions.status).toBe("failed");
      expect(result.rateLimit.maxPerHour).toBe(100);
      expect(result.rateLimit.currentCount).toBe(5);
    });

    it("should map Slack webhook configuration", () => {
      const settings = {
        channels: {
          slack: {
            enabled: true,
            authType: "webhook" as const,
            webhookUrl: `${WEBHOOK_PREFIX}T/B/X`,
            status: "active" as const,
            consecutiveFailures: 0,
            rules: [],
          },
        },
        rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: "2024-01-01T00:00:00Z" },
      };

      const result = mapNotificationSettingsToResponse(settings);

      expect(result.channels.slack).not.toBeNull();
      expect(result.channels.slack!.authType).toBe("webhook");
      expect(result.channels.slack!.webhookUrl).toBe(`${WEBHOOK_PREFIX}T/B/X`);
      expect(result.channels.slack!.isConfigured).toBe(true);
      expect(result.channels.slack!.status).toBe("active");
      expect(result.channels.slack!.consecutiveFailures).toBe(0);
    });

    it("should map Slack bot token configuration", () => {
      const settings = {
        channels: {
          slack: {
            enabled: true,
            authType: "bot_token" as const,
            botToken: "encrypted-token",
            channelId: "C12345678",
            status: "active" as const,
            consecutiveFailures: 0,
            rules: [],
          },
        },
        rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: "2024-01-01T00:00:00Z" },
      };

      const result = mapNotificationSettingsToResponse(settings);

      expect(result.channels.slack).not.toBeNull();
      expect(result.channels.slack!.authType).toBe("bot_token");
      expect(result.channels.slack!.botToken).toBe("encrypted-token");
      expect(result.channels.slack!.channelId).toBe("C12345678");
      expect(result.channels.slack!.isConfigured).toBe(true);
    });

    it("should handle Slack configuration with errors", () => {
      const settings = {
        channels: {
          slack: {
            enabled: true,
            authType: "webhook" as const,
            webhookUrl: `${WEBHOOK_PREFIX}T/B/X`,
            status: "disabled" as const,
            consecutiveFailures: 5,
            lastError: "Connection timeout",
            lastErrorAt: "2024-01-01T12:00:00Z",
            rules: [],
          },
        },
        rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: "2024-01-01T00:00:00Z" },
      };

      const result = mapNotificationSettingsToResponse(settings);

      expect(result.channels.slack!.status).toBe("disabled");
      expect(result.channels.slack!.consecutiveFailures).toBe(5);
      expect(result.channels.slack!.lastError).toBe("Connection timeout");
      expect(result.channels.slack!.lastErrorAt).toBe("2024-01-01T12:00:00Z");
    });

    it("should show isConfigured as false when no credentials", () => {
      const settings = {
        channels: {
          slack: {
            enabled: true,
            authType: "webhook" as const,
            status: "active" as const,
            consecutiveFailures: 0,
            rules: [],
          },
        },
        rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: "2024-01-01T00:00:00Z" },
      };

      const result = mapNotificationSettingsToResponse(settings);

      expect(result.channels.slack!.isConfigured).toBe(false);
    });

    it("should handle empty rules array in slack channel", () => {
      const settings = {
        channels: {
          slack: {
            enabled: false,
            authType: "webhook" as const,
            status: "active" as const,
            consecutiveFailures: 0,
            rules: [],
          },
        },
        rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: "2024-01-01T00:00:00Z" },
      };

      const result = mapNotificationSettingsToResponse(settings);

      expect(result.channels.slack!.rules).toEqual([]);
    });

    it("should use default rate limit when not provided", () => {
      const settings = {
        channels: {},
      };

      const result = mapNotificationSettingsToResponse(settings as any);

      expect(result.rateLimit.maxPerHour).toBe(50);
      expect(result.rateLimit.currentCount).toBe(0);
    });

    it("should handle multiple notification rules in slack channel", () => {
      const settings = {
        channels: {
          slack: {
            enabled: true,
            authType: "webhook" as const,
            webhookUrl: `${WEBHOOK_PREFIX}T/B/X`,
            status: "active" as const,
            consecutiveFailures: 0,
            rules: [
              {
                id: "rule-1",
                enabled: true,
                conditions: { status: "failed" as const },
              },
              {
                id: "rule-2",
                enabled: true,
                conditions: { status: "any" as const },
              },
            ],
          },
        },
        rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: "2024-01-01T00:00:00Z" },
      };

      const result = mapNotificationSettingsToResponse(settings as any);

      expect(result.channels.slack!.rules).toHaveLength(2);
      expect(result.channels.slack!.rules[0].conditions.status).toBe("failed");
      expect(result.channels.slack!.rules[1].conditions.status).toBe("any");
    });

    it("should handle no slack channel configured", () => {
      const settings = {
        channels: {},
        rateLimit: { maxPerHour: 50, currentCount: 0, windowStart: "2024-01-01T00:00:00Z" },
      };

      const result = mapNotificationSettingsToResponse(settings);

      expect(result.channels.slack).toBeNull();
    });
  });
});
