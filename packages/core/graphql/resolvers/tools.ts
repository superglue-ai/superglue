import {
  generateUniqueId,
  System,
  RequestOptions,
  RequestSource,
  RunStatus,
  Tool,
  ToolDiff,
  ToolResult,
  ToolStepResult,
  waitForSystemProcessing,
} from "@superglue/shared";
import type { GraphQLResolveInfo } from "graphql";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { parseJSON } from "../../files/index.js";
import { RunLifecycleManager } from "../../runs/index.js";
import { SystemManager } from "../../systems/system-manager.js";
import { ToolBuilder } from "../../tools/tool-builder.js";
import { ToolFinder } from "../../tools/tool-finder.js";
import { ToolFixer } from "../../tools/tool-fixer.js";
import { logMessage } from "../../utils/logs.js";
import { notifyWebhook } from "../../utils/webhook.js";
import type { ToolExecutionPayload } from "../../worker/types.js";
import { GraphQLRequestContext } from "../types.js";

function resolveField<T>(
  newValue: T | null | undefined,
  oldValue: T | undefined,
  defaultValue?: T,
): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

interface ExecuteWorkflowArgs {
  input: { workflow: Tool; id?: never } | { workflow?: never; id: string };
  payload?: any;
  credentials?: any;
  options?: RequestOptions;
  runId?: string;
}

interface BuildWorkflowArgs {
  instruction: string;
  payload?: Record<string, unknown>;
  systemIds?: string[];
  responseSchema?: JSONSchema;
}

interface FixWorkflowArgs {
  workflow: Tool;
  fixInstructions: string;
  lastError?: string;
  systemIds?: string[];
}

interface FixWorkflowResult {
  workflow: Tool;
  diffs: ToolDiff[];
}

