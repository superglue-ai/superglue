import type { System, Tool } from "@superglue/shared";
import { SEED_CONFIG } from "@superglue/shared";
import { createApiKey } from "../../auth/auth.js";
import { logMessage } from "../../utils/logs.js";
import { registerApiModule } from "../registry.js";
import { addTraceHeader, sendError } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";

const seedOrg: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const metadata = authReq.toMetadata();

  try {
    const [systems, workflows] = await Promise.all([
      authReq.datastore.listSystems({ orgId: authReq.authInfo.orgId }),
      authReq.datastore.listWorkflows({ orgId: authReq.authInfo.orgId }),
    ]);

    if (systems.total > 0 || workflows.total > 0) {
      logMessage(
        "info",
        `Skipping seed for org ${authReq.authInfo.orgId}: systems=${systems.total}, tools=${workflows.total}`,
        metadata,
      );
      return addTraceHeader(reply, authReq.traceId).code(200).send({
        success: true,
        seeded: false,
        reason: "not_empty",
      });
    }

    // Create API key for new org (used by Superglue Email Service)
    logMessage("debug", `Creating API key for org ${authReq.authInfo.orgId}`, metadata);
    const newApiKey = await createApiKey(
      authReq.authInfo.orgId,
      authReq.authInfo.userId ?? undefined,
      authReq.authInfo.userEmail ?? undefined,
      "frontend",
    );

    const now = new Date();
    for (const system of SEED_CONFIG.systems) {
      let systemToCreate: System = {
        ...system,
        createdAt: now,
        updatedAt: now,
      } as System;
      if (system.id === "superglue-email" && newApiKey) {
        systemToCreate = {
          ...systemToCreate,
          credentials: {
            ...system.credentials,
            apiKey: newApiKey,
          },
        };
      }
      await authReq.datastore.createSystem({
        system: systemToCreate,
        orgId: authReq.authInfo.orgId,
      });
      logMessage("info", `Seeded system '${system.name}' (${system.id})`, metadata);
    }

    for (const tool of SEED_CONFIG.tools) {
      const toolToCreate: Tool = {
        ...tool,
        createdAt: now,
        updatedAt: now,
      } as Tool;
      await authReq.datastore.upsertWorkflow({
        id: tool.id!,
        workflow: toolToCreate,
        orgId: authReq.authInfo.orgId,
      });
      logMessage("info", `Seeded tool '${tool.id}'`, metadata);
    }

    logMessage(
      "info",
      `Seeded org ${authReq.authInfo.orgId} with ${SEED_CONFIG.systems.length} systems and ${SEED_CONFIG.tools.length} tools`,
      metadata,
    );

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      success: true,
      seeded: true,
      systemsCreated: SEED_CONFIG.systems.length,
      toolsCreated: SEED_CONFIG.tools.length,
    });
  } catch (error) {
    logMessage("error", `Failed to seed org: ${error}`, metadata);
    return sendError(reply, 500, `Failed to seed organization: ${String(error)}`);
  }
};

registerApiModule({
  name: "seed",
  routes: [
    {
      method: "POST",
      path: "/seed",
      handler: seedOrg,
      permissions: { type: "write", resource: "systems", allowRestricted: false },
    },
  ],
});
