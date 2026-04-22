import {
  ExecutionFileEnvelope,
  RequestOptions,
  RequestSource,
  RunStatus,
  ServiceMetadata,
  Tool,
  ToolResult,
  generateUniqueId,
  getToolSystemIds,
  getBaseRoleId,
  validateToolStructure,
} from "@superglue/shared";
import { JsonStreamStringify } from "json-stream-stringify";
import { parseJSON } from "../files/index.js";
import {
  executeTool,
  executeToolAsync,
  ToolExecutionContext,
  ToolChainCallback,
} from "../tools/tool-execution-service.js";
import { logMessage } from "../utils/logs.js";
import { resolveUserEmailIfNeeded } from "../utils/user-lookup.js";
import { applyResponseFilters } from "../tools/response-filters.js";
import { filterToolsByPermissionAsync, checkToolExecutionPermissionAsync } from "./ee/index.js";
import { isEEDataStore } from "../datastore/ee/types.js";
import { registerApiModule } from "./registry.js";
import {
  addTraceHeader,
  mapRunStatusToOpenAPI,
  normalizeSchema,
  parsePaginationParams,
  resolveClientRequestSource,
  sendError,
} from "./response-helpers.js";
import type {
  AuthenticatedFastifyRequest,
  OpenAPIRun,
  RouteHandler,
  RunToolRequestBody,
} from "./types.js";

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
    tool: tool,
    toolId: tool.id,
    status: mapRunStatusToOpenAPI(status),
    toolPayload,
    data,
    error,
    // Exclude step data to reduce response size (can be 2x-5x smaller)
    // Full step results available via resultStorageUri if needed
    stepResults: stepResults?.map((sr) => ({
      stepId: sr.stepId,
      success: sr.success,
      error: sr.error,
      stepFileKeys: sr.stepFileKeys,
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

/**
 * Create a tool chain callback for REST API tool execution.
 * This allows tools to trigger other tools via tool: webhooks.
 */
function createToolChainCallback(
  authReq: AuthenticatedFastifyRequest,
  metadata: ServiceMetadata,
): ToolChainCallback {
  return (
    chainToolId: string,
    resultData: unknown,
    credentials?: Record<string, string>,
    options?: RequestOptions,
    mode?: "dev" | "prod",
  ) => {
    // Fire-and-forget chain execution
    executeToolByIdAsync(
      authReq,
      chainToolId,
      resultData,
      credentials,
      options,
      metadata,
      mode,
    ).catch((error) => {
      logMessage(
        "error",
        `Tool chain execution failed for ${chainToolId}: ${error.message || String(error)}`,
        metadata,
      );
    });
  };
}

/**
 * Execute a tool by ID asynchronously (fire-and-forget).
 * Used for tool chaining via tool: webhooks.
 */
async function executeToolByIdAsync(
  authReq: AuthenticatedFastifyRequest,
  toolId: string,
  payload: unknown,
  credentials: Record<string, string> | undefined,
  options: RequestOptions | undefined,
  metadata: ServiceMetadata,
  mode?: "dev" | "prod",
): Promise<void> {
  const tool = await authReq.datastore.getWorkflow({
    id: toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!tool) {
    logMessage("error", `Tool ${toolId} not found for chain execution`, metadata);
    return;
  }

  if (tool.archived) {
    logMessage("error", `Cannot execute archived tool ${toolId}`, metadata);
    return;
  }

  // Parse schemas if strings
  if (tool.inputSchema && typeof tool.inputSchema === "string") {
    tool.inputSchema = parseJSON(tool.inputSchema);
  }
  if (tool.outputSchema && typeof tool.outputSchema === "string") {
    tool.outputSchema = parseJSON(tool.outputSchema);
  }

  const ctx: ToolExecutionContext = {
    datastore: authReq.datastore,
    workerPools: authReq.workerPools,
    orgId: authReq.authInfo.orgId,
    metadata,
    requestSource: RequestSource.TOOL_CHAIN,
  };

  // Execute with chain callback for nested chains, propagating mode
  await executeToolAsync(ctx, {
    tool,
    payload: payload as Record<string, unknown>,
    credentials,
    requestOptions: options,
    userId: metadata.userId,
    onToolChain: createToolChainCallback(authReq, metadata),
    mode,
  });
}

// GET /tools - List tools
const listTools: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as { page?: string; limit?: string; includeArchived?: string };
  const includeArchived = query.includeArchived === "true";

  const { page, limit, offset } = parsePaginationParams(query);

  const result = await authReq.datastore.listWorkflows({
    limit: 10000,
    offset: 0,
    orgId: authReq.authInfo.orgId,
    includeArchived,
  });

  // Apply consolidated permission filter (API key scopes + RBAC + multi-tenancy)
  const toolsWithSystemIds = result.items.map((tool) => ({
    ...tool,
    systemIds: getToolSystemIds(tool),
  }));
  const filteredItems = await filterToolsByPermissionAsync(
    {
      userId: authReq.authInfo.userId,
      orgId: authReq.authInfo.orgId,
      roles: authReq.authInfo.roles,
      dataStore: authReq.datastore,
    },
    toolsWithSystemIds,
  );

  const total = filteredItems.length;
  const paginatedItems = filteredItems.slice(offset, offset + limit);
  const hasMore = offset + paginatedItems.length < total;

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    data: paginatedItems,
    page,
    limit,
    total,
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

  return addTraceHeader(reply, authReq.traceId).code(200).send(tool);
};

// POST /tools/:toolId/run - Run a tool
const runTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const body = request.body as RunToolRequestBody | undefined;

  const traceId = body?.options?.traceId || authReq.traceId;

  const requestSource = resolveClientRequestSource(body?.options?.requestSource);

  // Idempotency check
  if (body?.runId) {
    const existingRun = await authReq.datastore.getRun({
      id: body?.runId,
      orgId: authReq.authInfo.orgId,
    });
    if (existingRun) {
      return sendError(reply, 409, `Run with id ${body?.runId} already exists`);
    }
  }

  const tool = await authReq.datastore.getWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!tool) {
    return sendError(reply, 404, "Tool not found");
  }

  // EE: Check all permissions (API key scopes + end-user system scopes + multi-tenancy)
  const permCheck = await checkToolExecutionPermissionAsync(
    {
      userId: authReq.authInfo.userId,
      orgId: authReq.authInfo.orgId,
      roles: authReq.authInfo.roles,
      dataStore: authReq.datastore,
    },
    { id: tool.id, systemIds: getToolSystemIds(tool) },
  );
  if (!permCheck.allowed) {
    return sendError(reply, 403, permCheck.error || "Not authorized to execute this tool");
  }

  if (tool.archived) {
    return sendError(reply, 400, "Cannot execute archived tool");
  }

  // Parse schemas if strings
  if (tool.inputSchema && typeof tool.inputSchema === "string") {
    tool.inputSchema = parseJSON(tool.inputSchema);
  }
  if (tool.outputSchema && typeof tool.outputSchema === "string") {
    tool.outputSchema = parseJSON(tool.outputSchema);
  }

  const toolValidation = validateToolStructure(tool);
  if (toolValidation.valid === false) {
    return sendError(reply, 400, toolValidation.error);
  }

  // Lazy resolve user email - only fetch if tool config references sg_auth_email
  const userEmail = await resolveUserEmailIfNeeded({
    toolConfig: tool,
    userId: authReq.authInfo.userId,
    existingEmail: authReq.authInfo.userEmail,
  });

  const metadata: ServiceMetadata = {
    orgId: authReq.authInfo.orgId,
    traceId,
    userId: authReq.authInfo.userId,
    userEmail,
    roleIds: authReq.authInfo.roles.map((r) => r.id),
  };

  const requestOptions: RequestOptions = {
    webhookUrl: body?.options?.webhookUrl,
    timeout: body?.options?.timeout,
  };

  // Build execution context
  const ctx: ToolExecutionContext = {
    datastore: authReq.datastore,
    workerPools: authReq.workerPools,
    orgId: authReq.authInfo.orgId,
    metadata,
    requestSource,
  };

  const sendResponse = (statusCode: number, run: OpenAPIRun) => {
    const jsonStream = new JsonStreamStringify(run);
    addTraceHeader(reply, metadata.traceId)
      .code(statusCode)
      .header("Content-Type", "application/json");
    return reply.send(jsonStream);
  };

  // Async execution - fire and forget, return 202 immediately
  if (body?.options?.async) {
    const { runId, startedAt } = await executeToolAsync(ctx, {
      tool,
      payload: body?.inputs as Record<string, unknown>,
      files: body?.files as Record<string, ExecutionFileEnvelope> | undefined,
      credentials: body?.credentials as Record<string, string> | undefined,
      requestOptions,
      runId: body?.runId,
      userId: metadata.userId,
      onToolChain: createToolChainCallback(authReq, metadata),
      mode: body?.options?.mode || "prod",
    });

    (authReq as any)._telemetry = {
      toolId: params.toolId,
      stepCount: tool.steps?.length,
      requestSource,
      isAsync: true,
    };

    return sendResponse(
      202,
      buildRunResponse({
        runId,
        tool,
        status: RunStatus.RUNNING,
        toolPayload: body?.inputs,
        options: requestOptions,
        requestSource,
        traceId: metadata.traceId,
        startedAt,
      }),
    );
  }

  // Sync execution - wait for result
  const result = await executeTool(ctx, {
    tool,
    payload: body?.inputs as Record<string, unknown>,
    files: body?.files as Record<string, ExecutionFileEnvelope> | undefined,
    credentials: body?.credentials as Record<string, string> | undefined,
    requestOptions,
    runId: body?.runId,
    userId: metadata.userId,
    onToolChain: createToolChainCallback(authReq, metadata),
    mode: body?.options?.mode || "prod",
  });

  const status = result.success ? RunStatus.SUCCESS : RunStatus.FAILED;

  (authReq as any)._telemetry = {
    toolId: params.toolId,
    toolSuccess: result.success,
    stepCount: tool.steps?.length,
    requestSource,
    isAsync: false,
  };

  return sendResponse(
    200,
    buildRunResponse({
      runId: result.runId,
      tool: result.tool || tool,
      status,
      toolPayload: body?.inputs,
      data: result.data,
      error: result.error,
      stepResults: result.stepResults,
      options: requestOptions,
      requestSource,
      traceId: metadata.traceId,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
    }),
  );
};

// Request body type for POST /tools/run
interface RunToolConfigRequestBody {
  tool: Tool;
  payload?: Record<string, unknown>;
  files?: Record<string, ExecutionFileEnvelope>;
  credentials?: Record<string, unknown>;
  options?: {
    timeout?: number;
    requestSource?: string;
  };
  runId?: string;
}

// POST /tools/run - Execute a tool by providing full config
// Creates a run record when ?createRun=true query param is passed
const runToolConfig: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as RunToolConfigRequestBody;
  const query = request.query as Record<string, string>;

  const traceId = authReq.traceId;
  const createRun = query.createRun === "true";

  if (!body?.tool) {
    return sendError(reply, 400, "Tool configuration is required");
  }

  if (!body?.tool.steps || !Array.isArray(body?.tool.steps)) {
    return sendError(reply, 400, "Tool must have steps array");
  }

  const tool = body?.tool as Tool;

  if (tool.inputSchema && typeof tool.inputSchema === "string") {
    tool.inputSchema = parseJSON(tool.inputSchema);
  }
  if (tool.outputSchema && typeof tool.outputSchema === "string") {
    tool.outputSchema = parseJSON(tool.outputSchema);
  }

  if (createRun && body?.runId) {
    const existingRun = await authReq.datastore.getRun({
      id: body.runId,
      orgId: authReq.authInfo.orgId,
    });
    if (existingRun) {
      return sendError(reply, 409, `Run with id ${body.runId} already exists`);
    }
  }

  const clientRunId = body?.runId || crypto.randomUUID();
  const internalRunId = createRun ? clientRunId : `${authReq.authInfo.orgId}:${clientRunId}`;

  if (createRun && !tool.id) {
    tool.id = `inline-${clientRunId}`;
  }

  const toolValidation = validateToolStructure(tool);
  if (toolValidation.valid === false) {
    return sendError(reply, 400, toolValidation.error);
  }

  // Lazy resolve user email - only fetch if tool config references sg_auth_email
  const userEmail = await resolveUserEmailIfNeeded({
    toolConfig: tool,
    userId: authReq.authInfo.userId,
    existingEmail: authReq.authInfo.userEmail,
  });

  const metadata: ServiceMetadata = {
    orgId: authReq.authInfo.orgId,
    traceId,
    userEmail,
    userId: authReq.authInfo.userId,
    roleIds: authReq.authInfo.roles.map((r) => r.id),
  };

  const requestSource = resolveClientRequestSource(body?.options?.requestSource);

  const ctx: ToolExecutionContext = {
    datastore: authReq.datastore,
    workerPools: authReq.workerPools,
    orgId: authReq.authInfo.orgId,
    metadata,
    requestSource,
  };

  const result = await executeTool(ctx, {
    tool,
    payload: body?.payload || {},
    files: body?.files,
    credentials: body?.credentials as Record<string, string> | undefined,
    requestOptions: { timeout: body?.options?.timeout },
    createRun,
    runId: internalRunId,
    ...(createRun && { userId: metadata.userId }),
  });

  const status = result.success ? RunStatus.SUCCESS : RunStatus.FAILED;

  (authReq as any)._telemetry = {
    toolSuccess: result.success,
    stepCount: tool.steps?.length,
    requestSource: RequestSource.API,
  };

  const response = buildRunResponse({
    runId: clientRunId,
    tool: result.tool || tool,
    status,
    toolPayload: body?.payload,
    data: result.data,
    error: result.error,
    stepResults: result.stepResults,
    options: { timeout: body?.options?.timeout },
    requestSource,
    traceId,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  });

  // Use JsonStreamStringify to handle large payloads that exceed V8 string limits
  const responsePayload = {
    ...response,
    success: result.success, // Deprecated: for backward compatibility with old CLI
  };
  const jsonStream = new JsonStreamStringify(responsePayload);
  addTraceHeader(reply, traceId).code(200).header("Content-Type", "application/json");
  return reply.send(jsonStream);
};

