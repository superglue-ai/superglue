import { calculateNextRun, validateCronExpression } from "@superglue/shared";
import crypto from "crypto";
import { DataStore, ToolScheduleInternal } from "../datastore/types.js";
import { server_defaults } from "../default.js";
import { isValidTimezone } from "../utils/timezone.js";

export class ToolScheduler {
  private datastore: DataStore;

  constructor(datastore: DataStore) {
    this.datastore = datastore;
  }

  public async upsertToolSchedule(params: {
    id?: string;
    toolId?: string;
    orgId: string;
    cronExpression?: string;
    timezone?: string;
    enabled?: boolean;
    payload?: Record<string, any>;
    options?: Record<string, any>;
  }): Promise<ToolScheduleInternal> {
    if (!params.id && !params.toolId) {
      throw new Error(
        "Failed to upsert tool schedule: Provide either ID (for updates) or Tool ID (for new schedules)",
      );
    }

    if (params.cronExpression !== undefined && !validateCronExpression(params.cronExpression)) {
      throw new Error("Failed to upsert tool schedule: Invalid cron expression");
    }

    if (params.timezone !== undefined && !isValidTimezone(params.timezone)) {
      throw new Error("Failed to upsert tool schedule: Invalid timezone");
    }

    let existingScheduleOrNull = null;
    if (params.id) {
      existingScheduleOrNull = await this.datastore.getToolSchedule({
        id: params.id,
        orgId: params.orgId,
      });

      if (!existingScheduleOrNull) {
        throw new Error("Failed to upsert tool schedule: Schedule not found");
      }
    }

    if (!params.cronExpression && !existingScheduleOrNull?.cronExpression) {
      throw new Error(
        "Failed to upsert tool schedule: Cron expression is required for new schedule",
      );
    }

    if (!params.timezone && !existingScheduleOrNull) {
      throw new Error("Failed to upsert tool schedule: Timezone is required for new schedule");
    }

    if (params.options?.retries !== undefined) {
      if (
        typeof params.options.retries !== "number" ||
        params.options.retries < 0 ||
        params.options.retries > server_defaults.MAX_CALL_RETRIES
      ) {
        throw new Error(
          `Failed to upsert tool schedule: Retries must be between 0 and ${server_defaults.MAX_CALL_RETRIES}`,
        );
      }
    }

    const id = existingScheduleOrNull?.id ?? crypto.randomUUID();
    const toolId = existingScheduleOrNull
      ? existingScheduleOrNull.toolId
      : params.toolId; // prevent updating tool id
    const cronExpression = params.cronExpression ?? existingScheduleOrNull?.cronExpression;
    const timezone = params.timezone ?? existingScheduleOrNull?.timezone;
    const now = new Date();

    let nextRunAt = existingScheduleOrNull?.nextRunAt;
    const cronExpressionChanged =
      params.cronExpression !== undefined &&
      params.cronExpression !== existingScheduleOrNull?.cronExpression;
    const timezoneChanged =
      params.timezone !== undefined && params.timezone !== existingScheduleOrNull?.timezone;
    if (cronExpressionChanged || timezoneChanged || params.enabled == true) {
      const currentDate = new Date(Date.now());
      nextRunAt = calculateNextRun(cronExpression, timezone, currentDate);
    }

    const scheduleToSave: ToolScheduleInternal = {
      id,
      orgId: existingScheduleOrNull?.orgId ?? params.orgId,
      toolId,
      cronExpression: cronExpression,
      timezone: timezone,
      enabled: params.enabled ?? existingScheduleOrNull?.enabled ?? true,
      payload: params.payload ?? existingScheduleOrNull?.payload,
      options: params.options ?? existingScheduleOrNull?.options,
      nextRunAt: nextRunAt,
      lastRunAt: existingScheduleOrNull?.lastRunAt,
      createdAt: existingScheduleOrNull?.createdAt ?? now,
      updatedAt: now,
    };

    await this.datastore.upsertToolSchedule({ schedule: scheduleToSave });
    return scheduleToSave;
  }

  public async deleteToolSchedule({
    id,
    orgId,
  }: {
    id: string;
    orgId: string;
  }): Promise<boolean> {
    return await this.datastore.deleteToolSchedule({ id, orgId });
  }

  public async listToolSchedules({
    toolId,
    orgId,
  }: {
    toolId?: string;
    orgId: string;
  }): Promise<ToolScheduleInternal[]> {
    return await this.datastore.listToolSchedules({ toolId, orgId });
  }
}
