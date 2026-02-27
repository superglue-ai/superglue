import { ServiceMetadata } from "@superglue/shared";
import Fastify, { FastifyRequest } from "fastify";
import { registerAllRoutes } from "../api/index.js";
import { extractTokenFromFastifyRequest, validateToken } from "../auth/auth.js";
import { mcpHandler } from "../mcp/mcp-server.js";
import { logMessage } from "../utils/logs.js";
import { registerTelemetryHook } from "../utils/telemetry-hook.js";
import { generateTraceId } from "../utils/trace-id.js";
import type { WorkerPools } from "../worker/types.js";
import { getRoutePermission } from "./registry.js";
import { AuthenticatedFastifyRequest } from "./types.js";
import type { DataStore } from "../datastore/types.js";

// Check if restricted API key can access this route (uses route permissions from registry)
export function checkRestrictedAccess(
  authInfo: AuthenticatedFastifyRequest["authInfo"],
  request: FastifyRequest,
): { allowed: boolean; error?: string } {
  if (!authInfo.isRestricted) return { allowed: true };

  // Use Fastify's routeOptions.url which gives us the matched route pattern (e.g., /v1/tools/:toolId)
  const routePath = request.routeOptions?.url;
  if (!routePath) {
    logMessage("warn", `routeOptions.url is undefined for ${request.method} ${request.url}`);
    return { allowed: false, error: "This API key cannot access this endpoint" };
  }

  const permissions = getRoutePermission(request.method, routePath);

  // No permissions defined or not allowed for restricted keys
  if (!permissions?.allowRestricted) {
    return { allowed: false, error: "This API key cannot access this endpoint" };
  }

  // Resource-level permission is now handled by allowedSystems in the async check
  // The sync check here just validates the route is accessible to restricted keys

  return { allowed: true };
}

export async function startApiServer(datastore: DataStore, workerPools: WorkerPools) {
  const DEFAULT_API_PORT = 3002;
  const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : DEFAULT_API_PORT;

  const fastify = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024 * 1024, // 1GB
  });

  // Register CORS
  await fastify.register(import("@fastify/cors"), {
    origin: true,
  });

  // Register form body parser for application/x-www-form-urlencoded (used by webhooks)
  await fastify.register(import("@fastify/formbody"));

  // Register multipart for file uploads (used by /v1/extract)
  await fastify.register(import("@fastify/multipart"), {
    limits: { fileSize: 1000000000 },
  });

  // Error handler to log errors with traceId
  fastify.setErrorHandler(async (error: any, request, reply) => {
    const authReq = request as AuthenticatedFastifyRequest;
    const metadata = authReq.toMetadata?.() || {
      traceId: generateTraceId(),
      orgId: authReq.authInfo?.orgId || "",
    };

    logMessage(
      "error",
      `(REST API) ${request.method} ${request.url} - Error: ${error?.message || String(error)}`,
      metadata,
    );

    return reply.code(error?.statusCode || 500).send({
      success: false,
      error: error?.message || "Internal server error",
    });
  });

  fastify.addHook("preHandler", async (request, reply) => {
    // Use client-provided trace ID if available, otherwise generate one
    const clientTraceId = request.headers["x-trace-id"];
    const traceId =
      typeof clientTraceId === "string" && clientTraceId ? clientTraceId : generateTraceId();

    // Skip authentication for health check
    if (request.url === "/v1/health") {
      const metadata: ServiceMetadata = { traceId };
      logMessage("debug", `(REST API) ${request.method} ${request.url}`, metadata);
      return;
    }

    // Authentication logic
    const token = extractTokenFromFastifyRequest(request);
    const authResult = await validateToken(token);

    // If authentication fails, return 401 error
    if (!authResult.success) {
      const metadata: ServiceMetadata = { traceId };
      logMessage(
        "warn",
        `(REST API) ${request.method} ${request.url} - Authentication failed`,
        metadata,
      );
      return reply.code(401).send({
        success: false,
        error: "Authentication failed",
        message: authResult.message,
      });
    }

    const authenticatedRequest = request as AuthenticatedFastifyRequest;

    let allowedSystems: string[] | null | undefined = undefined;

    // Add auth info including orgId to request context
    authenticatedRequest.authInfo = {
      orgId: authResult.orgId,
      userId: authResult.userId,
      orgName: authResult.orgName,
      orgRole: authResult.orgRole,
      allowedSystems,
      isRestricted: authResult.isRestricted,
    };

    // Add datastore, workerPools and traceId to request context
    authenticatedRequest.datastore = datastore;
    authenticatedRequest.workerPools = workerPools;
    authenticatedRequest.traceId = traceId;

    // Add helper method to extract metadata
    authenticatedRequest.toMetadata = function () {
      return {
        orgId: this.authInfo.orgId,
        traceId: this.traceId,
        userId: this.authInfo.userId,
        isRestricted: this.authInfo.isRestricted,
      };
    };

    // Check restricted API key access (uses route permissions from registry)
    const accessCheck = checkRestrictedAccess(authenticatedRequest.authInfo, request);

    if (!accessCheck.allowed) {
      const metadata: ServiceMetadata = { traceId, orgId: authResult.orgId };
      logMessage(
        "warn",
        `(REST API) ${request.method} ${request.url} - Access denied: ${accessCheck.error}`,
        metadata,
      );
      return reply.code(403).send({
        success: false,
        error: accessCheck.error,
      });
    }

    // Single log per request with method, endpoint, using ServiceMetadata
    const metadata = authenticatedRequest.toMetadata();
    logMessage("debug", `(REST API) ${request.method} ${request.url}`, metadata);
  });

  // Telemetry: track all API requests via PostHog
  registerTelemetryHook(fastify);

  // Register all API routes from modules
  await registerAllRoutes(fastify);

  // Health check endpoint (no authentication required)
  fastify.get("/v1/health", async (request, reply) => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // MCP routes - use raw Node request/response with parsed body and auth context
  const mcpRouteHandler = async (request: any, reply: any) => {
    const raw = request.raw as any;
    raw.body = request.body;
    raw.authInfo = { ...request.authInfo, token: extractTokenFromFastifyRequest(request) };
    reply.hijack();
    await mcpHandler(raw, reply.raw);
  };
  fastify.post("/mcp", mcpRouteHandler);
  fastify.get("/mcp", mcpRouteHandler);
  fastify.delete("/mcp", mcpRouteHandler);

  // Start server
  try {
    const host = process.env.HOST || "0.0.0.0";
    await fastify.listen({ port: PORT, host });
    logMessage("info", `🚀 Fastify API server ready at http://${host}:${PORT}`);
  } catch (err: any) {
    logMessage("error", `Failed to start Fastify API server: ${err?.message || String(err)}`);
    process.exit(1);
  }

  return fastify;
}
