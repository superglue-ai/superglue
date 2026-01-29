import type {
  NotificationSettings,
  NotificationRule,
  RequestSource,
  Run,
  SlackChannelConfig,
} from "@superglue/shared";

export interface NotificationContext {
  run: Run;
  orgId: string;
  requestSource: RequestSource;
  toolName?: string;
}

export interface NotificationPayload {
  runId: string;
  toolId: string;
  toolName?: string;
  status: "failed" | "success";
  error?: string;
  requestSource: RequestSource;
  failedStepId?: string;
  failedStepInstruction?: string;
  timestamp: string;
  adminUrl: string;
  agentUrl: string;
}

export interface NotifierResult {
  success: boolean;
  error?: string;
}

export interface Notifier {
  send(payload: NotificationPayload): Promise<NotifierResult>;
  test(): Promise<NotifierResult>;
}

export type { NotificationSettings, NotificationRule, SlackChannelConfig };
