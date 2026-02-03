/**
 * EE Feature: Incoming Webhook API
 *
 * Accepts incoming webhooks from external services (Stripe, GitHub, etc.)
 * and triggers the corresponding superglue tool asynchronously.
 *
 * Endpoint: POST /hooks/:toolId?token=xxx
 * - Authenticates via token query parameter
 * - Uses request body as tool payload
 * - Returns 202 Accepted immediately
 * - Executes tool asynchronously via workerPools
 */

import { RequestOptions, RequestSource } from "@superglue/shared";
import { parseJSON } from "../../files/index.js";
import { RunLifecycleManager } from "../../runs/index.js";
import { SystemManager } from "../../systems/system-manager.js";
import { logMessage } from "../../utils/logs.js";
import type { ToolExecutionPayload } from "../../worker/types.js";
import { registerApiModule } from "../registry.js";
import { addTraceHeader, sendError } from "../response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "../types.js";

// POST /hooks/:toolId - Trigger a tool via incoming webhook
const handleIncomingWebhook: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const payload = request.body as Record<string, unknown> | undefined;

  const traceId = authReq.traceId || crypto.randomUUID();
  const metadata = { orgId: authReq.authInfo.orgId, traceId };

  // Fetch the tool
  const tool = await authReq.datastore.getWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!tool) {
    return sendError(reply, 404, "Tool not found");
  }

  if (tool.archived) {
    return sendError(reply, 400, "Cannot execute archived tool");
  }

  // Parse schemas if strings
  if (tool.inputSchema && typeof tool.inputSchema === "string") {
    tool.inputSchema = parseJSON(tool.inputSchema);
  }
  if (tool.responseSchema && typeof tool.responseSchema === "string") {
    tool.responseSchema = parseJSON(tool.responseSchema);
  }

  const requestOptions: RequestOptions = {};

  const systemManagers = await SystemManager.forToolExecution(tool, authReq.datastore, metadata);

  // Use RunLifecycleManager for centralized run handling
  const lifecycle = new RunLifecycleManager(authReq.datastore, authReq.authInfo.orgId, metadata);
  const runContext = await lifecycle.startRun({
    tool,
    payload: payload || {},
    options: requestOptions,
    requestSource: RequestSource.WEBHOOK,
  });

  const taskPayload: ToolExecutionPayload = {
    runId: runContext.runId,
    workflow: tool,
    payload: payload || {},
    credentials: undefined,
    options: requestOptions,
    systems: systemManagers.map((m) => m.toSystemSync()),
    orgId: authReq.authInfo.orgId,
    traceId: metadata.traceId,
  };

  // Fire-and-forget execution
  authReq.workerPools.toolExecution
    .runTask(runContext.runId, taskPayload)
    .then(async (result) => {
      await lifecycle.completeRun(runContext, {
        success: result.success,
        tool: result.config || tool,
        data: result.data,
        error: result.error,
        stepResults: result.stepResults,
        payload: payload,
      });
      logMessage(
        "info",
        `Webhook tool execution completed: ${result.success ? "success" : "failed"}`,
        metadata,
      );
    })
    .catch(async (error: any) => {
      logMessage("error", `Webhook tool execution error: ${String(error)}`, metadata);
      await lifecycle.completeRun(runContext, {
        success: false,
        tool,
        error: String(error),
        stepResults: error?.stepResults,
        payload: payload,
      });
    });

  // Return 202 Accepted immediately
  return addTraceHeader(reply, traceId).code(202).send({
    runId: runContext.runId,
    status: "accepted",
    toolId: tool.id,
  });
};

registerApiModule({
  name: "webhooks",
  routes: [
    {
      method: "POST",
      path: "/hooks/:toolId",
      handler: handleIncomingWebhook,
      permissions: {
        type: "execute",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      },
    },
  ],
});
