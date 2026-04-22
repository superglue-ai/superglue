/**
 * Workflow Executor for Deno runtime
 *
 * Main entry point for executing tool workflows in a Deno subprocess.
 * Receives workflow payload via stdin (MessagePack), executes all steps,
 * and returns results via stdout (MessagePack).
 */

import type {
  ExecutionFileEnvelope,
  RuntimeExecutionFile,
  WorkflowPayload,
  WorkflowResult,
  ToolStep,
  ToolStepResult,
  StepExecutionResult,
  RequestStepConfig,
  TransformStepConfig,
  ServiceMetadata,
  System,
  TunnelPortMappings,
  ResponseFilter,
} from "./types.ts";
import { DENO_DEFAULTS, isRequestConfig, isTransformConfig } from "./types.ts";
import { readPayload, writeResult } from "./utils/ipc.ts";
import { info, error as logError, debug, warn } from "./utils/logging.ts";
import { executeTransform, replaceVariables } from "./utils/transform.ts";
import {
  applyResponseFilters,
  FilterMatchError,
  FilterTarget,
  FilterAction,
  RemoveScope,
} from "./utils/response-filters.ts";
import { validateSchema } from "./utils/schema-validation.ts";
import {
  assertFileSupportsInlineStepResponse,
  createRuntimeExecutionFileViewMap,
  decodeExecutionFileEnvelope,
  encodeExecutionFileEnvelope,
} from "./utils/files.ts";

// Strategy imports
import { executeHttpStep } from "./strategies/http.ts";
import { executePostgresStep, closeAllPools as closePostgresPools } from "./strategies/postgres.ts";
import { executeRedisStep } from "./strategies/redis.ts";
import { executeFtpStep } from "./strategies/ftp.ts";
import { executeSmbStep } from "./strategies/smb.ts";
import { executeMssqlStep, closeAllPools as closeMssqlPools } from "./strategies/mssql.ts";
import { executeTransformStep } from "./strategies/transform.ts";

type StepEnvelopeData = {
  currentItem: unknown;
  data: unknown;
  stepFileKeys?: string[];
  success: boolean;
  error?: string;
};

function serializeProducedFiles(
  files: Record<string, RuntimeExecutionFile>,
  options?: { enforceInlineSizeLimit?: boolean },
): Record<string, ExecutionFileEnvelope> | undefined {
  if (Object.keys(files).length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(files).map(([key, file]) => {
      if (options?.enforceInlineSizeLimit) {
        assertFileSupportsInlineStepResponse(file, { ref: key });
      }
      return [key, encodeExecutionFileEnvelope(file)];
    }),
  );
}

function formatFileNameSegment(fileName: string): string {
  return `[${JSON.stringify(fileName)}]`;
}

function aliasProducedFiles(params: {
  stepId: string;
  producedFiles?: Record<string, RuntimeExecutionFile>;
  iterationIndex?: number;
}): {
  stepFileKeys: string[];
  aliasedFiles: Record<string, RuntimeExecutionFile>;
} {
  const { stepId, producedFiles, iterationIndex } = params;
  if (!producedFiles || Object.keys(producedFiles).length === 0) {
    return { stepFileKeys: [], aliasedFiles: {} };
  }

  const entries = Object.entries(producedFiles);
  const root = iterationIndex === undefined ? stepId : `${stepId}[${iterationIndex}]`;

  if (entries.length === 1) {
    const [, file] = entries[0];
    return {
      stepFileKeys: [root],
      aliasedFiles: { [root]: file },
    };
  }

  const aliasedFiles = Object.fromEntries(
    entries.map(([fileName, file]) => [`${root}${formatFileNameSegment(fileName)}`, file]),
  );

  return {
    stepFileKeys: Object.keys(aliasedFiles),
    aliasedFiles,
  };
}

/**
 * Determine which strategy to use based on the resolved URL
 */
