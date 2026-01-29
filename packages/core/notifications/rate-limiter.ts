import type { NotificationSettings } from "@superglue/shared";
import type { DataStore } from "../datastore/types.js";
import { logMessage } from "../utils/logs.js";

const DEFAULT_MAX_PER_HOUR = 50;

export class RateLimiter {
  constructor(private datastore: DataStore) {}

  async canSend(orgId: string): Promise<boolean> {
    const settings = await this.datastore.getOrgSettings({ orgId });
    if (!settings?.notifications?.rateLimit) {
      return true; // No rate limit configured, allow
    }

    const rateLimit = settings.notifications.rateLimit;
    const maxPerHour = rateLimit.maxPerHour || DEFAULT_MAX_PER_HOUR;
    const windowStart = new Date(rateLimit.windowStart);
    const now = new Date();

    // Check if we're in a new hour window
    const hoursSinceWindowStart = (now.getTime() - windowStart.getTime()) / (1000 * 60 * 60);

    if (hoursSinceWindowStart >= 1) {
      // Reset the window
      await this.resetWindow(orgId, settings.notifications);
      return true;
    }

    // Check if under limit
    return rateLimit.currentCount < maxPerHour;
  }

  async incrementCounter(orgId: string): Promise<void> {
    const settings = await this.datastore.getOrgSettings({ orgId });
    if (!settings?.notifications) return;

    const rateLimit = settings.notifications.rateLimit;
    const windowStart = new Date(rateLimit.windowStart);
    const now = new Date();
    const hoursSinceWindowStart = (now.getTime() - windowStart.getTime()) / (1000 * 60 * 60);

    let newCount: number;
    let newWindowStart: string;

    if (hoursSinceWindowStart >= 1) {
      // Start new window
      newCount = 1;
      newWindowStart = now.toISOString();
    } else {
      // Increment in current window
      newCount = rateLimit.currentCount + 1;
      newWindowStart = rateLimit.windowStart;
    }

    await this.datastore.upsertOrgSettings({
      orgId,
      settings: {
        notifications: {
          ...settings.notifications,
          rateLimit: {
            ...rateLimit,
            currentCount: newCount,
            windowStart: newWindowStart,
          },
        },
      },
    });
  }

  private async resetWindow(orgId: string, notifications: NotificationSettings): Promise<void> {
    await this.datastore.upsertOrgSettings({
      orgId,
      settings: {
        notifications: {
          ...notifications,
          rateLimit: {
            ...notifications.rateLimit,
            currentCount: 0,
            windowStart: new Date().toISOString(),
          },
        },
      },
    });
  }

  async getRateLimitStatus(
    orgId: string,
  ): Promise<{ currentCount: number; maxPerHour: number; windowStart: string }> {
    const settings = await this.datastore.getOrgSettings({ orgId });
    const rateLimit = settings?.notifications?.rateLimit;

    return {
      currentCount: rateLimit?.currentCount || 0,
      maxPerHour: rateLimit?.maxPerHour || DEFAULT_MAX_PER_HOUR,
      windowStart: rateLimit?.windowStart || new Date().toISOString(),
    };
  }
}
