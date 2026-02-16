/**
 * EE: Portal Public API
 *
 * Public endpoints for the end-user portal that don't require API key authentication.
 * These endpoints use portal session tokens for authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { isEEDataStore, type EEDataStore } from "../../datastore/ee/types.js";
import type { DataStore } from "../../datastore/types.js";
import { logMessage } from "../../utils/logs.js";

// Helper to send error responses
function sendError(reply: FastifyReply, statusCode: number, message: string) {
  return reply.code(statusCode).send({ error: message });
}

// Helper to validate portal session token and return session info
async function validatePortalSession(
  request: FastifyRequest,
  dataStore: EEDataStore,
): Promise<{ endUserId: string; orgId: string } | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  return dataStore.validatePortalToken({ token });
}

/**
 * Register portal public routes on a Fastify instance.
 * These routes are NOT protected by API key authentication.
 */
export function registerPortalRoutes(fastify: FastifyInstance, dataStore: DataStore) {
  // POST /v1/portal/validate-token - Validate a portal token and return session info
  // The token remains valid for subsequent requests (not consumed)
  fastify.post(
    "/v1/portal/validate-token",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { token?: string };

      if (!body.token) {
        return sendError(reply, 400, "Token is required");
      }

      if (!isEEDataStore(dataStore)) {
        return sendError(reply, 501, "Multi-tenancy features are not available");
      }

      try {
        const result = await dataStore.validatePortalToken({ token: body.token });

        if (!result) {
          return sendError(reply, 401, "Invalid or expired token");
        }

        // Get end user details
        const endUser = await dataStore.getEndUser({
          id: result.endUserId,
          orgId: result.orgId,
        });

        if (!endUser) {
          return sendError(reply, 404, "End user not found");
        }

        // Return the token back - frontend will use it as session token
        return reply.code(200).send({
          success: true,
          sessionToken: body.token,
          endUser: {
            id: endUser.id,
            externalId: endUser.externalId,
            email: endUser.email,
            name: endUser.name,
          },
        });
      } catch (error) {
        logMessage("error", `Failed to validate portal token: ${error}`, {});
        return sendError(reply, 500, "Failed to validate token");
      }
    },
  );

  // GET /v1/portal/session - Get current portal session info
  // Requires Authorization: Bearer <session-token>
  fastify.get("/v1/portal/session", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isEEDataStore(dataStore)) {
      return sendError(reply, 501, "Multi-tenancy features are not available");
    }

    const session = await validatePortalSession(request, dataStore);
    if (!session) {
      return sendError(reply, 401, "Invalid or expired session");
    }

    const { endUserId, orgId } = session;

    try {
      const endUser = await dataStore.getEndUser({
        id: endUserId,
        orgId: orgId,
      });

      if (!endUser) {
        return sendError(reply, 404, "End user not found");
      }

      // Get credential status for all systems
      const credentials = await dataStore.listEndUserCredentials({
        endUserId,
        orgId,
      });

      // Get systems with multi-tenancy enabled
      const systemsResult = await dataStore.listSystems({
        orgId,
        limit: 1000,
        offset: 0,
      });

      // Check if user has access to all systems
      const hasAllAccess = endUser.allowedSystems?.includes("*") || false;
      const allowedSystemIds = new Set(endUser.allowedSystems || []);

      const multiTenancySystems = systemsResult.items
        .filter((s) => s.multiTenancyMode === "enabled")
        // Filter by user's allowed systems
        .filter((s) => hasAllAccess || allowedSystemIds.has(s.id))
        .map((s) => {
          const hasOAuth = s.credentials?.auth_url && s.credentials?.token_url;
          const authType = hasOAuth ? "oauth" : s.credentials ? "apikey" : "none";

          // For API key auth, extract field names from credentials
          let credentialFields: string[] | undefined;
          if (authType === "apikey" && s.credentials) {
            try {
              const creds =
                typeof s.credentials === "string" ? JSON.parse(s.credentials) : s.credentials;
              credentialFields = Object.keys(creds);
            } catch {
              credentialFields = [];
            }
          }

          return {
            id: s.id,
            name: s.name || s.id,
            url: s.url,
            icon: s.icon,
            hasCredentials: credentials.some((c) => c.systemId === s.id && c.hasCredentials),
            authType,
            credentialFields,
            oauth: hasOAuth
              ? {
                  authUrl: s.credentials?.auth_url,
                  tokenUrl: s.credentials?.token_url,
                  scopes: s.credentials?.scopes,
                  clientId: s.credentials?.client_id,
                  grantType: s.credentials?.grant_type || "authorization_code",
                }
              : undefined,
            templateName: s.templateName,
          };
        });

      return reply.code(200).send({
        success: true,
        endUser: {
          id: endUser.id,
          externalId: endUser.externalId,
          email: endUser.email,
          name: endUser.name,
        },
        systems: multiTenancySystems,
      });
    } catch (error) {
      logMessage("error", `Failed to get portal session: ${error}`, {});
      return sendError(reply, 500, "Failed to get session");
    }
  });

  // GET /v1/portal/systems/:systemId/oauth-config - Get OAuth config for token exchange
  // SECURITY NOTE: This endpoint returns client_secret, but it's only called server-to-server
  // from the Next.js OAuth callback route (/api/auth/callback), never from the browser.
  // The callback route uses the portalToken from OAuth state to fetch credentials securely.
  // Requires Authorization: Bearer <session-token>
  fastify.get(
    "/v1/portal/systems/:systemId/oauth-config",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isEEDataStore(dataStore)) {
        return sendError(reply, 501, "Multi-tenancy features are not available");
      }

      const session = await validatePortalSession(request, dataStore);
      if (!session) {
        return sendError(reply, 401, "Invalid or expired session");
      }

      const { orgId } = session;
      const { systemId } = request.params as { systemId: string };

      try {
        const system = await dataStore.getSystem({ id: systemId, orgId });

        if (!system) {
          return sendError(reply, 404, "System not found");
        }

        if (system.multiTenancyMode !== "enabled") {
          return sendError(reply, 400, "System does not have multi-tenancy enabled");
        }

        if (!system.credentials?.client_id || !system.credentials?.client_secret) {
          return sendError(reply, 400, "System does not have OAuth credentials configured");
        }

        return reply.code(200).send({
          success: true,
          data: {
            clientId: system.credentials.client_id,
            clientSecret: system.credentials.client_secret,
            tokenUrl: system.credentials.token_url,
          },
        });
      } catch (error) {
        logMessage("error", `Failed to get OAuth config: ${error}`, {});
        return sendError(reply, 500, "Failed to get OAuth config");
      }
    },
  );

  // POST /v1/portal/systems/:systemId/credentials - Save credentials for a system
  // Requires Authorization: Bearer <session-token>
  fastify.post(
    "/v1/portal/systems/:systemId/credentials",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isEEDataStore(dataStore)) {
        return sendError(reply, 501, "Multi-tenancy features are not available");
      }

      const session = await validatePortalSession(request, dataStore);
      if (!session) {
        return sendError(reply, 401, "Invalid or expired session");
      }

      const { endUserId, orgId } = session;
      const { systemId } = request.params as { systemId: string };
      const body = request.body as { credentials: Record<string, any> };

      if (!body.credentials || typeof body.credentials !== "object") {
        return sendError(reply, 400, "Credentials object is required");
      }

      try {
        // Verify system exists and has multi-tenancy enabled
        const system = await dataStore.getSystem({ id: systemId, orgId });

        if (!system) {
          return sendError(reply, 404, "System not found");
        }

        if (system.multiTenancyMode !== "enabled") {
          return sendError(reply, 400, "System does not have multi-tenancy enabled");
        }

        await dataStore.upsertEndUserCredentials({
          endUserId,
          systemId,
          orgId,
          credentials: body.credentials,
        });

        return reply.code(200).send({
          success: true,
          data: {
            systemId,
            hasCredentials: true,
          },
        });
      } catch (error) {
        logMessage("error", `Failed to save portal credentials: ${error}`, {});
        return sendError(reply, 500, "Failed to save credentials");
      }
    },
  );

  // GET /v1/portal/api-keys - Get current end user's API keys
  // Requires Authorization: Bearer <session-token>
  fastify.get("/v1/portal/api-keys", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isEEDataStore(dataStore)) {
      return sendError(reply, 501, "Multi-tenancy features are not available");
    }

    const session = await validatePortalSession(request, dataStore);
    if (!session) {
      return sendError(reply, 401, "Invalid or expired session");
    }

    const { endUserId, orgId } = session;

    try {
      // Query Supabase directly for API keys
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const SUPABASE_SERVICE_ROLE_KEY = process.env.PRIV_SUPABASE_SERVICE_ROLE_KEY;

      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return sendError(reply, 501, "Supabase not configured");
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/sg_superglue_api_keys?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(endUserId)}&select=id,key,is_active,created_at,allowed_tools`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch API keys");
      }

      const keys = await response.json();

      return reply.code(200).send({
        success: true,
        data: keys.map((k: any) => ({
          id: k.id,
          key: k.key,
          isActive: k.is_active,
          createdAt: k.created_at,
          allowedTools: k.allowed_tools,
        })),
      });
    } catch (error) {
      logMessage("error", `Failed to get portal API keys: ${error}`, {});
      return sendError(reply, 500, "Failed to get API keys");
    }
  });

  // DELETE /v1/portal/systems/:systemId/credentials - Remove credentials for a system
  // Requires Authorization: Bearer <session-token>
  fastify.delete(
    "/v1/portal/systems/:systemId/credentials",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isEEDataStore(dataStore)) {
        return sendError(reply, 501, "Multi-tenancy features are not available");
      }

      const session = await validatePortalSession(request, dataStore);
      if (!session) {
        return sendError(reply, 401, "Invalid or expired session");
      }

      const { endUserId, orgId } = session;
      const { systemId } = request.params as { systemId: string };

      try {
        const deleted = await dataStore.deleteEndUserCredentials({
          endUserId,
          systemId,
          orgId,
        });

        if (!deleted) {
          return sendError(reply, 404, "Credentials not found");
        }

        return reply.code(200).send({ success: true });
      } catch (error) {
        logMessage("error", `Failed to delete portal credentials: ${error}`, {});
        return sendError(reply, 500, "Failed to delete credentials");
      }
    },
  );
}