function getStrategyForUrl(
  url: string,
): "http" | "postgres" | "mssql" | "redis" | "ftp" | "smb" | null {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "http";
  }
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return "postgres";
  }
  if (url.startsWith("mssql://") || url.startsWith("sqlserver://")) {
    return "mssql";
  }
  if (url.startsWith("redis://") || url.startsWith("rediss://")) {
    return "redis";
  }
  if (url.startsWith("ftp://") || url.startsWith("ftps://") || url.startsWith("sftp://")) {
    return "ftp";
  }
  if (url.startsWith("smb://")) {
    return "smb";
  }
  return null;
}

/**
 * Apply tunnel mappings to a URL for a specific system
 * Rewrites the URL to use localhost:tunnelPort while preserving path, query, and credentials
 */
function applyTunnelMappings(
  url: string,
  systemId: string | undefined,
  tunnelMappings?: TunnelPortMappings,
): string {
  if (!tunnelMappings || !systemId) return url;

  const mapping = tunnelMappings[systemId];
  if (!mapping) return url;

  // Protocol mapping for tunnel URL rewriting
  const TUNNEL_PROTOCOL_MAP: Record<string, string> = {
    http: "http",
    https: "http", // Tunnel handles TLS termination
    postgres: "postgres",
    postgresql: "postgres",
    mssql: "mssql",
    sqlserver: "mssql",
    redis: "redis",
    rediss: "redis",
    mysql: "mysql",
    sftp: "sftp",
    ftp: "ftp",
    ftps: "ftp", // Tunnel handles TLS termination
    smb: "smb",
  };

  const scheme = TUNNEL_PROTOCOL_MAP[mapping.protocol.toLowerCase()] || "http";

  try {
    const parsedUrl = new URL(url);
    const userinfo = parsedUrl.username
      ? `${parsedUrl.username}${parsedUrl.password ? `:${parsedUrl.password}` : ""}@`
      : "";
    return `${scheme}://${userinfo}127.0.0.1:${mapping.port}${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return `${scheme}://127.0.0.1:${mapping.port}`;
  }
}

/**
 * Flatten and namespace credentials from systems
 * Creates keys like "systemId_credentialKey" for template variable access
 */
function flattenAndNamespaceCredentials(systems: System[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const sys of systems) {
    if (sys.credentials) {
      for (const [key, value] of Object.entries(sys.credentials)) {
        result[`${sys.id}_${key}`] = value as string;
      }
    }
  }
  return result;
}

/**
 * Flatten and namespace system URLs
 * Creates keys like "systemId_url" for template variable access
 */
function flattenAndNamespaceSystemUrls(systems: System[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const sys of systems) {
    if (sys.url) {
      result[`${sys.id}_url`] = sys.url;
    }
  }
  return result;
}

/**
 * Get credentials for a step from systems
 * For request steps with systemId: loads that system's credentials (namespaced)
 * For transform steps (no systemId): loads ALL systems' credentials (namespaced)
 */
function getCredentialsForStep(
  step: ToolStep,
  systems: System[],
  globalCredentials: Record<string, string>,
): Record<string, unknown> {
  const config = step.config;

  // For transform steps, load credentials from ALL systems
  if (!isRequestConfig(config)) {
    const allSystemCredentials = flattenAndNamespaceCredentials(systems);
    const allSystemUrls = flattenAndNamespaceSystemUrls(systems);
    return { ...globalCredentials, ...allSystemCredentials, ...allSystemUrls };
  }

  // For request steps with a specific systemId, load that system's credentials
  if (config.systemId) {
    const system = systems.find((s) => s.id === config.systemId);
    if (system) {
      const systemCredentials = flattenAndNamespaceCredentials([system]);
      const systemUrls = flattenAndNamespaceSystemUrls([system]);
      return { ...globalCredentials, ...systemCredentials, ...systemUrls };
    }
  }

  // No systemId specified - load all systems' credentials
  const allSystemCredentials = flattenAndNamespaceCredentials(systems);
  const allSystemUrls = flattenAndNamespaceSystemUrls(systems);
  return { ...globalCredentials, ...allSystemCredentials, ...allSystemUrls };
}

