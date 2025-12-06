import { Run, RunStatus } from "@superglue/shared";

export interface LegacyRunRow {
  id: string;
  config_id: string;
  org_id: string;
  started_at: Date;
  completed_at: Date;
}

function isLegacyRun(data: any): boolean {
  return !data.status;
}

function migrateLegacyToRun(data: any, row: LegacyRunRow): Run {
  return {
    id: row.id,
    toolId: row.config_id || data.config?.id || '',
    orgId: row.org_id || '',
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
    id: row.id,
    orgId: row.org_id || data.orgId || '',
    startedAt: row.started_at ? new Date(row.started_at) : (data.startedAt ? new Date(data.startedAt) : new Date()),
    completedAt: row.completed_at ? new Date(row.completed_at) : (data.completedAt ? new Date(data.completedAt) : undefined)
  };
}

