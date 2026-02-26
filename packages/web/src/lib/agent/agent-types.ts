import { ConfirmationAction, Message, ConnectionProtocol, Tool } from "@superglue/shared";
import { SSESubscriptionClient } from "../sse-subscriptions";
import { AgentType } from "./registry/agents";
import { EESuperglueClient } from "../ee-superglue-client";
import { TextStreamPart, ToolSet } from "ai";

export interface PlaygroundToolContext {
  toolId: string;
  instruction: string;
  steps: any[];
  outputTransform: string;
  inputSchema: string | null;
  outputSchema: string | null;
  systemIds: string[];
  executionSummary: string;
  initialError?: string;
  currentPayload?: string;
}

export interface DraftLookup {
  config: Tool;
  systemIds: string[];
  instruction: string;
  executionResults?: Record<
    string,
    {
      status: string;
      result?: string;
      error?: string;
    }
  >;
}

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

export type ToolEventStatus =
  | "pending"
  | "declined"
  | "completed"
  | "awaiting_confirmation"
  | "running"
  | "stopped"
  | "failed"
  | "error";

export interface EventDefinition {
  message: string;
  statusUpdate?: ToolEventStatus;
}

export interface ToolEvents {
  [toolName: string]: Record<string, EventDefinition>;
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
  superglueClient: EESuperglueClient;
  filePayloads: Record<string, any>;
  messages: Message[];
  logCallback?: (message: string) => void;
  subscriptionClient?: SSESubscriptionClient;
  abortSignal?: AbortSignal;
  toolExecutionPolicies?: ToolExecutionPolicies;
  playgroundDraft?: DraftLookup;
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
  conversationId?: string;
  playgroundDraft?: DraftLookup;
}

export interface ValidatedAgentRequest {
  agentId: AgentType;
  messages: Message[];
  userMessage?: string;
  userActions?: UserAction[];
  filePayloads?: Record<string, { name: string; content: any }>;
  hiddenContext?: string;
  toolExecutionPolicies?: ToolExecutionPolicies;
  conversationId?: string;
  agent: AgentDefinition;
  playgroundDraft?: DraftLookup;
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
  next_step?: string;
}
