import { registerApiModule } from "../registry.js";
import { addTraceHeader, sendError } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";
import { logMessage } from "../../utils/logs.js";
import type { ApiKeyRecord } from "../../datastore/types.js";
import { hasRole } from "@superglue/shared";

// Mask API key to show only last 4 characters (security best practice)
function maskApiKey(key: string): string {
  if (key.length <= 4) return key;
  return "•".repeat(key.length - 4) + key.slice(-4);
}

// Map internal API key record to API response format
// By default, masks the key value for security
function mapApiKeyToResponse(key: ApiKeyRecord, includePlaintextKey = false) {
  return {
    id: key.id,
    key: includePlaintextKey ? key.key : maskApiKey(key.key),
    orgId: key.orgId,
    userId: key.userId,
    createdByUserId: key.createdByUserId,
    isActive: key.isActive,
    createdAt: key.createdAt.toISOString(),
    updatedAt: key.updatedAt.toISOString(),
  };
}

// GET /api-keys - List all API keys for the organization
const listApiKeys: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;

  try {
    const keys = await authReq.datastore.listApiKeys({
      orgId: authReq.authInfo.orgId,
    });

    const isAdmin = hasRole(authReq.authInfo.roles, "admin");
    const userId = authReq.authInfo.userId;
    const visibleKeys = isAdmin
      ? keys
      : keys.filter((k) => k.createdByUserId === userId || k.userId === userId);

    return addTraceHeader(reply, authReq.traceId)
      .code(200)
      .send({
        data: visibleKeys.map((key) => mapApiKeyToResponse(key)),
        total: visibleKeys.length,
      });
  } catch (error) {
    logMessage("error", `Failed to list API keys: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to list API keys");
  }
};

// POST /api-keys - Create a new API key
// NOTE: This is the ONLY endpoint that returns the full plaintext key.
// Users must copy it immediately as it won't be shown again.
const createApiKey: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as {
    userId?: string;
  };

  if (!authReq.authInfo.userId) {
    return sendError(reply, 400, "User ID required to create API key");
  }

  try {
    const key = await authReq.datastore.createApiKey({
      orgId: authReq.authInfo.orgId,
      createdByUserId: authReq.authInfo.userId,
      userId: body.userId || authReq.authInfo.userId,
    });

    return addTraceHeader(reply, authReq.traceId)
      .code(201)
      .send({
        success: true,
        data: mapApiKeyToResponse(key, true), // Include plaintext key on creation only
      });
  } catch (error) {
    logMessage("error", `Failed to create API key: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to create API key");
  }
};

// PATCH /api-keys/:id - Update an API key
// Note: isRestricted is intentionally NOT allowed here to prevent privilege escalation (mass assignment)
const updateApiKey: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const { id } = request.params as { id: string };
  const body = request.body as {
    isActive?: boolean;
  };

  try {
    const allKeys = await authReq.datastore.listApiKeys({ orgId: authReq.authInfo.orgId });
    const key = allKeys.find((k) => k.id === id);
    if (!key) {
      return sendError(reply, 404, "API key not found");
    }

    const isAdmin = hasRole(authReq.authInfo.roles, "admin");
    if (
      !isAdmin &&
      key.createdByUserId !== authReq.authInfo.userId &&
      key.userId !== authReq.authInfo.userId
    ) {
      return sendError(reply, 403, "You can only update your own API keys");
    }

    const updated = await authReq.datastore.updateApiKey({
      id,
      orgId: authReq.authInfo.orgId,
      isActive: body.isActive,
    });

    if (!updated) {
      return sendError(reply, 404, "API key not found");
    }

    return addTraceHeader(reply, authReq.traceId)
      .code(200)
      .send({
        success: true,
        data: mapApiKeyToResponse(updated),
      });
  } catch (error) {
    logMessage("error", `Failed to update API key: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to update API key");
  }
};

// DELETE /api-keys/:id - Delete an API key
const deleteApiKey: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const { id } = request.params as { id: string };

  try {
    const allKeys = await authReq.datastore.listApiKeys({ orgId: authReq.authInfo.orgId });
    const key = allKeys.find((k) => k.id === id);
    if (!key) {
      return sendError(reply, 404, "API key not found");
    }

    const isAdmin = hasRole(authReq.authInfo.roles, "admin");
    if (!isAdmin) {
      if (
        key.createdByUserId !== authReq.authInfo.userId &&
        key.userId !== authReq.authInfo.userId
      ) {
        return sendError(reply, 403, "You can only delete your own API keys");
      }
    }

    const deleted = await authReq.datastore.deleteApiKey({
      id,
      orgId: authReq.authInfo.orgId,
    });

    if (!deleted) {
      return sendError(reply, 404, "API key not found");
    }

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      success: true,
    });
  } catch (error) {
    logMessage("error", `Failed to delete API key: ${error}`, authReq.toMetadata());
    return sendError(reply, 500, "Failed to delete API key");
  }
};

registerApiModule({
  name: "api-keys",
  routes: [
    {
      method: "GET",
      path: "/api-keys",
      handler: listApiKeys,
      permissions: { type: "read", resource: "api-keys", allowedBaseRoles: ["admin", "member"] },
    },
    {
      method: "POST",
      path: "/api-keys",
      handler: createApiKey,
      permissions: { type: "write", resource: "api-keys", allowedBaseRoles: ["admin", "member"] },
    },
    {
      method: "PATCH",
      path: "/api-keys/:id",
      handler: updateApiKey,
      permissions: { type: "write", resource: "api-keys", allowedBaseRoles: ["admin", "member"] },
    },
    {
      method: "DELETE",
      path: "/api-keys/:id",
      handler: deleteApiKey,
      permissions: { type: "delete", resource: "api-keys", allowedBaseRoles: ["admin", "member"] },
    },
  ],
});
