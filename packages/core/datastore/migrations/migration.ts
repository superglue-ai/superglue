import { Run, RunStatus, Tool } from "@superglue/shared";

export interface LegacyRunRow {
  id: string;
  config_id: string;
  started_at: Date;
  completed_at: Date;
  request_source?: string;
  result_storage_uri?: string;
}

function isLegacyRun(data: any): boolean {
  return !data?.status;
}

function normalizeRunStatus(status: string): RunStatus {
  const normalized = status.toUpperCase();
  if (normalized === "RUNNING") return RunStatus.RUNNING;
  if (normalized === "SUCCESS") return RunStatus.SUCCESS;
  if (normalized === "FAILED") return RunStatus.FAILED;
  if (normalized === "ABORTED") return RunStatus.ABORTED;
  return RunStatus.FAILED;
}

function migrateLegacyToRun(data: any, row: LegacyRunRow): Run {
  const startedAt = row.started_at ? new Date(row.started_at) : new Date();
  const completedAt = row.completed_at ? new Date(row.completed_at) : undefined;

  return {
    runId: row.id,
    toolId: row.config_id,
    status: data.success === true ? RunStatus.SUCCESS : RunStatus.FAILED,
    tool: data.config,
    toolPayload: undefined,
    data: data.data,
    options: undefined,
    error: data.error,
    requestSource: row.request_source || data.requestSource,
    resultStorageUri: row.result_storage_uri || data.resultStorageUri || undefined,
    metadata: {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt?.toISOString(),
      durationMs: completedAt ? completedAt.getTime() - startedAt.getTime() : undefined,
    },
  };
}

export function extractRun(data: any, row: LegacyRunRow): Run {
  if (isLegacyRun(data)) {
    return migrateLegacyToRun(data, row);
  }

  const startedAt = row.started_at
    ? new Date(row.started_at)
    : data.startedAt
      ? new Date(data.startedAt)
      : data.metadata?.startedAt
        ? new Date(data.metadata.startedAt)
        : new Date();

  const completedAt = row.completed_at
    ? new Date(row.completed_at)
    : data.completedAt
      ? new Date(data.completedAt)
      : data.metadata?.completedAt
        ? new Date(data.metadata.completedAt)
        : undefined;

  const tool = data.tool ?? data.toolConfig;
  const toolResult = data.toolResult ?? data.data;

  return {
    runId: row.id,
    toolId: data.toolId ?? row.config_id,
    tool,
    status: typeof data.status === "string" ? normalizeRunStatus(data.status) : data.status,
    toolPayload: data.toolPayload,
    data: toolResult,
    error: data.error,
    stepResults: data.stepResults,
    options: data.options,
    requestSource: row.request_source || data.requestSource,
    traceId: data.traceId,
    resultStorageUri: row.result_storage_uri || data.resultStorageUri || undefined,
    metadata: {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt?.toISOString(),
      durationMs: completedAt ? completedAt.getTime() - startedAt.getTime() : undefined,
    },
  };
}

export function normalizeTool(tool: any): Tool {
  if (!tool) return tool;

  const normalizedSteps = tool.steps?.map((step: any) => {
    const { integrationId, ...rest } = step;
    return {
      ...rest,
      systemId: step.systemId ?? integrationId,
    };
  });

  const { integrationIds, ...rest } = tool;
  return {
    ...rest,
    systemIds: tool.systemIds ?? integrationIds,
    steps: normalizedSteps,
  };
}
