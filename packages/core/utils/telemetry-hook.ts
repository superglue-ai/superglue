import type { FastifyInstance } from "fastify";
import type { AuthenticatedFastifyRequest } from "../api/types.js";
import { telemetryClient, sessionId, isSelfHosted } from "./telemetry.js";

const SKIP_ROUTES = new Set(["/v1/health"]);

export function registerTelemetryHook(fastify: FastifyInstance): void {
  if (!telemetryClient) return;

  fastify.addHook("onResponse", async (request, reply) => {
    const url = request.routeOptions?.url || request.url;
    if (SKIP_ROUTES.has(url)) return;

    const authReq = request as AuthenticatedFastifyRequest;
    const method = request.method;
    const statusCode = reply.statusCode;
    const success = statusCode >= 200 && statusCode < 400;
    const orgId = authReq.authInfo?.orgId;
    const userId = authReq.authInfo?.userId;
    const distinctId = isSelfHosted ? `sh-inst-${sessionId}` : userId || orgId || sessionId;

    const properties: Record<string, any> = {
      method,
      route: url,
      statusCode,
      success,
      durationMs: Math.round(reply.elapsedTime),
      orgId,
      isSelfHosted,
    };

    const extra = (request as any)._telemetry;
    if (extra) Object.assign(properties, extra);

    telemetryClient!.capture({
      distinctId,
      event: `${method} ${url}`,
      properties,
      ...(orgId && { groups: { orgId } }),
    });

    if (!success) {
      telemetryClient!.capture({
        distinctId,
        event: `${method} ${url}_error`,
        properties,
        ...(orgId && { groups: { orgId } }),
      });
    }
  });
}
