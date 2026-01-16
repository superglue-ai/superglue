import {
  ExecutionStep,
  RequestOptions,
  ResponseFilter,
  SelfHealingMode,
  Tool,
} from "@superglue/shared";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { logMessage } from "../utils/logs.js";
import type { ToolExecutionPayload } from "../worker/types.js";
import { registerApiModule } from "./registry.js";
import { addTraceHeader, sendError } from "./response-helpers.js";
import type { AuthenticatedFastifyRequest, RouteHandler } from "./types.js";

// Step execution types (internal only, not in OpenAPI spec)
interface RunStepRequestOptions {
  selfHealing?: boolean;
  timeout?: number;
}

interface RunStepRequestBody {
  step: Record<string, unknown>; // ExecutionStep
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
  updatedStep?: Record<string, unknown>; // ExecutionStep if self-healed
}

// Transform execution types (internal only, not in OpenAPI spec)
interface RunTransformRequestBody {
  finalTransform: string;
  responseSchema?: Record<string, unknown>;
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
  updatedResponseSchema?: Record<string, unknown>;
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

  const step = body.step as unknown as ExecutionStep;
  const runId = body.runId || crypto.randomUUID();

  const requestOptions: RequestOptions = {
    timeout: body.options?.timeout,
    selfHealing: body.options?.selfHealing
      ? SelfHealingMode.REQUEST_ONLY
      : SelfHealingMode.DISABLED,
    testMode: body.options?.selfHealing,
  };

  const selfHealingEnabled = body.options?.selfHealing ?? false;

  // Create a temporary single-step tool for execution
  const tempTool: Tool = {
    id: `temp_step_${step.id}`,
    steps: [step],
    finalTransform: "",
  } as Tool;

  // Build the execution payload combining tool input and previous results
  const executionPayload = {
    ...(body.payload || {}),
    ...(body.previousResults || {}),
  };

  // Get integration manager if step has an integration
  const integrationManagers = await IntegrationManager.forToolExecution(
    tempTool,
    authReq.datastore,
    metadata,
    { includeDocs: selfHealingEnabled },
  );

  const taskPayload: ToolExecutionPayload = {
    runId,
    workflow: tempTool,
    payload: executionPayload,
    credentials: body.credentials as Record<string, string> | undefined,
    options: requestOptions,
    integrations: integrationManagers.map((m) => m.toIntegrationSync()),
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
      updatedStep: result.config?.steps?.[0] as unknown as Record<string, unknown> | undefined,
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

  if (!body.finalTransform && !body.responseFilters?.length) {
    return sendError(reply, 400, "Either finalTransform or responseFilters is required");
  }

  const runId = body.runId || crypto.randomUUID();

  const requestOptions: RequestOptions = {
    timeout: body.options?.timeout,
    selfHealing: body.options?.selfHealing
      ? SelfHealingMode.TRANSFORM_ONLY
      : SelfHealingMode.DISABLED,
    testMode: body.options?.selfHealing,
  };

  // Create a temporary tool with no steps, just the transform
  const tempTool: Tool = {
    id: `temp_transform`,
    steps: [],
    finalTransform: body.finalTransform || "",
    responseSchema: body.responseSchema,
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
    integrations: [],
    orgId: authReq.authInfo.orgId,
    traceId,
  };

  try {
    const result = await authReq.workerPools.toolExecution.runTask(runId, taskPayload);

    const response: RunTransformResponse = {
      success: result.success,
      data: result.data,
      error: result.error,
      updatedTransform: result.config?.finalTransform,
      updatedResponseSchema: result.config?.responseSchema as Record<string, unknown> | undefined,
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

  authReq.workerPools.toolExecution.abortTask(runId);
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