// Request body type for POST /tools (create)
interface CreateToolRequestBody {
  id?: string;
  name?: string;
  steps?: Tool["steps"];
  instruction?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  outputTransform?: string;
  folder?: string;
  responseFilters?: Tool["responseFilters"];
}

// POST /tools - Create a new tool
const createTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as CreateToolRequestBody;
  const metadata = authReq.toMetadata();

  const toolId = body?.id || crypto.randomUUID();

  // Check if tool already exists
  const existingTool = await authReq.datastore.getWorkflow({
    id: toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (existingTool) {
    return sendError(reply, 409, `Tool with id ${toolId} already exists`);
  }

  const tool: Tool = {
    id: toolId,
    name: body?.name,
    steps: body?.steps,
    instruction: body?.instruction,
    inputSchema: normalizeSchema(body?.inputSchema),
    outputSchema: normalizeSchema(body?.outputSchema),
    outputTransform: body?.outputTransform,
    folder: body?.folder,
    responseFilters: body?.responseFilters,
    archived: false,
  };

  const toolValidation = validateToolStructure(tool);
  if (toolValidation.valid === false) {
    return sendError(reply, 400, toolValidation.error);
  }

  const savedTool = await authReq.datastore.upsertWorkflow({
    id: toolId,
    workflow: tool,
    orgId: authReq.authInfo.orgId,
  });

  if (isEEDataStore(authReq.datastore)) {
    const baseRoleId = getBaseRoleId(authReq.authInfo.roles);
    if (baseRoleId) {
      await authReq.datastore.appendToolToRole({
        roleId: baseRoleId,
        toolId,
        orgId: authReq.authInfo.orgId,
      });
    }
  }

  logMessage("info", `Tool ${toolId} created`, metadata);

  return addTraceHeader(reply, authReq.traceId).code(201).send(savedTool);
};

// Request body type for PUT /tools/:toolId (update)
interface UpdateToolRequestBody {
  name?: string;
  steps?: Tool["steps"];
  instruction?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  outputTransform?: string;
  folder?: string;
  archived?: boolean;
  responseFilters?: Tool["responseFilters"];
}

// PUT /tools/:toolId - Update an existing tool
const updateTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const body = request.body as UpdateToolRequestBody;
  const metadata = authReq.toMetadata();

  const existingTool = await authReq.datastore.getWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!existingTool) {
    return sendError(reply, 404, "Tool not found");
  }

  // Merge updates with existing tool
  const updatedTool: Tool = {
    ...existingTool,
    name: body?.name !== undefined ? body?.name : existingTool.name,
    steps: body?.steps !== undefined ? body?.steps : existingTool.steps,
    instruction: body?.instruction !== undefined ? body?.instruction : existingTool.instruction,
    inputSchema:
      body?.inputSchema !== undefined
        ? normalizeSchema(body.inputSchema)
        : existingTool.inputSchema,
    outputSchema:
      body?.outputSchema !== undefined
        ? normalizeSchema(body.outputSchema)
        : existingTool.outputSchema,
    outputTransform:
      body?.outputTransform !== undefined ? body?.outputTransform : existingTool.outputTransform,
    folder: body?.folder !== undefined ? body?.folder : existingTool.folder,
    archived: body?.archived !== undefined ? body?.archived : existingTool.archived,
    responseFilters:
      body?.responseFilters !== undefined ? body?.responseFilters : existingTool.responseFilters,
  };

  const toolValidation = validateToolStructure(updatedTool);
  if (toolValidation.valid === false) {
    return sendError(reply, 400, toolValidation.error);
  }

  const savedTool = await authReq.datastore.upsertWorkflow({
    id: params.toolId,
    workflow: updatedTool,
    orgId: authReq.authInfo.orgId,
  });

  logMessage("info", `Tool ${params.toolId} updated`, metadata);

  return addTraceHeader(reply, authReq.traceId).code(200).send(savedTool);
};

