import { RunStatus } from '@superglue/shared';

export function parsePaginationParams(query: { page?: string; limit?: string }): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function mapRunStatusToOpenAPI(status: RunStatus): 'running' | 'success' | 'failed' | 'aborted' {
  const statusMap: Record<RunStatus, 'running' | 'success' | 'failed' | 'aborted'> = {
    [RunStatus.RUNNING]: 'running',
    [RunStatus.SUCCESS]: 'success',
    [RunStatus.FAILED]: 'failed',
    [RunStatus.ABORTED]: 'aborted',
  };
  return statusMap[status] || 'failed';
}

export function mapOpenAPIStatusToInternal(status: string): RunStatus | undefined {
  const statusMap: Record<string, RunStatus> = {
    running: RunStatus.RUNNING,
    success: RunStatus.SUCCESS,
    failed: RunStatus.FAILED,
    aborted: RunStatus.ABORTED,
  };
  return statusMap[status.toLowerCase()];
}

export function sendError(reply: any, statusCode: number, message: string) {
  return reply.code(statusCode).header('X-Trace-Id', reply.request.traceId).send({
    error: { message },
  });
}

export function addTraceHeader(reply: any, traceId?: string) {
  if (traceId) {
    reply.header('X-Trace-Id', traceId);
  }
  return reply;
}