/**
 * Execute a single step with timeout
 */
async function executeStepWithTimeout(
  step: ToolStep,
  inputData: Record<string, unknown>,
  fileStore: Record<string, RuntimeExecutionFile>,
  credentials: Record<string, unknown>,
  options: { timeout?: number; retries?: number; retryDelay?: number },
  metadata: ServiceMetadata,
  tunnelMappings?: TunnelPortMappings,
): Promise<StepExecutionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DENO_DEFAULTS.STEP_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      executeStep(step, inputData, fileStore, credentials, options, metadata, tunnelMappings),
      new Promise<StepExecutionResult>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(
            new Error(`Step timed out after ${DENO_DEFAULTS.STEP_TIMEOUT_MS / 1000 / 60} minutes`),
          );
        });
      }),
    ]);
    return result;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Execute a single step
 */
async function executeStep(
  step: ToolStep,
  inputData: Record<string, unknown>,
  fileStore: Record<string, RuntimeExecutionFile>,
  credentials: Record<string, unknown>,
  options: { timeout?: number; retries?: number; retryDelay?: number },
  metadata: ServiceMetadata,
  tunnelMappings?: TunnelPortMappings,
): Promise<StepExecutionResult> {
  const config = step.config;

  // Handle transform steps
  if (isTransformConfig(config)) {
    return executeTransformStep(config as TransformStepConfig, inputData, credentials, metadata);
  }

  // Handle request steps
  if (!isRequestConfig(config)) {
    return { success: false, error: "Unknown step config type" };
  }

  const requestConfig = config as RequestStepConfig;

  // Resolve URL with variables
  const allVars = { ...inputData, ...credentials };
  let resolvedUrl = await replaceVariables(requestConfig.url || "", allVars, metadata);

  // Apply tunnel mappings if this step has a systemId
  resolvedUrl = applyTunnelMappings(resolvedUrl, requestConfig.systemId, tunnelMappings);

  // Determine strategy
  const strategy = getStrategyForUrl(resolvedUrl);

  if (!strategy) {
    return { success: false, error: `Unsupported URL protocol: ${resolvedUrl}` };
  }

  // Create config with resolved URL
  const resolvedConfig: RequestStepConfig = {
    ...requestConfig,
    url: resolvedUrl,
  };

  switch (strategy) {
    case "http":
      return executeHttpStep(
        resolvedConfig,
        inputData,
        fileStore,
        credentials,
        options,
        metadata,
        step.id,
      );
    case "postgres":
      return executePostgresStep(resolvedConfig, inputData, credentials, options, metadata);
    case "mssql":
      return executeMssqlStep(resolvedConfig, inputData, credentials, options, metadata);
    case "redis":
      return executeRedisStep(resolvedConfig, inputData, credentials, options, metadata);
    case "ftp":
      return executeFtpStep(
        resolvedConfig,
        inputData,
        fileStore,
        credentials,
        options,
        metadata,
        step.id,
      );
    case "smb":
      return executeSmbStep(
        resolvedConfig,
        inputData,
        fileStore,
        credentials,
        options,
        metadata,
        step.id,
      );
    default:
      return { success: false, error: `Unknown strategy: ${strategy}` };
  }
}

/**
 * Execute a step with loop support (dataSelector)
 */
