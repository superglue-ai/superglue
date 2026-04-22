/**
 * Types for Deno subprocess pool
 */

import type {
  ExecutionFileEnvelope,
  Tool,
  RequestOptions,
  ToolStepResult,
  System,
  Role,
  RequestSource,
} from "@superglue/shared";
import type { TunnelPortMappings } from "../tunnel/index.js";

/**
 * Payload sent to Deno subprocess (mirrors ToolExecutionPayload)
 */
export interface DenoWorkflowPayload {
  runId: string;
  workflow: Tool;
  payload?: Record<string, any>;
  files?: Record<string, ExecutionFileEnvelope>;
  /** Internal-only: return produced file envelopes inline for step-by-step execution */
  returnProducedFiles?: boolean;
  credentials?: Record<string, string>;
  options?: RequestOptions;
  systems: System[];
  orgId: string;
  traceId?: string;
  userEmail?: string;
  tunnelMappings?: TunnelPortMappings;
  userRoles: Role[];
  requestSource?: RequestSource;
}

/**
 * Result from Deno subprocess (mirrors ToolExecutionResult)
 */
export interface DenoWorkflowResult {
  runId: string;
  success: boolean;
  data?: any;
  error?: string;
  stepResults: ToolStepResult[];
  producedFiles?: Record<string, ExecutionFileEnvelope>;
  tool?: Tool;
  startedAt: string;
  completedAt: string;
}

/**
 * Configuration for Deno process pool
 */
export interface DenoPoolConfig {
  /** Number of warm processes to maintain */
  poolSize: number;
  /** Maximum memory per process in MB */
  memoryMb: number;
  /** Workflow timeout in milliseconds */
  workflowTimeoutMs: number;
  /** Path to the Deno workflow executor script */
  scriptPath: string;
  /** Maximum queue size before rejecting new tasks */
  maxQueueSize?: number;
  /** Number of executions before recycling a process */
  recycleAfterExecutions?: number;
}

/**
 * Internal state for a Deno worker process
 */
export interface DenoWorkerState {
  id: string;
  busy: boolean;
  executionCount: number;
  lastUsed: number;
  currentTaskId?: string;
}

/**
 * Log entry from Deno subprocess
 */
export interface DenoLogEntry {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
  traceId?: string;
  orgId?: string;
}

/**
 * Credential update from Deno subprocess
 */
export interface DenoCredentialUpdate {
  type: "credential_update";
  systemId: string;
  credentials: Record<string, any>;
}

/**
 * Message from Deno subprocess stderr
 */
export type DenoStderrMessage = DenoLogEntry | DenoCredentialUpdate;

/**
 * Queued task waiting for a worker
 */
export interface QueuedTask {
  taskId: string;
  payload: DenoWorkflowPayload;
  resolve: (result: DenoWorkflowResult) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * Handler for credential updates from Deno subprocess
 */
export type CredentialUpdateHandler = (
  systemId: string,
  orgId: string,
  credentials: Record<string, any>,
) => Promise<void>;

/**
 * Handler for log messages from Deno subprocess
 */
export type LogHandler = (entry: DenoLogEntry) => void;
