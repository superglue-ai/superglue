import {
  RequestOptions,
  RequestSource,
  RunStatus,
  SuggestedTool,
  Tool,
  ToolResult,
  generateUniqueId,
  System,
  waitForSystemProcessing,
} from "@superglue/shared";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { parseJSON } from "../files/index.js";
import { RunLifecycleManager } from "../runs/index.js";
import { SystemManager } from "../systems/system-manager.js";
import { ToolBuilder } from "../tools/tool-builder.js";
import { ToolFinder } from "../tools/tool-finder.js";
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
  requestSource: RequestSource,
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
      RequestSource.TOOL_CHAIN,
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
  requestSource: RequestSource,
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
  if (tool.outputSchema && typeof tool.outputSchema === "string") {
    tool.outputSchema = parseJSON(tool.outputSchema);
  }

  const requestOptions: RequestOptions = {
    webhookUrl: options?.webhookUrl,
    timeout: options?.timeout,
  };

  const systemManagers = await SystemManager.forToolExecution(tool, authReq.datastore, metadata);

  // Use RunLifecycleManager for centralized run handling
  const lifecycle = new RunLifecycleManager(authReq.datastore, authReq.authInfo.orgId, metadata);
  const runContext = await lifecycle.startRun({
    tool,
    payload,
    options: requestOptions,
    requestSource,
  });

  const taskPayload: ToolExecutionPayload = {
    runId: runContext.runId,
    workflow: tool,
    payload,
    credentials: credentials as Record<string, string> | undefined,
    options: requestOptions,
    systems: systemManagers.map((m) => m.toSystemSync()),
    orgId: authReq.authInfo.orgId,
    traceId: metadata.traceId,
  };

  // Fire and forget execution
  authReq.workerPools.toolExecution
    .runTask(runContext.runId, taskPayload)
    .then(async (result) => {
      await lifecycle.completeRun(runContext, {
        success: result.success,
        tool: result.tool || tool,
        data: result.data,
        error: result.error,
        stepResults: result.stepResults,
      });
      handleWebhook(
        authReq,
        options?.webhookUrl,
        toolId,
        runContext.runId,
        result,
        credentials,
        options,
        metadata,
        requestSource,
      );
    })
    .catch(async (error: any) => {
      logMessage("error", `Tool execution error: ${String(error)}`, metadata);
      const isAborted = error.message?.includes("abort") || error.name === "AbortError";

      if (isAborted) {
        await lifecycle.abortRun(runContext, String(error));
      } else {
        await lifecycle.completeRun(runContext, {
          success: false,
          tool,
          error: String(error),
        });
      }
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
    const hasMore = offset + paginatedItems.length < total;

    return addTraceHeader(reply, authReq.traceId).code(200).send({
      data: paginatedItems,
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

  const hasMore = offset + result.items.length < result.total;

  return addTraceHeader(reply, authReq.traceId).code(200).send({
    data: result.items,
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

  return addTraceHeader(reply, authReq.traceId).code(200).send(tool);
};

// POST /tools/:toolId/run - Run a tool
const runTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const params = request.params as { toolId: string };
  const body = request.body as RunToolRequestBody;

  const traceId = body.options?.traceId || authReq.traceId;
  const metadata = { orgId: authReq.authInfo.orgId, traceId };
  const providedRunId = body.runId;

  // Source attribution:
  // - default: api (REST API calls are always API unless explicitly overridden)
  // - frontend/mcp: only if client explicitly asks for it
  // Note: userId presence doesn't indicate frontend - API keys can have associated users
  let requestSource: RequestSource = RequestSource.API;
  if (body.options?.requestSource === RequestSource.MCP) {
    requestSource = RequestSource.MCP;
  } else if (body.options?.requestSource === RequestSource.FRONTEND) {
    requestSource = RequestSource.FRONTEND;
  }

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
  if (tool.outputSchema && typeof tool.outputSchema === "string") {
    tool.outputSchema = parseJSON(tool.outputSchema);
  }

  const requestOptions: RequestOptions = {
    webhookUrl: body.options?.webhookUrl,
    timeout: body.options?.timeout,
  };

  const systemManagers = await SystemManager.forToolExecution(tool, authReq.datastore, metadata);

  // Use RunLifecycleManager for centralized run handling
  const lifecycle = new RunLifecycleManager(authReq.datastore, authReq.authInfo.orgId, metadata);
  const runContext = await lifecycle.startRun({
    runId: providedRunId,
    tool,
    payload: body.inputs as Record<string, unknown>,
    options: requestOptions,
    requestSource,
  });

  const taskPayload: ToolExecutionPayload = {
    runId: runContext.runId,
    workflow: tool,
    payload: body.inputs,
    credentials: body.credentials as Record<string, string> | undefined,
    options: requestOptions,
    systems: systemManagers.map((m) => m.toSystemSync()),
    orgId: authReq.authInfo.orgId,
    traceId: metadata.traceId,
  };

  const sendResponse = (statusCode: number, run: OpenAPIRun) => {
    return addTraceHeader(reply, metadata.traceId).code(statusCode).send(run);
  };

  // Async execution
  if (body.options?.async) {
    authReq.workerPools.toolExecution
      .runTask(runContext.runId, taskPayload)
      .then(async (result) => {
        await lifecycle.completeRun(runContext, {
          success: result.success,
          tool: result.tool || tool,
          data: result.data,
          error: result.error,
          stepResults: result.stepResults,
        });
        handleWebhook(
          authReq,
          body.options?.webhookUrl,
          params.toolId,
          runContext.runId,
          result,
          body.credentials,
          body.options,
          metadata,
          requestSource,
        );
      })
      .catch(async (error) => {
        logMessage("error", `Async tool execution error: ${String(error)}`, metadata);
        await lifecycle.completeRun(runContext, {
          success: false,
          tool,
          error: String(error),
        });
      });

    return sendResponse(
      202,
      buildRunResponse({
        runId: runContext.runId,
        tool,
        status: RunStatus.RUNNING,
        toolPayload: body.inputs,
        options: requestOptions,
        requestSource,
        traceId: metadata.traceId,
        startedAt: runContext.startedAt,
      }),
    );
  }

  // Sync execution
  try {
    const result = await authReq.workerPools.toolExecution.runTask(runContext.runId, taskPayload);
    const completedAt = new Date();
    const status = result.success ? RunStatus.SUCCESS : RunStatus.FAILED;

    await lifecycle.completeRun(runContext, {
      success: result.success,
      tool: result.tool || tool,
      data: result.data,
      error: result.error,
      stepResults: result.stepResults,
    });
    handleWebhook(
      authReq,
      body.options?.webhookUrl,
      params.toolId,
      runContext.runId,
      result,
      body.credentials,
      body.options,
      metadata,
      requestSource,
    );

    return sendResponse(
      200,
      buildRunResponse({
        runId: runContext.runId,
        tool,
        status,
        toolPayload: body.inputs,
        data: result.data,
        error: result.error,
        stepResults: result.stepResults,
        options: requestOptions,
        requestSource,
        traceId: metadata.traceId,
        startedAt: runContext.startedAt,
        completedAt,
      }),
    );
  } catch (error: any) {
    logMessage("error", `Tool execution error: ${String(error)}`, metadata);
    const completedAt = new Date();
    const isAborted = error.message?.includes("abort") || error.name === "AbortError";

    if (isAborted) {
      await lifecycle.abortRun(runContext, String(error));
    } else {
      await lifecycle.completeRun(runContext, {
        success: false,
        tool,
        error: String(error),
      });
    }

    const status = isAborted ? RunStatus.ABORTED : RunStatus.FAILED;

    return sendResponse(
      200,
      buildRunResponse({
        runId: runContext.runId,
        tool,
        status,
        toolPayload: body.inputs,
        error: String(error),
        options: requestOptions,
        requestSource,
        traceId: metadata.traceId,
        startedAt: runContext.startedAt,
        completedAt,
      }),
    );
  }
};

// Request body type for POST /tools/run
interface RunToolConfigRequestBody {
  tool: Tool;
  payload?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  options?: {
    timeout?: number;
  };
  runId?: string;
}

// POST /tools/run - Execute a tool by providing full config (no run record)
// This endpoint is for SDK/playground testing - it doesn't create a run record
const runToolConfig: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as RunToolConfigRequestBody;

  const traceId = authReq.traceId;
  const metadata = { orgId: authReq.authInfo.orgId, traceId };

  if (!body.tool) {
    return sendError(reply, 400, "Tool configuration is required");
  }

  if (!body.tool.steps || !Array.isArray(body.tool.steps)) {
    return sendError(reply, 400, "Tool must have steps array");
  }

  const tool = body.tool as Tool;

  // Parse schemas if strings
  if (tool.inputSchema && typeof tool.inputSchema === "string") {
    tool.inputSchema = parseJSON(tool.inputSchema);
  }
  if (tool.outputSchema && typeof tool.outputSchema === "string") {
    tool.outputSchema = parseJSON(tool.outputSchema);
  }

  const requestOptions: RequestOptions = {
    timeout: body.options?.timeout,
  };

  try {
    const systemManagers = await SystemManager.forToolExecution(tool, authReq.datastore, metadata);

    const runId = body.runId || crypto.randomUUID();
    const internalRunId = `${authReq.authInfo.orgId}:${runId}`;

    const taskPayload: ToolExecutionPayload = {
      runId: internalRunId,
      workflow: tool,
      payload: body.payload || {},
      credentials: body.credentials as Record<string, string> | undefined,
      options: requestOptions,
      systems: systemManagers.map((m) => m.toSystemSync()),
      orgId: authReq.authInfo.orgId,
      traceId,
    };

    const result = await authReq.workerPools.toolExecution.runTask(internalRunId, taskPayload);

    return addTraceHeader(reply, traceId)
      .code(200)
      .send({
        runId,
        success: result.success,
        data: result.data,
        error: result.error,
        stepResults: result.stepResults,
        tool: result.tool || tool,
      });
  } catch (error: any) {
    logMessage("error", `Tool config execution error: ${String(error)}`, metadata);

    return addTraceHeader(reply, traceId)
      .code(200)
      .send({
        runId: body.runId || "unknown",
        success: false,
        error: String(error),
        tool,
      });
  }
};

// Request body type for POST /tools (create)
interface CreateToolRequestBody {
  id?: string;
  name?: string;
  steps: Tool["steps"];
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

  if (!body.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
    return sendError(reply, 400, "Tool must have at least one step");
  }

  const toolId = body.id || crypto.randomUUID();

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
    name: body.name,
    steps: body.steps,
    instruction: body.instruction,
    inputSchema: body.inputSchema,
    outputSchema: body.outputSchema,
    outputTransform: body.outputTransform,
    folder: body.folder,
    responseFilters: body.responseFilters,
    archived: false,
  };

  const savedTool = await authReq.datastore.upsertWorkflow({
    id: toolId,
    workflow: tool,
    orgId: authReq.authInfo.orgId,
  });

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
    name: body.name !== undefined ? body.name : existingTool.name,
    steps: body.steps !== undefined ? body.steps : existingTool.steps,
    instruction: body.instruction !== undefined ? body.instruction : existingTool.instruction,
    inputSchema: body.inputSchema !== undefined ? body.inputSchema : existingTool.inputSchema,
    outputSchema: body.outputSchema !== undefined ? body.outputSchema : existingTool.outputSchema,
    outputTransform:
      body.outputTransform !== undefined ? body.outputTransform : existingTool.outputTransform,
    folder: body.folder !== undefined ? body.folder : existingTool.folder,
    archived: body.archived !== undefined ? body.archived : existingTool.archived,
    responseFilters:
      body.responseFilters !== undefined ? body.responseFilters : existingTool.responseFilters,
  };

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

  if (!body.newId || typeof body.newId !== "string") {
    return sendError(reply, 400, "newId is required");
  }

  if (body.newId === params.toolId) {
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
    id: body.newId,
    orgId: authReq.authInfo.orgId,
  });

  if (conflictingTool) {
    return sendError(reply, 409, `Tool with id ${body.newId} already exists`);
  }

  // Create tool with new ID
  const renamedTool: Tool = {
    ...existingTool,
    id: body.newId,
  };

  await authReq.datastore.upsertWorkflow({
    id: body.newId,
    workflow: renamedTool,
    orgId: authReq.authInfo.orgId,
  });

  // Delete old tool
  await authReq.datastore.deleteWorkflow({
    id: params.toolId,
    orgId: authReq.authInfo.orgId,
  });

  logMessage("info", `Tool ${params.toolId} renamed to ${body.newId}`, metadata);

  return addTraceHeader(reply, authReq.traceId).code(200).send(renamedTool);
};

