import crypto from "crypto";
import { DataStore, WorkflowScheduleInternal } from "../datastore/types.js";
import { calculateNextRun, validateCronExpression } from "../utils/cron.js";

export class WorkflowScheduler {
    private datastore: DataStore;

    constructor(datastore: DataStore) {
        this.datastore = datastore;
    }

    public async upsertWorkflowSchedule(params: { 
        id?: string, 
        workflowId?: string, 
        orgId: string, 
        cronExpression?: string, 
        enabled?: boolean, 
        payload?: Record<string, any>, 
        options?: Record<string, any>
    }) : Promise<WorkflowScheduleInternal> {
        if (!params.id && !params.workflowId) {
            throw new Error("Failed to upsert workflow schedule: ID or Workflow ID is required");
        }

        if (params.id && params.workflowId) {
            throw new Error("Failed to upsert workflow schedule: Provide either ID or Workflow ID, not both");
        }

        if (params.cronExpression !== undefined && !validateCronExpression(params.cronExpression)) {
            throw new Error("Failed to upsert workflow schedule: Invalid cron expression");
        }

        let existingScheduleOrNull = null; 
        if (params.id) {
            existingScheduleOrNull = await this.datastore.getWorkflowSchedule({ id: params.id, orgId: params.orgId });
        }

        const id = existingScheduleOrNull?.id ?? crypto.randomUUID();
        const workflowId = existingScheduleOrNull ? existingScheduleOrNull.workflowId : params.workflowId; // prevent updating workflow id
        const cronExpressionToSave = params.cronExpression ?? existingScheduleOrNull?.cronExpression;
        const nextRunAt = existingScheduleOrNull?.nextRunAt ?? calculateNextRun(cronExpressionToSave);
        const now = new Date();

        const scheduleToSave: WorkflowScheduleInternal = {
            id,
            orgId: existingScheduleOrNull?.orgId ?? params.orgId,
            workflowId,
            cronExpression: cronExpressionToSave,
            enabled: params.enabled ?? existingScheduleOrNull?.enabled,
            payload: params.payload ?? existingScheduleOrNull?.payload,
            options: params.options ?? existingScheduleOrNull?.options,
            nextRunAt: nextRunAt,
            lastRunAt: existingScheduleOrNull?.lastRunAt,
            createdAt: existingScheduleOrNull?.createdAt ?? now,
            updatedAt: now
        };

        await this.datastore.upsertWorkflowSchedule({ schedule: scheduleToSave });
        return scheduleToSave;
    }

    public async deleteWorkflowSchedule({id, orgId}: { id: string, orgId: string }) : Promise<boolean> {
        return await this.datastore.deleteWorkflowSchedule({ id, orgId });
    }

    public async listWorkflowSchedules({workflowId, orgId}: { workflowId: string, orgId: string }) : Promise<WorkflowScheduleInternal[]> {
        return await this.datastore.listWorkflowSchedules({ workflowId, orgId });
    }
}