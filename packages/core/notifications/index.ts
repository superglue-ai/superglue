import type { DataStore } from "../datastore/types.js";
import { logMessage } from "../utils/logs.js";

export class NotificationService {
  constructor(_datastore: DataStore) {}

  async processRunCompletion(_params: {
    run: any;
    orgId: string;
    requestSource: any;
  }): Promise<void> {
    logMessage("debug", "Notifications are an enterprise feature");
  }
}