// Request body type for POST /tools/build
interface BuildToolRequestBody {
  instruction: string;
  payload?: Record<string, unknown>;
  systemIds?: string[];
  outputSchema?: JSONSchema;
}

// POST /tools/build - Build a new tool using AI
const buildTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as BuildToolRequestBody;
  const metadata = authReq.toMetadata();

  // Validate instruction
  if (!body.instruction?.trim()) {
    return sendError(reply, 400, "Instruction is required to build a tool");
  }

  try {
    const { instruction, payload = {}, systemIds, outputSchema } = body;

    // Resolve systems if provided
    let resolvedSystems: System[] = [];
    if (systemIds && systemIds.length > 0) {
      const datastoreAdapter = {
        getSystem: async (id: string): Promise<System | null> => {
          const result = await authReq.datastore.getSystem({
            id,
            includeDocs: true,
            orgId: authReq.authInfo.orgId,
          });
          return result || null;
        },
        getManySystems: async (ids: string[]): Promise<System[]> => {
          return await authReq.datastore.getManySystems({
            ids,
            includeDocs: true,
            orgId: authReq.authInfo.orgId,
          });
        },
      };
      resolvedSystems = await waitForSystemProcessing(datastoreAdapter, systemIds);
    }

    // Build the tool using ToolBuilder
    const builder = new ToolBuilder(instruction, resolvedSystems, payload, outputSchema, metadata);
    const tool = await builder.buildTool();

    // Generate unique ID
    tool.id = await generateUniqueId({
      baseId: tool.id,
      exists: async (id) =>
        !!(await authReq.datastore.getWorkflow({ id, orgId: authReq.authInfo.orgId })),
    });

    logMessage("info", `Tool ${tool.id} built successfully`, metadata);

    return addTraceHeader(reply, authReq.traceId).code(200).send(tool);
  } catch (error: any) {
    logMessage("error", `Failed to build tool: ${error}`, metadata);
    return sendError(reply, 500, `Failed to build tool: ${error.message || String(error)}`);
  }
};

