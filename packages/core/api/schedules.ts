import { ToolSchedule } from "@superglue/shared";
import { ToolScheduleInternal } from "../datastore/types.js";
import { ToolScheduler } from "../scheduler/scheduler-service.js";
import { registerApiModule } from "./registry.js";
import { addTraceHeader, parsePaginationParams, sendError } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

export interface OpenAPIToolSchedule {
  id: string;
  toolId: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
  lastRunAt?: string;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
}

function mapScheduleToOpenAPI(schedule: ToolScheduleInternal): OpenAPIToolSchedule {
  return {
    id: schedule.id,
    toolId: schedule.toolId,
    cronExpression: schedule.cronExpression,
    timezone: schedule.timezone,
    enabled: schedule.enabled,
    payload: schedule.payload,
    options: schedule.options as Record<string, unknown>,
    lastRunAt: schedule.lastRunAt?.toISOString(),
    nextRunAt: schedule.nextRunAt.toISOString(),
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

export function toPublicSchedule(internal: ToolScheduleInternal): ToolSchedule {
  return {
    id: internal.id,
    toolId: internal.toolId,
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

interface CreateScheduleBody {
  cronExpression: string;
  timezone: string;
  enabled?: boolean;
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

interface UpdateScheduleBody {
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

// GET /tools/:toolId/schedules - List schedules for a tool
const listSchedulesForTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const query = request.query as { page?: string; limit?: string };
  const { page, limit, offset } = parsePaginationParams(query);

  const schedulerService = new ToolScheduler(authReq.datastore);
  const schedules = await schedulerService.listToolSchedules({
    toolId: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  const total = schedules.length;
  const paginatedItems = schedules.slice(offset, offset + limit);
  const data = paginatedItems.map(mapScheduleToOpenAPI);
  const hasMore = offset + paginatedItems.length < total;

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    data,
    page,
    limit,
    total,
    hasMore,
  });
};

// GET /schedules - List all schedules (optional convenience endpoint)
const listAllSchedules: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as { toolId?: string; page?: string; limit?: string };
  const { page, limit, offset } = parsePaginationParams(query);

  const schedulerService = new ToolScheduler(authReq.datastore);
  const schedules = await schedulerService.listToolSchedules({
    toolId: query.toolId,
    orgId: authReq.authInfo.orgId,
  });

  const total = schedules.length;
  const paginatedItems = schedules.slice(offset, offset + limit);
  const data = paginatedItems.map(mapScheduleToOpenAPI);
  const hasMore = offset + paginatedItems.length < total;

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    data,
    page,
    limit,
    total,
    hasMore,
  });
};

// GET /tools/:toolId/schedules/:scheduleId - Get a schedule
const getSchedule: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string; scheduleId: string };

  const schedule = await authReq.datastore.getToolSchedule({
    id: params.scheduleId,
    orgId: authReq.authInfo.orgId,
  });

  if (!schedule) {
    return sendError(reply, 404, "Schedule not found");
  }

  // Verify the schedule belongs to the specified tool
  if (schedule.toolId !== params.toolId) {
    return sendError(reply, 404, "Schedule not found for this tool");
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send(mapScheduleToOpenAPI(schedule));
};

// POST /tools/:toolId/schedules - Create a schedule
const createSchedule: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const body = request.body as CreateScheduleBody;

  if (!body.cronExpression) {
    return sendError(reply, 400, "cronExpression is required");
  }
  if (!body.timezone) {
    return sendError(reply, 400, "timezone is required");
  }

  const schedulerService = new ToolScheduler(authReq.datastore);

  try {
    const schedule = await schedulerService.upsertToolSchedule({
      toolId: params.toolId,
      orgId: authReq.authInfo.orgId,
      cronExpression: body.cronExpression,
      timezone: body.timezone,
      enabled: body.enabled ?? true,
      payload: body.payload,
      options: body.options,
    });

    return addTraceHeader(reply, authReq.traceId).code(201).send(mapScheduleToOpenAPI(schedule));
  } catch (error: any) {
    const message = error?.message || String(error);
    if (message.includes("Invalid cron") || message.includes("Invalid timezone")) {
      return sendError(reply, 400, message);
    }
    throw error;
  }
};

// PUT /tools/:toolId/schedules/:scheduleId - Update a schedule
const updateSchedule: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string; scheduleId: string };
  const body = request.body as UpdateScheduleBody;

  const existingSchedule = await authReq.datastore.getToolSchedule({
    id: params.scheduleId,
    orgId: authReq.authInfo.orgId,
  });

  if (!existingSchedule) {
    return sendError(reply, 404, "Schedule not found");
  }

  // Verify the schedule belongs to the specified tool
  if (existingSchedule.toolId !== params.toolId) {
    return sendError(reply, 404, "Schedule not found for this tool");
  }

  const schedulerService = new ToolScheduler(authReq.datastore);

  try {
    const schedule = await schedulerService.upsertToolSchedule({
      id: params.scheduleId,
      orgId: authReq.authInfo.orgId,
      cronExpression: body.cronExpression,
      timezone: body.timezone,
      enabled: body.enabled,
      payload: body.payload,
      options: body.options,
    });

    return addTraceHeader(reply, authReq.traceId).code(200).send(mapScheduleToOpenAPI(schedule));
  } catch (error: any) {
    const message = error?.message || String(error);
    if (message.includes("Invalid cron") || message.includes("Invalid timezone")) {
      return sendError(reply, 400, message);
    }
    throw error;
  }
};

// DELETE /tools/:toolId/schedules/:scheduleId - Delete a schedule
const deleteSchedule: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string; scheduleId: string };

  const existingSchedule = await authReq.datastore.getToolSchedule({
    id: params.scheduleId,
    orgId: authReq.authInfo.orgId,
  });

  if (!existingSchedule) {
    return sendError(reply, 404, "Schedule not found");
  }

  // Verify the schedule belongs to the specified tool
  if (existingSchedule.toolId !== params.toolId) {
    return sendError(reply, 404, "Schedule not found for this tool");
  }

  const schedulerService = new ToolScheduler(authReq.datastore);
  await schedulerService.deleteToolSchedule({
    id: params.scheduleId,
    orgId: authReq.authInfo.orgId,
  });

  return addTraceHeader(reply, authReq.traceId).code(204).send();
};

registerApiModule({
  name: "schedules",
  routes: [
    // Nested under tools
    {
      method: "GET",
      path: "/tools/:toolId/schedules",
      handler: listSchedulesForTool,
    },
    {
      method: "GET",
      path: "/tools/:toolId/schedules/:scheduleId",
      handler: getSchedule,
    },
    {
      method: "POST",
      path: "/tools/:toolId/schedules",
      handler: createSchedule,
    },
    {
      method: "PUT",
      path: "/tools/:toolId/schedules/:scheduleId",
      handler: updateSchedule,
    },
    {
      method: "DELETE",
      path: "/tools/:toolId/schedules/:scheduleId",
      handler: deleteSchedule,
    },
    // Convenience endpoint for listing all schedules
    {
      method: "GET",
      path: "/schedules",
      handler: listAllSchedules,
    },
  ],
});
