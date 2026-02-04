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

  return addTraceHeader(reply, authReq.traceId)
    .code(200)
    .send({
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

const createSystem: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const metadata = authReq.toMetadata();

  let body: CreateSystemBody;
  try {
    body = validateCreateSystemBody(request.body);
  } catch (error: any) {
    return sendError(reply, 400, error.message);
  }

  try {
    const now = new Date();
    const systemId = crypto.randomUUID();

    let input: System = { id: systemId, ...body };

    const systemToSave: System = {
      id: systemId,
      name: input.name,
      url: input.url,
      specificInstructions: input.specificInstructions || "",
      icon: input.icon || "",
      credentials: input.credentials || {},
      metadata: input.metadata || {},
      templateName: input.templateName || "",
      documentationFiles: input.documentationFiles || {},
      createdAt: now,
      updatedAt: now,
    };

    const savedSystem = await authReq.datastore.createSystem({
      system: systemToSave,
      orgId: authReq.authInfo.orgId,
    });

    logMessage("info", `Created system '${body.name}' (${systemId})`, metadata);

    return addTraceHeader(reply, authReq.traceId)
      .code(201)
      .send({
        success: true,
        data: transformSystemDates(savedSystem),
      });
  } catch (error: any) {
    logMessage("error", `Error creating system '${body.name}': ${String(error)}`, metadata);
    return sendError(reply, 500, String(error));
  }
};

const updateSystem: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const metadata = authReq.toMetadata();

  if (!params.systemId) {
    return sendError(reply, 400, "systemId is required");
  }

  let body: UpdateSystemBody;
  try {
    body = validateUpdateSystemBody(request.body);
  } catch (error: any) {
    return sendError(reply, 400, error.message);
  }

  try {
    const existingSystem = await authReq.datastore.getSystem({
      id: params.systemId,
      includeDocs: false,
      orgId: authReq.authInfo.orgId,
    });

    if (!existingSystem) {
      return sendError(reply, 404, `System '${params.systemId}' not found`);
    }

    const systemToSave: System = {
      id: params.systemId,
      name: body.name,
      url: body.url,
      specificInstructions: body.specificInstructions || "",
      icon: body.icon || "",
      credentials: body.credentials || {},
      metadata: body.metadata || {},
      templateName: body.templateName || "",
      documentationFiles: body.documentationFiles || {},
      createdAt: existingSystem.createdAt,
      updatedAt: new Date(),
    };

    const savedSystem = await authReq.datastore.updateSystem({
      id: params.systemId,
      system: systemToSave,
      orgId: authReq.authInfo.orgId,
    });

    logMessage("info", `Updated system '${body.name}' (${params.systemId})`, metadata);

    return addTraceHeader(reply, authReq.traceId)
      .code(200)
      .send({
        success: true,
        data: transformSystemDates(savedSystem),
      });
  } catch (error) {
    logMessage("error", `Error updating system ${params.systemId}: ${String(error)}`, metadata);
    return sendError(reply, 500, String(error));
  }
};

const deleteSystem: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const metadata = authReq.toMetadata();

  try {
    const deleted = await authReq.datastore.deleteSystem({
      id: params.systemId,
      orgId: authReq.authInfo.orgId,
    });

    if (!deleted) {
      return sendError(reply, 404, "System not found");
    }

    logMessage("info", `Deleted system ${params.systemId}`, metadata);

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      success: true,
    });
  } catch (error) {
    logMessage("error", `Error deleting system ${params.systemId}: ${String(error)}`, metadata);
    return sendError(reply, 500, String(error));
  }
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
