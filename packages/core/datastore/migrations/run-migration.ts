import { Run, RunStatus } from "@superglue/shared";

export interface LegacyRunRow {
  id: string;
  config_id: string;
  started_at: Date;
  completed_at: Date;
}

function isLegacyRun(data: any): boolean {
  return !data?.status;
}

function normalizeRunStatus(status: string): RunStatus {
  const normalized = status.toUpperCase();
  if (normalized === 'RUNNING') return RunStatus.RUNNING;
  if (normalized === 'SUCCESS') return RunStatus.SUCCESS;
  if (normalized === 'FAILED') return RunStatus.FAILED;
  if (normalized === 'ABORTED') return RunStatus.ABORTED;
  return RunStatus.FAILED;
}

function migrateLegacyToRun(data: any, row: LegacyRunRow): Run {
  return {
    id: row.id,
    toolId: row.config_id,
    status: data.success === true ? RunStatus.SUCCESS : RunStatus.FAILED,
    toolConfig: data.config,
    toolPayload: undefined,
    toolResult: data.data,
    options: undefined,
    error: data.error,
    startedAt: row.started_at ? new Date(row.started_at) : new Date(),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined
  };
}

export function extractRun(data: any, row: LegacyRunRow): Run {
  if (isLegacyRun(data)) {
    return migrateLegacyToRun(data, row);
  }
  return {
    ...data,
    status: typeof data.status === 'string' ? normalizeRunStatus(data.status) : data.status,
    id: row.id,
    startedAt: row.started_at ? new Date(row.started_at) : (data.startedAt ? new Date(data.startedAt) : new Date()),
    completedAt: row.completed_at ? new Date(row.completed_at) : (data.completedAt ? new Date(data.completedAt) : undefined)
  };
}

