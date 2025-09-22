import { DataStore } from "../datastore/types.js";
import { executeWorkflowResolver } from "../graphql/resolvers/workflow.js";
import { calculateNextRun } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";
import { GraphQLResolveInfo } from "graphql";

export class WorkflowScheduler {
    private datastore: DataStore;
    private intervalId: NodeJS.Timeout;
    private intervalMs: number;
    private isRunning: boolean = false;

    constructor(datastore: DataStore, intervalMs: number = 1000 * 30) {
        this.datastore = datastore;
        this.intervalMs = intervalMs;
    }

    public start(): void {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.intervalId = setInterval(this.pollAndExecute.bind(this), this.intervalMs);

        logMessage('info', 'WORKFLOW SCHEDULER: Async scheduler service started');
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

        logMessage('info', 'WORKFLOW SCHEDULER: Scheduler service stopped');
    }

    private async pollAndExecute(): Promise<void> {      
        const schedules = await this.datastore.listDueWorkflowSchedules();

        for (const schedule of schedules) {
            try {
                logMessage('debug', `WORKFLOW SCHEDULER: Running scheduled workflow ${schedule.workflowId}`);

                const now = new Date();
                const nextRun = calculateNextRun(schedule.cronExpression, schedule.timezone, now);
                await this.datastore.updateScheduleNextRun({ id: schedule.id, nextRunAt: nextRun, lastRunAt: now });

                const context = {
                    datastore: this.datastore,
                    orgId: schedule.orgId
                };

                await executeWorkflowResolver(
                    {},
                    { 
                        input: { id: schedule.workflowId },
                        payload: schedule.payload || {},
                        credentials: {},
                        options: schedule.options || {}
                    },
                    context,
                    {} as GraphQLResolveInfo // not needed
                );
            } catch (error) {
                logMessage('error', `WORKFLOW SCHEDULER: Failed to run scheduled workflow ${schedule.workflowId}: ${error}`);
            }
        }
    }
}