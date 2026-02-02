import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";
import { registerApiModule } from "../registry.js";
import {
  DiscoveryRun,
  DiscoveryRunStatus,
  DiscoveryResult,
  DiscoverySource,
} from "@superglue/shared";
import { deleteFileReferenceById } from "../file-references.js";
import { logMessage } from "../../utils/logs.js";
import { DiscoveryService } from "../../ee/discovery-service.js";

// Helper function to extract file IDs from sources
function extractFileIds(sources: DiscoverySource[]): string[] {
  return sources.filter((s) => s.type === "file").map((s) => s.id);
}

const createDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const body = request.body as { sources: DiscoverySource[]; data?: any };

    if (!body.sources || !Array.isArray(body.sources)) {
      return reply.code(400).send({ success: false, error: "Missing or invalid sources" });
    }

    // Backend generates the ID
    const run: DiscoveryRun = {
      id: crypto.randomUUID(),
      sources: body.sources,
      data: body.data ?? {},
      status: DiscoveryRunStatus.PENDING,
      createdAt: new Date(),
    };

    const created = await authReq.datastore.createDiscoveryRun({
      run,
      orgId: authReq.authInfo.orgId,
    });

    return reply.code(201).send({ success: true, data: created });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const getDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };

    const run = await authReq.datastore.getDiscoveryRun({ id, orgId: authReq.authInfo.orgId });

    if (!run) {
      return reply.code(404).send({ success: false, error: "Discovery run not found" });
    }

    return reply.code(200).send({ success: true, data: run });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const updateDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };
    const body = request.body as { updates: Partial<DiscoveryRun> };

    if (!body.updates) {
      return reply.code(400).send({ success: false, error: "Missing updates data" });
    }

    const updated = await authReq.datastore.updateDiscoveryRun({
      id,
      updates: body.updates,
      orgId: authReq.authInfo.orgId,
    });

    return reply.code(200).send({ success: true, data: updated });
  } catch (error) {
    if (String(error).includes("not found")) {
      return reply.code(404).send({ success: false, error: String(error) });
    }
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const listDiscoveryRuns: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const query = request.query as {
      limit?: string;
      offset?: string;
    };

    const limit = query.limit ? parseInt(query.limit, 10) || 10 : 10;
    const offset = query.offset ? parseInt(query.offset, 10) || 0 : 0;

    const result = await authReq.datastore.listDiscoveryRuns({
      limit,
      offset,
      orgId: authReq.authInfo.orgId,
    });

    return reply.code(200).send({
      success: true,
      items: result.items,
      total: result.total,
    });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const deleteDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };
    const serviceMetadata = authReq.toMetadata();

    // Get the discovery run first to access associated file IDs
    const run = await authReq.datastore.getDiscoveryRun({ id, orgId: authReq.authInfo.orgId });

    if (!run) {
      return reply.code(404).send({ success: false, error: "Discovery run not found" });
    }

    // Delete all associated files
    const fileIds = extractFileIds(run.sources);
    if (fileIds.length > 0) {
      const deletionResults = await Promise.allSettled(
        fileIds.map((fileId) =>
          deleteFileReferenceById(
            fileId,
            authReq.authInfo.orgId,
            authReq.datastore,
            serviceMetadata,
          ),
        ),
      );

      // Log any failed deletions
      deletionResults.forEach((result, index) => {
        if (result.status === "rejected") {
          const fileId = fileIds[index];
          logMessage(
            "warn",
            `deleteDiscoveryRun: failed to delete file fileId=${fileId}: ${result.reason}`,
            serviceMetadata,
          );
        }
      });
    }

    // Finally, delete the discovery run itself
    const deleted = await authReq.datastore.deleteDiscoveryRun({
      id,
      orgId: authReq.authInfo.orgId,
    });

    if (!deleted) {
      return reply.code(404).send({ success: false, error: "Discovery run not found" });
    }

    return reply.code(200).send({ success: true });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const startDiscoveryRun: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };
    const body = request.body as { userInstruction?: string } | undefined;
    const userInstruction = body?.userInstruction;
    const serviceMetadata = authReq.toMetadata();

    // Get the discovery run
    const run = await authReq.datastore.getDiscoveryRun({ id, orgId: authReq.authInfo.orgId });

    if (!run) {
      return reply.code(404).send({ success: false, error: "Discovery run not found" });
    }

    // Idempotent check - if already processing, return success without re-processing
    if (run.status === DiscoveryRunStatus.PROCESSING) {
      return reply.code(200).send({
        success: true,
        message: "Discovery run is already processing.",
      });
    }

    // Update status to PROCESSING
    await authReq.datastore.updateDiscoveryRun({
      id,
      updates: { status: DiscoveryRunStatus.PROCESSING },
      orgId: authReq.authInfo.orgId,
    });

    // Return immediately - processing happens async
    reply.code(200).send({
      success: true,
      message: "Discovery run started. Refresh to see results when processing completes.",
    });

    // Process asynchronously (fire and forget)
    setImmediate(async () => {
      try {
        logMessage(
          "info",
          `startDiscoveryRun: Processing run id=${id}${userInstruction ? " with user instruction" : ""}`,
          serviceMetadata,
        );
        const result: DiscoveryResult = await DiscoveryService.processDiscoveryRun(
          run,
          authReq.datastore,
          authReq.authInfo.orgId,
          serviceMetadata,
          { userInstruction },
        );

        // Update run with results and mark as completed
        await authReq.datastore.updateDiscoveryRun({
          id,
          updates: {
            status: DiscoveryRunStatus.COMPLETED,
            data: result,
          },
          orgId: authReq.authInfo.orgId,
        });

        logMessage("info", `startDiscoveryRun: Completed run id=${id}`, serviceMetadata);
      } catch (processingError) {
        // Mark run as failed
        await authReq.datastore.updateDiscoveryRun({
          id,
          updates: {
            status: DiscoveryRunStatus.FAILED,
            data: {
              ...run.data,
              error: String(processingError),
            },
          },
          orgId: authReq.authInfo.orgId,
        });

        logMessage(
          "error",
          `startDiscoveryRun: Failed to process run id=${id}: ${processingError}`,
          serviceMetadata,
        );
      }
    });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

registerApiModule({
  name: "discovery-runs",
  routes: [
    {
      method: "POST",
      path: "/discovery-runs",
      handler: createDiscoveryRun,
      permissions: { type: "write", resource: "discovery-run" },
    },
    {
      method: "GET",
      path: "/discovery-runs/:id",
      handler: getDiscoveryRun,
      permissions: { type: "read", resource: "discovery-run" },
    },
    {
      method: "PATCH",
      path: "/discovery-runs/:id",
      handler: updateDiscoveryRun,
      permissions: { type: "write", resource: "discovery-run" },
    },
    {
      method: "GET",
      path: "/discovery-runs",
      handler: listDiscoveryRuns,
      permissions: { type: "read", resource: "discovery-run" },
    },
    {
      method: "DELETE",
      path: "/discovery-runs/:id",
      handler: deleteDiscoveryRun,
      permissions: { type: "delete", resource: "discovery-run" },
    },
    {
      method: "POST",
      path: "/discovery-runs/:id/start",
      handler: startDiscoveryRun,
      permissions: { type: "execute", resource: "discovery-run" },
    },
  ],
});
