import { System } from "@superglue/shared";
import { registerApiModule } from "./registry.js";
import { addTraceHeader, parsePaginationParams, sendError } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

// Transform dates to ISO strings for JSON response
function transformSystemDates(system: System) {
  const { createdAt, updatedAt, ...rest } = system;
  return {
    ...rest,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
  };
}

// GET /systems/:systemId - Get a single system
const getSystem: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const query = request.query as { includeDocs?: string };

  const includeDocs = query.includeDocs === "true";

  const system = await authReq.datastore.getSystem({
    id: params.systemId,
    orgId: authReq.authInfo.orgId,
    includeDocs,
  });

  if (!system) {
    return sendError(reply, 404, "System not found");
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    success: true,
    data: transformSystemDates(system),
  });
};

// GET /systems - List systems
const listSystems: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as {
    page?: string;
    limit?: string;
    includeDocs?: string;
  };

  const { page, limit, offset } = parsePaginationParams(query);
  const includeDocs = query.includeDocs === "true";

  const result = await authReq.datastore.listSystems({
    limit,
    offset,
    orgId: authReq.authInfo.orgId,
    includeDocs,
  });

  const data = result.items.map(transformSystemDates);
  const hasMore = offset + result.items.length < result.total;

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    success: true,
    data,
    page,
    limit,
    total: result.total,
    hasMore,
  });
};

registerApiModule({
  name: "systems",
  routes: [
    {
      method: "GET",
      path: "/systems/:systemId",
      handler: getSystem,
      permissions: { type: "read", resource: "system" },
    },
    {
      method: "GET",
      path: "/systems",
      handler: listSystems,
      permissions: { type: "read", resource: "system" },
    },
  ],
});