async function executeStepWithLoop(
  step: ToolStep,
  inputData: Record<string, unknown>,
  fileStore: Record<string, RuntimeExecutionFile>,
  credentials: Record<string, unknown>,
  options: { timeout?: number; retries?: number; retryDelay?: number },
  metadata: ServiceMetadata,
  tunnelMappings?: TunnelPortMappings,
): Promise<StepExecutionResult> {
  // If no dataSelector, execute once
  if (!step.dataSelector) {
    const result = await executeStepWithTimeout(
      step,
      inputData,
      fileStore,
      credentials,
      options,
      metadata,
      tunnelMappings,
    );
    const aliasedFiles = aliasProducedFiles({
      stepId: step.id,
      producedFiles: result.producedFiles,
    });
    return {
      ...result,
      data: {
        currentItem: {},
        data: result.data,
        ...(aliasedFiles.stepFileKeys.length > 0
          ? { stepFileKeys: aliasedFiles.stepFileKeys }
          : {}),
        success: result.success,
      },
      producedFiles: aliasedFiles.aliasedFiles,
      stepFileKeys: aliasedFiles.stepFileKeys,
    };
  }

  // Execute dataSelector to get items to iterate over
  const selectorResult = await executeTransform(inputData, step.dataSelector, metadata);
  if (!selectorResult.success) {
    return { success: false, error: `Data selector failed: ${selectorResult.error}` };
  }

  const items = selectorResult.data;
  if (!Array.isArray(items)) {
    const itemData = { ...inputData, currentItem: items };
    const result = await executeStepWithTimeout(
      step,
      itemData,
      fileStore,
      credentials,
      options,
      metadata,
      tunnelMappings,
    );
    const aliasedFiles = aliasProducedFiles({
      stepId: step.id,
      producedFiles: result.producedFiles,
    });
    return {
      ...result,
      data: {
        currentItem: items,
        data: result.data,
        ...(aliasedFiles.stepFileKeys.length > 0
          ? { stepFileKeys: aliasedFiles.stepFileKeys }
          : {}),
        success: result.success,
      },
      producedFiles: aliasedFiles.aliasedFiles,
      stepFileKeys: aliasedFiles.stepFileKeys,
    };
  }

  const results: StepEnvelopeData[] = [];
  const aggregatedFiles: Record<string, RuntimeExecutionFile> = {};
  const aggregatedKeys: string[] = [];
  const maxIters = DENO_DEFAULTS.DEFAULT_LOOP_MAX_ITERS;

  for (let i = 0; i < Math.min(items.length, maxIters); i++) {
    const item = items[i];
    const itemData = { ...inputData, currentItem: item };

    debug(`Executing loop iteration ${i + 1}/${items.length}`, metadata);

    const result = await executeStepWithTimeout(
      step,
      itemData,
      fileStore,
      credentials,
      options,
      metadata,
      tunnelMappings,
    );

    if (!result.success && step.failureBehavior !== "continue") {
      return result;
    }

    const aliasedFiles = aliasProducedFiles({
      stepId: step.id,
      producedFiles: result.producedFiles,
      iterationIndex: i,
    });

    results.push({
      currentItem: item,
      data: result.success ? result.data : null,
      ...(aliasedFiles.stepFileKeys.length > 0 ? { stepFileKeys: aliasedFiles.stepFileKeys } : {}),
      success: result.success,
      ...(result.error ? { error: result.error } : {}),
    });
    Object.assign(aggregatedFiles, aliasedFiles.aliasedFiles);
    aggregatedKeys.push(...aliasedFiles.stepFileKeys);
  }

  const allSuccess = results.every((r) => r.success);
  return {
    success: allSuccess || step.failureBehavior === "continue",
    data: results,
    producedFiles: aggregatedFiles,
    stepFileKeys: aggregatedKeys,
  };
}

/**
 * Execute the entire workflow
 */
