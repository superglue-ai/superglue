import {
  DocumentationFiles,
  FileReference,
  RequestSource,
  RunStatus,
  System,
  TunnelConfig,
  validateExternalUrl,
  ALLOWED_PATCH_SYSTEM_FIELDS,
} from "@superglue/shared";
import {
  CreateSystemBody,
  PatchSystemBody,
  ScrapeRequestBody,
  UploadDocumentationBody,
} from "./types.js";
import { normalizeSystem } from "../datastore/migrations/migration.js";

export function transformSystemDates(system: System) {
  const { createdAt, updatedAt, ...rest } = system;
  return {
    ...rest,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
  };
}

export function validateCreateSystemBody(body: any): CreateSystemBody {
  const normalized = normalizeSystem(body);

  const missing: string[] = [];
  if (!normalized.name || typeof normalized.name !== "string" || normalized.name.trim() === "") {
    missing.push("name");
  }
  if (!normalized.url || typeof normalized.url !== "string" || normalized.url.trim() === "") {
    missing.push("url");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }

  if (normalized.tunnel !== undefined) {
    validateTunnelConfig(normalized.tunnel);
  }

  return normalized as CreateSystemBody;
}

export function validateScrapeRequestBody(
  body: any,
  fallbackUrl?: string,
): ScrapeRequestBody & { resolvedUrl: string } {
  const url = body?.url || fallbackUrl;
  if (!url || typeof url !== "string" || url.trim() === "") {
    throw new Error("url is required");
  }
  const validatedUrl = validateExternalUrl(url.trim());
  return {
    url: validatedUrl.toString(),
    keywords: Array.isArray(body?.keywords) ? body.keywords : [],
    resolvedUrl: validatedUrl.toString(),
  };
}

export function validateOpenApiSpecRequestBody(body: any): { url: string } {
  if (!body?.url || typeof body.url !== "string" || !body.url.trim()) {
    throw new Error("url is required");
  }
  const url = body.url.trim();
  validateExternalUrl(url);
  return { url };
}

export function parsePaginationParams(query: { page?: string; limit?: string }): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(query.page || "1") || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(query.limit || "1000") || 1000));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function mapRunStatusToOpenAPI(
  status: RunStatus,
): "running" | "success" | "failed" | "aborted" {
  const statusMap: Record<RunStatus, "running" | "success" | "failed" | "aborted"> = {
    [RunStatus.RUNNING]: "running",
    [RunStatus.SUCCESS]: "success",
    [RunStatus.FAILED]: "failed",
    [RunStatus.ABORTED]: "aborted",
  };
  return statusMap[status] || "failed";
}

export function mapOpenAPIStatusToInternal(status: string): RunStatus | undefined {
  const statusMap: Record<string, RunStatus> = {
    running: RunStatus.RUNNING,
    success: RunStatus.SUCCESS,
    failed: RunStatus.FAILED,
    aborted: RunStatus.ABORTED,
  };
  return statusMap[status.toLowerCase()];
}

export function mapOpenAPIRequestSourceToInternal(source: string): RequestSource | undefined {
  const sourceMap: Record<string, RequestSource> = {
    api: RequestSource.API,
    frontend: RequestSource.FRONTEND,
    scheduler: RequestSource.SCHEDULER,
    mcp: RequestSource.MCP,
    "tool-chain": RequestSource.TOOL_CHAIN,
    webhook: RequestSource.WEBHOOK,
  };
  return sourceMap[source.toLowerCase()];
}

export function sendError(reply: any, statusCode: number, message: string) {
  return reply.code(statusCode).header("X-Trace-Id", reply.request.traceId).send({
    error: { message },
  });
}

export function validateTunnelConfig(tunnel: any): asserts tunnel is TunnelConfig {
  if (typeof tunnel !== "object" || tunnel === null) {
    throw new Error("tunnel must be an object");
  }
  if (typeof tunnel.tunnelId !== "string" || tunnel.tunnelId.trim() === "") {
    throw new Error("tunnel.tunnelId is required and must be a non-empty string");
  }
  if (typeof tunnel.targetName !== "string" || tunnel.targetName.trim() === "") {
    throw new Error("tunnel.targetName is required and must be a non-empty string");
  }
}

export function addTraceHeader(reply: any, traceId?: string) {
  if (traceId) {
    reply.header("X-Trace-Id", traceId);
  }
  return reply;
}

export function getFileSource(
  file: FileReference,
  docFiles: DocumentationFiles,
): "upload" | "scrape" | "openapi" {
  if (docFiles.scrapeFileIds?.includes(file.id)) return "scrape";
  if (docFiles.openApiFileIds?.includes(file.id)) return "openapi";
  return "upload";
}

export function getFileName(file: FileReference, fallbackDisplayName?: string): string {
  if (file.metadata?.originalFileName) {
    return file.metadata.originalFileName;
  }
  if (file.metadata?.specTitle) {
    return file.metadata.specTitle;
  }
  if (file.metadata?.title) {
    return file.metadata.title;
  }
  if (fallbackDisplayName) {
    return `${fallbackDisplayName} API`;
  }
  const fileId = file.id;
  if (file.processedStorageUri) {
    const parts = file.processedStorageUri.split("/");
    return parts[parts.length - 1] || fileId;
  }
  if (file.storageUri) {
    const parts = file.storageUri.split("/");
    return parts[parts.length - 1] || fileId;
  }
  return fileId;
}

export function getSourceUrl(file: FileReference): string | undefined {
  if (file.metadata?.source === "scrape" || file.metadata?.source === "openapi") {
    return file.metadata.url;
  }
  return undefined;
}

export function validatePatchSystemBody(body: any): PatchSystemBody {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }
  const normalized = normalizeSystem(body);
  const result: PatchSystemBody = {};
  for (const key of ALLOWED_PATCH_SYSTEM_FIELDS) {
    if (normalized[key] !== undefined) {
      (result as any)[key] = normalized[key];
    }
  }
  if (Object.keys(result).length === 0) {
    throw new Error("At least one field must be provided for patch");
  }

  if (result.tunnel !== undefined && result.tunnel !== null) {
    validateTunnelConfig(result.tunnel);
  }

  return result;
}

export function validateUploadDocumentationBody(body: any): UploadDocumentationBody {
  if (!body?.files || !Array.isArray(body.files)) {
    throw new Error("Request body must contain a 'files' array");
  }
  if (body.files.length === 0 || body.files.length > 20) {
    throw new Error("Files array must contain between 1 and 20 files");
  }
  for (const file of body.files) {
    if (!file.fileName || typeof file.fileName !== "string") {
      throw new Error("Each file must have a 'fileName' string");
    }
    const lastDot = file.fileName.lastIndexOf(".");
    if (lastDot === -1 || lastDot === file.fileName.length - 1) {
      throw new Error(`File '${file.fileName}' must have a valid extension`);
    }
  }
  return body as UploadDocumentationBody;
}

export function normalizeSchema(schema: any): any {
  if (schema === null || schema === undefined) return null;
  if (typeof schema === "string") {
    if (!schema.trim()) return null;
    try {
      return JSON.parse(schema);
    } catch {
      return null;
    }
  }
  return schema;
}
