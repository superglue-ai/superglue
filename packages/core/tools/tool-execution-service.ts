/**
 * Tool Execution Service
 *
 * Central service for executing tools. All tool execution flows through this service:
 * - REST API (/tools/:id/run)
 * - Scheduler (cron-triggered executions)
 * - Internal step execution (/tools/step/run)
 *
 * This service handles:
 * - Run lifecycle management (create, complete, abort)
 * - Tunnel setup for private systems
 * - Deno subprocess pool dispatch
 * - Webhook notifications
 *
 * Design principles:
 * - Single responsibility: orchestrates execution, delegates to specialized services
 * - Stateless: all state passed through parameters
 * - Testable: dependencies injected via context
 */

import {
  ExecutionFileEnvelope,
  RequestOptions,
  RequestSource,
  ServiceMetadata,
  Tool,
  ToolStepResult,
  validateExternalUrl,
} from "@superglue/shared";
import { DataStore } from "../datastore/types.js";
import { resolveUserRoles } from "../auth/role-resolver.js";
import { RunContext, RunLifecycleManager } from "../runs/run-lifecycle.js";
import { SystemManager } from "../systems/system-manager.js";
import { setupTunnelsForTool } from "../tunnel/index.js";
import { logMessage } from "../utils/logs.js";
import { notifyWebhook } from "../utils/webhook.js";
import type { ToolExecutionPayload, WorkerPools, ToolExecutionResult } from "../worker/types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Context required for tool execution.
 * Passed by the caller (API handler, REST resolver, scheduler).
 */
export interface ToolExecutionContext {
  /** Database access */
  datastore: DataStore;
  /** Worker pools for async execution */
  workerPools: WorkerPools;
  /** Organization ID */
  orgId: string;
  /** Service metadata (traceId, userId, etc.) */
  metadata: ServiceMetadata;
  /** Where this execution originated from */
  requestSource: RequestSource;
}

/**
 * Callback for handling tool chain webhooks (tool:xxx URLs).
 * Called when a tool completes and has a tool: webhook configured.
 */
export type ToolChainCallback = (
  chainToolId: string,
  resultData: unknown,
  credentials?: Record<string, string>,
  options?: RequestOptions,
  mode?: "dev" | "prod",
) => void;

/**
 * Options for tool execution.
 */
export interface ExecuteToolOptions {
  /** Tool to execute */
  tool: Tool;
  /** Input payload for the tool */
  payload?: Record<string, unknown>;
  /** Uploaded file envelopes */
  files?: Record<string, ExecutionFileEnvelope>;
  /** Internal-only: return produced file envelopes inline for step-by-step execution */
  returnProducedFiles?: boolean;
  /** Credentials to use (merged with system credentials) */
  credentials?: Record<string, string>;
  /** Request options (timeout, webhook, etc.) */
  requestOptions?: RequestOptions;
  /** Whether to create a run record (default: true) */
  createRun?: boolean;
  /** Client-provided run ID (optional) */
  runId?: string;
  /** User ID who triggered this execution */
  userId?: string;
  /** Callback for tool: chain webhooks (only needed for REST API chaining) */
  onToolChain?: ToolChainCallback;
  /** Execution mode for system resolution (default: prod) */
  mode?: "dev" | "prod";
}

/**
 * Result of tool execution.
 */
export interface ExecuteToolResult {
  /** Run ID (if createRun was true) */
  runId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Output data from the tool */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Results from each step */
  stepResults: ToolStepResult[];
  /** Internal-only live produced file envelopes for step-by-step chaining */
  producedFiles?: Record<string, ExecutionFileEnvelope>;
  /** Updated tool configuration (may include self-healed changes) */
  tool?: Tool;
  /** When execution started */
  startedAt: Date;
  /** When execution completed */
  completedAt: Date;
}

// ============================================================================
// Webhook Handling
// ============================================================================

/**
 * Handle webhook notification after tool execution.
 * Supports both HTTP webhooks and tool: chain webhooks.
 */
