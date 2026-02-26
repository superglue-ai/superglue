import { ToolStep, ResponseFilter, Tool, RequestSource, ServiceMetadata } from "@superglue/shared";
import { executeTool, ToolExecutionContext } from "../tools/tool-execution-service.js";
import { logMessage } from "../utils/logs.js";
import { registerApiModule } from "./registry.js";
import { addTraceHeader, sendError } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

export function rewriteUrlForTunnel(url: string, _tunnelPortMappings?: any): string {
  return url;
}

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

  // For non-run executions, prefix runId with orgId for abort tracking uniqueness
  const clientRunId = body.runId || crypto.randomUUID();
  const internalRunId = `${authReq.authInfo.orgId}:${clientRunId}`;

  // Build execution context
  const ctx: ToolExecutionContext = {
    datastore: authReq.datastore,
    workerPools: authReq.workerPools,
    orgId: authReq.authInfo.orgId,
    metadata,
    requestSource: RequestSource.FRONTEND,
  };

  // Wrap step in a temporary tool and execute without creating a run record
  const tempTool: Tool = {
    id: `temp_step_${step.id}`,
    steps: [step],
    outputTransform: "",
  } as Tool;

  // Merge payload with previous results
  const executionPayload = {
    ...(body.payload || {}),
    ...(body.previousResults || {}),
  };

  try {
    const result = await executeTool(ctx, {
      tool: tempTool,
      payload: executionPayload,
      credentials: body.credentials as Record<string, string> | undefined,
      requestOptions: { timeout: body.options?.timeout },
      createRun: false,
      runId: internalRunId,
    });

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
  const metadata: ServiceMetadata = { orgId: authReq.authInfo.orgId, traceId };

  if (!body.outputTransform && !body.responseFilters?.length) {
    return sendError(reply, 400, "Either outputTransform or responseFilters is required");
  }

  // For non-run executions, prefix runId with orgId for abort tracking uniqueness
  const clientRunId = body.runId || crypto.randomUUID();
  const internalRunId = `${authReq.authInfo.orgId}:${clientRunId}`;

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

  // Build execution context
  const ctx: ToolExecutionContext = {
    datastore: authReq.datastore,
    workerPools: authReq.workerPools,
    orgId: authReq.authInfo.orgId,
    metadata,
    requestSource: RequestSource.FRONTEND,
  };

  try {
    const result = await executeTool(ctx, {
      tool: tempTool,
      payload: executionPayload,
      requestOptions: { timeout: body.options?.timeout },
      createRun: false,
      runId: internalRunId,
    });

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

  // Step executions use prefixed runIds for abort tracking
  const internalRunId = `${authReq.authInfo.orgId}:${runId}`;
  authReq.workerPools.toolExecution.abortTask(internalRunId);
  return addTraceHeader(reply, authReq.traceId).code(200).send({ success: true, runId });
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
  ],
});
