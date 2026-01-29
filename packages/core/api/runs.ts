import { RequestSource, Run, RunStatus, Tool } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";
import { registerApiModule } from "./registry.js";
import {
  addTraceHeader,
  mapOpenAPIRequestSourceToInternal,
  mapOpenAPIStatusToInternal,
  mapRunStatusToOpenAPI,
  parsePaginationParams,
  sendError,
} from "./response-helpers.js";
import type {
  AuthenticatedFastifyRequest,
  CreateRunRequestBody,
  OpenAPIRun,
  RouteHandler,
} from "./types.js";

// Map internal Run to OpenAPI format - now minimal since types are aligned
// Just strips internal fields and ensures tool has version
export function mapRunToOpenAPI(run: Run): OpenAPIRun {
  // Add default version if tool exists but has no version
  const tool = run.tool
    ? {
        ...(run.tool as unknown as Record<string, unknown>),
        version: (run.tool as unknown as Record<string, unknown>).version ?? "1.0.0",
      }
    : undefined;

  return {
    runId: run.runId,
    toolId: run.toolId,
    tool,
    status: mapRunStatusToOpenAPI(run.status),
    toolPayload: run.toolPayload,
    data: run.data,
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
    metadata: run.metadata,
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
    requestSources?: string;
    page?: string;
    limit?: string;
  };

  const { page, limit, offset } = parsePaginationParams(query);
  const internalStatus = query.status ? mapOpenAPIStatusToInternal(query.status) : undefined;

  let internalRequestSources: RequestSource[] | undefined;
  if (query.requestSources) {
    internalRequestSources = query.requestSources
      .split(",")
      .map((s) => mapOpenAPIRequestSourceToInternal(s.trim()))
      .filter((s): s is RequestSource => s !== undefined);
  }

  const result = await authReq.datastore.listRuns({
    limit,
    offset,
    configId: query.toolId,
    status: internalStatus,
    requestSources: internalRequestSources,
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

  if (run.requestSource === RequestSource.SCHEDULER) {
    return sendError(reply, 400, "Scheduled runs cannot be cancelled");
  }

  logMessage("info", `Cancelling run ${params.runId}`, metadata);

  // Abort the task
  authReq.workerPools.toolExecution.abortTask(params.runId);

  const now = new Date();
  const startedAt = new Date(run.metadata.startedAt);

  // Update the run status
  await authReq.datastore.updateRun({
    id: params.runId,
    orgId: authReq.authInfo.orgId,
    updates: {
      status: RunStatus.ABORTED,
      error: `Run cancelled by user`,
      metadata: {
        ...run.metadata,
        completedAt: now.toISOString(),
        durationMs: now.getTime() - startedAt.getTime(),
      },
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

// POST /runs - Create a run entry (for manual tool execution in playground)
const createRun: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as CreateRunRequestBody;
  const metadata = authReq.toMetadata();

  if (!body.toolId) {
    return sendError(reply, 400, "toolId is required");
  }
  if (!body.toolConfig) {
    return sendError(reply, 400, "toolConfig is required");
  }
  if (!body.status) {
    return sendError(reply, 400, "status is required");
  }
  if (!body.startedAt) {
    return sendError(reply, 400, "startedAt is required");
  }
  if (!body.completedAt) {
    return sendError(reply, 400, "completedAt is required");
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date(body.startedAt);
  const completedAt = new Date(body.completedAt);

  // Validate that dates are valid
  if (isNaN(startedAt.getTime())) {
    return sendError(reply, 400, `Invalid startedAt date: ${body.startedAt}`);
  }
  if (isNaN(completedAt.getTime())) {
    return sendError(reply, 400, `Invalid completedAt date: ${body.completedAt}`);
  }

  // Map status string to RunStatus enum
  let status: RunStatus;
  if (body.status === "success") {
    status = RunStatus.SUCCESS;
  } else if (body.status === "failed") {
    status = RunStatus.FAILED;
  } else if (body.status === "aborted") {
    status = RunStatus.ABORTED;
  } else {
    return sendError(
      reply,
      400,
      `Invalid status: ${body.status}. Must be 'success', 'failed', or 'aborted'`,
    );
  }

  const run: Run = {
    runId,
    toolId: body.toolId,
    status,
    tool: body.toolConfig as unknown as Tool,
    requestSource: RequestSource.FRONTEND,
    error: body.error,
    metadata: {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
  };

  try {
    await authReq.datastore.createRun({ run, orgId: authReq.authInfo.orgId });
    return addTraceHeader(reply, authReq.traceId).code(201).send(mapRunToOpenAPI(run));
  } catch (error: any) {
    logMessage("error", `Failed to create run: ${String(error)}`, metadata);
    return sendError(reply, 500, `Failed to create run: ${error.message}`);
  }
};

registerApiModule({
  name: "runs",
  routes: [
    {
      method: "GET",
      path: "/runs/:runId",
      handler: getRun,
      permissions: { type: "read", resource: "run", allowRestricted: true },
    },
    {
      method: "GET",
      path: "/runs",
      handler: listRuns,
      permissions: { type: "read", resource: "run", allowRestricted: true },
    },
    {
      method: "POST",
      path: "/runs/:runId/cancel",
      handler: cancelRun,
      permissions: { type: "write", resource: "run", allowRestricted: true },
    },
    {
      method: "POST",
      path: "/runs",
      handler: createRun,
      permissions: { type: "write", resource: "run", allowRestricted: false },
    },
  ],
});
