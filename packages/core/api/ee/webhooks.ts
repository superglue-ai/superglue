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

import { RequestOptions, RequestSource, RunStatus } from "@superglue/shared";
import { parseJSON } from "../../files/index.js";
import { SystemManager } from "../../systems/system-manager.js";
import { isSelfHealingEnabled } from "../../utils/helpers.js";
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
  const runId = crypto.randomUUID();
  const startedAt = new Date();

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
  const selfHealingEnabled = isSelfHealingEnabled(requestOptions, "api");

  const systemManagers = await SystemManager.forToolExecution(tool, authReq.datastore, metadata, {
    includeDocs: selfHealingEnabled,
  });

  // Create the run record
  await authReq.datastore.createRun({
    run: {
      runId,
      toolId: tool.id,
      status: RunStatus.RUNNING,
      tool,
      toolPayload: payload || {},
      options: requestOptions,
      requestSource: RequestSource.WEBHOOK,
      metadata: {
        startedAt: startedAt.toISOString(),
      },
    },
    orgId: authReq.authInfo.orgId,
  });

  const taskPayload: ToolExecutionPayload = {
    runId,
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
    .runTask(runId, taskPayload)
    .then(async (result) => {
      const completedAt = new Date();
      await authReq.datastore.updateRun({
        id: runId,
        orgId: authReq.authInfo.orgId,
        updates: {
          status: result.success ? RunStatus.SUCCESS : RunStatus.FAILED,
          tool: result.config || tool,
          error: result.error,
          metadata: {
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
          },
        },
      });
      logMessage(
        "info",
        `Webhook tool execution completed: ${result.success ? "success" : "failed"}`,
        metadata,
      );
    })
    .catch(async (error) => {
      logMessage("error", `Webhook tool execution error: ${String(error)}`, metadata);
      const completedAt = new Date();
      await authReq.datastore.updateRun({
        id: runId,
        orgId: authReq.authInfo.orgId,
        updates: {
          status: RunStatus.FAILED,
          tool,
          error: String(error),
          metadata: {
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: completedAt.getTime() - startedAt.getTime(),
          },
        },
      });
    });

  // Return 202 Accepted immediately
  return addTraceHeader(reply, traceId).code(202).send({
    runId,
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