function handleWebhookNotification({
  webhookUrl,
  toolId,
  runId,
  success,
  data,
  error,
  credentials,
  requestOptions,
  metadata,
  onToolChain,
  mode,
}: {
  webhookUrl: string;
  toolId: string;
  runId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  credentials?: Record<string, string>;
  requestOptions?: RequestOptions;
  metadata: ServiceMetadata;
  onToolChain?: ToolChainCallback;
  mode?: "dev" | "prod";
}): void {
  if (webhookUrl.startsWith("http")) {
    // Validate webhook URL against SSRF before making any request
    try {
      validateExternalUrl(webhookUrl);
    } catch (err) {
      logMessage(
        "warn",
        `Webhook URL rejected (SSRF protection): ${(err as Error).message}`,
        metadata,
      );
      return;
    }
    // HTTP webhook - fire and forget
    notifyWebhook(webhookUrl, runId, success, data, error, metadata);
  } else if (webhookUrl.startsWith("tool:")) {
    // Tool chain webhook
    const chainToolId = webhookUrl.split(":")[1];
    if (chainToolId === toolId) {
      logMessage("warn", "Tool cannot trigger itself", metadata);
      return;
    }
    if (onToolChain) {
      // Use callback for chaining (REST API provides this)
      onToolChain(
        chainToolId,
        data,
        credentials,
        { ...requestOptions, webhookUrl: undefined },
        mode,
      );
    } else {
      // No callback provided - log warning (scheduler don't support tool: chains)
      logMessage(
        "warn",
        `Tool chain webhook (tool:${chainToolId}) not supported in this context`,
        metadata,
      );
    }
  }
}

// ============================================================================
// Tool Execution Service
// ============================================================================

/**
 * Execute a tool with full run lifecycle management.
 *
 * This is the primary entry point for tool execution. It:
 * 1. Resolves systems needed by the tool
 * 2. Creates a run record (if createRun is true)
 * 3. Sets up tunnels for private systems
 * 4. Dispatches to Deno subprocess pool
 * 5. Completes the run and sends notifications
 *
 * @param ctx - Execution context (datastore, worker pools, etc.)
 * @param options - Tool and execution options
 * @returns Execution result
 */
