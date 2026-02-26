import { Pagination, ServiceMetadata, Tool, ToolStep, UserRole } from "@superglue/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import type { DataStore } from "../datastore/types.js";
import type { WorkerPools } from "../worker/types.js";
import type {
  DocumentationFiles,
  FileStatus,
  MultiTenancyMode,
  PatchSystemBody,
} from "@superglue/shared";
export type { PatchSystemBody };

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  traceId?: string;
  authInfo: AuthInfo;
  datastore: DataStore;
  workerPools: WorkerPools;

  toMetadata: () => ServiceMetadata;
}

export interface AuthInfo {
  orgId: string;
  userId?: string;
  orgName?: string;
  orgRole?: UserRole;
  // EE: Effective permissions (intersection of API key + end user scopes)
  isRestricted?: boolean;
  allowedSystems?: string[] | null; // null or ['*'] means all systems allowed
}

export interface RouteHandler {
  (request: AuthenticatedFastifyRequest, reply: FastifyReply): Promise<any>;
}

// Route-level permission configuration
export interface RoutePermission {
  type: "read" | "write" | "execute" | "delete";
  resource: string;
  allowRestricted?: boolean; // Can restricted API keys access this route? (default: false)
  checkResourceId?: "toolId"; // Which param needs permission validation?
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

// Re-export types from shared for convenience
export type { Pagination, Tool, ToolStep };

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
  tool?: Tool; // Full tool config
  status: "running" | "success" | "failed" | "aborted";
  toolPayload?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string;
  stepResults?: OpenAPIStepResult[];
  options?: Record<string, unknown>;
  requestSource?: string;
  traceId?: string;
  resultStorageUri?: string; // S3 URI where full results are stored (EE feature)
  userId?: string; // User or end user who triggered this run
  metadata: OpenAPIRunMetadata;
}

// Request body types
export interface RunToolRequestOptions {
  async?: boolean;
  timeout?: number;
  webhookUrl?: string;
  traceId?: string;
  // Optional source of the request; 'frontend' and 'mcp' are honored; Other sources are derived from the request context.
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
  toolConfig: Tool;
  toolResult?: unknown;
  stepResults?: Array<{ stepId: string; success: boolean; data?: unknown; error?: string }>;
  toolPayload?: Record<string, unknown>;
  status: "success" | "failed" | "aborted";
  error?: string;
  startedAt: string;
  completedAt: string;
}

export interface CreateSystemBody {
  id?: string;
  name: string;
  url: string;
  credentials?: Record<string, any>;
  specificInstructions?: string;
  templateName?: string;
  multiTenancyMode?: MultiTenancyMode;
  documentationFiles?: DocumentationFiles;
  icon?: string;
  metadata?: Record<string, any>;
  tunnel?: { tunnelId: string; targetName: string };
}

export interface UploadDocumentationBody {
  files: Array<{
    fileName: string;
    metadata?: {
      contentType?: string;
      contentLength?: number;
      [key: string]: any;
    };
  }>;
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
  createdAt?: string;
  contentLength?: number;
}
