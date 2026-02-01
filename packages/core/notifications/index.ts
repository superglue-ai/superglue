// Notifications are available in the enterprise version of superglue
import type { RequestSource, RunStatus, Tool, ToolStepResult } from "@superglue/shared";
import type { DataStore } from "../datastore/types.js";

export interface RunCompletionParams {
  run: {
    runId: string;
    toolId: string;
    tool?: Tool;
    status: RunStatus;
    error?: string;
    stepResults?: ToolStepResult[];
    metadata: {
      startedAt: string;
      completedAt: string;
      durationMs: number;
    };
  };
  orgId: string;
  requestSource: RequestSource;
}

export class NotificationService {
  constructor(_datastore: DataStore) {}

  async processRunCompletion(_params: RunCompletionParams): Promise<void> {}
}