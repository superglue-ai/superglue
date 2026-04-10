import { SystemEnvironment, System, generateUniqueId, getBaseRoleId } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";
import { deleteFileReferenceById } from "./file-references.js";
import { filterSystemsByPermissionAsync } from "./ee/index.js";
import { isEEDataStore } from "../datastore/ee/types.js";
import { registerApiModule } from "./registry.js";
import { addTraceHeader, parsePaginationParams, sendError } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, CreateSystemBody, RouteHandler } from "./types.js";
import {
  validateCreateSystemBody,
  transformSystemDates,
  validatePatchSystemBody,
} from "./response-helpers.js";

const getSystem: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const query = request.query as { env?: string };

  // Parse environment from query parameter
  // If not specified, try prod first, then fall back to dev (for backwards compatibility)
  const explicitEnv =
    query.env === "dev" || query.env === "prod" ? (query.env as "dev" | "prod") : undefined;

  let system = await authReq.datastore.getSystem({
    id: params.systemId,
    orgId: authReq.authInfo.orgId,
    includeDocs: false,
    environment: explicitEnv || "prod",
  });

  // If no explicit env was requested and prod wasn't found, try dev
  if (!system && !explicitEnv) {
    system = await authReq.datastore.getSystem({
      id: params.systemId,
      orgId: authReq.authInfo.orgId,
      includeDocs: false,
      environment: "dev",
    });
  }

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
    mode?: string;
  };

  const { page, limit, offset } = parsePaginationParams(query);
  const mode = query.mode as SystemEnvironment | undefined;

  // Fetch all systems for permission filtering, then paginate client-side
  const result = await authReq.datastore.listSystems({
    limit: 1000,
    offset: 0,
    orgId: authReq.authInfo.orgId,
    includeDocs: false,
    mode,
  });

  // Apply role-based access filtering
  const filteredItems = await filterSystemsByPermissionAsync(
    {
      dataStore: authReq.datastore,
      orgId: authReq.authInfo.orgId,
      userId: authReq.authInfo.userId,
      roles: authReq.authInfo.roles,
    },
    result.items,
  );

  const total = filteredItems.length;
  const paginatedItems = filteredItems.slice(offset, offset + limit);
  const data = paginatedItems.map(transformSystemDates);
  const hasMore = offset + paginatedItems.length < total;

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    success: true,
    data,
    page,
    limit,
    total,
    hasMore,
  });
};

// GET /systems/has-multi-env - Check if org has any linked non-prod systems
const hasMultiEnvSystems: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;

  const hasLinked = await authReq.datastore.hasLinkedNonProdSystems({
    orgId: authReq.authInfo.orgId,
  });

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    success: true,
    hasMultiEnvSystems: hasLinked,
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
    // With composite key model, validate that we're not creating a duplicate (same id + environment)
    if (body.environment) {
      const existingWithEnv = await authReq.datastore.getSystem({
        id: body.id,
        environment: body.environment,
        includeDocs: false,
        orgId: authReq.authInfo.orgId,
      });
      if (existingWithEnv) {
        return sendError(
          reply,
          400,
          `A system with id '${body.id}' and environment '${body.environment}' already exists`,
        );
      }
    }

    const now = new Date();
    const baseId = body.id;

    // Only generate unique ID if no environment is specified (legacy behavior)
    // With environment, we want to allow same ID with different environments
    let systemId = baseId;
    if (!body.environment) {
      systemId = await generateUniqueId({
        baseId,
        exists: async (id) =>
          !!(await authReq.datastore.getSystem({
            id,
            includeDocs: false,
            orgId: authReq.authInfo.orgId,
          })),
      });
    }

    const systemToSave: System = {
      id: systemId,
      name: body.name,
      url: body.url,
      specificInstructions: body.specificInstructions || "",
      icon: body.icon || "",
      credentials: body.credentials || {},
      metadata: body.metadata || {},
      templateName: body.templateName || "",
      multiTenancyMode: body.multiTenancyMode || "disabled",
      documentationFiles: body.documentationFiles || {},
      tunnel: body.tunnel,
      environment: body.environment || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const savedSystem = await authReq.datastore.createSystem({
      system: systemToSave,
      orgId: authReq.authInfo.orgId,
    });

    if (isEEDataStore(authReq.datastore)) {
      const baseRoleId = getBaseRoleId(authReq.authInfo.roles);
      if (baseRoleId) {
        await authReq.datastore.appendSystemToRole({
          roleId: baseRoleId,
          systemId: systemId,
          accessLevel: "read-write",
          orgId: authReq.authInfo.orgId,
        });
      }
    }

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

const patchSystem: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const query = request.query as { env?: string };
  const metadata = authReq.toMetadata();

  if (!params.systemId) {
    return sendError(reply, 400, "systemId is required");
  }

  // Parse environment from query parameter, defaulting to 'prod' since systems use composite key (id, environment)
  const environment =
    query.env === "dev" || query.env === "prod" ? (query.env as "dev" | "prod") : "prod";

  let body;
  try {
    body = validatePatchSystemBody(request.body);
  } catch (error: any) {
    return sendError(reply, 400, error.message);
  }

  try {
    const existingSystem = await authReq.datastore.getSystem({
      id: params.systemId,
      includeDocs: false,
      orgId: authReq.authInfo.orgId,
      environment,
    });

    if (!existingSystem) {
      return sendError(reply, 404, `System '${params.systemId}' not found`);
    }

    // Note: PATCH semantics - only provided fields are updated, others remain unchanged
    const patchedSystem: Partial<System> = {
      ...body,
      updatedAt: new Date(),
    };

    const savedSystem = await authReq.datastore.updateSystem({
      id: params.systemId,
      system: patchedSystem,
      orgId: authReq.authInfo.orgId,
      environment: existingSystem.environment, // Use the environment from the fetched system
    });

    if (!savedSystem) {
      return sendError(reply, 500, "Failed to update system");
    }

    logMessage("info", `Patched system ${params.systemId} (${environment})`, metadata);

    return addTraceHeader(reply, authReq.traceId)
      .code(200)
      .send({
        success: true,
        data: transformSystemDates(savedSystem),
      });
  } catch (error) {
    logMessage("error", `Error patching system ${params.systemId}: ${String(error)}`, metadata);
    return sendError(reply, 500, String(error));
  }
};

