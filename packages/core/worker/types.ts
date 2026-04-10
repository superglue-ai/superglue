import {
  Tool,
  RequestOptions,
  ToolStepResult,
  System,
  Role,
  RequestSource,
} from "@superglue/shared";
import type { TunnelPortMappings } from "../tunnel/index.js";
import type { DenoProcessPool } from "../deno/index.js";

export interface WorkerPools {
  /** Deno subprocess pool for tool execution */
  toolExecution: DenoProcessPool;
}

export interface ToolExecutionPayload {
  runId: string;
  workflow: Tool;
  payload?: Record<string, any>;
  credentials?: Record<string, string>;
  options?: RequestOptions;
  systems: System[];
  orgId: string;
  traceId?: string;
  userEmail?: string;
  tunnelMappings?: TunnelPortMappings;
  /** Pre-resolved user roles for request-level access rule evaluation in worker */
  userRoles: Role[];
  /** Where this execution originated from, used for source-scoped access rules */
  requestSource?: RequestSource;
}

export interface ToolExecutionResult {
  runId: string;
  success: boolean;
  data?: any;
  error?: string;
  stepResults: ToolStepResult[];
  tool?: Tool;
  startedAt: Date;
  completedAt: Date;
}

export interface CredentialUpdateMessage {
  systemId: string;
  orgId: string;
  credentials: Record<string, any>;
}
