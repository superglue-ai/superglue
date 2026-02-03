/**
 * RunLifecycleManager - Centralized run creation, completion, and notifications.
 * Context is passed through (not stored) for stateless operation.
 */

import type {
  RequestOptions,
  RequestSource,
  StoredRunResults,
  Tool,
  ToolStepResult,
} from "@superglue/shared";
import { RunStatus, RequestSource as RSrc, sampleResultObject } from "@superglue/shared";
import type { DataStore } from "../datastore/types.js";
import { generateRunResultsUri, getRunResultsService } from "../ee/run-results-service.js";
import { isFileStorageAvailable } from "../filestore/file-service.js";
import { NotificationService } from "../notifications/index.js";
import { logMessage } from "../utils/logs.js";

export interface StartRunParams {
  runId?: string;
  tool: Tool;
  /** Payload to store in DB. Omit for GraphQL (saves DB space), include for REST/Webhook */
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
  error?: string;
  stepResults?: ToolStepResult[];
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
        // Only include toolPayload if provided (GraphQL omits it to save DB space)
        ...(payload !== undefined && { toolPayload: payload }),
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

    // Update run in database
    await this.datastore.updateRun({
      id: context.runId,
      orgId: this.orgId,
      updates: {
        status,
        tool: finalTool,
        error: result.error,
        metadata: {
          startedAt: context.startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - context.startedAt.getTime(),
        },
      },
    });

    // Fire-and-forget: Store run results to S3 if enabled
    this.maybeStoreRunResults({
      runId: context.runId,
      success: result.success,
      data: result.data ?? null,
      stepResults: result.stepResults ?? [],
      toolPayload: result.payload ?? {},
      error: result.error,
      storedAt: new Date(),
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

  /**
   * Check if run results storage is enabled for this org (EE feature)
   * Returns true if file storage is available AND org has the feature enabled
   */
  private async isRunResultsStorageEnabled(): Promise<boolean> {
    if (!isFileStorageAvailable()) {
      return false;
    }
    const orgSettings = await this.datastore.getOrgSettings({ orgId: this.orgId });
    return !!orgSettings?.preferences?.storeRunResults;
  }

  /**
   * Fire-and-forget: Check org settings and store run results to S3 if enabled
   * Also updates the run with the storage URI in the database
   */
  private maybeStoreRunResults(results: StoredRunResults): void {
    setImmediate(async () => {
      try {
        const enabled = await this.isRunResultsStorageEnabled();
        if (!enabled) return;

        const storageUri = generateRunResultsUri(results.runId, this.orgId);
        if (!storageUri) return;

        // Update run with storage URI
        await this.datastore.updateRun({
          id: results.runId,
          orgId: this.orgId,
          updates: {
            resultStorageUri: storageUri,
          },
        });

        // Upload to S3 with full (non-truncated) payload and result
        await getRunResultsService().storeResults(storageUri, results, { orgId: this.orgId });

        logMessage("debug", `Stored run results to S3: ${storageUri}`, this.metadata);
      } catch (err) {
        logMessage(
          "warn",
          `Failed to store run results for ${results.runId}: ${err}`,
          this.metadata,
        );
      }
    });
  }
}
