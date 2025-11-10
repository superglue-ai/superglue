import { WorkflowSchedule } from "@superglue/client";
import { GraphQLResolveInfo } from "graphql";
import { WorkflowScheduleInternal } from "../../datastore/types.js";
import { WorkflowScheduler } from "../../scheduler/scheduler-service.js";
import { logMessage } from "../../utils/logs.js";
import { Context } from "../types.js";

function toPublicSchedule(
  internal: WorkflowScheduleInternal,
): WorkflowSchedule {
  return {
    id: internal.id,
    workflowId: internal.workflowId,
    cronExpression: internal.cronExpression,
    timezone: internal.timezone,
    enabled: internal.enabled,
    payload: internal.payload,
    options: internal.options,
    lastRunAt: internal.lastRunAt,
    nextRunAt: internal.nextRunAt,
    createdAt: internal.createdAt,
    updatedAt: internal.updatedAt,
  };
}

export const listWorkflowSchedulesResolver = async (
  _: unknown,
  { workflowId }: { workflowId: string },
  context: Context,
  info: GraphQLResolveInfo,
) => {
  try {
    const workflowSchedulerService = new WorkflowScheduler(context.datastore);
    const schedulesInternal: WorkflowScheduleInternal[] =
      await workflowSchedulerService.listWorkflowSchedules({
        workflowId,
        orgId: context.orgId,
      });

    return schedulesInternal.map(toPublicSchedule);
  } catch (error) {
    logMessage("error", "Error listing workflow schedules: " + String(error), {
      orgId: context.orgId,
    });
    throw error;
  }
};

type UpsertWorkflowScheduleArgs = {
  schedule: {
    id?: string;
    workflowId?: string;
    cronExpression?: string;
    timezone?: string;
    enabled?: boolean;
    payload?: Record<string, any>;
    options?: Record<string, any>;
  };
};

export const upsertWorkflowScheduleResolver = async (
  _: unknown,
  { schedule }: UpsertWorkflowScheduleArgs,
  context: Context,
  info: GraphQLResolveInfo,
): Promise<WorkflowSchedule> => {
  try {
    const workflowSchedulerService = new WorkflowScheduler(context.datastore);

    const workflowSchedule =
      await workflowSchedulerService.upsertWorkflowSchedule({
        id: schedule.id,
        workflowId: schedule.workflowId,
        orgId: context.orgId,
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
        enabled: schedule.enabled,
        payload: schedule.payload,
        options: schedule.options,
      });

    return toPublicSchedule(workflowSchedule);
  } catch (error) {
    logMessage("error", "Error upserting workflow schedule: " + String(error), {
      orgId: context.orgId,
    });
    throw error;
  }
};

export const deleteWorkflowScheduleResolver = async (
  _: unknown,
  { id }: { id: string },
  context: Context,
  info: GraphQLResolveInfo,
) => {
  try {
    const workflowSchedulerService = new WorkflowScheduler(context.datastore);
    return await workflowSchedulerService.deleteWorkflowSchedule({
      id,
      orgId: context.orgId,
    });
  } catch (error) {
    logMessage("error", "Error deleting workflow schedule: " + String(error), {
      orgId: context.orgId,
    });
    throw error;
  }
};
