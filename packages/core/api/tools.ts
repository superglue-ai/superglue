import { ExecutionStep, RequestOptions, RunStatus, Tool, ToolResult } from "@superglue/shared";
import { parseJSON } from "../files/index.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { isSelfHealingEnabled } from "../utils/helpers.js";
import { logMessage } from "../utils/logs.js";
import { notifyWebhook } from "../utils/webhook.js";
import type { ToolExecutionPayload } from "../worker/types.js";
import { filterToolsByPermission } from "./ee/index.js";
import { registerApiModule } from "./registry.js";
import {
  addTraceHeader,
  mapRunStatusToOpenAPI,
  parsePaginationParams,
  sendError,
} from "./response-helpers.js";
import type {
  AuthenticatedFastifyRequest,
  OpenAPIRun,
  OpenAPITool,
  OpenAPIToolStep,
  RouteHandler,
  RunToolRequestBody,
} from "./types.js";

export const PAGINATION_TYPE_MAP: Record<string, string> = {
  OFFSET_BASED: "offsetBased",
  PAGE_BASED: "pageBased",
  CURSOR_BASED: "cursorBased",
  DISABLED: "disabled",
};

export function mapPaginationType(internalType?: string): string {
  if (!internalType) return "disabled";
  return PAGINATION_TYPE_MAP[internalType] || internalType.toLowerCase();
}

export function mapFailureBehavior(internal?: string): "fail" | "continue" | undefined {
  if (!internal) return undefined;
  return internal.toLowerCase() as "fail" | "continue";
}

export function mapStepToOpenAPI(step: ExecutionStep): OpenAPIToolStep {
  const apiConfig = step.apiConfig;
  const url = (apiConfig.urlHost || "") + (apiConfig.urlPath || "");

  const result: OpenAPIToolStep = {
    id: step.id,
    url,
    method: apiConfig.method || "GET",
  };

  if (apiConfig.queryParams) result.queryParams = apiConfig.queryParams;
  if (apiConfig.headers) result.headers = apiConfig.headers;
  if (apiConfig.body) result.body = apiConfig.body;
  if (step.integrationId) result.systemId = step.integrationId;
  if (apiConfig.instruction) result.instruction = apiConfig.instruction;
  if (step.modify !== undefined) result.modify = step.modify;
  if (step.loopSelector) result.dataSelector = step.loopSelector;
  if (step.failureBehavior) result.failureBehavior = mapFailureBehavior(step.failureBehavior);

  if (apiConfig.pagination) {
    result.pagination = {
      type: mapPaginationType(apiConfig.pagination.type),
      pageSize: apiConfig.pagination.pageSize,
      cursorPath: apiConfig.pagination.cursorPath,
      stopCondition: apiConfig.pagination.stopCondition,
    };
  }

  return result;
}

export function mapToolToOpenAPI(tool: Tool): OpenAPITool {
  return {
    id: tool.id,
    name: tool.id,
    version: tool.version || "1.0.0",
    instruction: tool.instruction,
    inputSchema: tool.inputSchema as Record<string, unknown>,
    outputSchema: tool.responseSchema as Record<string, unknown>,
    steps: tool.steps.map(mapStepToOpenAPI),
    outputTransform: tool.finalTransform,
    archived: tool.archived ?? false,
    createdAt: tool.createdAt?.toISOString?.() || (tool.createdAt as unknown as string),
    updatedAt: tool.updatedAt?.toISOString?.() || (tool.updatedAt as unknown as string),
  };
}

