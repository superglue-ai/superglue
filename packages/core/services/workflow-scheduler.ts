import crypto from "crypto";
import { DataStore, WorkflowScheduleInternal } from "../datastore/types.js";
import { calculateNextRun, validateCronExpression } from "@superglue/shared";
import { isValidTimezone } from "../utils/timezone.js";
import { logMessage } from "../utils/logs.js";

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
        timezone?: string,
        enabled?: boolean, 
        payload?: Record<string, any>, 
        options?: Record<string, any>
    }) : Promise<WorkflowScheduleInternal> {
        if (!params.id && !params.workflowId) {
            throw new Error("Failed to upsert workflow schedule: Provide either ID (for updates) or Workflow ID (for new schedules)");
        }

        if (params.cronExpression !== undefined && !validateCronExpression(params.cronExpression)) {
            throw new Error("Failed to upsert workflow schedule: Invalid cron expression");
        }

        if(params.timezone !== undefined && !isValidTimezone(params.timezone)) {
            throw new Error("Failed to upsert workflow schedule: Invalid timezone");
        }

        let existingScheduleOrNull = null; 
        if (params.id) {
            existingScheduleOrNull = await this.datastore.getWorkflowSchedule({ id: params.id, orgId: params.orgId });

            if (!existingScheduleOrNull) {
                throw new Error("Failed to upsert workflow schedule: Schedule not found");
            }
        }

        if(!params.cronExpression && !existingScheduleOrNull?.cronExpression) {
            throw new Error("Failed to upsert workflow schedule: Cron expression is required for new schedule");
        }

        if(!params.timezone && !existingScheduleOrNull) {
            throw new Error("Failed to upsert workflow schedule: Timezone is required for new schedule");
        }

        const id = existingScheduleOrNull?.id ?? crypto.randomUUID();
        const workflowId = existingScheduleOrNull ? existingScheduleOrNull.workflowId : params.workflowId; // prevent updating workflow id
        const cronExpression = params.cronExpression ?? existingScheduleOrNull?.cronExpression;
        const timezone = params.timezone ?? existingScheduleOrNull?.timezone;
        const now = new Date();

        let nextRunAt = existingScheduleOrNull?.nextRunAt;
        const cronExpressionChanged = params.cronExpression !== undefined && params.cronExpression !== existingScheduleOrNull?.cronExpression;
        const timezoneChanged = params.timezone !== undefined && params.timezone !== existingScheduleOrNull?.timezone;
        if(cronExpressionChanged || timezoneChanged || params.enabled == true) {
            const currentDate = new Date(Date.now());
            nextRunAt = calculateNextRun(cronExpression, timezone, currentDate);
        }

        const scheduleToSave: WorkflowScheduleInternal = {
            id,
            orgId: existingScheduleOrNull?.orgId ?? params.orgId,
            workflowId,
            cronExpression: cronExpression,
            timezone: timezone,
            enabled: params.enabled ?? existingScheduleOrNull?.enabled ?? true,
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