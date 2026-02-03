import { StoredRunResults } from "@superglue/shared";
import { getRunResultsService } from "../../ee/run-results-service.js";
import { registerApiModule } from "../registry.js";
import { addTraceHeader, sendError } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";
import { isFileStorageAvailable } from "../../filestore/file-service.js";

// GET /runs/:runId/results - Fetch stored run results from S3
const getRunResults: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { runId: string };

  // Check if S3 infrastructure is available
  if (!isFileStorageAvailable()) {
    return sendError(
      reply,
      503,
      "Run results storage is not enabled. Configure file storage to enable this feature.",
    );
  }

  // Get the run to find the storage URI
  const run = await authReq.datastore.getRun({
    id: params.runId,
    orgId: authReq.authInfo.orgId,
  });

  if (!run) {
    return sendError(reply, 404, "Run not found");
  }

  if (!run.resultStorageUri) {
    return addTraceHeader(reply, authReq.traceId).send({
      success: true,
      data: null,
      message: "No stored results available for this run",
    });
  }

  // Fetch results from S3
  const metadata = { orgId: authReq.authInfo.orgId, traceId: authReq.traceId };
  const runResultsService = getRunResultsService();
  const results = await runResultsService.getResults(run.resultStorageUri, metadata);

  if (!results) {
    return addTraceHeader(reply, authReq.traceId).send({
      success: true,
      data: null,
      message: "Results file not found or corrupted",
    });
  }

  // Convert storedAt to ISO string for JSON response
  const response: Omit<StoredRunResults, "storedAt"> & { storedAt: string } = {
    ...results,
    storedAt: results.storedAt instanceof Date ? results.storedAt.toISOString() : results.storedAt,
  };

  return addTraceHeader(reply, authReq.traceId).send({
    success: true,
    data: response,
  });
};

registerApiModule({
  name: "run-results",
  routes: [
    {
      method: "GET",
      path: "/runs/:runId/results",
      handler: getRunResults,
      permissions: {
        type: "read",
        resource: "run",
        allowRestricted: true,
      },
    },
  ],
});
