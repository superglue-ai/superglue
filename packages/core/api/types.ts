import { ServiceMetadata, UserRole } from "@superglue/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import type { DataStore } from "../datastore/types.js";
import type { WorkerPools } from "../worker/types.js";

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  traceId?: string;
  authInfo: {
    orgId: string;
    userId?: string;
    userEmail?: string;
    userName?: string;
    orgName?: string;
    orgRole?: UserRole;
    // EE: API key permission fields
    isRestricted?: boolean;
    allowedTools?: string[];
  };
  datastore: DataStore;
  workerPools: WorkerPools;

  toMetadata: () => ServiceMetadata;
}

export interface RouteHandler {
  (request: AuthenticatedFastifyRequest, reply: FastifyReply): Promise<any>;
}

// Route-level permission configuration
export interface RoutePermission {
  type: "read" | "write" | "execute" | "delete";
  resource: string;
  allowRestricted?: boolean; // Can restricted API keys access this route? (default: false)
  checkResourceId?: "toolId"; // Which param needs allowedTools validation?
}

export interface RouteConfig {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: RouteHandler;
  schema?: any;
  permissions?: RoutePermission;
}

export interface ApiModule {
  name: string;
  routes: RouteConfig[];
}

// OpenAPI Response Types
export interface OpenAPIPagination {
  type: string;
  pageSize?: string;
  cursorPath?: string;
  stopCondition?: string;
}

export interface OpenAPIToolStep {
  id: string;
  url: string;
  method: string;
  queryParams?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: string;
  pagination?: OpenAPIPagination;
  systemId?: string;
  instruction?: string;
  modify?: boolean;
  dataSelector?: string;
  failureBehavior?: "fail" | "continue";
}

export interface OpenAPITool {
  id: string;
  name: string;
  version?: string;
  instruction?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  steps: OpenAPIToolStep[];
  outputTransform?: string;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpenAPIStepResult {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface OpenAPIRunMetadata {
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface OpenAPIRun {
  runId: string;
  toolId: string;
  tool?: { id: string; version?: string };
  status: "running" | "success" | "failed" | "aborted";
  toolPayload?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string;
  stepResults?: OpenAPIStepResult[];
  options?: Record<string, unknown>;
  requestSource?: string;
  traceId?: string;
  metadata: OpenAPIRunMetadata;
}

// Request body types
export interface RunToolRequestOptions {
  async?: boolean;
  timeout?: number;
  webhookUrl?: string;
  traceId?: string;
  // Optional source of the request; currently only 'mcp' is honored; Other sources are derived from the request context.x
  requestSource?: string;
}

export interface RunToolRequestBody {
  runId?: string;
  inputs?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  options?: RunToolRequestOptions;
}

// Step execution request (no run creation)
export interface RunStepRequestOptions {
  selfHealing?: boolean;
  timeout?: number;
}

export interface RunStepRequestBody {
  step: Record<string, unknown>; // ExecutionStep
  payload?: Record<string, unknown>;
  previousResults?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  options?: RunStepRequestOptions;
}

// Step execution response
export interface RunStepResponse {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  updatedStep?: Record<string, unknown>; // ExecutionStep if self-healed
}

// Transform execution request (no run creation)
export interface RunTransformRequestBody {
  finalTransform: string;
  responseSchema?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  stepResults?: Record<string, unknown>;
  responseFilters?: Array<Record<string, unknown>>;
  options?: RunStepRequestOptions;
}

// Transform execution response
export interface RunTransformResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  updatedTransform?: string;
  updatedResponseSchema?: Record<string, unknown>;
}

// Create run request (for manual run creation after tool execution)
export interface CreateRunRequestBody {
  toolId: string;
  toolConfig: Record<string, unknown>; // Tool configuration
  status: string; // "success" | "failed"
  error?: string;
  startedAt: string; // ISO timestamp
  completedAt: string; // ISO timestamp
}
