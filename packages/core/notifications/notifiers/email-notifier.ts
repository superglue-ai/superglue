import { Resend } from "resend";
import type { NotificationPayload, NotifierResult } from "../types.js";
import { BaseNotifier } from "./base-notifier.js";

export class EmailNotifier extends BaseNotifier {
  private resend: Resend;

  constructor(private config: { recipientEmail: string }) {
    super();
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }
    this.resend = new Resend(apiKey);
  }

  async send(payload: NotificationPayload): Promise<NotifierResult> {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@superglue.cloud";

      await this.resend.emails.send({
        from: fromEmail,
        to: this.config.recipientEmail,
        subject: `Superglue Notification: ${payload.status}`,
        html: this.formatEmailHtml(payload),
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async sendCustom(subject: string, body: string): Promise<NotifierResult> {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@superglue.cloud";

      await this.resend.emails.send({
        from: fromEmail,
        to: this.config.recipientEmail,
        subject,
        html: body,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async test(): Promise<NotifierResult> {
    return this.send({
      runId: "test-run",
      toolId: "test-tool",
      toolName: "Test Tool",
      status: "success",
      requestSource: "API" as NotificationPayload["requestSource"],
      timestamp: new Date().toISOString(),
      adminUrl: "https://app.superglue.cloud",
      agentUrl: "https://app.superglue.cloud/agent",
    });
  }

  private formatEmailHtml(payload: NotificationPayload): string {
    const statusLabel = payload.status === "success" ? "Succeeded" : "Failed";
    const escapeHtml = (value: string) =>
      value.replace(
        /[&<>"']/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[char] as string,
      );
    const safeTool = escapeHtml(payload.toolName || payload.toolId);
    const safeRunId = escapeHtml(payload.runId);
    const safeStatus = escapeHtml(payload.status);
    const safeAdminUrl = escapeHtml(payload.adminUrl);
    const errorBlock = payload.error
      ? `<p><strong>Error:</strong> ${escapeHtml(payload.error)}</p>`
      : "";
    return `
      <h2>Tool Run ${statusLabel}</h2>
      <p><strong>Tool:</strong> ${safeTool}</p>
      <p><strong>Run ID:</strong> ${safeRunId}</p>
      <p><strong>Status:</strong> ${safeStatus}</p>
      ${errorBlock}
      <p><a href="${safeAdminUrl}">View in Admin</a></p>
    `;
  }
}
