import {
  DocumentationFiles,
  FileReference,
  RequestSource,
  RunStatus,
  System,
} from "@superglue/shared";
import { CreateSystemBody, ScrapeRequestBody, UpdateSystemBody } from "./types.js";

export function transformSystemDates(system: System) {
  const { createdAt, updatedAt, ...rest } = system;
  return {
    ...rest,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
  };
}

export function validateCreateSystemBody(body: any): CreateSystemBody {
  const missing: string[] = [];
  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    missing.push("name");
  }
  if (!body.urlHost || typeof body.urlHost !== "string" || body.urlHost.trim() === "") {
    missing.push("urlHost");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
  return body as CreateSystemBody;
}

export function validateUpdateSystemBody(body: any): UpdateSystemBody {
  const missing: string[] = [];
  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    missing.push("name");
  }
  if (!body.urlHost || typeof body.urlHost !== "string" || body.urlHost.trim() === "") {
    missing.push("urlHost");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
  return body as UpdateSystemBody;
}

export function validateScrapeRequestBody(
  body: any,
  fallbackUrl?: string,
): ScrapeRequestBody & { resolvedUrl: string } {
  const url = body?.url || fallbackUrl;
  if (!url || typeof url !== "string" || url.trim() === "") {
    throw new Error("No URL provided and system has no documentationUrl");
  }
  return {
    url: body?.url,
    keywords: Array.isArray(body?.keywords) ? body.keywords : [],
    resolvedUrl: url,
  };
}

export function uniqueKeywords(keywords: string[] | undefined): string[] {
  if (!keywords || keywords.length === 0) return [];
  return [...new Set(keywords)];
}

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

export function parsePaginationParams(query: { page?: string; limit?: string }): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(query.page || "1") || 1);
  const parsedLimit = parseInt(query.limit || "") || DEFAULT_PAGE_LIMIT;
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parsedLimit));
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

export function getFileName(file: FileReference): string {
  const fileId = file.id;
  if (file.processedStorageUri) {
    const parts = file.processedStorageUri.split("/");
    return parts[parts.length - 1] || fileId;
  }
  if (file.storageUri) {
    const parts = file.storageUri.split("/");
    return parts[parts.length - 1] || fileId;
  }
  return file.metadata?.originalFileName || fileId;
}

export function getSourceUrl(file: FileReference): string | undefined {
  if (file.metadata?.source === "scrape" || file.metadata?.source === "openapi") {
    return file.metadata.url;
  }
  return undefined;
}
