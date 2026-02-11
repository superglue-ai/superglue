import {
  OpenAPIPagination,
  OpenAPITool,
  OpenAPIToolStep,
  ServiceMetadata,
  UserRole,
} from "@superglue/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import type { DataStore } from "../datastore/types.js";
import type { WorkerPools } from "../worker/types.js";
import type { DocumentationFiles, FileStatus } from "@superglue/shared";

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

// Re-export OpenAPI types from shared for convenience
export type { OpenAPIPagination, OpenAPITool, OpenAPIToolStep };

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
  tool?: Record<string, unknown>;
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

// For manual run creation (e.g., playground execution records)
export interface CreateRunRequestBody {
  toolId: string;
  toolConfig: Record<string, unknown>;
  status: "success" | "failed" | "aborted";
  error?: string;
  startedAt: string;
  completedAt: string;
}

export interface CreateSystemBody {
  name: string;
  url: string;
  credentials?: Record<string, any>;
  specificInstructions?: string;
  templateName?: string;
  documentationFiles?: DocumentationFiles;
  icon?: string;
  metadata?: Record<string, any>;
}

export interface UpdateSystemBody {
  name: string;
  url: string;
  specificInstructions?: string;
  icon?: string;
  credentials?: Record<string, any>;
  metadata?: Record<string, any>;
  templateName?: string;
  documentationFiles?: DocumentationFiles;
}

export interface ScrapeRequestBody {
  url?: string;
  keywords?: string[];
}

export interface DocumentationFileResponse {
  id: string;
  source: "upload" | "scrape" | "openapi";
  status: FileStatus;
  fileName: string;
  sourceUrl?: string;
  error?: string;
  content?: string;
}
