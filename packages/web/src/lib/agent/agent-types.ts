import { ConfirmationAction, Message } from "@superglue/shared";
import { SuperglueClient } from "@superglue/shared";
import { z } from "zod";
import { GraphQLSubscriptionClient } from "../graphql-subscriptions";
import { AgentType } from "./registry/agents";
import { EESuperglueClient } from "../ee-superglue-client";
import { TextStreamPart, ToolSet } from "ai";

// Type helpers for AI SDK stream parts - Extract specific part types from the union
export type StreamPart = TextStreamPart<ToolSet>;
export type TextDeltaPart = Extract<StreamPart, { type: "text-delta" }>;
export type ToolCallPart = Extract<StreamPart, { type: "tool-call" }>;
export type ToolInputStartPart = Extract<StreamPart, { type: "tool-input-start" }>;
export type ToolResultPart = Extract<StreamPart, { type: "tool-result" }>;
export type ToolErrorPart = Extract<StreamPart, { type: "tool-error" }>;
export type ErrorPart = Extract<StreamPart, { type: "error" }>;

export type ExecutionMode = "auto" | "confirm_before_execution" | "confirm_after_execution";

export interface ToolPolicy {
  defaultMode: ExecutionMode;
  userModeOptions?: ExecutionMode[];
  computeModeFromInput?: (input: any, policies?: Record<string, any>) => ExecutionMode | null;
  buildPendingOutput?: (input: any) => any;
}

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
  protocol: "http" | "postgres" | "sftp";
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: any;
  error?: string;
}