export async function executeTool(
  ctx: ToolExecutionContext,
  options: ExecuteToolOptions,
): Promise<ExecuteToolResult> {
  const {
    tool,
    payload = {},
    files = {},
    returnProducedFiles = false,
    credentials = {},
    requestOptions = {},
    createRun = true,
    runId: clientRunId,
    userId,
    onToolChain,
    mode = "prod",
  } = options;

  const startedAt = new Date();
  const runId = clientRunId || crypto.randomUUID();

  // Resolve systems for this tool based on execution mode
  const systemManagers = await SystemManager.forToolExecution(
    tool,
    ctx.datastore,
    ctx.metadata,
    mode,
  );
  const systems = systemManagers.map((m) => m.toSystemSync());

  // Set up run lifecycle manager
  const lifecycle = createRun
    ? new RunLifecycleManager(ctx.datastore, ctx.orgId, ctx.metadata)
    : null;

  let runContext: RunContext | null = null;
  let tunnelCleanups: Array<() => void> = [];

  try {
    // Start run record if requested
    if (lifecycle) {
      runContext = await lifecycle.startRun({
        runId,
        tool,
        payload,
        options: requestOptions,
        requestSource: ctx.requestSource,
        userId,
        executionMode: mode,
      });
    }

    // Set up tunnels for private systems (must happen in main thread)
    const tunnelResult = await setupTunnelsForTool({
      tool,
      systems,
      orgId: ctx.orgId,
      metadata: ctx.metadata,
    });
    tunnelCleanups = tunnelResult.cleanups;

    const userRoles = await resolveUserRoles({
      userId: ctx.metadata.userId,
      orgId: ctx.orgId,
      datastore: ctx.datastore,
    });

    // Build worker payload
    const taskPayload: ToolExecutionPayload = {
      runId,
      workflow: tool,
      payload,
      files,
      returnProducedFiles,
      credentials,
      options: requestOptions,
      systems,
      orgId: ctx.orgId,
      traceId: ctx.metadata.traceId,
      userEmail: ctx.metadata.userEmail,
      tunnelMappings: tunnelResult.tunnelMappings,
      userRoles,
      requestSource: ctx.requestSource,
    };

    // Execute in Deno subprocess pool
    const denoResult = await ctx.workerPools.toolExecution.runTask(runId, taskPayload);

    // Convert Deno result to ToolExecutionResult
    const executionResult: ToolExecutionResult = {
      runId: denoResult.runId,
      success: denoResult.success,
      data: denoResult.data,
      error: denoResult.error,
      stepResults: denoResult.stepResults,
      producedFiles: denoResult.producedFiles,
      tool: denoResult.tool,
      startedAt: new Date(denoResult.startedAt),
      completedAt: new Date(denoResult.completedAt),
    };

    // Complete run record
    if (lifecycle && runContext) {
      await lifecycle.completeRun(runContext, {
        success: executionResult.success,
        tool: executionResult.tool || tool,
        data: executionResult.data,
        error: executionResult.error,
        stepResults: executionResult.stepResults,
        payload,
      });
    }

    // Send webhook notification if configured
    if (requestOptions.webhookUrl) {
      handleWebhookNotification({
        webhookUrl: requestOptions.webhookUrl,
        toolId: tool.id,
        runId,
        success: executionResult.success,
        data: executionResult.data,
        error: executionResult.error,
        credentials,
        requestOptions,
        metadata: ctx.metadata,
        onToolChain,
        mode,
      });
    }

    return {
      runId,
      success: executionResult.success,
      data: executionResult.data,
      error: executionResult.error,
      stepResults: executionResult.stepResults,
      producedFiles: executionResult.producedFiles,
      tool: executionResult.tool,
      startedAt,
      completedAt: new Date(),
    };
  } catch (error: any) {
    const isAborted = error.name === "AbortError";
    const completedAt = new Date();

    // Handle run completion/abort
    if (lifecycle && runContext) {
      if (isAborted) {
        await lifecycle.abortRun(runContext, String(error));
      } else {
        await lifecycle.completeRun(runContext, {
          success: false,
          tool,
          error: String(error),
          stepResults: error.stepResults,
          payload,
        });
      }
    } else if (lifecycle) {
      // Run was never started, use fallback
      await lifecycle.failRunWithoutContext(
        runId,
        tool.id,
        tool,
        String(error),
        startedAt,
        ctx.requestSource,
      );
    }

    logMessage("error", `Tool execution failed: ${error}`, ctx.metadata);

    return {
      runId,
      success: false,
      error: String(error),
      stepResults: error.stepResults || [],
      tool,
      startedAt,
      completedAt,
    };
  } finally {
    // Always clean up tunnels
    for (const cleanup of tunnelCleanups) {
      try {
        cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Execute a tool asynchronously (fire-and-forget).
 *
 * Used by the REST API for non-blocking execution.
 * Returns immediately with the run ID and start time.
 *
 * @param ctx - Execution context
 * @param options - Tool and execution options
 * @returns Run ID and start time for tracking
 */
export async function executeToolAsync(
  ctx: ToolExecutionContext,
  options: ExecuteToolOptions,
): Promise<{ runId: string; startedAt: Date }> {
  const runId = options.runId || crypto.randomUUID();
  const startedAt = new Date();

  // Fire and forget - don't await
  executeTool(ctx, { ...options, runId }).catch((error) => {
    // Errors are already handled inside executeTool (run lifecycle, logging)
    // This catch is just to prevent unhandled promise rejection
    logMessage("debug", `Background tool execution completed with error: ${error}`, ctx.metadata);
  });

  return { runId, startedAt };
}

/**
 * Abort a running tool execution.
 *
 * @param ctx - Execution context
 * @param runId - Run ID to abort (should match the runId used when starting execution)
 */
export function abortExecution(ctx: ToolExecutionContext, runId: string): void {
  ctx.workerPools.toolExecution.abortTask(runId);
}