type GraphQLWorkflowResult = Omit<ToolResult, "stepResults"> & {
  data?: any;
  stepResults: (ToolStepResult & { rawData: any; transformedData: any })[];
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
      workflow = args.input.workflow;
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
    if (workflow.responseSchema && typeof workflow.responseSchema === "string") {
      workflow.responseSchema = parseJSON(workflow.responseSchema);
    }

    const systemManagers = await SystemManager.forToolExecution(
      workflow,
      context.datastore,
      metadata,
    );

    runContext = await lifecycle.startRun({
      runId: args.runId,
      tool: workflow,
      payload: args.payload,
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
      ...executionResult,
      id: runContext.runId,
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
      data: graphqlResult.data,
      error: graphqlResult.error,
      stepResults: executionResult.stepResults,
      payload: args.payload,
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
  } catch (error: any) {
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
        stepResults: error.stepResults,
        payload: args.payload,
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

export const abortToolExecutionResolver = async (
  _: unknown,
  { runId }: { runId: string },
  context: GraphQLRequestContext,
): Promise<{ success: boolean; runId: string }> => {
  const metadata = context.toMetadata();

  try {
    const run = await context.datastore.getRun({ id: runId, orgId: context.orgId });

    if (!run) {
      throw new Error(`Run with id ${runId} not found`);
    }

    if (run.status !== RunStatus.RUNNING) {
      throw new Error(`Run ${runId} is not currently running (status: ${run.status})`);
    }

    logMessage("info", `Aborting tool execution for run ${runId}`, metadata);

    context.workerPools.toolExecution.abortTask(runId);

    await context.datastore.updateRun({
      id: runId,
      orgId: context.orgId,
      updates: {
        status: RunStatus.ABORTED,
        error: `Aborted run with runId ${runId}`,
        metadata: {
          startedAt: run.metadata.startedAt,
          completedAt: new Date().toISOString(),
          durationMs: new Date().getTime() - new Date(run.metadata.startedAt).getTime(),
        },
      },
    });

    return { success: true, runId };
  } catch (error) {
    logMessage("error", `Failed to abort tool execution: ${String(error)}`, metadata);
    throw error;
  }
};

export const upsertWorkflowResolver = async (
  _: unknown,
  { id, input }: { id: string; input: any },
  context: any,
) => {
  if (!id) {
    throw new Error("id is required");
  }

  try {
    const now = new Date();
    const oldWorkflow = await context.datastore.getWorkflow({ id, orgId: context.orgId });

    const workflow = {
      id,
      steps: resolveField(input.steps, oldWorkflow?.steps, []),
      systemIds: resolveField(input.systemIds, oldWorkflow?.systemIds, []),
      inputSchema: resolveField(input.inputSchema, oldWorkflow?.inputSchema),
      finalTransform: resolveField(input.finalTransform, oldWorkflow?.finalTransform, "$"),
      responseSchema: resolveField(input.responseSchema, oldWorkflow?.responseSchema),
      responseFilters: resolveField(input.responseFilters, oldWorkflow?.responseFilters, []),
      instruction: resolveField(input.instruction, oldWorkflow?.instruction),
      folder: resolveField(input.folder, oldWorkflow?.folder),
      archived: resolveField(input.archived, oldWorkflow?.archived, false),
      createdAt: oldWorkflow?.createdAt || now,
      updatedAt: now,
    };

    return await context.datastore.upsertWorkflow({ id, workflow, orgId: context.orgId });
  } catch (error) {
    logMessage("error", "Error upserting workflow: " + String(error), context.toMetadata());
    throw error;
  }
};

export const deleteWorkflowResolver = async (_: unknown, { id }: { id: string }, context: any) => {
  if (!id) {
    throw new Error("id is required");
  }

  try {
    return await context.datastore.deleteWorkflow({ id, orgId: context.orgId });
  } catch (error) {
    logMessage("error", "Error deleting workflow: " + String(error), context.toMetadata());
    throw error;
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
    // for each step, make sure that the apiConfig has an id. if not, set it to the step id
    workflow.steps.forEach((step: any) => {
      if (!step.apiConfig.id) {
        step.apiConfig.id = step.id;
      }
    });
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

export const findRelevantToolsResolver = async (
  _: unknown,
  { searchTerms }: { searchTerms?: string },
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
) => {
  try {
    const metadata = context.toMetadata();
    const allTools = await context.datastore.listWorkflows({
      limit: 1000,
      offset: 0,
      orgId: context.orgId,
    });
    const tools = (allTools.items || [])
      .filter((tool) => !tool.archived)
      .map((tool) => {
        if (tool.inputSchema && typeof tool.inputSchema === "string") {
          tool.inputSchema = parseJSON(tool.inputSchema);
        }
        if (tool.responseSchema && typeof tool.responseSchema === "string") {
          tool.responseSchema = parseJSON(tool.responseSchema);
        }
        return tool;
      });

    const selector = new ToolFinder(metadata);
    return await selector.findTools(searchTerms, tools);
  } catch (error) {
    logMessage("error", `Error finding relevant tools: ${String(error)}`, context.toMetadata());
    return [];
  }
};

export const buildWorkflowResolver = async (
  _: unknown,
  args: BuildWorkflowArgs,
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
): Promise<Tool> => {
  const metadata = context.toMetadata();

  try {
    const { instruction, payload = {}, systemIds, responseSchema } = args;

    if (!instruction || instruction.trim() === "") {
      throw new Error("Instruction is required to build a workflow.");
    }

    let resolvedSystems: System[] = [];
    if (systemIds && systemIds.length > 0) {
      const datastoreAdapter = {
        getSystem: async (id: string): Promise<System | null> => {
          const result = await context.datastore.getSystem({
            id,
            includeDocs: true,
            orgId: context.orgId,
          });
          return result || null;
        },
        getManySystems: async (ids: string[]): Promise<System[]> => {
          return await context.datastore.getManySystems({
            ids,
            includeDocs: true,
            orgId: context.orgId,
          });
        },
      };
      resolvedSystems = await waitForSystemProcessing(datastoreAdapter, systemIds);
    }

    const builder = new ToolBuilder(
      instruction,
      resolvedSystems,
      payload,
      responseSchema,
      metadata,
    );
    const workflow = await builder.buildTool();

    workflow.id = await generateUniqueId({
      baseId: workflow.id,
      exists: async (id) => !!(await context.datastore.getWorkflow({ id, orgId: context.orgId })),
    });

    return workflow;
  } catch (error) {
    logMessage("error", `Failed to build workflow: ${error}`, metadata);
    throw error;
  }
};

export const fixWorkflowResolver = async (
  _: unknown,
  args: FixWorkflowArgs,
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
): Promise<FixWorkflowResult> => {
  const metadata = context.toMetadata();

  try {
    const { workflow, fixInstructions, lastError } = args;

    if (!workflow) {
      throw new Error("Workflow configuration is required to fix a workflow.");
    }

    if (!fixInstructions || fixInstructions.trim() === "") {
      throw new Error("Fix instructions are required.");
    }

    // Fetch ALL of the customer's configured systems so the LLM can use any of them
    const allSystems = await context.datastore.listSystems({
      limit: 1000,
      offset: 0,
      includeDocs: true,
      orgId: context.orgId,
    });
    const resolvedSystems: System[] = allSystems.items || [];

    const fixer = new ToolFixer({
      tool: workflow,
      fixInstructions,
      systems: resolvedSystems,
      lastError,
      metadata,
    });

    const result = await fixer.fixTool();

    return {
      workflow: result.tool,
      diffs: result.diffs,
    };
  } catch (error) {
    logMessage("error", `Failed to fix workflow: ${error}`, metadata);
    throw error;
  }
};
