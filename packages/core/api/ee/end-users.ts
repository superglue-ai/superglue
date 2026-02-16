/**
 * EE: End User Management API
 *
 * REST endpoints for managing end users in multi-tenancy mode.
 * Credential management is handled via the portal UI.
 */

import type { EndUser, EndUserInput } from "@superglue/shared";
import { SupabaseAuthManager } from "../../auth/supabase-auth-manager.js";
import { isEEDataStore } from "../../datastore/ee/types.js";
import { sendPortalInvitationEmail } from "../../utils/email.js";
import { logMessage } from "../../utils/logs.js";
import { registerApiModule } from "../registry.js";
import { addTraceHeader, parsePaginationParams, sendError } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";

// Helper to check if datastore supports EE features
function requireEEDataStore(authReq: AuthenticatedFastifyRequest, reply: any): boolean {
  if (!isEEDataStore(authReq.datastore)) {
    sendError(reply, 501, "Multi-tenancy features are not available");
    return false;
  }
  return true;
}

// Shared auth manager instance for API key operations
const authManager = new SupabaseAuthManager();

// Create an API key for an end user (restricted key with access to all tools of permitted systems)
async function createEndUserApiKey(
  endUserId: string,
  orgId: string,
  createdByUserId: string,
): Promise<string | null> {
  return authManager.createApiKey(orgId, createdByUserId, endUserId, "backend", true);
}

// Map EndUser to API response format
function mapEndUserToResponse(endUser: EndUser): any {
  return {
    id: endUser.id,
    externalId: endUser.externalId,
    email: endUser.email,
    name: endUser.name,
    metadata: endUser.metadata,
    allowedSystems: endUser.allowedSystems,
    createdAt: endUser.createdAt?.toISOString(),
    updatedAt: endUser.updatedAt?.toISOString(),
  };
}

// ============================================================================
// End User CRUD Endpoints
// ============================================================================

// GET /end-users - List end users (admin)
const listEndUsers: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  if (!requireEEDataStore(authReq, reply)) return;

  const query = request.query as { page?: string; limit?: string };
  const { page, limit, offset } = parsePaginationParams(query);

  try {
    const result = await authReq.datastore.listEndUsers({
      orgId: authReq.authInfo.orgId,
      limit,
      offset,
    });

    const data = result.items.map(mapEndUserToResponse);
    const hasMore = offset + result.items.length < result.total;

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      data,
      page,
      limit,
      total: result.total,
      hasMore,
    });
  } catch (error) {
    logMessage("error", `Failed to list end users: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to list end users");
  }
};

// GET /end-users/:endUserId - Get end user with credential status (admin)
const getEndUser: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  if (!requireEEDataStore(authReq, reply)) return;

  const { endUserId } = request.params as { endUserId: string };

  try {
    const endUser = await authReq.datastore.getEndUser({
      id: endUserId,
      orgId: authReq.authInfo.orgId,
    });

    if (!endUser) {
      return sendError(reply, 404, "End user not found");
    }

    // Get credential status
    const credentials = await authReq.datastore.listEndUserCredentials({
      endUserId,
      orgId: authReq.authInfo.orgId,
    });

    // Get system names for credentials
    const systemsResult = await authReq.datastore.listSystems({
      orgId: authReq.authInfo.orgId,
      limit: 1000,
      offset: 0,
    });
    const systemMap = new Map(systemsResult.items.map((s) => [s.id, s.name || s.id]));

    const credentialsWithNames = credentials.map((c) => ({
      ...c,
      systemName: systemMap.get(c.systemId) || c.systemId,
    }));

    return addTraceHeader(reply, authReq.traceId)
      .code(200)
      .send({
        data: {
          ...mapEndUserToResponse(endUser),
          credentials: credentialsWithNames,
        },
      });
  } catch (error) {
    logMessage("error", `Failed to get end user: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to get end user");
  }
};