// GET /tools/search - Search for relevant tools
const searchTools: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const query = request.query as { q?: string };
  const metadata = authReq.toMetadata();

  try {
    const allTools = await authReq.datastore.listWorkflows({
      limit: 1000,
      offset: 0,
      orgId: authReq.authInfo.orgId,
    });

    const tools = (allTools.items || [])
      .filter((tool) => !tool.archived)
      .map((tool) => ({
        ...tool,
        inputSchema:
          typeof tool.inputSchema === "string" ? parseJSON(tool.inputSchema) : tool.inputSchema,
        outputSchema:
          typeof tool.outputSchema === "string" ? parseJSON(tool.outputSchema) : tool.outputSchema,
      }));

    const finder = new ToolFinder(metadata);
    const results: SuggestedTool[] = await finder.findTools(query.q, tools);

    return addTraceHeader(reply, authReq.traceId).code(200).send({ data: results });
  } catch (error) {
    logMessage("error", `Error searching tools: ${String(error)}`, metadata);
    return addTraceHeader(reply, authReq.traceId).code(200).send({ data: [] });
  }
};

registerApiModule({
  name: "tools",
  routes: [
    {
      method: "GET",
      path: "/tools",
      handler: listTools,
      permissions: { type: "read", resource: "tool", allowRestricted: true },
    },
    {
      method: "POST",
      path: "/tools",
      handler: createTool,
      permissions: { type: "write", resource: "tool", allowRestricted: false },
    },
    {
      method: "GET",
      path: "/tools/search",
      handler: searchTools,
      permissions: { type: "read", resource: "tool", allowRestricted: false },
    },
    {
      method: "GET",
      path: "/tools/:toolId",
      handler: getTool,
      permissions: {
        type: "read",
        resource: "tool",
        allowRestricted: true,
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
        allowRestricted: false,
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
        allowRestricted: false,
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
        allowRestricted: false,
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
        allowRestricted: false,
      },
    },
    {
      method: "POST",
      path: "/tools/build",
      handler: buildTool,
      permissions: {
        type: "write",
        resource: "tool",
        allowRestricted: false,
      },
    },
    {
      method: "POST",
      path: "/tools/:toolId/run",
      handler: runTool,
      permissions: {
        type: "execute",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      },
    },
  ],
});
