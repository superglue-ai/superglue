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

  const entry = await authReq.datastore.getOAuthSecret({ uid: params.uid });
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

registerApiModule({
  name: "oauth",
  routes: [
    {
      method: "POST",
      path: "/oauth/secrets",
      handler: cacheSecret,
      permissions: { type: "write", resource: "system" },
    },
    {
      method: "GET",
      path: "/oauth/secrets/:uid",
      handler: getSecret,
      permissions: { type: "read", resource: "system" },
    },
    {
      method: "GET",
      path: "/oauth/templates/:templateId/credentials",
      handler: getTemplateCredentials,
      permissions: { type: "read", resource: "system" }, // should templates be their own resource? Does having this endpoint make any sense?
    },
  ],
});
