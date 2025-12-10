import { Run, RunStatus } from '@superglue/shared';
import { logMessage } from '../utils/logs.js';
import { registerApiModule } from './registry.js';
import type {
  AuthenticatedFastifyRequest,
  OpenAPIRun,
  OpenAPIRunMetadata,
  RouteHandler,
} from './types.js';

function mapRunStatusToOpenAPI(status: RunStatus): 'running' | 'success' | 'failed' | 'aborted' {
  const statusMap: Record<RunStatus, 'running' | 'success' | 'failed' | 'aborted'> = {
    [RunStatus.RUNNING]: 'running',
    [RunStatus.SUCCESS]: 'success',
    [RunStatus.FAILED]: 'failed',
    [RunStatus.ABORTED]: 'aborted',
  };
  return statusMap[status] || 'failed';
}

function mapOpenAPIStatusToInternal(status: string): RunStatus | undefined {
  const statusMap: Record<string, RunStatus> = {
    running: RunStatus.RUNNING,
    success: RunStatus.SUCCESS,
    failed: RunStatus.FAILED,
    aborted: RunStatus.ABORTED,
  };
  return statusMap[status.toLowerCase()];
}

function mapRunToOpenAPI(run: Run): OpenAPIRun {
  const startedAt = run.startedAt instanceof Date ? run.startedAt : new Date(run.startedAt);
  const completedAt = run.completedAt instanceof Date ? run.completedAt : run.completedAt ? new Date(run.completedAt) : undefined;
  
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
    tool: run.toolConfig ? { 
      id: run.toolConfig.id, 
      version: run.toolConfig.version || '1.0.0' 
    } : undefined,
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

function sendError(reply: any, statusCode: number, message: string) {
  return reply.code(statusCode).header('X-Trace-Id', reply.request.traceId).send({
    error: { message },
  });
}

function addTraceHeader(reply: any, traceId?: string) {
  if (traceId) {
    reply.header('X-Trace-Id', traceId);
  }
  return reply;
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
    return sendError(reply, 404, 'Run not found');
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

  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
  const offset = (page - 1) * limit;

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
    return sendError(reply, 404, 'Run not found');
  }

  if (run.status !== RunStatus.RUNNING) {
    return sendError(reply, 400, `Run is not currently running (status: ${run.status})`);
  }

  logMessage('info', `Cancelling run ${params.runId}`, metadata);

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
    return sendError(reply, 500, 'Failed to retrieve updated run');
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send(mapRunToOpenAPI(updatedRun));
};

registerApiModule({
  name: 'runs',
  routes: [
    {
      method: 'GET',
      path: '/runs/:runId',
      handler: getRun,
    },
    {
      method: 'GET',
      path: '/runs',
      handler: listRuns,
    },
    {
      method: 'POST',
      path: '/runs/:runId/cancel',
      handler: cancelRun,
    },
  ],
});

