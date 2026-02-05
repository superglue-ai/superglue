import { ToolStep, RequestOptions, ResponseFilter, Tool, ToolDiff } from "@superglue/shared";
import { SystemManager } from "../systems/system-manager.js";
import { ToolFixer } from "../tools/tool-fixer.js";
import { logMessage } from "../utils/logs.js";
import type { ToolExecutionPayload } from "../worker/types.js";
import { registerApiModule } from "./registry.js";
import { addTraceHeader, sendError } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

// Step execution types (internal only, not in OpenAPI spec)
interface RunStepRequestOptions {
  timeout?: number;
}

interface RunStepRequestBody {
  step: Record<string, unknown>; // ToolStep
  payload?: Record<string, unknown>;
  previousResults?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  options?: RunStepRequestOptions;
  runId?: string; // Client-provided runId for abort tracking
}

interface RunStepResponse {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  updatedStep?: Record<string, unknown>; // ToolStep if self-healed
}

// Transform execution types (internal only, not in OpenAPI spec)
interface RunTransformRequestBody {
  outputTransform: string;
  outputSchema?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  stepResults?: Record<string, unknown>;
  responseFilters?: Array<Record<string, unknown>>;
  options?: RunStepRequestOptions;
  runId?: string; // Client-provided runId for abort tracking
}

interface RunTransformResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  updatedTransform?: string;
  updatedOutputSchema?: Record<string, unknown>;
}

// POST /tools/step/run - Execute a single step without creating a run
const runStep: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as RunStepRequestBody;

  const traceId = authReq.traceId;
  const metadata = { orgId: authReq.authInfo.orgId, traceId };

  if (!body.step) {
    return sendError(reply, 400, "Step configuration is required");
  }

  const step = body.step as unknown as ToolStep;
  const clientRunId = body.runId || crypto.randomUUID();
  const runId = `${authReq.authInfo.orgId}:${clientRunId}`;

  const requestOptions: RequestOptions = {
    timeout: body.options?.timeout,
  };

  // Create a temporary single-step tool for execution
  const tempTool: Tool = {
    id: `temp_step_${step.id}`,
    steps: [step],
    outputTransform: "",
  } as Tool;

  // Build the execution payload combining tool input and previous results
  const executionPayload = {
    ...(body.payload || {}),
    ...(body.previousResults || {}),
  };

  // Get system managers for tool execution
  const systemManagers = await SystemManager.forToolExecution(
    tempTool,
    authReq.datastore,
    metadata,
  );

  const taskPayload: ToolExecutionPayload = {
    runId,
    workflow: tempTool,
    payload: executionPayload,
    credentials: body.credentials as Record<string, string> | undefined,
    options: requestOptions,
    systems: systemManagers.map((m) => m.toSystemSync()),
    orgId: authReq.authInfo.orgId,
    traceId,
  };

  try {
    const result = await authReq.workerPools.toolExecution.runTask(runId, taskPayload);
    const stepResult = result.stepResults?.[0];

    const response: RunStepResponse = {
      stepId: step.id,
      success: result.success,
      data: stepResult?.data,
      error: result.error,
      updatedStep: result.tool?.steps?.[0] as unknown as Record<string, unknown> | undefined,
    };

    return addTraceHeader(reply, traceId).code(200).send(response);
  } catch (error: any) {
    logMessage("error", `Step execution error: ${String(error)}`, metadata);

    const response: RunStepResponse = {
      stepId: step.id,
      success: false,
      error: String(error),
    };

    return addTraceHeader(reply, traceId).code(200).send(response);
  }
};

