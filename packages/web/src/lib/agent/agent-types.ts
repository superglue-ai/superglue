import { ConfirmationAction, Message, ConnectionProtocol } from "@superglue/shared";
import { GraphQLSubscriptionClient } from "../graphql-subscriptions";
import { AgentType } from "./registry/agents";

export const CALL_SYSTEM_CONFIRMATION = {
  PENDING: "PENDING_USER_CONFIRMATION",
  CONFIRMED: "USER_CONFIRMED",
  DECLINED: "USER_CANCELLED",
} as const;

export const EDIT_TOOL_CONFIRMATION = {
  PENDING: "PENDING_DIFF_APPROVAL",
  CONFIRMED: "DIFFS_APPROVED",
  DECLINED: "DIFFS_REJECTED",
  PARTIAL: "DIFFS_PARTIALLY_APPROVED",
} as const;

export const SYSTEM_UPSERT_CONFIRMATION = {
  PENDING: "PENDING_CREDENTIALS",
  CONFIRMED: "CREDENTIALS_PROVIDED",
  DECLINED: "CREDENTIALS_DECLINED",
} as const;

export type ToolExecutionPolicies = Record<string, Record<string, any>>;

export type CallSystemAutoExecute = "ask_every_time" | "run_gets_only" | "run_everything";

export interface CallSystemPolicy {
  autoExecute: CallSystemAutoExecute;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface ToolExecutionContext {
  superglueClient: SuperglueClient;
  filePayloads: Record<string, any>;
  messages: Message[];
  orgId: string;
  logCallback?: (message: string) => void;
  subscriptionClient?: GraphQLSubscriptionClient;
  abortSignal?: AbortSignal;
  toolExecutionPolicies?: ToolExecutionPolicies;
}

export interface ToolConfirmationConfig {
  timing: "before" | "after";
  validActions: ConfirmationAction[];
  states: Partial<Record<ConfirmationAction, string>>;
  processConfirmation: (
    input: any,
    output: any,
    ctx: ToolExecutionContext,
  ) => Promise<{ output: string; status: "completed" | "declined" }>;
}

export interface ToolRegistryEntry {
  name: string;
  definition: () => ToolDefinition;
  execute?: (input: any, ctx: ToolExecutionContext) => Promise<any>;
  confirmation?: ToolConfirmationConfig;
}

export interface AgentDefinition {
  id: string;
  systemPrompt: string | ((params: Record<string, any>) => string);
  toolSet: string[];
  initialContextGenerator?: (
    ctx: ToolExecutionContext,
    agentParams?: Record<string, any>,
  ) => Promise<string>;
  agentParamsSchema?: z.ZodSchema;
}

export type UserAction = ToolConfirmationAction | ToolExecutionFeedback | FileUploadAction;

export interface ToolConfirmationAction {
  type: "tool_confirmation";
  toolCallId: string;
  toolName: string;
  action: "confirmed" | "declined" | "partial";
  data?: {
    appliedChanges?: any[];
    rejectedChanges?: any[];
    systemConfig?: any;
    userProvidedCredentials?: Record<string, string>;
  };
}

export interface ToolExecutionFeedback {
  type: "tool_execution_feedback";
  toolCallId: string;
  toolName: string;
  feedback:
    | "manual_run"
    | "manual_run_success"
    | "manual_run_failure"
    | "request_fix"
    | "save_success"
    | "oauth_success"
    | "oauth_failure";
  data?:
    | {
        toolId?: string;
        result?: any;
        error?: string;
        appliedChanges?: number;
        payload?: any;
      }
    | any;
}

export interface FileUploadAction {
  type: "file_upload";
  files: Array<{
    key: string;
    name: string;
    contentPreview: string;
  }>;
}

export interface AgentRequest {
  agentId: AgentType;
  messages: Message[];
  userMessage?: string;
  userActions?: UserAction[];
  filePayloads?: Record<string, { name: string; content: any }>;
  hiddenContext?: string;
  agentParams?: Record<string, any>;
  toolExecutionPolicies?: ToolExecutionPolicies;
}

export interface ValidatedAgentRequest {
  agentId: AgentType;
  messages: Message[];
  userMessage?: string;
  userActions?: UserAction[];
  filePayloads?: Record<string, { name: string; content: any }>;
  hiddenContext?: string;
  agentParams?: Record<string, any>;
  toolExecutionPolicies?: ToolExecutionPolicies;
  agent: AgentDefinition;
}

export interface CallSystemArgs {
  systemId?: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface CallSystemResult {
  success: boolean;
  protocol: ConnectionProtocol;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: any;
  error?: string;
}