// POST /end-users - Create end user
const createEndUser: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  if (!requireEEDataStore(authReq, reply)) return;

  const body = request.body as EndUserInput;

  // Generate externalId if not provided
  const externalId = body.externalId?.trim() || crypto.randomUUID();

  try {
    // Check if user already exists
    const existingUser = await authReq.datastore.getEndUserByExternalId({
      externalId,
      orgId: authReq.authInfo.orgId,
    });
    if (existingUser) {
      return sendError(reply, 409, `End user with externalId '${externalId}' already exists`);
    }

    const endUser = await authReq.datastore.createEndUser({
      endUser: { ...body, externalId },
      orgId: authReq.authInfo.orgId,
    });

    // Create API key for the new user (requires admin userId)
    let apiKey: string | null = null;
    if (authReq.authInfo.userId) {
      apiKey = await createEndUserApiKey(
        endUser.id,
        authReq.authInfo.orgId,
        authReq.authInfo.userId,
      );
      if (apiKey) {
        logMessage("info", `Created API key for end user ${endUser.id}`, authReq.toMetadata());
      }
    } else {
      logMessage(
        "warn",
        `Could not create API key for end user ${endUser.id}: no admin userId`,
        authReq.toMetadata(),
      );
    }

    return addTraceHeader(reply, authReq.traceId)
      .code(201)
      .send({
        success: true,
        data: {
          ...mapEndUserToResponse(endUser),
          ...(apiKey ? { apiKey } : {}),
        },
      });
  } catch (error) {
    logMessage("error", `Failed to create end user: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to create end user");
  }
};

// PATCH /end-users/:endUserId - Update end user
const updateEndUser: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  if (!requireEEDataStore(authReq, reply)) return;

  const { endUserId } = request.params as { endUserId: string };
  const body = request.body as Partial<EndUserInput>;

  try {
    const endUser = await authReq.datastore.updateEndUser({
      id: endUserId,
      endUser: body,
      orgId: authReq.authInfo.orgId,
    });

    if (!endUser) {
      return sendError(reply, 404, "End user not found");
    }

    return addTraceHeader(reply, authReq.traceId)
      .code(200)
      .send({
        success: true,
        data: mapEndUserToResponse(endUser),
      });
  } catch (error) {
    logMessage("error", `Failed to update end user: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to update end user");
  }
};

// POST /end-users/:endUserId/invite - Send portal invitation email (admin)
const sendPortalInvite: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  if (!requireEEDataStore(authReq, reply)) return;

  const { endUserId } = request.params as { endUserId: string };

  try {
    // Verify end user exists and has email
    const endUser = await authReq.datastore.getEndUser({
      id: endUserId,
      orgId: authReq.authInfo.orgId,
    });

    if (!endUser) {
      return sendError(reply, 404, "End user not found");
    }

    if (!endUser.email) {
      return sendError(reply, 400, "End user has no email address");
    }

    // Generate long-lived portal token (30 days)
    const portalToken = await authReq.datastore.createPortalToken({
      endUserId,
      orgId: authReq.authInfo.orgId,
      ttlSeconds: 30 * 24 * 60 * 60, // 30 days
    });

    // Build portal URL
    const baseUrl = process.env.WEB_URL || "http://localhost:3001";
    const portalUrl = `${baseUrl}/portal?token=${portalToken.token}`;

    // Send invitation email
    const result = await sendPortalInvitationEmail({
      to: endUser.email,
      name: endUser.name,
      portalUrl,
    });

    if (!result.success) {
      logMessage("error", `Failed to send invitation email: ${result.error}`, authReq.toMetadata());
      return sendError(reply, 500, result.error || "Failed to send invitation email");
    }

    logMessage("info", `Sent portal invitation email to ${endUser.email}`, authReq.toMetadata());

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      success: true,
      message: "Invitation email sent successfully",
      recipient: endUser.email,
    });
  } catch (error) {
    logMessage("error", `Failed to send invitation email: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to send invitation email");
  }
};

// POST /end-users/:endUserId/portal-token - Generate portal token (admin)
const createPortalToken: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  if (!requireEEDataStore(authReq, reply)) return;

  const { endUserId } = request.params as { endUserId: string };

  try {
    // Verify end user exists
    const endUser = await authReq.datastore.getEndUser({
      id: endUserId,
      orgId: authReq.authInfo.orgId,
    });

    if (!endUser) {
      return sendError(reply, 404, "End user not found");
    }

    const portalToken = await authReq.datastore.createPortalToken({
      endUserId,
      orgId: authReq.authInfo.orgId,
    });

    // Build the portal URL
    const baseUrl = process.env.WEB_URL || "http://localhost:3001";
    const portalUrl = `${baseUrl}/portal?token=${portalToken.token}`;

    return addTraceHeader(reply, authReq.traceId)
      .code(200)
      .send({
        success: true,
        data: {
          portalUrl,
          expiresAt: portalToken.expiresAt.toISOString(),
        },
      });
  } catch (error) {
    logMessage("error", `Failed to create portal token: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to create portal token");
  }
};

