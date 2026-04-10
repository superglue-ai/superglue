/**
 * Deno Runtime Types
 *
 * These types are used for communication between Node.js and Deno subprocess.
 * They mirror the types from @superglue/shared but are self-contained for Deno.
 */

export type ServiceMetadata = {
  traceId?: string;
  orgId?: string;
  userId?: string;
  userEmail?: string;
};

export type RequestOptions = {
  cacheMode?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  webhookUrl?: string;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

export type PaginationTypeValue = "offsetBased" | "pageBased" | "cursorBased" | "disabled";

export interface Pagination {
  type: PaginationTypeValue;
  pageSize?: string;
  cursorPath?: string;
  stopCondition?: string;
}

export interface RequestStepConfig {
  type?: "request";
  url: string;
  method?: HttpMethod | string;
  queryParams?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: string;
  pagination?: Pagination;
  systemId?: string;
}

export interface TransformStepConfig {
  type: "transform";
  transformCode: string;
}

export type StepConfig = RequestStepConfig | TransformStepConfig;

export function isRequestConfig(
  config: StepConfig | null | undefined,
): config is RequestStepConfig {
  if (!config || typeof config !== "object") return false;
  return config.type === "request" || !("type" in config) || config.type === undefined;
}

export function isTransformConfig(
  config: StepConfig | null | undefined,
): config is TransformStepConfig {
  return config?.type === "transform";
}

export type FailureBehavior = "fail" | "continue";

export interface ToolStep {
  id: string;
  config: StepConfig;
  instruction?: string;
  modify?: boolean;
  dataSelector?: string;
  failureBehavior?: FailureBehavior;
}

export interface ResponseFilter {
  id: string;
  name?: string;
  enabled: boolean;
  target: "KEYS" | "VALUES" | "BOTH";
  pattern: string;
  action: "REMOVE" | "MASK" | "FAIL";
  maskValue?: string;
  scope?: "FIELD" | "ITEM" | "ENTRY";
}

export interface Tool {
  id: string;
  name?: string;
  steps: ToolStep[];
  outputTransform?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  instruction?: string;
  responseFilters?: ResponseFilter[];
}

export interface ToolStepResult {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  tool: Tool;
  stepResults: ToolStepResult[];
}

export interface System {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  credentials?: Record<string, unknown>;
}

export interface TunnelPortMappings {
  [systemId: string]: {
    port: number;
    protocol: string;
  };
}

export interface Role {
  id: string;
  name: string;
  tools: "ALL" | string[];
  systems: "ALL" | Record<string, unknown>;
}

/**
 * Payload sent from Node.js to Deno subprocess via stdin (MessagePack encoded)
 */
export interface WorkflowPayload {
  runId: string;
  workflow: Tool;
  payload?: Record<string, unknown>;
  credentials?: Record<string, string>;
  options?: RequestOptions;
  systems: System[];
  orgId: string;
  traceId?: string;
  userEmail?: string;
  tunnelMappings?: TunnelPortMappings;
  userRoles: Role[];
  requestSource?: string;
}

/**
 * Result sent from Deno subprocess to Node.js via stdout (MessagePack encoded)
 */
export interface WorkflowResult {
  runId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  stepResults: ToolStepResult[];
  tool?: Tool;
  startedAt: string;
  completedAt: string;
}

/**
 * Internal step execution result
 */
export interface StepExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Transform execution result
 */
export interface TransformResult {
  success: boolean;
  code: string;
  data?: unknown;
  error?: string;
}

/**
 * Defaults for Deno runtime (will be passed from Node.js or use these defaults)
 */
export const DENO_DEFAULTS = {
  TRANSFORM_TIMEOUT_MS: 600_000, // 10 minutes
  STEP_TIMEOUT_MS: 3_600_000, // 1 hour
  WORKFLOW_TIMEOUT_MS: 21_600_000, // 6 hours
  HTTP: {
    DEFAULT_TIMEOUT: 3_600_000, // 1 hour
    DEFAULT_RETRY_DELAY_MS: 1000,
    MAX_RATE_LIMIT_WAIT_MS: 3_600_000, // 1 hour
  },
  POSTGRES: {
    DEFAULT_TIMEOUT: 600_000, // 10 minutes
    DEFAULT_RETRIES: 0,
    DEFAULT_RETRY_DELAY: 1000,
  },
  FTP: {
    DEFAULT_TIMEOUT: 600_000, // 10 minutes
    DEFAULT_RETRIES: 0,
    DEFAULT_RETRY_DELAY: 1000,
  },
  SMB: {
    DEFAULT_TIMEOUT: 600_000, // 10 minutes
    DEFAULT_RETRIES: 0,
    DEFAULT_RETRY_DELAY: 1000,
  },
  MSSQL: {
    DEFAULT_TIMEOUT: 600_000, // 10 minutes
    DEFAULT_RETRIES: 0,
    DEFAULT_RETRY_DELAY: 1000,
    POOL_IDLE_TIMEOUT: 10 * 60 * 1000, // 10 minutes
    POOL_CLEANUP_INTERVAL: 60 * 1000, // 1 minute
    CONNECTION_TIMEOUT: 30_000, // 30 seconds (increased for Azure SQL latency)
    POOL_MAX: 10,
    POOL_MIN: 0,
  },
  REDIS: {
    DEFAULT_TIMEOUT: 30_000, // 30 seconds
    DEFAULT_RETRIES: 0,
    DEFAULT_RETRY_DELAY: 1000,
  },
  MAX_CALL_RETRIES: 5,
  DEFAULT_LOOP_MAX_ITERS: 10_000,
  MAX_PAGINATION_REQUESTS: 1_000,
};
