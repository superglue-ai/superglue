import {
  ExecutionFileEnvelope,
  ToolStep,
  ResponseFilter,
  Tool,
  RequestSource,
  ServiceMetadata,
  isTransformConfig,
} from "@superglue/shared";
import {
  flattenAndNamespaceCredentials,
  flattenAndNamespaceSystemUrls,
} from "@superglue/shared/utils";
import { executeTool, ToolExecutionContext } from "../tools/tool-execution-service.js";
import { SystemManager } from "../systems/system-manager.js";
import { logMessage } from "../utils/logs.js";
import { resolveUserEmailIfNeeded } from "../utils/user-lookup.js";
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
  files?: Record<string, ExecutionFileEnvelope>;
  previousResults?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  options?: RunStepRequestOptions;
  runId?: string; // Client-provided runId for abort tracking
  mode?: "dev" | "prod"; // Execution mode for system resolution
  systemIds?: string[]; // System IDs to load namespaced template vars from (for transform steps)
}

interface RunStepResponse {
  stepId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  updatedStep?: Record<string, unknown>; // ToolStep if self-healed
  stepFileKeys?: string[];
  producedFiles?: Record<string, ExecutionFileEnvelope>;
}

// Transform execution types (internal only, not in OpenAPI spec)
interface RunTransformRequestBody {
  outputTransform: string;
  outputSchema?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  files?: Record<string, ExecutionFileEnvelope>;
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

export function buildRunStepResponse({
  stepId,
  success,
  error,
  updatedStep,
  stepResult,
  producedFiles,
}: {
  stepId: string;
  success: boolean;
  error?: string;
  updatedStep?: Record<string, unknown>;
  stepResult?: { data?: unknown; stepFileKeys?: string[] };
  producedFiles?: Record<string, ExecutionFileEnvelope>;
}): RunStepResponse {
  return {
    stepId,
    success,
    ...(error ? { error } : {}),
    ...(updatedStep ? { updatedStep } : {}),
    ...(success && stepResult?.data !== undefined ? { data: stepResult.data } : {}),
    ...(success && stepResult?.stepFileKeys ? { stepFileKeys: stepResult.stepFileKeys } : {}),
    ...(success && producedFiles ? { producedFiles } : {}),
  };
}

// POST /tools/step/run - Execute a single step without creating a run
const runStep: RouteHandler = async (request, reply) => {
  const authReq = request as AuthenticatedFastifyRequest;
  const body = request.body as RunStepRequestBody;

  const traceId = authReq.traceId;

  if (!body.step) {
    return sendError(reply, 400, "Step configuration is required");
  }

  const step = body.step as unknown as ToolStep;

  // Lazy resolve user email - only fetch if step config references sg_auth_email
  const userEmail = await resolveUserEmailIfNeeded({
    toolConfig: step,
    userId: authReq.authInfo.userId,
    existingEmail: authReq.authInfo.userEmail,
  });

  const metadata = {
    orgId: authReq.authInfo.orgId,
    traceId,
    userEmail,
    userId: authReq.authInfo.userId,
    roleIds: authReq.authInfo.roles.map((r) => r.id),
  };

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

  // Load system template vars if systemIds provided (needed for transform steps)
  let systemCredentials: Record<string, string> = {};
  if (body.systemIds && body.systemIds.length > 0 && isTransformConfig(step.config)) {
    const mode = body.mode || "prod";
    try {
      // Use environment-aware system loading (same logic as forToolExecution)
      const preferredEnv = mode === "dev" ? "dev" : "prod";
      const fallbackEnv = mode === "dev" ? "prod" : "dev";

      const preferredSystems = await authReq.datastore.getManySystems({
        ids: body.systemIds,
        environment: preferredEnv,
        includeDocs: false,
        orgId: authReq.authInfo.orgId,
      });

      const foundIds = new Set(preferredSystems.map((s) => s.id));
      const missingIds = body.systemIds.filter((id) => !foundIds.has(id));

      let fallbackSystems: typeof preferredSystems = [];
      if (missingIds.length > 0) {
        fallbackSystems = await authReq.datastore.getManySystems({
          ids: missingIds,
          environment: fallbackEnv,
          includeDocs: false,
          orgId: authReq.authInfo.orgId,
        });
      }

      const systems = [...preferredSystems, ...fallbackSystems];
      const systemManagers = SystemManager.fromSystems(systems, authReq.datastore, metadata);

      // Enrich with template credentials and refresh tokens if needed
      await Promise.all(
        systemManagers.map(async (m) => {
          await m.enrichWithTemplateCredentials();
          await m.refreshTokenIfNeeded();
        }),
      );
      const refreshedSystems = await Promise.all(systemManagers.map((m) => m.getSystem()));
      const validSystems = refreshedSystems.filter((s) => s !== null);

      if (validSystems.length > 0) {
        systemCredentials = {
          ...flattenAndNamespaceCredentials(validSystems),
          ...flattenAndNamespaceSystemUrls(validSystems),
        };
      }
    } catch (error) {
      logMessage("warn", `Failed to load system credentials: ${error}`, metadata);
    }
  }

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

  // Merge provided credentials with loaded system credentials
  const mergedCredentials = {
    ...systemCredentials,
    ...(body.credentials as Record<string, string> | undefined),
  };

  try {
    const result = await executeTool(ctx, {
      tool: tempTool,
      payload: executionPayload,
      files: body.files,
      // Internal step testing needs produced files for chaining in the playground. This stays
      // off for normal full workflow runs to avoid serializing large file envelopes inline.
      returnProducedFiles: true,
      credentials: mergedCredentials,
      requestOptions: { timeout: body.options?.timeout },
      createRun: false,
      runId: internalRunId,
      mode: body.mode || "prod",
    });

    const stepResult = result.stepResults?.[0];

    const response = buildRunStepResponse({
      stepId: step.id,
      success: result.success,
      error: result.error,
      updatedStep: result.tool?.steps?.[0] as unknown as Record<string, unknown> | undefined,
      stepResult,
      producedFiles: result.producedFiles,
    });

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

  if (!body.outputTransform && !body.responseFilters?.length) {
    return sendError(reply, 400, "Either outputTransform or responseFilters is required");
  }

  // Lazy resolve user email - only fetch if transform config references sg_auth_email
  const userEmail = await resolveUserEmailIfNeeded({
    toolConfig: body,
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
      files: body.files,
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
        allowedBaseRoles: ["admin", "member"],
      },
    },
    {
      method: "POST",
      path: "/tools/transform/run",
      handler: runTransform,
      permissions: {
        type: "execute",
        resource: "tool",
        allowedBaseRoles: ["admin", "member"],
      },
    },
    {
      method: "POST",
      path: "/tools/step/abort",
      handler: abortStep,
      permissions: {
        type: "execute",
        resource: "tool",
        allowedBaseRoles: ["admin", "member"],
      },
    },
  ],
});