// DELETE /tools/:toolId - Delete a tool
const deleteTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const metadata = authReq.toMetadata();

  const existingTool = await authReq.datastore.getWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!existingTool) {
    return sendError(reply, 404, "Tool not found");
  }

  const success = await authReq.datastore.deleteWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!success) {
    return sendError(reply, 500, "Failed to delete tool");
  }

  if (isEEDataStore(authReq.datastore)) {
    await authReq.datastore.removeToolFromRoles({
      toolId: params.toolId,
      orgId: authReq.authInfo.orgId,
    });
  }

  logMessage("info", `Tool ${params.toolId} deleted`, metadata);

  return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true });
};

// Request body type for POST /tools/:toolId/rename
interface RenameToolRequestBody {
  newId: string;
}

// POST /tools/:toolId/rename - Rename a tool (change its ID)
const renameTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const body = request.body as RenameToolRequestBody;
  const metadata = authReq.toMetadata();

  if (!body?.newId || typeof body?.newId !== "string") {
    return sendError(reply, 400, "newId is required");
  }

  if (body?.newId === params.toolId) {
    return sendError(reply, 400, "newId must be different from current id");
  }

  const existingTool = await authReq.datastore.getWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (!existingTool) {
    return sendError(reply, 404, "Tool not found");
  }

  // Check if new ID already exists
  const conflictingTool = await authReq.datastore.getWorkflow({
    id: body?.newId,
    orgId: authReq.authInfo.orgId,
  });

  if (conflictingTool) {
    return sendError(reply, 409, `Tool with id ${body?.newId} already exists`);
  }

  // Create tool with new ID
  const renamedTool: Tool = {
    ...existingTool,
    id: body?.newId,
  };

  await authReq.datastore.upsertWorkflow({
    id: body?.newId,
    workflow: renamedTool,
    orgId: authReq.authInfo.orgId,
  });

  // Delete old tool
  await authReq.datastore.deleteWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  if (isEEDataStore(authReq.datastore)) {
    await authReq.datastore.renameToolInRoles({
      oldToolId: params.toolId,
      newToolId: body?.newId,
      orgId: authReq.authInfo.orgId,
    });
  }

  logMessage("info", `Tool ${params.toolId} renamed to ${body?.newId}`, metadata);

  return addTraceHeader(reply, authReq.traceId).code(200).send(renamedTool);
};