// Build OpenAPIRun response object
export function buildRunResponse(params: {
  runId: string;
  tool: Tool;
  status: RunStatus;
  toolPayload?: Record<string, unknown>;
  data?: any;
  error?: string;
  stepResults?: ToolResult["stepResults"];
  options?: RequestOptions;
  requestSource: string;
  traceId?: string;
  startedAt: Date;
  completedAt?: Date;
}): OpenAPIRun {
  const {
    runId,
    tool,
    status,
    toolPayload,
    data,
    error,
    stepResults,
    options,
    requestSource,
    traceId,
    startedAt,
    completedAt,
  } = params;

  return {
    runId,
    toolId: tool.id,
    tool: { id: tool.id, version: tool.version || "1.0.0" },
    status: mapRunStatusToOpenAPI(status),
    toolPayload,
    data,
    error,
    stepResults: stepResults?.map((sr) => ({
      stepId: sr.stepId,
      success: sr.success,
      data: sr.data,
      error: sr.error,
    })),
    options: options as Record<string, unknown>,
    requestSource,
    traceId,
    metadata: {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt?.toISOString(),
      durationMs: completedAt ? completedAt.getTime() - startedAt.getTime() : undefined,
    },
  };
}

// Handle webhook notifications (http or tool: chain)
async function handleWebhook(
  authReq: AuthenticatedFastifyRequest,
  webhookUrl: string | undefined,
  currentToolId: string,
  runId: string,
  result: { success: boolean; data?: any; error?: string },
  credentials: Record<string, unknown> | undefined,
  options: { timeout?: number } | undefined,
  metadata: { orgId: string; traceId?: string },
) {
  if (!webhookUrl) return;

  if (webhookUrl.startsWith("http")) {
    notifyWebhook(webhookUrl, runId, result.success, result.data, result.error, metadata);
  } else if (webhookUrl.startsWith("tool:")) {
    const chainToolId = webhookUrl.split(":")[1];
    if (chainToolId === currentToolId) {
      logMessage("warn", "Tool cannot trigger itself", metadata);
      return;
    }
    // Fire-and-forget chain execution
    executeToolInternal(
      authReq,
      chainToolId,
      result.data,
      credentials,
      { ...options, webhookUrl: undefined },
      metadata,
      "api-chain",
    );
  }
}

// Internal tool execution (used by both runTool and chain)
async function executeToolInternal(
  authReq: AuthenticatedFastifyRequest,
  toolId: string,
  payload: any,
  credentials: Record<string, unknown> | undefined,
  options: RequestOptions | undefined,
  metadata: { orgId: string; traceId?: string },
  requestSource: string,
): Promise<{ runId: string; result: ToolResult } | null> {
  const tool = await authReq.datastore.getWorkflow({
    id: toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!tool) {
    logMessage("error", `Tool ${toolId} not found`, metadata);
    return null;
  }

  if (tool.archived) {
    logMessage("error", `Cannot execute archived tool ${toolId}`, metadata);
    return null;
  }

  // Parse schemas if strings
  if (tool.inputSchema && typeof tool.inputSchema === "string") {
    tool.inputSchema = parseJSON(tool.inputSchema);
  }
  if (tool.responseSchema && typeof tool.responseSchema === "string") {
    tool.responseSchema = parseJSON(tool.responseSchema);
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const requestOptions: RequestOptions = {
    webhookUrl: options?.webhookUrl,
    timeout: options?.timeout,
  };

  const selfHealingEnabled = isSelfHealingEnabled(requestOptions, "api");
  const integrationManagers = await IntegrationManager.forToolExecution(
    tool,
    authReq.datastore,
    metadata,
    { includeDocs: selfHealingEnabled },
  );

  await authReq.datastore.createRun({
    run: {
      id: runId,
      toolId: tool.id,
      orgId: authReq.authInfo.orgId,
      userId: authReq.authInfo.userId,
      userEmail: authReq.authInfo.userEmail,
      status: RunStatus.RUNNING,
      toolConfig: tool,
      toolPayload: payload,
      options: requestOptions,
      requestSource,
      startedAt,
    },
  });

  const taskPayload: ToolExecutionPayload = {
    runId,
    workflow: tool,
    payload,
    credentials: credentials as Record<string, string> | undefined,
    options: requestOptions,
    integrations: integrationManagers.map((m) => m.toIntegrationSync()),
    orgId: authReq.authInfo.orgId,
    traceId: metadata.traceId,
  };

  // Fire and forget execution
  authReq.workerPools.toolExecution
    .runTask(runId, taskPayload)
    .then(async (result) => {
      await authReq.datastore.updateRun({
        id: runId,
        orgId: authReq.authInfo.orgId,
        updates: {
          status: result.success ? RunStatus.SUCCESS : RunStatus.FAILED,
          toolConfig: result.config || tool,
          error: result.error,
          completedAt: new Date(),
        },
      });
      handleWebhook(
        authReq,
        options?.webhookUrl,
        toolId,
        runId,
        result,
        credentials,
        options,
        metadata,
      );
    })
    .catch(async (error) => {
      logMessage("error", `Tool execution error: ${String(error)}`, metadata);
      await authReq.datastore.updateRun({
        id: runId,
        orgId: authReq.authInfo.orgId,
        updates: {
          status: RunStatus.FAILED,
          toolConfig: tool,
          error: String(error),
          completedAt: new Date(),
        },
      });
    });

  return null; // Fire and forget
}

// GET /tools - List tools
const listTools: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as { page?: string; limit?: string };

  const { page, limit, offset } = parsePaginationParams(query);

  const isRestricted = authReq.authInfo.isRestricted;

  if (isRestricted) {
    // Fetch all tools and filter
    const result = await authReq.datastore.listWorkflows({
      limit: 10000, // Fetch all
      offset: 0,
      orgId: authReq.authInfo.orgId,
    });

    const filteredItems = filterToolsByPermission(authReq.authInfo, result.items);
    const total = filteredItems.length;
    const paginatedItems = filteredItems.slice(offset, offset + limit);
    const data = paginatedItems.map(mapToolToOpenAPI);
    const hasMore = offset + paginatedItems.length < total;

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      data,
      page,
      limit,
      total,
      hasMore,
    });
  }

  // Unrestricted keys use normal pagination
  const result = await authReq.datastore.listWorkflows({
    limit,
    offset,
    orgId: authReq.authInfo.orgId,
  });

  const data = result.items.map(mapToolToOpenAPI);
  const hasMore = offset + result.items.length < result.total;

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    data,
    page,
    limit,
    total: result.total,
    hasMore,
  });
};

