import { ServiceMetadata } from "@superglue/shared";
import Fastify from "fastify";
import { registerAllRoutes } from "../api/index.js";
import { extractTokenFromFastifyRequest, validateToken } from "../auth/auth.js";
import { DataStore } from "../datastore/types.js";
import { logMessage } from "../utils/logs.js";
import { generateTraceId } from "../utils/trace-id.js";
import type { WorkerPools } from "../worker/types.js";
import { AuthenticatedFastifyRequest } from "./types.js";

// Routes allowed for restricted API keys (format: "METHOD:/path" without /v1 prefix)
const RESTRICTED_KEY_ALLOWLIST = new Set([
  "GET:/tools",
  "GET:/tools/:toolId",
  "POST:/tools/:toolId/run",
  "GET:/runs",
  "GET:/runs/:runId",
  "POST:/runs/:runId/cancel",
]);

// Routes that require toolId permission check when restricted
const TOOL_PERMISSION_ROUTES = new Set(["GET:/tools/:toolId", "POST:/tools/:toolId/run"]);

// Convert actual URL to route pattern (e.g., /v1/tools/abc123 -> GET:/tools/:toolId)
function getRoutePattern(method: string, url: string): string {
  const path = url.replace(/^\/v1/, "").split("?")[0];

  // Match known route patterns
  if (/^\/tools\/[^/]+\/run$/.test(path)) return `${method}:/tools/:toolId/run`;
  if (/^\/tools\/[^/]+\/schedules\/[^/]+$/.test(path))
    return `${method}:/tools/:toolId/schedules/:scheduleId`;
  if (/^\/tools\/[^/]+\/schedules$/.test(path)) return `${method}:/tools/:toolId/schedules`;
  if (/^\/tools\/[^/]+$/.test(path)) return `${method}:/tools/:toolId`;
  if (/^\/tools$/.test(path)) return `${method}:/tools`;
  if (/^\/runs\/[^/]+\/cancel$/.test(path)) return `${method}:/runs/:runId/cancel`;
  if (/^\/runs\/[^/]+$/.test(path)) return `${method}:/runs/:runId`;
  if (/^\/runs$/.test(path)) return `${method}:/runs`;
  if (/^\/schedules$/.test(path)) return `${method}:/schedules`;

  return `${method}:${path}`;
}

function checkRestrictedAccess(
  authInfo: AuthenticatedFastifyRequest["authInfo"],
  method: string,
  url: string,
  params: Record<string, string>,
): { allowed: boolean; error?: string } {
  if (!authInfo.isRestricted) return { allowed: true };

  const pattern = getRoutePattern(method, url);

  if (!RESTRICTED_KEY_ALLOWLIST.has(pattern)) {
    return { allowed: false, error: "This API key cannot access this endpoint" };
  }

  // Check tool-level permissions for tool-specific routes
  if (TOOL_PERMISSION_ROUTES.has(pattern) && params.toolId) {
    if (!authInfo.allowedTools?.includes(params.toolId)) {
      return { allowed: false, error: "This API key is not authorized for this tool" };
    }
  }

  return { allowed: true };
}

export async function startApiServer(datastore: DataStore, workerPools: WorkerPools) {
  // Get REST API port
  const DEFAULT_API_PORT = 3002;
  let port = process.env.API_PORT ? parseInt(process.env.API_PORT) : DEFAULT_API_PORT;
  const graphqlPort = process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT) : undefined;

  if (graphqlPort !== undefined && port === graphqlPort) {
    logMessage(
      "warn",
      `API_PORT cannot be the same as GRAPHQL_PORT. Switching REST API port to ${port + 1}.`,
    );
    port = port + 1;
  }
  const PORT = port;

  const fastify = Fastify({
    logger: false,
  });

  // Register CORS
  await fastify.register(import("@fastify/cors"), {
    origin: true,
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
    const traceId = generateTraceId();

    // Skip authentication for health check and public endpoints
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

    // Add auth info including orgId to request context
    authenticatedRequest.authInfo = {
      orgId: authResult.orgId,
      userId: authResult.userId,
      userEmail: authResult.userEmail,
      userName: authResult.userName,
      orgName: authResult.orgName,
      orgRole: authResult.orgRole,
      isRestricted: authResult.isRestricted,
      allowedTools: authResult.allowedTools,
    };

    // Add datastore, workerPools and traceId to request context
    authenticatedRequest.datastore = datastore;
    authenticatedRequest.workerPools = workerPools;
    authenticatedRequest.traceId = traceId;

    // Add helper method to extract metadata
    authenticatedRequest.toMetadata = function () {
      return { orgId: this.authInfo.orgId, traceId: this.traceId };
    };

    // Check restricted API key access
    const accessCheck = checkRestrictedAccess(
      authenticatedRequest.authInfo,
      request.method,
      request.url,
      request.params as Record<string, string>,
    );

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
    logMessage("info", `(REST API) ${request.method} ${request.url}`, metadata);
  });

  // Register all API routes from modules
  await registerAllRoutes(fastify);

  // Health check endpoint (no authentication required)
  fastify.get("/v1/health", async (request, reply) => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

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
