import { SelfHealingMode } from "@superglue/shared";
import { calculateNextRun } from "@superglue/shared";
import { GraphQLResolveInfo } from "graphql";
import { DataStore } from "../datastore/types.js";
import { executeWorkflowResolver } from "../graphql/resolvers/workflow.js";
import { GraphQLRequestContext, WorkerPools } from "../graphql/types.js";
import { logMessage } from "../utils/logs.js";

export class ToolSchedulerWorker {
  private datastore: DataStore;
  private workerPools: WorkerPools;
  private intervalId: NodeJS.Timeout;
  private intervalMs: number;
  private isRunning: boolean = false;

  constructor(datastore: DataStore, workerPools: WorkerPools, intervalMs: number = 1000 * 30) {
    this.datastore = datastore;
    this.workerPools = workerPools;
    this.intervalMs = intervalMs;
  }

  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(this.pollAndExecute.bind(this), this.intervalMs);

    logMessage("info", "TOOL SCHEDULER: Async scheduler service started");
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logMessage("info", "TOOL SCHEDULER: Scheduler service stopped");
  }

  private async pollAndExecute(): Promise<void> {
    const schedules = await this.datastore.listDueToolSchedules();
    logMessage("debug", `TOOL SCHEDULER: Found ${schedules.length} due schedules`);

    for (const schedule of schedules) {
      try {
        const traceId = crypto.randomUUID();
        logMessage("info", `TOOL SCHEDULER: Running scheduled tool ${schedule.toolId}`, {
          orgId: schedule.orgId,
          traceId,
        });

        const now = new Date(Date.now());
        const nextRun = calculateNextRun(schedule.cronExpression, schedule.timezone, now);
        await this.datastore.updateScheduleNextRun({
          id: schedule.id,
          nextRunAt: nextRun,
          lastRunAt: now,
        });

        const context: GraphQLRequestContext = {
          datastore: this.datastore,
          workerPools: this.workerPools,
          traceId,
          orgId: schedule.orgId,
          toMetadata: function () {
            return { orgId: this.orgId, traceId: this.traceId };
          },
        };

        const options = schedule.options
          ? {
              ...schedule.options,
              selfHealing: schedule.options.selfHealing
                ? SelfHealingMode[schedule.options.selfHealing as keyof typeof SelfHealingMode]
                : undefined,
            }
          : {};

        await executeWorkflowResolver(
          {},
          {
            input: { id: schedule.toolId },
            payload: schedule.payload || {},
            credentials: {},
            options,
          },
          context,
          {} as GraphQLResolveInfo,
        );
      } catch (error) {
        logMessage(
          "error",
          `TOOL SCHEDULER: Failed to run scheduled tool ${schedule.toolId}: ${error}`,
          { orgId: schedule.orgId },
        );
      }
    }
  }
}