// GET /tools/:toolId - Get tool details
const getTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };

  const tool = await authReq.datastore.getWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!tool) {
    return sendError(reply, 404, "Tool not found");
  }

  return addTraceHeader(reply, authReq.traceId).code(200).send(mapToolToOpenAPI(tool));
};

// POST /tools/:toolId/run - Run a tool
const runTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const body = request.body as RunToolRequestBody;

  const traceId = body.options?.traceId || authReq.traceId;
  const metadata = { orgId: authReq.authInfo.orgId, traceId };
  const runId = body.runId || crypto.randomUUID();

  // Idempotency check
  if (body.runId) {
    const existingRun = await authReq.datastore.getRun({
      id: body.runId,
      orgId: authReq.authInfo.orgId,
    });
    if (existingRun) {
      return sendError(reply, 409, `Run with id ${body.runId} already exists`);
    }
  }

  const startedAt = new Date();

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

  if (tool.inputSchema && typeof tool.inputSchema === "string") {
    tool.inputSchema = parseJSON(tool.inputSchema);
  }
  if (tool.responseSchema && typeof tool.responseSchema === "string") {
    tool.responseSchema = parseJSON(tool.responseSchema);
  }

  const requestOptions: RequestOptions = {
    webhookUrl: body.options?.webhookUrl,
    timeout: body.options?.timeout,
  };

  const selfHealingEnabled = isSelfHealingEnabled(requestOptions, "api");
  const integrationManagers = await IntegrationManager.forToolExecution(
    tool,
    authReq.datastore,
    metadata,
    { includeDocs: selfHealingEnabled },
  );

  await authReq.datastore.createRun({
    run: {
      id: runId,
      toolId: tool.id,
      orgId: authReq.authInfo.orgId,
      userId: authReq.authInfo.userId,
      userEmail: authReq.authInfo.userEmail,
      status: RunStatus.RUNNING,
      toolConfig: tool,
      toolPayload: body.inputs as Record<string, any>,
      options: requestOptions,
      requestSource: "api",
      startedAt,
    },
  });

  const taskPayload: ToolExecutionPayload = {
    runId,
    workflow: tool,
    payload: body.inputs,
    credentials: body.credentials as Record<string, string> | undefined,
    options: requestOptions,
    integrations: integrationManagers.map((m) => m.toIntegrationSync()),
    orgId: authReq.authInfo.orgId,
    traceId: metadata.traceId,
  };

  const sendResponse = (statusCode: number, run: OpenAPIRun) => {
    return addTraceHeader(reply, metadata.traceId).code(statusCode).send(run);
  };

  // Async execution
  if (body.options?.async) {
    authReq.workerPools.toolExecution
      .runTask(runId, taskPayload)
      .then(async (result) => {
        await authReq.datastore.updateRun({
          id: runId,
          orgId: authReq.authInfo.orgId,
          updates: {
            status: result.success ? RunStatus.SUCCESS : RunStatus.FAILED,
            toolConfig: result.config || tool,
            error: result.error,
            completedAt: new Date(),
          },
        });
        handleWebhook(
          authReq,
          body.options?.webhookUrl,
          params.toolId,
          runId,
          result,
          body.credentials,
          body.options,
          metadata,
        );
      })
      .catch(async (error) => {
        logMessage("error", `Async tool execution error: ${String(error)}`, metadata);
        await authReq.datastore.updateRun({
          id: runId,
          orgId: authReq.authInfo.orgId,
          updates: {
            status: RunStatus.FAILED,
            toolConfig: tool,
            error: String(error),
            completedAt: new Date(),
          },
        });
      });

    return sendResponse(
      202,
      buildRunResponse({
        runId,
        tool,
        status: RunStatus.RUNNING,
        toolPayload: body.inputs,
        options: requestOptions,
        requestSource: "api",
        traceId: metadata.traceId,
        startedAt,
      }),
    );
  }

  // Sync execution
  try {
    const result = await authReq.workerPools.toolExecution.runTask(runId, taskPayload);
    const completedAt = new Date();
    const status = result.success ? RunStatus.SUCCESS : RunStatus.FAILED;

    await authReq.datastore.updateRun({
      id: runId,
      orgId: authReq.authInfo.orgId,
      updates: {
        status,
        toolConfig: result.config || tool,
        error: result.error,
        completedAt,
      },
    });
    handleWebhook(
      authReq,
      body.options?.webhookUrl,
      params.toolId,
      runId,
      result,
      body.credentials,
      body.options,
      metadata,
    );

    return sendResponse(
      200,
      buildRunResponse({
        runId,
        tool,
        status,
        toolPayload: body.inputs,
        data: result.data,
        error: result.error,
        stepResults: result.stepResults,
        options: requestOptions,
        requestSource: "api",
        traceId: metadata.traceId,
        startedAt,
        completedAt,
      }),
    );
  } catch (error: any) {
    logMessage("error", `Tool execution error: ${String(error)}`, metadata);
    const completedAt = new Date();
    const isAborted = error.message?.includes("abort") || error.name === "AbortError";
    const status = isAborted ? RunStatus.ABORTED : RunStatus.FAILED;

    await authReq.datastore.updateRun({
      id: runId,
      orgId: authReq.authInfo.orgId,
      updates: {
        status,
        toolConfig: tool,
        error: String(error),
        completedAt,
      },
    });

    return sendResponse(
      200,
      buildRunResponse({
        runId,
        tool,
        status,
        toolPayload: body.inputs,
        error: String(error),
        options: requestOptions,
        requestSource: "api",
        traceId: metadata.traceId,
        startedAt,
        completedAt,
      }),
    );
  }
};

registerApiModule({
  name: "tools",
  routes: [
    {
      method: "GET",
      path: "/tools",
      handler: listTools,
      permissions: { type: "list", resource: "tool", allowRestricted: true },
    },
    {
      method: "GET",
      path: "/tools/:toolId",
      handler: getTool,
      permissions: { type: "read", resource: "tool", allowRestricted: true, checkResourceId: "toolId" },
    },
    {
      method: "POST",
      path: "/tools/:toolId/run",
      handler: runTool,
      permissions: { type: "execute", resource: "tool", allowRestricted: true, checkResourceId: "toolId" },
    },
  ],
});
