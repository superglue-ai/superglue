import { ConfirmationAction, Message } from "@superglue/shared";
import { GraphQLSubscriptionClient } from "../graphql-subscriptions";
import { AgentType } from "./registry/agents";

export type ExecutionMode = "auto" | "confirm_before_execution" | "confirm_after_execution";

export interface ToolPolicy {
  defaultMode: ExecutionMode;
  userModeOptions?: ExecutionMode[];
  computeModeFromInput?: (input: any, policies?: Record<string, any>) => ExecutionMode | null;
  buildPendingOutput?: (input: any) => any;
}

export type ToolEventStatus =
  | "pending"
  | "declined"
  | "completed"
  | "awaiting_confirmation"
  | "running"
  | "stopped"
  | "failed";

export interface EventDefinition {
  message: string;
  statusUpdate?: ToolEventStatus;
}

export interface ToolEvents {
  [toolName: string]: Record<string, EventDefinition>;
}

export interface GlobalEvents {
  [eventName: string]: EventDefinition;
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
  logCallback?: (message: string) => void;
  subscriptionClient?: GraphQLSubscriptionClient;
  abortSignal?: AbortSignal;
  toolExecutionPolicies?: ToolExecutionPolicies;
}

export interface ToolConfirmationConfig {
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

export interface SystemPromptResult {
  content: string;
}

export interface AgentDefinition {
  id: string;
  toolSet: string[];
  systemPromptGenerator: (ctx: ToolExecutionContext) => Promise<SystemPromptResult>;
}

export interface ToolEventAction {
  type: "tool_event";
  toolCallId: string;
  toolName: string;
  event: string;
  payload?: Record<string, unknown>;
}

export interface GlobalEventAction {
  type: "global_event";
  event: string;
  payload?: Record<string, unknown>;
}

export type UserAction = ToolEventAction | GlobalEventAction;

export interface AgentRequest {
  agentId: AgentType;
  messages: Message[];
  userMessage?: string;
  userActions?: UserAction[];
  filePayloads?: Record<string, { name: string; content: any }>;
  hiddenContext?: string;
  toolExecutionPolicies?: ToolExecutionPolicies;
}

export interface ValidatedAgentRequest {
  agentId: AgentType;
  messages: Message[];
  userMessage?: string;
  userActions?: UserAction[];
  filePayloads?: Record<string, { name: string; content: any }>;
  hiddenContext?: string;
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
