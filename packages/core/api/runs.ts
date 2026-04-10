import { RequestSource, Run, RunStatus, type Role } from "@superglue/shared";
import { getAllowedToolIds, isToolAllowed } from "../auth/access-rule-evaluator.js";
import type { DataStore } from "../datastore/types.js";
import { RunLifecycleManager } from "../runs/run-lifecycle.js";
import { logMessage } from "../utils/logs.js";
import { registerApiModule } from "./registry.js";
import {
  addTraceHeader,
  mapOpenAPIRequestSourceToInternal,
  mapOpenAPIStatusToInternal,
  mapRunStatusToOpenAPI,
  parseMultiValueQueryParam,
  parsePaginationParams,
  sendError,
} from "./response-helpers.js";
import type {
  AuthenticatedFastifyRequest,
  CreateRunRequestBody,
  OpenAPIRun,
  RouteHandler,
} from "./types.js";

async function forwardCancelToScheduler(runId: string, authorization?: string): Promise<void> {
  const schedulerUrl = process.env.SCHEDULER_URL;
  if (!schedulerUrl || process.env.START_SCHEDULER_SERVER === "true") return;

  try {
    await fetch(`${schedulerUrl}/v1/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      headers: authorization ? { Authorization: authorization } : {},
    });
  } catch (error) {
    logMessage(
      "warn",
      `Failed to forward cancel to scheduler: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Map internal Run to OpenAPI format - now minimal since types are aligned
// Just strips internal fields and ensures tool has version
export function mapRunToOpenAPI(run: Run): OpenAPIRun {
  return {
    runId: run.runId,
    toolId: run.toolId,
    tool: run.tool,
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
    resultStorageUri: run.resultStorageUri,
    userId: run.userId,
    executionMode: run.executionMode,
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

  const toolCheck = isToolAllowed(authReq.authInfo.roles || [], run.toolId);
  if (!toolCheck.allowed) {
    return sendError(reply, 403, toolCheck.error || "Access denied");
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send(mapRunToOpenAPI(run));
};

export type ListRunsQuery = {
  toolId?: string;
  search?: string;
  searchUserIds?: string;
  includeTotal?: string;
  startedAfter?: string;
  status?: string;
  requestSources?: string;
  page?: string;
  limit?: string;
  userId?: string;
  systemId?: string;
};

type RunsListFilters = Omit<NonNullable<Parameters<DataStore["listRuns"]>[0]>, "limit" | "offset">;

export function buildListRunsRequest(
  query: ListRunsQuery,
  orgId: string,
): {
  page: number;
  limit: number;
  offset: number;
  filters: RunsListFilters;
  includeTotal: boolean;
} {
  const { page, limit, offset } = parsePaginationParams(query);
  const internalStatus = query.status ? mapOpenAPIStatusToInternal(query.status) : undefined;

  let internalRequestSources: RequestSource[] | undefined;
  if (query.requestSources) {
    internalRequestSources = query.requestSources
      .split(",")
      .map((source) => mapOpenAPIRequestSourceToInternal(source.trim()))
      .filter((source): source is RequestSource => source !== undefined);
  }

  const startedAfter =
    query.startedAfter && !Number.isNaN(new Date(query.startedAfter).getTime())
      ? new Date(query.startedAfter)
      : undefined;

  return {
    page,
    limit,
    offset,
    includeTotal: query.includeTotal !== "false",
    filters: {
      configId: query.toolId,
      search: query.search?.trim() || undefined,
      searchUserIds: parseMultiValueQueryParam(query.searchUserIds),
      startedAfter,
      status: internalStatus,
      requestSources: internalRequestSources,
      orgId,
      userId: query.userId,
      systemId: query.systemId,
    },
  };
}

export async function listAuthorizedRunsPage({
  datastore,
  roles,
  filters,
  limit,
  offset,
  includeTotal,
}: {
  datastore: Pick<DataStore, "listRuns">;
  roles: Role[];
  filters: RunsListFilters;
  limit: number;
  offset: number;
  includeTotal?: boolean;
}): Promise<{ items: Run[]; total: number; hasMore: boolean }> {
  const allowedToolIds = getAllowedToolIds(roles);
  if (allowedToolIds && allowedToolIds.length === 0) {
    return {
      items: [],
      total: 0,
      hasMore: false,
    };
  }

  const result = await datastore.listRuns({
    ...filters,
    allowedToolIds,
    ...(includeTotal === undefined ? {} : { includeTotal }),
    limit,
    offset,
  });

  return {
    items: result.items,
    total: result.total,
    hasMore: offset + result.items.length < result.total,
  };
}

const listRuns: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as ListRunsQuery;
  const { page, limit, offset, filters, includeTotal } = buildListRunsRequest(
    query,
    authReq.authInfo.orgId,
  );
  const { items, total, hasMore } = await listAuthorizedRunsPage({
    datastore: authReq.datastore,
    roles: authReq.authInfo.roles || [],
    filters,
    limit,
    offset,
    includeTotal,
  });
  const data = items.map(mapRunToOpenAPI);

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    data,
    page,
    limit,
    total,
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

  const toolCheck = isToolAllowed(authReq.authInfo.roles || [], run.toolId);
  if (!toolCheck.allowed) {
    return sendError(reply, 403, toolCheck.error || "Access denied");
  }

  if (run.status !== RunStatus.RUNNING && run.status !== RunStatus.ABORTED) {
    return sendError(reply, 400, `Run is not currently running (status: ${run.status})`);
  }

  authReq.workerPools.toolExecution.abortTask(params.runId);

  if (run.status === RunStatus.RUNNING) {
    logMessage("info", `Cancelling run ${params.runId}`, metadata);

    const now = new Date();
    const startedAt = new Date(run.metadata.startedAt);

    await authReq.datastore.updateRun({
      id: params.runId,
      orgId: authReq.authInfo.orgId,
      updates: {
        status: RunStatus.ABORTED,
        tool: run.tool,
        error: `Run cancelled by user`,
        metadata: {
          ...run.metadata,
          completedAt: now.toISOString(),
          durationMs: now.getTime() - startedAt.getTime(),
        },
      },
    });

    forwardCancelToScheduler(params.runId, request.headers.authorization);
  }

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

  const startedAt = new Date(body.startedAt);
  const completedAt = new Date(body.completedAt);

  // Validate that dates are valid
  if (isNaN(startedAt.getTime())) {
    return sendError(reply, 400, `Invalid startedAt date: ${body.startedAt}`);
  }
  if (isNaN(completedAt.getTime())) {
    return sendError(reply, 400, `Invalid completedAt date: ${body.completedAt}`);
  }

  // Validate status
  if (!["success", "failed", "aborted"].includes(body.status)) {
    return sendError(
      reply,
      400,
      `Invalid status: ${body.status}. Must be 'success', 'failed', or 'aborted'`,
    );
  }

  try {
    const tool = body.toolConfig;
    const lifecycle = new RunLifecycleManager(authReq.datastore, authReq.authInfo.orgId, metadata);

    // Phase 1: Create run with truncated payload
    const runContext = await lifecycle.startRun({
      tool,
      payload: body.toolPayload,
      requestSource: RequestSource.FRONTEND,
    });

    // Phase 2: Complete run with full results (handles S3 storage)
    if (body.status === "aborted") {
      await lifecycle.abortRun(runContext, body.error);
    } else {
      await lifecycle.completeRun(runContext, {
        success: body.status === "success",
        tool,
        data: body.toolResult,
        error: body.error,
        stepResults: body.stepResults,
        payload: body.toolPayload,
      });
    }

    // Fetch the created run to return it
    const run = await authReq.datastore.getRun({
      id: runContext.runId,
      orgId: authReq.authInfo.orgId,
    });

    if (!run) {
      return sendError(reply, 500, "Failed to retrieve created run");
    }

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
      permissions: {
        type: "read",
        resource: "run",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
    {
      method: "GET",
      path: "/runs",
      handler: listRuns,
      permissions: {
        type: "read",
        resource: "run",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
    {
      method: "POST",
      path: "/runs/:runId/cancel",
      handler: cancelRun,
      permissions: {
        type: "execute",
        resource: "run",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
    {
      method: "POST",
      path: "/runs",
      handler: createRun,
      permissions: { type: "write", resource: "run", allowedBaseRoles: ["admin", "member"] },
    },
  ],
});
