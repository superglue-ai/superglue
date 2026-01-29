import type { NotificationPayload, NotifierResult } from "../types.js";
import { BaseNotifier } from "./base-notifier.js";

// Stub for future email implementation
export class EmailNotifier extends BaseNotifier {
  constructor(private config: { recipientEmail?: string }) {
    super();
  }

  async send(_payload: NotificationPayload): Promise<NotifierResult> {
    return { success: false, error: "Email notifications not yet implemented" };
  }

  async test(): Promise<NotifierResult> {
    return { success: false, error: "Email notifications not yet implemented" };
  }
}
