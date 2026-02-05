import { RequestOptions, RequestSource, Tool, ToolResult, ToolStepResult } from "@superglue/shared";
import type { GraphQLResolveInfo } from "graphql";
import { normalizeTool } from "../../datastore/migrations/migration.js";
import { parseJSON } from "../../files/index.js";
import { RunLifecycleManager } from "../../runs/index.js";
import { SystemManager } from "../../systems/system-manager.js";
import { logMessage } from "../../utils/logs.js";
import { notifyWebhook } from "../../utils/webhook.js";
import type { ToolExecutionPayload } from "../../worker/types.js";
import { GraphQLRequestContext } from "../types.js";

interface ExecuteWorkflowArgs {
  input: { workflow: Tool; id?: never } | { workflow?: never; id: string };
  payload?: any;
  credentials?: any;
  options?: RequestOptions;
  runId?: string;
}

type GraphQLWorkflowResult = Omit<ToolResult, "stepResults" | "tool"> & {
  data?: any;
  config: Tool; // GraphQL schema uses 'config', maps from ToolResult.tool
  stepResults: (ToolStepResult & { rawData: any; transformedData: any })[];
  id: string;
  startedAt: Date;
  completedAt: Date;
};

export const executeWorkflowResolver = async (
  _: unknown,
  args: ExecuteWorkflowArgs,
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
): Promise<GraphQLWorkflowResult> => {
  const metadata = context.toMetadata();
  const requestSource = context.requestSource ?? RequestSource.FRONTEND;

  // Use RunLifecycleManager for centralized run handling
  const lifecycle = new RunLifecycleManager(context.datastore, context.orgId, metadata);

  let workflow: Tool | undefined;
  let runContext:
    | {
        runId: string;
        startedAt: Date;
        toolId: string;
        tool: Tool;
        requestSource: RequestSource;
        options?: RequestOptions;
      }
    | undefined;

  try {
    if (args.input.id) {
      workflow = await context.datastore.getWorkflow({ id: args.input.id, orgId: context.orgId });
      if (!workflow) {
        throw new Error("Workflow not found");
      }
    } else if (args.input.workflow) {
      workflow = normalizeTool(args.input.workflow);
      // Validate required workflow fields
      if (!workflow.id) throw new Error("Workflow must have an ID");
      if (!workflow.steps || !Array.isArray(workflow.steps))
        throw new Error("Workflow must have steps array");
    } else {
      throw new Error("Must provide either workflow ID or workflow object");
    }

    if (workflow.archived) {
      throw new Error("Cannot execute archived workflow");
    }

    logMessage("debug", `Executing tool with id: ${workflow.id}`, metadata);

    // Parse schemas if they're strings
    if (workflow.inputSchema && typeof workflow.inputSchema === "string") {
      workflow.inputSchema = parseJSON(workflow.inputSchema);
    }
    if (workflow.outputSchema && typeof workflow.outputSchema === "string") {
      workflow.outputSchema = parseJSON(workflow.outputSchema);
    }

    const systemManagers = await SystemManager.forToolExecution(
      workflow,
      context.datastore,
      metadata,
    );

    // NOTE: GraphQL does NOT store payload in DB to save space (intentional)
    runContext = await lifecycle.startRun({
      runId: args.runId,
      tool: workflow,
      // payload intentionally omitted to save DB space
      options: args.options,
      requestSource,
    });

    const taskPayload: ToolExecutionPayload = {
      runId: runContext.runId,
      workflow,
      payload: args.payload,
      credentials: args.credentials,
      options: args.options,
      systems: systemManagers.map((m) => m.toSystemSync()),
      orgId: context.orgId,
      traceId: metadata.traceId,
    };

    let executionResult;
    try {
      executionResult = await context.workerPools.toolExecution.runTask(
        runContext.runId,
        taskPayload,
      );
    } catch (abortError: any) {
      if (abortError.message?.includes("abort") || abortError.name === "AbortError") {
        logMessage("warn", `Aborted run with runId ${runContext.runId}`, metadata);
        await lifecycle.abortRun(
          runContext,
          `User manually aborted run with runId ${runContext.runId}`,
        );

        return {
          id: runContext.runId,
          success: false,
          error: `User manually aborted run with runId ${runContext.runId}`,
          config: workflow,
          stepResults: [],
          startedAt: runContext.startedAt,
          completedAt: new Date(),
          data: undefined,
        } as GraphQLWorkflowResult;
      }
      throw abortError;
    }

    const graphqlResult: GraphQLWorkflowResult = {
      success: executionResult.success,
      data: executionResult.data,
      error: executionResult.error,
      config: executionResult.tool,
      id: runContext.runId,
      startedAt: runContext.startedAt,
      completedAt: new Date(),
      stepResults: executionResult.stepResults.map((stepResult) => ({
        ...stepResult,
        rawData: undefined,
        transformedData: stepResult.data,
      })),
    };

    // Complete the run (handles DB update and notifications)
    await lifecycle.completeRun(runContext, {
      success: graphqlResult.success,
      tool: graphqlResult.config || workflow,
      error: graphqlResult.error,
      stepResults: executionResult.stepResults,
    });

    // Notify webhook if configured (fire-and-forget)
    if (args.options?.webhookUrl?.startsWith("http")) {
      notifyWebhook(
        args.options.webhookUrl,
        runContext.runId,
        graphqlResult.success,
        graphqlResult.data,
        graphqlResult.error,
        metadata,
      );
    } else if (args.options?.webhookUrl?.startsWith("tool:")) {
      const toolId = args.options.webhookUrl.split(":")[1];
      if (toolId == args.input.id) {
        logMessage("warn", "Tool cannot trigger itself", metadata);
        return;
      }
      executeWorkflowResolver(
        _,
        {
          input: { id: toolId },
          payload: graphqlResult.data,
          credentials: args.credentials,
          options: { ...args.options, webhookUrl: undefined },
        },
        context,
        info,
      );
    }

    return graphqlResult;
  } catch (error) {
    logMessage("error", "Workflow execution error: " + String(error), metadata);

    const errorStartedAt = runContext?.startedAt || new Date();
    const completedAt = new Date();

    // Determine the runId to use for both persistence and response
    const errorRunId = runContext?.runId || args.runId || crypto.randomUUID();

    // Use lifecycle manager for error handling if we have a runContext
    if (runContext) {
      await lifecycle.completeRun(runContext, {
        success: false,
        tool: workflow,
        error: String(error),
      });
    } else {
      // Fallback for errors before run was started
      await lifecycle.failRunWithoutContext(
        errorRunId,
        workflow?.id || args.input.id || "unknown",
        workflow,
        String(error),
        errorStartedAt,
        requestSource,
      );
    }

    const result = {
      id: errorRunId,
      success: false,
      config: workflow || { id: args.input.id, steps: [] },
      error: String(error),
      stepResults: [],
      startedAt: errorStartedAt,
      completedAt,
    };
    return { ...result, data: undefined, stepResults: [] } as GraphQLWorkflowResult;
  }
};

export const getWorkflowResolver = async (_: unknown, { id }: { id: string }, context: any) => {
  if (!id) {
    throw new Error("id is required");
  }

  try {
    const workflow = await context.datastore.getWorkflow({ id, orgId: context.orgId });
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    return workflow;
  } catch (error) {
    logMessage("error", "Error getting workflow: " + String(error), context.toMetadata());
    throw error;
  }
};

export const listWorkflowsResolver = async (
  _: unknown,
  { limit = 10, offset = 0 }: { limit: number; offset: number },
  context: any,
) => {
  try {
    const result = await context.datastore.listWorkflows({ limit, offset, orgId: context.orgId });
    return {
      items: result.items,
      total: result.total,
    };
  } catch (error) {
    logMessage("error", "Error listing workflows: " + String(error), context.toMetadata());
    throw error;
  }
};