async function executeWorkflow(payload: WorkflowPayload): Promise<WorkflowResult> {
  const startedAt = new Date().toISOString();
  const metadata: ServiceMetadata = {
    traceId: payload.traceId,
    orgId: payload.orgId,
    userEmail: payload.userEmail,
  };

  info(`Starting workflow execution: ${payload.workflow.name || payload.workflow.id}`, metadata);

  const stepResults: ToolStepResult[] = [];
  const fileStore: Record<string, RuntimeExecutionFile> = Object.fromEntries(
    Object.entries(payload.files || {}).map(([key, envelope]) => [
      key,
      decodeExecutionFileEnvelope(envelope),
    ]),
  );
  const producedFileStore: Record<string, RuntimeExecutionFile> = {};
  let currentData: Record<string, unknown> = {
    ...(payload.payload || {}),
    // Intentionally share raw byte references here to avoid duplicating large files in memory.
    // Transform/output code should treat sourceData.__files__ as read-only.
    __files__: createRuntimeExecutionFileViewMap(fileStore),
  };
  let lastSuccessfulData: unknown = currentData;
  let serializedProducedFiles: Record<string, ExecutionFileEnvelope> | undefined;

  try {
    // Execute each step sequentially
    for (const step of payload.workflow.steps) {
      debug(`Executing step: ${step.id}`, metadata);

      // Get credentials for this step
      const stepCredentials = getCredentialsForStep(
        step,
        payload.systems,
        payload.credentials || {},
      );

      // Execute the step
      const result = await executeStepWithLoop(
        step,
        currentData,
        fileStore,
        stepCredentials,
        payload.options || {},
        metadata,
        payload.tunnelMappings,
      );

      stepResults.push({
        stepId: step.id,
        success: result.success,
        data: result.data,
        error: result.error,
        ...(result.stepFileKeys && result.stepFileKeys.length > 0
          ? { stepFileKeys: result.stepFileKeys }
          : {}),
      });

      if (!result.success) {
        if (step.failureBehavior === "continue") {
          warn(`Step ${step.id} failed but continuing: ${result.error}`, metadata);
          continue;
        }

        logError(`Step ${step.id} failed: ${result.error}`, metadata);
        if (payload.returnProducedFiles) {
          serializedProducedFiles = serializeProducedFiles(producedFileStore, {
            enforceInlineSizeLimit: true,
          });
        }
        return {
          runId: payload.runId,
          success: false,
          error: `Step ${step.id} failed: ${result.error}`,
          stepResults,
          ...(serializedProducedFiles ? { producedFiles: serializedProducedFiles } : {}),
          tool: payload.workflow,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      if (result.producedFiles && Object.keys(result.producedFiles).length > 0) {
        Object.assign(fileStore, result.producedFiles);
        Object.assign(producedFileStore, result.producedFiles);
      }

      currentData = {
        ...currentData,
        __files__: createRuntimeExecutionFileViewMap(fileStore),
      };

      if (result.data !== undefined) {
        currentData = { ...currentData, [step.id]: result.data };
      }

      if (
        result.data &&
        typeof result.data === "object" &&
        !Array.isArray(result.data) &&
        "currentItem" in (result.data as Record<string, unknown>)
      ) {
        lastSuccessfulData = (result.data as { data: unknown }).data;
      } else {
        lastSuccessfulData = result.data;
      }
    }

    // Apply output transform if specified
    let finalData = lastSuccessfulData;
    const hasOutputProcessing =
      payload.workflow.outputTransform ||
      payload.workflow.outputSchema ||
      (payload.workflow.responseFilters && payload.workflow.responseFilters.length > 0);

    if (hasOutputProcessing) {
      // Apply output transform
      if (payload.workflow.outputTransform) {
        debug("Applying output transform", metadata);
        const transformResult = await executeTransform(
          currentData,
          payload.workflow.outputTransform,
          metadata,
        );

        if (!transformResult.success) {
          if (payload.returnProducedFiles) {
            serializedProducedFiles = serializeProducedFiles(producedFileStore, {
              enforceInlineSizeLimit: true,
            });
          }
          return {
            runId: payload.runId,
            success: false,
            error: `Output transform failed: ${transformResult.error}`,
            stepResults,
            ...(serializedProducedFiles ? { producedFiles: serializedProducedFiles } : {}),
            tool: payload.workflow,
            startedAt,
            completedAt: new Date().toISOString(),
          };
        }

        finalData = transformResult.data;
      }

      // Validate against output schema
      if (payload.workflow.outputSchema) {
        debug("Validating output schema", metadata);
        const validationResult = validateSchema(finalData, payload.workflow.outputSchema);
        if (!validationResult.success) {
          if (payload.returnProducedFiles) {
            serializedProducedFiles = serializeProducedFiles(producedFileStore, {
              enforceInlineSizeLimit: true,
            });
          }
          return {
            runId: payload.runId,
            success: false,
            error: `Output schema validation failed: ${validationResult.error}`,
            stepResults,
            ...(serializedProducedFiles ? { producedFiles: serializedProducedFiles } : {}),
            tool: payload.workflow,
            startedAt,
            completedAt: new Date().toISOString(),
          };
        }
      }

      // Apply response filters
      if (payload.workflow.responseFilters && payload.workflow.responseFilters.length > 0) {
        debug("Applying response filters", metadata);
        // Convert to internal filter format
        const filters = payload.workflow.responseFilters.map((f: ResponseFilter) => ({
          ...f,
          target: f.target as unknown as FilterTarget,
          action: f.action as unknown as FilterAction,
          scope: f.scope as unknown as RemoveScope | undefined,
        }));

        const filterResult = applyResponseFilters(finalData, filters);

        if (filterResult.failedFilters.length > 0) {
          const error = new FilterMatchError(filterResult.failedFilters);
          if (payload.returnProducedFiles) {
            serializedProducedFiles = serializeProducedFiles(producedFileStore, {
              enforceInlineSizeLimit: true,
            });
          }
          return {
            runId: payload.runId,
            success: false,
            error: error.message,
            stepResults,
            ...(serializedProducedFiles ? { producedFiles: serializedProducedFiles } : {}),
            tool: payload.workflow,
            startedAt,
            completedAt: new Date().toISOString(),
          };
        }

        finalData = filterResult.data;

        if (filterResult.matches.length > 0) {
          info(`Response filters applied: ${filterResult.matches.length} match(es)`, metadata);
        }
      }
    }

    info(`Workflow completed successfully`, metadata);
    if (payload.returnProducedFiles) {
      serializedProducedFiles = serializeProducedFiles(producedFileStore, {
        enforceInlineSizeLimit: true,
      });
    }

    return {
      runId: payload.runId,
      success: true,
      data: finalData,
      stepResults,
      ...(serializedProducedFiles ? { producedFiles: serializedProducedFiles } : {}),
      tool: payload.workflow,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    logError(`Workflow execution error: ${(err as Error).message}`, metadata);
    if (payload.returnProducedFiles && !serializedProducedFiles) {
      serializedProducedFiles = serializeProducedFiles(producedFileStore, {
        enforceInlineSizeLimit: true,
      });
    }
    return {
      runId: payload.runId,
      success: false,
      error: (err as Error).message,
      stepResults,
      ...(serializedProducedFiles ? { producedFiles: serializedProducedFiles } : {}),
      tool: payload.workflow,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } finally {
    // Cleanup
    await closePostgresPools();
    await closeMssqlPools();
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Read payload from stdin
    const payload = await readPayload();

    // Execute workflow
    const result = await executeWorkflow(payload);

    // Write result to stdout (await to ensure full flush)
    await writeResult(result);

    // Exit successfully - this is critical for Node.js to receive the 'end' event
    Deno.exit(0);
  } catch (err) {
    // Write error result
    const errorResult: WorkflowResult = {
      runId: "unknown",
      success: false,
      error: `Fatal error: ${(err as Error).message}`,
      stepResults: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    await writeResult(errorResult);
    Deno.exit(1);
  }
}

// Run main
main();
