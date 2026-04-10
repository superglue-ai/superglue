import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import type { Role, ServiceMetadata } from "@superglue/shared";
import { getBaseRoleId, getRoleIds } from "@superglue/shared";
import Fastify, { FastifyRequest } from "fastify";
import { registerAllRoutes } from "../api/index.js";
import { extractTokenFromFastifyRequest, validateToken } from "../auth/auth.js";
import { resolveUserRoles, BaseRoleViolationError } from "../auth/role-resolver.js";
import {
  isToolAllowed,
  isSystemVisible,
  getSystemAccessLevel,
} from "../auth/access-rule-evaluator.js";
import { SystemAccessLevel } from "@superglue/shared";
import { EEDataStore } from "../datastore/ee/types.js";
import { mcpHandler } from "../mcp/mcp-server.js";
import { getTunnelService } from "../tunnel/index.js";
import { logMessage } from "../utils/logs.js";
import { registerTelemetryHook } from "../utils/telemetry-hook.js";
import { generateTraceId } from "../utils/trace-id.js";
import type { WorkerPools } from "../worker/types.js";
import { getRoutePermission } from "./registry.js";
import type { AuthenticatedFastifyRequest, BaseRoleId } from "./types.js";
import { server_defaults } from "../default.js";

export function checkRouteAccess(
  roles: Role[],
  allowedBaseRoles?: BaseRoleId[],
): { allowed: boolean; error?: string } {
  if (!allowedBaseRoles) return { allowed: true };
  const baseRole = getBaseRoleId(roles);
  if (!baseRole || !(allowedBaseRoles as string[]).includes(baseRole)) {
    return { allowed: false, error: "Your role does not have access to this endpoint" };
  }
  return { allowed: true };
}

export async function startApiServer(datastore: EEDataStore, workerPools: WorkerPools) {
  const DEFAULT_API_PORT = 3002;
  const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : DEFAULT_API_PORT;

  const fastify = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024 * 1024, // 1GB
    routerOptions: {
      ignoreTrailingSlash: true,
    },
    requestTimeout: 30 * 60 * 1000, // 30 min — tools like backfill can run for 10+ min
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  });

  // Register form body parser for application/x-www-form-urlencoded (used by webhooks)
  await fastify.register(formbody);

  // Register multipart for file uploads (used by /v1/extract)
  await fastify.register(multipart, { limits: { fileSize: 1000000000 } });

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
    const clientTraceId = request.headers["x-trace-id"];
    const traceId =
      typeof clientTraceId === "string" && clientTraceId ? clientTraceId : generateTraceId();

    if (request.url === "/v1/health") {
      return;
    }

    const token = extractTokenFromFastifyRequest(request);
    const authResult = await validateToken(token);

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

    let roles: Role[];
    try {
      roles = await resolveUserRoles({
        userId: authResult.userId,
        orgId: authResult.orgId,
        datastore,
      });
    } catch (error) {
      if (error instanceof BaseRoleViolationError) {
        const metadata: ServiceMetadata = { traceId, orgId: authResult.orgId };
        logMessage(
          "warn",
          `(REST API) ${request.method} ${request.url} - ${error.message}`,
          metadata,
        );
        return reply.code(403).send({ success: false, error: error.message });
      }
      throw error;
    }

    authenticatedRequest.authInfo = {
      orgId: authResult.orgId,
      userId: authResult.userId,
      userEmail: authResult.userEmail,
      orgName: authResult.orgName,
      roles,
    };

    authenticatedRequest.datastore = datastore;
    authenticatedRequest.workerPools = workerPools;
    authenticatedRequest.traceId = traceId;

    authenticatedRequest.toMetadata = function () {
      return {
        orgId: this.authInfo.orgId,
        traceId: this.traceId,
        userId: this.authInfo.userId,
        userEmail: this.authInfo.userEmail,
        isRestricted: this.authInfo.isRestricted,
        roleIds: getRoleIds(this.authInfo.roles),
      };
    };

    const routePath = request.routeOptions?.url || request.url;
    const permissions = getRoutePermission(request.method, routePath);
    const accessCheck = checkRouteAccess(roles, permissions?.allowedBaseRoles);

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

    if (permissions?.checkResourceId) {
      const params = request.params as Record<string, string>;
      const resourceId = params[permissions.checkResourceId];
      if (resourceId) {
        let resourceCheck: { allowed: boolean; error?: string } = { allowed: true };
        if (permissions.checkResourceId === "toolId") {
          resourceCheck = isToolAllowed(roles, resourceId);
        } else if (permissions.checkResourceId === "systemId") {
          if (permissions.type === "read") {
            resourceCheck = isSystemVisible(roles, resourceId);
          } else {
            const level = getSystemAccessLevel(roles, resourceId);
            if (level !== SystemAccessLevel.READ_WRITE) {
              resourceCheck = {
                allowed: false,
                error: `Your role does not have ${permissions.type} access to system '${resourceId}'`,
              };
            }
          }
        }
        if (!resourceCheck.allowed) {
          const metadata: ServiceMetadata = { traceId, orgId: authResult.orgId };
          logMessage(
            "warn",
            `(REST API) ${request.method} ${request.url} - Resource access denied: ${resourceCheck.error}`,
            metadata,
          );
          return reply.code(403).send({ success: false, error: resourceCheck.error });
        }
      }
    }

    const metadata = authenticatedRequest.toMetadata();
    logMessage("debug", `(REST API) ${request.method} ${request.url}`, metadata);
  });

  // Telemetry: track all API requests via PostHog
  registerTelemetryHook(fastify);

  // Register all API routes from modules
  await registerAllRoutes(fastify);

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

  // Attach tunnel WebSocket service for secure gateway connections
  const tunnelService = getTunnelService();
  tunnelService.attachToServer(fastify);

  // Health check endpoint (no authentication required)
  fastify.get("/v1/health", async (request, reply) => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: server_defaults.VERSION,
      minCliVersion: server_defaults.MIN_CLI_VERSION,
    };
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
