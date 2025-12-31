import { ServiceMetadata, UserRole } from "@superglue/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import type { DataStore } from "../datastore/types.js";
import type { WorkerPools } from "../worker/types.js";

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  traceId?: string;
  authInfo: {
    orgId: string;
    userId?: string;
    orgName?: string;
    orgRole?: UserRole;
  };
  datastore: DataStore;
  workerPools: WorkerPools;

  toMetadata: () => ServiceMetadata;
}

export interface RouteHandler {
  (request: AuthenticatedFastifyRequest, reply: FastifyReply): Promise<any>;
}

export interface RouteConfig {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: RouteHandler;
  schema?: any;
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
}

export interface RunToolRequestBody {
  runId?: string;
  inputs?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  options?: RunToolRequestOptions;
}
