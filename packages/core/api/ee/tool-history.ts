import { mapToolToOpenAPI } from "@superglue/shared";
import { registerApiModule } from "../registry.js";
import { addTraceHeader, sendError } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";

// GET /tools/:toolId/history - List tool version history
const listToolHistory: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };

  const history = await authReq.datastore.listToolHistory({
    toolId: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  return addTraceHeader(reply, authReq.traceId).send({
    data: history.map((entry) => ({
      version: entry.version,
      createdAt: entry.createdAt.toISOString(),
      createdByUserId: entry.createdByUserId,
      createdByEmail: entry.createdByEmail,
      tool: mapToolToOpenAPI(entry.tool),
    })),
  });
};

// POST /tools/:toolId/history/:version/restore - Restore a tool version
const restoreToolVersion: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string; version: string };
  const version = parseInt(params.version, 10);

  if (isNaN(version) || version < 1) {
    return sendError(reply, 400, "Invalid version number");
  }

  try {
    const restoredTool = await authReq.datastore.restoreToolVersion({
      toolId: params.toolId,
      version,
      orgId: authReq.authInfo.orgId,
      userId: authReq.authInfo.userId,
      userEmail: authReq.authInfo.userEmail,
    });

    return addTraceHeader(reply, authReq.traceId).send(mapToolToOpenAPI(restoredTool));
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      return sendError(reply, 404, error.message);
    }
    throw error;
  }
};

registerApiModule({
  name: "tool-history",
  routes: [
    {
      method: "GET",
      path: "/tools/:toolId/history",
      handler: listToolHistory,
      permissions: {
        type: "read",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      },
    },
    {
      method: "POST",
      path: "/tools/:toolId/history/:version/restore",
      handler: restoreToolVersion,
      permissions: {
        type: "write",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      },
    },
  ],
});