// DELETE /end-users/:endUserId - Delete end user (admin)
const deleteEndUser: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  if (!requireEEDataStore(authReq, reply)) return;

  const { endUserId } = request.params as { endUserId: string };

  try {
    // Delete API keys first (before deleting the end user)
    await authManager.deleteApiKeysByUserId(endUserId, authReq.authInfo.orgId);

    const deleted = await authReq.datastore.deleteEndUser({
      id: endUserId,
      orgId: authReq.authInfo.orgId,
    });

    if (!deleted) {
      return sendError(reply, 404, "End user not found");
    }

    return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true });
  } catch (error) {
    logMessage("error", `Failed to delete end user: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to delete end user");
  }
};

// ============================================================================
// Authenticate Endpoint (for MCP/AI agents)
// ============================================================================

// POST /authenticate?system=optional - Generate portal link for current end user
const authenticate: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  if (!requireEEDataStore(authReq, reply)) return;

  const query = request.query as { system?: string };
  const systemId = query.system;

  // This endpoint requires an end-user API key
  if (!authReq.authInfo.isRestricted || !authReq.authInfo.userId) {
    return sendError(
      reply,
      400,
      "This endpoint requires an API key linked to an end user. Use an end-user API key or create one first.",
    );
  }
  const endUserId = authReq.authInfo.userId;

  try {
    const portalToken = await authReq.datastore.createPortalToken({
      endUserId,
      orgId: authReq.authInfo.orgId,
    });

    // Build the portal URL
    const baseUrl = process.env.WEB_URL || "http://localhost:3001";
    let portalUrl = `${baseUrl}/portal?token=${portalToken.token}`;
    if (systemId) {
      portalUrl += `&system=${encodeURIComponent(systemId)}`;
    }

    return addTraceHeader(reply, authReq.traceId)
      .code(200)
      .send({
        success: true,
        data: {
          portalUrl,
          expiresAt: portalToken.expiresAt.toISOString(),
        },
      });
  } catch (error) {
    logMessage("error", `Failed to generate auth link: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to generate authentication link");
  }
};

// ============================================================================
// Register Routes
// ============================================================================

registerApiModule({
  name: "end-users",
  routes: [
    // Admin endpoints
    {
      method: "GET",
      path: "/end-users",
      handler: listEndUsers,
      permissions: { type: "read", resource: "end-users", allowRestricted: false },
    },
    {
      method: "GET",
      path: "/end-users/:endUserId",
      handler: getEndUser,
      permissions: { type: "read", resource: "end-users", allowRestricted: false },
    },
    {
      method: "POST",
      path: "/end-users",
      handler: createEndUser,
      permissions: { type: "write", resource: "end-users", allowRestricted: false },
    },
    {
      method: "PATCH",
      path: "/end-users/:endUserId",
      handler: updateEndUser,
      permissions: { type: "write", resource: "end-users", allowRestricted: false },
    },
    {
      method: "DELETE",
      path: "/end-users/:endUserId",
      handler: deleteEndUser,
      permissions: { type: "delete", resource: "end-users", allowRestricted: false },
    },
    {
      method: "POST",
      path: "/end-users/:endUserId/invite",
      handler: sendPortalInvite,
      permissions: { type: "write", resource: "end-users", allowRestricted: false },
    },
    {
      method: "POST",
      path: "/end-users/:endUserId/portal-token",
      handler: createPortalToken,
      permissions: { type: "write", resource: "end-users", allowRestricted: false },
    },
    // Agent endpoint
    {
      method: "POST",
      path: "/authenticate",
      handler: authenticate,
      permissions: { type: "write", resource: "end-users", allowRestricted: true },
    },
  ],
});