const deleteSystem: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { systemId: string };
  const query = request.query as { env?: string };
  const metadata = authReq.toMetadata();

  // Parse environment from query parameter, defaulting to 'prod' since systems use composite key (id, environment)
  const environment =
    query.env === "dev" || query.env === "prod" ? (query.env as "dev" | "prod") : "prod";

  try {
    const system = await authReq.datastore.getSystem({
      id: params.systemId,
      includeDocs: false,
      orgId: authReq.authInfo.orgId,
      environment,
    });

    if (!system) {
      return sendError(reply, 404, "System not found");
    }

    // Only delete S3 documentation files if no other environment exists for this system
    // Documentation is shared across environments (dev/prod)
    const hasOtherEnv = await authReq.datastore.hasOtherSystemEnvironments({
      id: params.systemId,
      excludeEnvironment: environment,
      orgId: authReq.authInfo.orgId,
    });

    if (!hasOtherEnv) {
      const docFiles = system.documentationFiles || {};
      const allFileIds = [
        ...(docFiles.uploadFileIds || []),
        ...(docFiles.scrapeFileIds || []),
        ...(docFiles.openApiFileIds || []),
      ];

      for (const fileId of allFileIds) {
        try {
          await deleteFileReferenceById(
            fileId,
            authReq.authInfo.orgId,
            authReq.datastore,
            metadata,
          );
        } catch (err) {
          logMessage(
            "warn",
            `Failed to delete doc file ${fileId} during system deletion: ${String(err)}`,
            metadata,
          );
        }
      }
    }

    await authReq.datastore.deleteSystem({
      id: params.systemId,
      orgId: authReq.authInfo.orgId,
      environment,
    });

    if (isEEDataStore(authReq.datastore)) {
      const hasOtherEnvAfterDelete = await authReq.datastore.hasOtherSystemEnvironments({
        id: params.systemId,
        excludeEnvironment: environment,
        orgId: authReq.authInfo.orgId,
      });
      if (!hasOtherEnvAfterDelete) {
        await authReq.datastore.removeSystemFromRoles({
          systemId: params.systemId,
          orgId: authReq.authInfo.orgId,
        });
      }
    }

    logMessage("info", `Deleted system ${params.systemId} (${environment})`, metadata);

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
      path: "/systems/has-multi-env",
      handler: hasMultiEnvSystems,
      permissions: { type: "read", resource: "system", allowedBaseRoles: ["admin", "member"] },
    },
    {
      method: "GET",
      path: "/systems/:systemId",
      handler: getSystem,
      permissions: {
        type: "read",
        resource: "system",
        allowedBaseRoles: ["admin", "member"],
        checkResourceId: "systemId",
      },
    },
    {
      method: "GET",
      path: "/systems",
      handler: listSystems,
      permissions: { type: "read", resource: "system", allowedBaseRoles: ["admin", "member"] },
    },
    {
      method: "POST",
      path: "/systems",
      handler: createSystem,
      permissions: { type: "write", resource: "system", allowedBaseRoles: ["admin", "member"] },
    },
    {
      method: "PATCH",
      path: "/systems/:systemId",
      handler: patchSystem,
      permissions: {
        type: "write",
        resource: "system",
        allowedBaseRoles: ["admin", "member"],
        checkResourceId: "systemId",
      },
    },
    {
      method: "DELETE",
      path: "/systems/:systemId",
      handler: deleteSystem,
      permissions: {
        type: "delete",
        resource: "system",
        allowedBaseRoles: ["admin", "member"],
        checkResourceId: "systemId",
      },
    },
  ],
});
