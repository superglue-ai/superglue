import { Pagination, ServiceMetadata, Tool, ToolStep } from "@superglue/shared";
import type { Role } from "@superglue/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import type { EEDataStore } from "../datastore/ee/types.js";
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
  datastore: EEDataStore;
  workerPools: WorkerPools;

  toMetadata: () => ServiceMetadata;
}

export interface AuthInfo {
  orgId: string;
  userId?: string;
  userEmail?: string;
  orgName?: string;
  roles: Role[];
}

export interface RouteHandler {
  (request: AuthenticatedFastifyRequest, reply: FastifyReply): Promise<any>;
}

export type BaseRoleId = "admin" | "member" | "enduser";

export const ALL_BASE_ROLES: BaseRoleId[] = ["admin", "member", "enduser"];

export interface RoutePermission {
  type: "read" | "write" | "execute" | "delete";
  resource: string;
  allowedBaseRoles: BaseRoleId[];
  checkResourceId?: "toolId" | "systemId";
}

export interface RouteConfig {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: RouteHandler;
  schema?: any;
  permissions: RoutePermission;
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
  tool?: Tool;
  status: "running" | "success" | "failed" | "aborted";
  toolPayload?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string;
  stepResults?: OpenAPIStepResult[];
  options?: Record<string, unknown>;
  requestSource?: string;
  traceId?: string;
  resultStorageUri?: string;
  userId?: string;
  executionMode?: "dev" | "prod";
  metadata: OpenAPIRunMetadata;
}

export interface RunToolRequestOptions {
  async?: boolean;
  timeout?: number;
  webhookUrl?: string;
  traceId?: string;
  requestSource?: string;
  mode?: "dev" | "prod";
}

export interface RunToolRequestBody {
  runId?: string;
  inputs?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  options?: RunToolRequestOptions;
}

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
  id: string;
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
  environment?: "dev" | "prod";
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
