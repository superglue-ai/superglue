import type { NotificationPayload, NotifierResult } from "../types.js";

export abstract class BaseNotifier {
  abstract send(payload: NotificationPayload): Promise<NotifierResult>;
  abstract test(): Promise<NotifierResult>;

  /**
   * Formats a timestamp in UTC for consistent display across all users/orgs.
   * Using UTC avoids confusion in multi-tenant systems where server timezone
   * may differ from user expectations.
   */
  protected formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  }

  protected getSourceLabel(source: string): string {
    const labels: Record<string, string> = {
      api: "API",
      scheduler: "Scheduler",
      webhook: "Webhook",
      "tool-chain": "Tool Chain",
      frontend: "Frontend",
      mcp: "MCP",
    };
    return labels[source] || source;
  }
}