registerApiModule({
  name: "tools",
  routes: [
    {
      method: "GET",
      path: "/tools",
      handler: listTools,
      permissions: {
        type: "read",
        resource: "tool",
        allowedBaseRoles: ["admin", "member", "enduser"],
      },
    },
    {
      method: "POST",
      path: "/tools",
      handler: createTool,
      permissions: { type: "write", resource: "tool", allowedBaseRoles: ["admin", "member"] },
    },
    {
      method: "GET",
      path: "/tools/:toolId",
      handler: getTool,
      permissions: {
        type: "read",
        resource: "tool",
        allowedBaseRoles: ["admin", "member", "enduser"],
        checkResourceId: "toolId",
      },
    },
    {
      method: "PUT",
      path: "/tools/:toolId",
      handler: updateTool,
      permissions: {
        type: "write",
        resource: "tool",
        allowedBaseRoles: ["admin", "member"],
        checkResourceId: "toolId",
      },
    },
    {
      method: "DELETE",
      path: "/tools/:toolId",
      handler: deleteTool,
      permissions: {
        type: "delete",
        resource: "tool",
        allowedBaseRoles: ["admin", "member"],
        checkResourceId: "toolId",
      },
    },
    {
      method: "POST",
      path: "/tools/:toolId/rename",
      handler: renameTool,
      permissions: {
        type: "write",
        resource: "tool",
        allowedBaseRoles: ["admin", "member"],
        checkResourceId: "toolId",
      },
    },
    {
      method: "POST",
      path: "/tools/run",
      handler: runToolConfig,
      permissions: {
        type: "execute",
        resource: "tool",
        allowedBaseRoles: ["admin", "member"],
      },
    },
    {
      method: "POST",
      path: "/tools/:toolId/run",
      handler: runTool,
      permissions: {
        type: "execute",
        resource: "tool",
        allowedBaseRoles: ["admin", "member", "enduser"],
        checkResourceId: "toolId",
      },
    },
  ],
});