// POST /tools/transform/run - Execute a final transform without creating a run
const runTransform: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as RunTransformRequestBody;

  const traceId = authReq.traceId;
  const metadata = { orgId: authReq.authInfo.orgId, traceId };

  if (!body.outputTransform && !body.responseFilters?.length) {
    return sendError(reply, 400, "Either outputTransform or responseFilters is required");
  }

  const clientRunId = body.runId || crypto.randomUUID();
  const runId = `${authReq.authInfo.orgId}:${clientRunId}`;

  const requestOptions: RequestOptions = {
    timeout: body.options?.timeout,
  };

  // Create a temporary tool with no steps, just the transform
  const tempTool: Tool = {
    id: `temp_transform`,
    steps: [],
    outputTransform: body.outputTransform || "",
    outputSchema: body.outputSchema,
    inputSchema: body.inputSchema,
    responseFilters: body.responseFilters as unknown as ResponseFilter[] | undefined,
  } as Tool;

  // Build the execution payload combining tool input and step results
  const executionPayload = {
    ...(body.payload || {}),
    ...(body.stepResults || {}),
  };

  const taskPayload: ToolExecutionPayload = {
    runId,
    workflow: tempTool,
    payload: executionPayload,
    credentials: undefined,
    options: requestOptions,
    systems: [],
    orgId: authReq.authInfo.orgId,
    traceId,
  };

  try {
    const result = await authReq.workerPools.toolExecution.runTask(runId, taskPayload);

    const response: RunTransformResponse = {
      success: result.success,
      data: result.data,
      error: result.error,
      updatedTransform: result.tool?.outputTransform,
      updatedOutputSchema: result.tool?.outputSchema as Record<string, unknown> | undefined,
    };

    return addTraceHeader(reply, traceId).code(200).send(response);
  } catch (error: any) {
    logMessage("error", `Transform execution error: ${String(error)}`, metadata);

    const response: RunTransformResponse = {
      success: false,
      error: String(error),
    };

    return addTraceHeader(reply, traceId).code(200).send(response);
  }
};

// POST /tools/step/abort - Abort an in-flight step execution by runId
const abortStep: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const { runId } = request.body as { runId: string };

  if (!runId) {
    return sendError(reply, 400, "runId is required");
  }

  const internalRunId = `${authReq.authInfo.orgId}:${runId}`;
  authReq.workerPools.toolExecution.abortTask(internalRunId);
  return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true, runId });
};

// Fix tool types (internal only, not in OpenAPI spec)
interface FixToolRequestBody {
  tool: Tool;
  fixInstructions: string;
  lastError?: string;
  stepResults?: Array<{
    stepId: string;
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
}

interface FixToolResponse {
  success: boolean;
  tool?: Tool;
  diffs?: ToolDiff[];
  error?: string;
}

// POST /tools/fix - Fix a tool using LLM-generated patches
const fixTool: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as FixToolRequestBody;
  const metadata = authReq.toMetadata();

  if (!body.tool) {
    return sendError(reply, 400, "Tool configuration is required");
  }

  if (!body.fixInstructions || body.fixInstructions.trim() === "") {
    return sendError(reply, 400, "Fix instructions are required");
  }

  try {
    // Fetch system IDs for validation and LLM context (no need for full docs)
    const allSystems = await authReq.datastore.listSystems({
      limit: 1000,
      offset: 0,
      includeDocs: false,
      orgId: authReq.authInfo.orgId,
    });

    const fixer = new ToolFixer({
      tool: body.tool,
      fixInstructions: body.fixInstructions,
      systems: allSystems.items || [],
      lastError: body.lastError,
      stepResults: body.stepResults,
      metadata,
    });

    const result = await fixer.fixTool();

    const response: FixToolResponse = {
      success: true,
      tool: result.tool,
      diffs: result.diffs,
    };

    return addTraceHeader(reply, authReq.traceId).code(200).send(response);
  } catch (error: any) {
    logMessage("error", `Tool fix error: ${String(error)}`, metadata);

    const response: FixToolResponse = {
      success: false,
      error: String(error),
    };

    return addTraceHeader(reply, authReq.traceId).code(200).send(response);
  }
};

registerApiModule({
  name: "tool-internal",
  routes: [
    {
      method: "POST",
      path: "/tools/step/run",
      handler: runStep,
      permissions: {
        type: "execute",
        resource: "tool",
        allowRestricted: false,
      },
    },
    {
      method: "POST",
      path: "/tools/transform/run",
      handler: runTransform,
      permissions: {
        type: "execute",
        resource: "tool",
        allowRestricted: false,
      },
    },
    {
      method: "POST",
      path: "/tools/step/abort",
      handler: abortStep,
      permissions: {
        type: "execute",
        resource: "tool",
        allowRestricted: false,
      },
    },
    {
      method: "POST",
      path: "/tools/fix",
      handler: fixTool,
      permissions: {
        type: "write",
        resource: "tool",
        allowRestricted: false,
      },
    },
  ],
});
