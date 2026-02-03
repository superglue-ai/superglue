import { ConfirmationAction, Message } from "@superglue/shared";
import { SuperglueClient } from "@superglue/shared";
import { z } from "zod";
import { GraphQLSubscriptionClient } from "../graphql-subscriptions";
import { AgentType } from "./registry/agents";
import { EESuperglueClient } from "../ee-superglue-client";

export const CALL_ENDPOINT_CONFIRMATION = {
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

export type ToolExecutionPolicies = Record<string, Record<string, any>>;

export type CallEndpointAutoExecute = "ask_every_time" | "run_gets_only" | "run_everything";

export interface CallEndpointPolicy {
  autoExecute: CallEndpointAutoExecute;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface ToolExecutionContext {
  superglueClient: EESuperglueClient;
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
