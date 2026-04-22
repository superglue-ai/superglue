import {
  ConfirmationAction,
  ExecutionFileEnvelope,
  Message,
  ConnectionProtocol,
  Tool,
} from "@superglue/shared";
import { SSESubscriptionClient } from "../sse-subscriptions";
import { AgentType } from "./registries/agent-registry";
import { EESuperglueClient } from "../ee-superglue-client";
import { TextStreamPart, ToolSet } from "ai";
import type { SkillName } from "./skills/index";

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

export interface SystemPlaygroundContext {
  systemId: string;
  url: string;
  templateName?: string;
  authType: "none" | "oauth" | "apikey" | "connection_string";
  credentialKeys: string[];
  specificInstructions: string;
  isNewSystem: boolean;
  sectionStatuses: {
    configuration: { isComplete: boolean; label: string };
    authentication: { isComplete: boolean; label: string };
    context: { isComplete: boolean; label: string };
  };
}

export interface AccessRulesContext {
  role: {
    id: string;
    name: string;
    description?: string;
    tools: "ALL" | string[];
    systems: "ALL" | Record<string, any>;
    isBaseRole?: boolean;
  };
  allRoles: Array<{ id: string; name: string }>;
  users: Array<{
    id: string;
    email: string | null;
    name: string | null;
    userType: "member" | "end_user";
    roleIds: string[];
  }>;
  availableSystems: Array<{ id: string; name: string; urlHost: string }>;
  availableTools: Array<{ id: string; name: string }>;
  isEditing: boolean;
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

export type EditToolSaveResult =
  | {
      success: true;
      toolId: string;
    }
  | {
      success: false;
      error: string;
    }
  | undefined;

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
  agentId: AgentType;
  superglueClient: EESuperglueClient;
  filePayloads: Record<string, ExecutionFileEnvelope>;
  messages: Message[];
  logCallback?: (message: string) => void;
  subscriptionClient?: SSESubscriptionClient;
  abortSignal?: AbortSignal;
  toolExecutionPolicies?: ToolExecutionPolicies;
  playgroundDraft?: DraftLookup;
  systemPlaygroundContext?: SystemPlaygroundContext;
  accessRulesContext?: AccessRulesContext;
  loadedSkills: Set<SkillName>;
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
  preloadedSkills?: SkillName[];
  systemPromptGenerator: (ctx: ToolExecutionContext) => Promise<SystemPromptResult>;
}

export interface AgentRequest {
  agentId: AgentType;
  messages: Message[];
  userMessage?: string;
  visibleUserMessageId?: string;
  resumeToolCallId?: string;
  filePayloads?: Record<string, ExecutionFileEnvelope>;
  toolExecutionPolicies?: ToolExecutionPolicies;
  conversationId?: string;
  loadedSkills?: string[];
  playgroundDraft?: DraftLookup;
  systemPlaygroundContext?: SystemPlaygroundContext;
  accessRulesContext?: AccessRulesContext;
}

export interface ValidatedAgentRequest {
  agentId: AgentType;
  messages: Message[];
  userMessage?: string;
  visibleUserMessageId?: string;
  resumeToolCallId?: string;
  filePayloads?: Record<string, ExecutionFileEnvelope>;
  toolExecutionPolicies?: ToolExecutionPolicies;
  conversationId?: string;
  loadedSkills?: string[];
  agent: AgentDefinition;
  playgroundDraft?: DraftLookup;
  systemPlaygroundContext?: SystemPlaygroundContext;
  accessRulesContext?: AccessRulesContext;
}

export interface PrepareMessagesResult {
  messages: Message[];
  systemMessage?: { id: string; content: string };
}

export interface CallSystemArgs {
  systemId?: string;
  environment?: "dev" | "prod";
  protocol?: ConnectionProtocol;
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

export interface DeploymentEndpoints {
  apiEndpoint: string;
  appEndpoint: string;
}
