/**
 * RunLifecycleManager - Centralized run creation, completion, and notifications.
 * Context is passed through (not stored) for stateless operation.
 */

import type { RequestOptions, RequestSource, Tool, ToolStepResult } from "@superglue/shared";
import { RunStatus, RequestSource as RSrc, sampleResultObject } from "@superglue/shared";
import type { DataStore } from "../datastore/types.js";
import { NotificationService } from "../notifications/index.js";
import { logMessage } from "../utils/logs.js";

// Max size for payload/result stored in DB (10KB) - full data goes to S3
const MAX_DB_PAYLOAD_SIZE = 10 * 1024;

/**
 * Truncate a payload for DB storage. If too large, sample it.
 * Returns null if even sampled version is too large.
 */
export function truncateForDB(
  payload: Record<string, unknown>,
  maxSize: number = MAX_DB_PAYLOAD_SIZE,
): Record<string, unknown> | null {
  const json = JSON.stringify(payload);
  if (json.length <= maxSize) {
    return payload;
  }
  const sampled = sampleResultObject(payload, 3);
  const sampledJson = JSON.stringify(sampled);

  // If still too large, return null
  if (sampledJson.length > maxSize) {
    return null;
  }
  return sampled;
}

export interface StartRunParams {
  runId?: string;
  tool: Tool;
  payload?: Record<string, unknown>;
  options?: RequestOptions;
  requestSource: RequestSource;
}

export interface RunContext {
  runId: string;
  toolId: string;
  tool: Tool;
  startedAt: Date;
  requestSource: RequestSource;
  options?: RequestOptions;
}

export interface CompleteRunParams {
  success: boolean;
  tool?: Tool; // Updated tool config
  data?: any; // Tool result data
  error?: string;
  stepResults?: ToolStepResult[];
  payload?: Record<string, unknown>;
}

// Sources that should NOT trigger notifications (handled by their own UI)
const NOTIFICATION_EXCLUDED_SOURCES: RequestSource[] = [RSrc.FRONTEND, RSrc.MCP];

export class RunLifecycleManager {
  private datastore: DataStore;
  private orgId: string;
  private metadata: { orgId: string; traceId?: string };

  constructor(datastore: DataStore, orgId: string, metadata: { orgId?: string; traceId?: string }) {
    this.datastore = datastore;
    this.orgId = orgId;
    this.metadata = { orgId, traceId: metadata.traceId };
  }

  /**
   * Start a new run - creates the run record in the database
   * Returns the full context needed for completeRun/abortRun
   */
  async startRun(params: StartRunParams): Promise<RunContext> {
    const { tool, payload, options, requestSource } = params;
    const runId = params.runId || crypto.randomUUID();
    const startedAt = new Date();

    const context: RunContext = {
      runId,
      toolId: tool.id,
      tool,
      startedAt,
      requestSource,
      options,
    };

    await this.datastore.createRun({
      run: {
        runId,
        toolId: tool.id,
        status: RunStatus.RUNNING,
        tool,
        ...(payload !== undefined && { toolPayload: truncateForDB(payload) ?? undefined }),
        options,
        requestSource,
        metadata: {
          startedAt: startedAt.toISOString(),
        },
      },
      orgId: this.orgId,
    });

    logMessage("debug", `Run started: ${runId} for tool ${tool.id}`, this.metadata);

    return context;
  }

  /**
   * Complete a run - updates the database and sends notifications if needed
   * Handles both success and failure cases
   *
   * @param context - The context returned from startRun()
   * @param result - The execution result
   */
  async completeRun(context: RunContext, result: CompleteRunParams): Promise<void> {
    const completedAt = new Date();
    const status = result.success ? RunStatus.SUCCESS : RunStatus.FAILED;
    const finalTool = result.tool || context.tool;

    await this.datastore.updateRun({
      id: context.runId,
      orgId: this.orgId,
      updates: {
        status,
        tool: finalTool,
        toolPayload: result.payload,
        data: result.data,
        stepResults: result.stepResults,
        error: result.error,
        metadata: {
          startedAt: context.startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - context.startedAt.getTime(),
        },
      },
      // Full (non-truncated) data for S3 storage only
    });

    // Send notification for failed runs (fire-and-forget)
    if (!result.success) {
      this.sendFailureNotification(context, result, completedAt);
    }

    logMessage(
      "debug",
      `Run completed: ${context.runId} - ${result.success ? "success" : "failed"}`,
      this.metadata,
    );
  }

  /**
   * Mark a run as aborted - special case that doesn't send notifications
   *
   * @param context - The context returned from startRun()
   * @param error - Optional error message
   */
  async abortRun(context: RunContext, error?: string): Promise<void> {
    const completedAt = new Date();

    await this.datastore.updateRun({
      id: context.runId,
      orgId: this.orgId,
      updates: {
        status: RunStatus.ABORTED,
        tool: context.tool,
        error: error || `Aborted run with runId ${context.runId}`,
        metadata: {
          startedAt: context.startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - context.startedAt.getTime(),
        },
      },
    });

    // No notification for aborted runs
    logMessage("info", `Run aborted: ${context.runId}`, this.metadata);
  }

  /**
   * Handle run failure when we don't have context (e.g., error before startRun completed)
   * This is a fallback for edge cases where startRun() threw an error
   */
  async failRunWithoutContext(
    runId: string,
    toolId: string,
    tool: Tool | undefined,
    error: string,
    startedAt: Date,
    requestSource: RequestSource,
  ): Promise<void> {
    const completedAt = new Date();

    await this.datastore
      .updateRun({
        id: runId,
        orgId: this.orgId,
        updates: {
          status: RunStatus.FAILED,
          error,
          metadata: {
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
          },
        },
      })
      .catch(() => {
        // Run might not exist yet if startRun failed
      });

    // Still try to send notification
    if (!NOTIFICATION_EXCLUDED_SOURCES.includes(requestSource)) {
      const notificationService = new NotificationService(this.datastore);
      notificationService
        .processRunCompletion({
          run: {
            runId,
            toolId,
            tool,
            status: RunStatus.FAILED,
            error,
            metadata: {
              startedAt: startedAt.toISOString(),
              completedAt: completedAt.toISOString(),
              durationMs: completedAt.getTime() - startedAt.getTime(),
            },
          },
          orgId: this.orgId,
          requestSource,
        })
        .catch((err) => logMessage("error", `Notification failed: ${err}`, this.metadata));
    }
  }

  private sendFailureNotification(
    context: RunContext,
    result: CompleteRunParams,
    completedAt: Date,
  ): void {
    // Skip notification for excluded sources
    if (NOTIFICATION_EXCLUDED_SOURCES.includes(context.requestSource)) {
      return;
    }

    const notificationService = new NotificationService(this.datastore);
    notificationService
      .processRunCompletion({
        run: {
          runId: context.runId,
          toolId: context.toolId,
          tool: result.tool || context.tool,
          status: RunStatus.FAILED,
          error: result.error,
          stepResults: result.stepResults,
          metadata: {
            startedAt: context.startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - context.startedAt.getTime(),
          },
        },
        orgId: this.orgId,
        requestSource: context.requestSource,
      })
      .catch((err) => logMessage("error", `Notification failed: ${err}`, this.metadata));
  }
}
