import crypto from "node:crypto";
import { registerApiModule } from "./registry.js";
import { addTraceHeader, sendError } from "./response-helpers.js";
import { server_defaults } from "../default.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

const cacheSecret: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as {
    uid: string;
    clientId: string;
    clientSecret: string;
  };

  if (
    typeof body?.uid !== "string" ||
    !body.uid ||
    typeof body?.clientId !== "string" ||
    !body.clientId ||
    typeof body?.clientSecret !== "string" ||
    !body.clientSecret
  ) {
    return sendError(reply, 400, "uid, clientId, and clientSecret are required strings");
  }

  await authReq.datastore.cacheOAuthSecret({
    uid: body.uid,
    orgId: authReq.authInfo.orgId,
    clientId: body.clientId,
    clientSecret: body.clientSecret,
    ttlMs: server_defaults.POSTGRES.OAUTH_SECRET_TTL_MS,
  });

  return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true });
};

const getSecret: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { uid: string };

  if (!params.uid) {
    return sendError(reply, 400, "uid is required");
  }

  const entry = await authReq.datastore.getOAuthSecret({
    uid: params.uid,
    orgId: authReq.authInfo.orgId,
  });
  if (!entry) {
    return sendError(reply, 404, "Cached OAuth client credentials not found or expired");
  }

  return addTraceHeader(reply, authReq.traceId)
    .code(200)
    .send({
      success: true,
      data: { client_id: entry.clientId, client_secret: entry.clientSecret },
    });
};

const getTemplateCredentials: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { templateId: string };

  if (!params.templateId) {
    return sendError(reply, 400, "templateId is required");
  }

  const creds = await authReq.datastore.getTemplateOAuthCredentials({
    templateId: params.templateId,
  });

  if (!creds) {
    return sendError(reply, 404, "Template client credentials not found");
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    success: true,
    data: creds,
  });
};

/**
 * Returns a derived secret for CLI OAuth encryption.
 * The secret is derived from MASTER_ENCRYPTION_KEY + orgId so:
 * 1. The encrypted value cannot be decrypted without server-side secret
 * 2. Each org gets a unique encryption secret (cross-tenant isolation)
 * 3. CLI can encrypt API keys that only the server can decrypt
 * Note: systemId is used as additional salt during encryption, providing per-system uniqueness
 */
const getCliOAuthSecret: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const masterKey = process.env.MASTER_ENCRYPTION_KEY;

  if (!masterKey) {
    return sendError(reply, 503, "CLI OAuth not available: server encryption not configured");
  }

  const orgId = authReq.authInfo.orgId;

  const derivedSecret = await new Promise<string>((resolve, reject) => {
    crypto.hkdf(
      "sha256",
      masterKey,
      orgId,
      "superglue-cli-oauth",
      32,
      (err, key) => {
        if (err) return reject(err);
        resolve(Buffer.from(key).toString("hex"));
      },
    );
  });

  return addTraceHeader(reply, authReq.traceId)
    .code(200)
    .send({
      success: true,
      data: { secret: derivedSecret, orgId },
    });
};

registerApiModule({
  name: "oauth",
  routes: [
    {
      method: "POST",
      path: "/oauth/secrets",
      handler: cacheSecret,
      permissions: {
        type: "write",
        resource: "system",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
    {
      method: "GET",
      path: "/oauth/secrets/:uid",
      handler: getSecret,
      permissions: {
        type: "read",
        resource: "system",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
    {
      method: "GET",
      path: "/oauth/templates/:templateId/credentials",
      handler: getTemplateCredentials,
      permissions: {
        type: "read",
        resource: "system",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
    {
      method: "GET",
      path: "/oauth/cli-secret",
      handler: getCliOAuthSecret,
      permissions: {
        type: "read",
        resource: "system",
        allowedBaseRoles: ["admin", "member"],
      },
    },
  ],
});
