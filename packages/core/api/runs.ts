import { Run, RunStatus } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";
import { registerApiModule } from "./registry.js";
import {
  addTraceHeader,
  mapOpenAPIStatusToInternal,
  mapRunStatusToOpenAPI,
  parsePaginationParams,
  sendError,
} from "./response-helpers.js";
import type {
  AuthenticatedFastifyRequest,
  OpenAPIRun,
  OpenAPIRunMetadata,
  RouteHandler,
} from "./types.js";

export function mapRunToOpenAPI(run: Run): OpenAPIRun {
  const startedAt = run.startedAt instanceof Date ? run.startedAt : new Date(run.startedAt);
  const completedAt =
    run.completedAt instanceof Date
      ? run.completedAt
      : run.completedAt
        ? new Date(run.completedAt)
        : undefined;

  const metadata: OpenAPIRunMetadata = {
    startedAt: startedAt.toISOString(),
  };

  if (completedAt) {
    metadata.completedAt = completedAt.toISOString();
    metadata.durationMs = completedAt.getTime() - startedAt.getTime();
  }

  return {
    runId: run.id,
    toolId: run.toolId,
    tool: run.toolConfig
      ? {
          id: run.toolConfig.id,
          version: run.toolConfig.version || "1.0.0",
        }
      : undefined,
    status: mapRunStatusToOpenAPI(run.status),
    toolPayload: run.toolPayload,
    data: run.toolResult,
    error: run.error,
    stepResults: run.stepResults?.map((sr) => ({
      stepId: sr.stepId,
      success: sr.success,
      data: sr.data,
      error: sr.error,
    })),
    options: run.options as Record<string, unknown>,
    requestSource: run.requestSource,
    traceId: run.traceId,
    metadata,
  };
}

// GET /runs/:runId - Get run status
const getRun: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { runId: string };

  const run = await authReq.datastore.getRun({
    id: params.runId,
    orgId: authReq.authInfo.orgId,
  });

  if (!run) {
    return sendError(reply, 404, "Run not found");
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send(mapRunToOpenAPI(run));
};

// GET /runs - List runs
const listRuns: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as {
    toolId?: string;
    status?: string;
    page?: string;
    limit?: string;
  };

  const { page, limit, offset } = parsePaginationParams(query);
  const internalStatus = query.status ? mapOpenAPIStatusToInternal(query.status) : undefined;

  const result = await authReq.datastore.listRuns({
    limit,
    offset,
    configId: query.toolId,
    status: internalStatus,
    orgId: authReq.authInfo.orgId,
  });

  const data = result.items.map(mapRunToOpenAPI);
  const hasMore = offset + result.items.length < result.total;

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    data,
    page,
    limit,
    total: result.total,
    hasMore,
  });
};

// POST /runs/:runId/cancel - Cancel a run
const cancelRun: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { runId: string };
  const metadata = authReq.toMetadata();

  const run = await authReq.datastore.getRun({
    id: params.runId,
    orgId: authReq.authInfo.orgId,
  });

  if (!run) {
    return sendError(reply, 404, "Run not found");
  }

  if (run.status !== RunStatus.RUNNING) {
    return sendError(reply, 400, `Run is not currently running (status: ${run.status})`);
  }

  logMessage("info", `Cancelling run ${params.runId}`, metadata);

  // Abort the task
  authReq.workerPools.toolExecution.abortTask(params.runId);

  // Update the run status
  await authReq.datastore.updateRun({
    id: params.runId,
    orgId: authReq.authInfo.orgId,
    updates: {
      status: RunStatus.ABORTED,
      error: `Run cancelled by user`,
      completedAt: new Date(),
    },
  });

  // Fetch the updated run
  const updatedRun = await authReq.datastore.getRun({
    id: params.runId,
    orgId: authReq.authInfo.orgId,
  });

  if (!updatedRun) {
    return sendError(reply, 500, "Failed to retrieve updated run");
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send(mapRunToOpenAPI(updatedRun));
};

registerApiModule({
  name: "runs",
  routes: [
    {
      method: "GET",
      path: "/runs/:runId",
      handler: getRun,
    },
    {
      method: "GET",
      path: "/runs",
      handler: listRuns,
    },
    {
      method: "POST",
      path: "/runs/:runId/cancel",
      handler: cancelRun,
    },
  ],
});
