import { ToolSchedule } from "@superglue/shared";
import { ToolScheduleInternal } from "../datastore/types.js";
import { WorkflowScheduler } from "../scheduler/scheduler-service.js";
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
    toolId: schedule.workflowId,
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

interface CreateScheduleBody {
  toolId: string;
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

// GET /schedules - List schedules
const listSchedules: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as { toolId?: string; page?: string; limit?: string };
  const { page, limit, offset } = parsePaginationParams(query);

  const schedulerService = new WorkflowScheduler(authReq.datastore);
  const schedules = await schedulerService.listWorkflowSchedules({
    workflowId: query.toolId,
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

// GET /schedules/:scheduleId - Get a schedule
const getSchedule: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { scheduleId: string };

  const schedule = await authReq.datastore.getWorkflowSchedule({
    id: params.scheduleId,
    orgId: authReq.authInfo.orgId,
  });

  if (!schedule) {
    return sendError(reply, 404, "Schedule not found");
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send(mapScheduleToOpenAPI(schedule));
};

// POST /schedules - Create a schedule
const createSchedule: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as CreateScheduleBody;

  if (!body.toolId) {
    return sendError(reply, 400, "toolId is required");
  }
  if (!body.cronExpression) {
    return sendError(reply, 400, "cronExpression is required");
  }
  if (!body.timezone) {
    return sendError(reply, 400, "timezone is required");
  }

  const schedulerService = new WorkflowScheduler(authReq.datastore);

  try {
    const schedule = await schedulerService.upsertWorkflowSchedule({
      workflowId: body.toolId,
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

// PUT /schedules/:scheduleId - Update a schedule
const updateSchedule: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { scheduleId: string };
  const body = request.body as UpdateScheduleBody;

  const existingSchedule = await authReq.datastore.getWorkflowSchedule({
    id: params.scheduleId,
    orgId: authReq.authInfo.orgId,
  });

  if (!existingSchedule) {
    return sendError(reply, 404, "Schedule not found");
  }

  const schedulerService = new WorkflowScheduler(authReq.datastore);

  try {
    const schedule = await schedulerService.upsertWorkflowSchedule({
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

// DELETE /schedules/:scheduleId - Delete a schedule
const deleteSchedule: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { scheduleId: string };

  const existingSchedule = await authReq.datastore.getWorkflowSchedule({
    id: params.scheduleId,
    orgId: authReq.authInfo.orgId,
  });

  if (!existingSchedule) {
    return sendError(reply, 404, "Schedule not found");
  }

  const schedulerService = new WorkflowScheduler(authReq.datastore);
  await schedulerService.deleteWorkflowSchedule({
    id: params.scheduleId,
    orgId: authReq.authInfo.orgId,
  });

  return addTraceHeader(reply, authReq.traceId).code(204).send();
};

registerApiModule({
  name: "schedules",
  routes: [
    {
      method: "GET",
      path: "/schedules",
      handler: listSchedules,
    },
    {
      method: "GET",
      path: "/schedules/:scheduleId",
      handler: getSchedule,
    },
    {
      method: "POST",
      path: "/schedules",
      handler: createSchedule,
    },
    {
      method: "PUT",
      path: "/schedules/:scheduleId",
      handler: updateSchedule,
    },
    {
      method: "DELETE",
      path: "/schedules/:scheduleId",
      handler: deleteSchedule,
    },
  ],
});
