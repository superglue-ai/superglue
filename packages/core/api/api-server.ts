import { ServiceMetadata } from "@superglue/shared";
import Fastify, { FastifyRequest } from "fastify";
import { registerAllRoutes } from "../api/index.js";
import { extractTokenFromFastifyRequest, validateToken } from "../auth/auth.js";
import { EEDataStore } from "../datastore/ee/types.js";
import { isEEDataStore } from "../datastore/ee/types.js";
import { logMessage } from "../utils/logs.js";
import { generateTraceId } from "../utils/trace-id.js";
import type { WorkerPools } from "../worker/types.js";
import { registerPortalRoutes } from "./ee/portal.js";
import { getRoutePermission } from "./registry.js";
import { AuthenticatedFastifyRequest } from "./types.js";

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

  // Check resource-level permission (e.g., toolId must be in allowedTools)
  if (permissions.checkResourceId) {
    const params = request.params as Record<string, string>;
    const resourceId = params[permissions.checkResourceId];
    // ['*'] means ALL tools are allowed for this restricted key
    const isAllToolsAllowed =
      authInfo.allowedTools?.length === 1 && authInfo.allowedTools[0] === "*";
    if (resourceId && !isAllToolsAllowed && !authInfo.allowedTools?.includes(resourceId)) {
      return { allowed: false, error: "This API key is not authorized for this tool" };
    }
  }

  return { allowed: true };
}

export async function startApiServer(datastore: EEDataStore, workerPools: WorkerPools) {
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
    bodyLimit: 1024 * 1024 * 1024, // 1GB
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

    // Skip authentication for health check and public portal endpoints
    if (request.url === "/v1/health" || request.url.startsWith("/v1/portal/")) {
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

    // Compute effective allowed systems (intersection of API key + end user scopes)
    let allowedSystems: string[] | null | undefined = undefined;
    if (authResult.isRestricted && authResult.userId && isEEDataStore(datastore)) {
      try {
        const endUserSystems = await datastore.getEndUserAllowedSystems({
          endUserId: authResult.userId,
          orgId: authResult.orgId,
        });
        // endUserSystems: null = user not found, ['*'] = all systems, string[] = specific systems
        allowedSystems = endUserSystems;
      } catch (error) {
        logMessage("warn", `Failed to fetch end user allowed systems: ${error}`, { traceId });
        // Continue without - will default to no restrictions
      }
    }

    // Add auth info including orgId to request context
    authenticatedRequest.authInfo = {
      orgId: authResult.orgId,
      userId: authResult.userId,
      userEmail: authResult.userEmail,
      userName: authResult.userName,
      orgName: authResult.orgName,
      orgRole: authResult.orgRole,
      allowedTools: authResult.allowedTools,
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

  // Register all API routes from modules
  await registerAllRoutes(fastify);

  // Register portal routes (public, no auth required)
  registerPortalRoutes(fastify, datastore);

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
