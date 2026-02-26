import { composeUrl, Run, RunStatus, System, Tool } from "@superglue/shared";

export interface LegacyRunRow {
  id: string;
  config_id: string;
  started_at: Date;
  completed_at: Date;
  request_source?: string;
  result_storage_uri?: string;
  user_id?: string;
}

/**
 * Normalizes ApiConfig from old urlHost/urlPath to new url field.
 * Deletes deprecated fields after normalization.
 */
export function normalizeApiConfig(config: any): any {
  if (!config) return config;

  // Compose url from old fields if url doesn't exist
  if (!config.url && (config.urlHost || config.urlPath)) {
    config.url = composeUrl(config.urlHost || "", config.urlPath || "");
  }

  // Delete deprecated fields
  delete config.urlHost;
  delete config.urlPath;

  return config;
}

/**
 * Normalizes System from old urlHost/urlPath to new url field.
 * Deletes deprecated fields after normalization.
 */
export function normalizeSystem(system: any): System {
  if (!system) return system;

  // Compose url from old fields if url doesn't exist
  if (!system.url && (system.urlHost || system.urlPath)) {
    system.url = composeUrl(system.urlHost || "", system.urlPath || "");
  }

  // Delete deprecated fields
  delete system.urlHost;
  delete system.urlPath;

  return system;
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

  const tool = normalizeTool(data.tool ?? data.toolConfig);
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
    userId: row.user_id || data.userId || undefined,
    metadata: {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt?.toISOString(),
      durationMs: completedAt ? completedAt.getTime() - startedAt.getTime() : undefined,
    },
  };
}

// Pagination type mapping from legacy UPPER_CASE to camelCase
const PAGINATION_TYPE_MAP: Record<string, string> = {
  OFFSET_BASED: "offsetBased",
  PAGE_BASED: "pageBased",
  CURSOR_BASED: "cursorBased",
  DISABLED: "disabled",
};

function mapPaginationType(internalType?: string): string {
  if (!internalType) return "disabled";
  // If already camelCase, return as-is
  if (PAGINATION_TYPE_MAP[internalType]) {
    return PAGINATION_TYPE_MAP[internalType];
  }
  return internalType;
}

export function normalizeTool(tool: any): Tool {
  if (!tool) return tool;

  const normalizedSteps = tool.steps?.map((step: any) => {
    const { integrationId, apiConfig, config, executionMode, loopSelector, systemId, ...rest } =
      step;

    // Migration: apiConfig -> config (prefer config if both exist)
    let stepConfig = config || apiConfig;

    // Extract integrationId from apiConfig if it exists there (legacy format)
    const legacyIntegrationId = integrationId ?? apiConfig?.integrationId;

    // Extract instruction from config to step level
    let instruction: string | undefined;

    if (stepConfig) {
      // Normalize old apiConfig format (urlHost/urlPath -> url)
      stepConfig = normalizeApiConfig(stepConfig);

      // Add type for frontend convenience (not stored in DB for URL-based steps)
      // URL-based steps (HTTP, SFTP, Postgres) get type: "request"
      // Transform steps already have type: "transform" and should be preserved
      if (!stepConfig.type) {
        // Only default to "request" if step has URL (request step)
        // Transform steps have transformCode instead of URL
        stepConfig.type = stepConfig.url || !stepConfig.transformCode ? "request" : "transform";
      }

      // Remove legacy config.id - step.id is used instead
      delete stepConfig.id;

      // Remove integrationId from config (it's moved to systemId)
      delete stepConfig.integrationId;

      // Move instruction from config to step level (only for request steps)
      instruction = step.instruction ?? stepConfig.instruction;
      delete stepConfig.instruction;

      // Move systemId into config for request steps (not transform steps)
      if (stepConfig.type === "request") {
        const stepSystemId = systemId ?? legacyIntegrationId;
        if (stepSystemId) {
          stepConfig.systemId = stepSystemId;
        }
      }

      // Normalize pagination type to camelCase (only for request steps)
      if (stepConfig.pagination?.type) {
        stepConfig.pagination.type = mapPaginationType(stepConfig.pagination.type);
      }
    }

    // Normalize failureBehavior to lowercase
    let failureBehavior: string | undefined = rest.failureBehavior;
    if (failureBehavior) {
      failureBehavior = failureBehavior.toLowerCase();
    }

    // Rename loopSelector -> dataSelector
    const dataSelector = rest.dataSelector ?? loopSelector;

    return {
      id: step.id,
      config: stepConfig,
      instruction,
      modify: rest.modify,
      dataSelector,
      failureBehavior,
    };
  });

  // Build the normalized tool with new field names
  // responseSchema -> outputSchema, finalTransform -> outputTransform
  return {
    id: tool.id,
    name: tool.name,
    version: tool.version,
    instruction: tool.instruction,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema ?? tool.responseSchema,
    steps: normalizedSteps,
    outputTransform: tool.outputTransform ?? tool.finalTransform,
    folder: tool.folder,
    archived: tool.archived,
    responseFilters: tool.responseFilters,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
}
