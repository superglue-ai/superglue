import { generateUniqueId, Integration, RequestOptions, RunStatus, Tool, ToolResult, ToolStepResult, waitForIntegrationProcessing } from "@superglue/shared";
import type { GraphQLResolveInfo } from "graphql";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { parseJSON } from "../../files/index.js";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { ToolBuilder } from "../../tools/tool-builder.js";
import { ToolFinder } from "../../tools/tool-finder.js";
import { isSelfHealingEnabled } from "../../utils/helpers.js";
import { logMessage } from "../../utils/logs.js";
import { notifyWebhook } from "../../utils/webhook.js";
import type { ToolExecutionPayload } from "../../worker/types.js";
import { GraphQLRequestContext } from '../types.js';

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
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
  integrationIds?: string[];
  responseSchema?: JSONSchema;
}

type GraphQLWorkflowResult = Omit<ToolResult, 'stepResults'> & { data?: any, stepResults: (ToolStepResult & { rawData: any, transformedData: any })[] };

export const executeWorkflowResolver = async (
  _: unknown,
  args: ExecuteWorkflowArgs,
  context: GraphQLRequestContext,
  info: GraphQLResolveInfo,
): Promise<GraphQLWorkflowResult> => {
  const runId = args.runId || crypto.randomUUID();
  const startedAt = new Date();
  const metadata = context.toMetadata();

  let workflow: Tool | undefined;
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
      if (!workflow.steps || !Array.isArray(workflow.steps)) throw new Error("Workflow must have steps array");
    } else {
      throw new Error("Must provide either workflow ID or workflow object");
    }

    logMessage('debug', `Executing tool with id: ${workflow.id}, run_id: ${runId}`, metadata);

    // Parse schemas if they're strings
    if (workflow.inputSchema && typeof workflow.inputSchema === 'string') {
      workflow.inputSchema = parseJSON(workflow.inputSchema);
    }
    if (workflow.responseSchema && typeof workflow.responseSchema === 'string') {
      workflow.responseSchema = parseJSON(workflow.responseSchema);
    }

    const selfHealingEnabled = isSelfHealingEnabled(args.options, "api");

    const integrationManagers = await IntegrationManager.forToolExecution(
      workflow,
      context.datastore,
      metadata,
      { includeDocs: selfHealingEnabled }
    );

    await context.datastore.createRun({
      run: {
        id: runId,
        toolId: workflow.id,
        orgId: context.orgId,
        status: RunStatus.RUNNING,
        toolConfig: workflow,
        options: args.options,
        startedAt
      }
    });

    const taskPayload: ToolExecutionPayload = {
      runId,
      workflow,
      payload: args.payload,
      credentials: args.credentials,
      options: args.options,
      integrations: integrationManagers.map(m => m.toIntegrationSync()),
      orgId: context.orgId,
      traceId: metadata.traceId
    };

    let result;
    try {
      result = await context.workerPools.toolExecution.runTask(runId, taskPayload);
    } catch (abortError: any) {
      if (abortError.message?.includes('abort') || abortError.name === 'AbortError') {
        
        logMessage('warn', `Aborted run with runId ${runId}`, metadata);

        return {
          id: runId,
          success: false,
          error: `User manually aborted run with runId ${runId}`,
          config: workflow,
          stepResults: [],
          startedAt,
          completedAt: new Date(),
          data: undefined
        } as GraphQLWorkflowResult;
      }
      throw abortError;
    }

    const graphqlResult: GraphQLWorkflowResult = {
      ...result,
      id: runId,
      stepResults: result.stepResults.map(stepResult => ({
        ...stepResult,
        rawData: undefined,
        transformedData: stepResult.data
      }))
    };

    // NOTE: Not persisting toolResult/stepResults and payload to avoid PostgreSQL JSONB size limits (256MB)
    // Large workflow results can exceed this, tbd
    await context.datastore.updateRun({
      id: runId,
      orgId: context.orgId,
      updates: {
        status: graphqlResult.success ? RunStatus.SUCCESS : RunStatus.FAILED,
        toolConfig: graphqlResult.config || workflow,
        error: graphqlResult.error || undefined,
        completedAt: new Date()
      }
    });

    // Notify webhook if configured (fire-and-forget)
    if (args.options?.webhookUrl?.startsWith('http')) {
      notifyWebhook(args.options.webhookUrl, runId, graphqlResult.success, graphqlResult.data, graphqlResult.error, metadata);
    } else if(args.options?.webhookUrl?.startsWith('tool:')) {
      const toolId = args.options.webhookUrl.split(':')[1];
      if (toolId == args.input.id) {
        logMessage('warn', "Tool cannot trigger itself", metadata);
        return;
      }
      executeWorkflowResolver(_, { input: { id: toolId }, payload: graphqlResult.data, credentials: args.credentials, options: { ...args.options, webhookUrl: undefined } }, context, info);
    }

    return graphqlResult;

  } catch (error) {
    logMessage('error', "Workflow execution error: " + String(error), metadata);
    
    await context.datastore.updateRun({
      id: runId,
      orgId: context.orgId,
      updates: {
        status: RunStatus.FAILED,
        toolPayload: args.payload,
        error: String(error),
        completedAt: new Date()
      }
    }).catch(() => {});
    
    const result = {
      id: runId,
      success: false,
      config: workflow || { id: args.input.id, steps: [] },
      error: String(error),
      stepResults: [],
      startedAt,
      completedAt: new Date(),
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

    logMessage('info', `Aborting tool execution for run ${runId}`, metadata);
    
    context.workerPools.toolExecution.abortTask(runId);
    
    await context.datastore.updateRun({
      id: runId,
      orgId: context.orgId,
      updates: {
        status: RunStatus.ABORTED,
        error: `Aborted run with runId ${runId}`,
        completedAt: new Date()
      }
    });

    return { success: true, runId };
  } catch (error) {
    logMessage('error', `Failed to abort tool execution: ${String(error)}`, metadata);
    throw error;
  }
};

export const upsertWorkflowResolver = async (_: unknown, { id, input }: { id: string; input: any }, context: any) => {
  if (!id) {
    throw new Error("id is required");
  }

  try {
    const now = new Date();
    const oldWorkflow = await context.datastore.getWorkflow({ id, orgId: context.orgId });

    const workflow = {
      id,
      steps: resolveField(input.steps, oldWorkflow?.steps, []),
      integrationIds: resolveField(input.integrationIds, oldWorkflow?.integrationIds, []),
      inputSchema: resolveField(input.inputSchema, oldWorkflow?.inputSchema),
      finalTransform: resolveField(input.finalTransform, oldWorkflow?.finalTransform, "$"),
      responseSchema: resolveField(input.responseSchema, oldWorkflow?.responseSchema),
      instruction: resolveField(input.instruction, oldWorkflow?.instruction),
      folder: resolveField(input.folder, oldWorkflow?.folder),
      createdAt: oldWorkflow?.createdAt || now,
      updatedAt: now
    };

    return await context.datastore.upsertWorkflow({ id, workflow, orgId: context.orgId });
  } catch (error) {
    logMessage('error', "Error upserting workflow: " + String(error), context.toMetadata());
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
    logMessage('error', "Error deleting workflow: " + String(error), context.toMetadata());
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
    logMessage('error', "Error getting workflow: " + String(error), context.toMetadata());
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
    logMessage('error', "Error listing workflows: " + String(error), context.toMetadata());
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
    const allTools = await context.datastore.listWorkflows({ limit: 1000, offset: 0, orgId: context.orgId });
    const tools = (allTools.items || []).map(tool => {
      if (tool.inputSchema && typeof tool.inputSchema === 'string') {
        tool.inputSchema = parseJSON(tool.inputSchema);
      }
      if (tool.responseSchema && typeof tool.responseSchema === 'string') {
        tool.responseSchema = parseJSON(tool.responseSchema);
      }
      return tool;
    });

    const selector = new ToolFinder(metadata);
    return await selector.findTools(searchTerms, tools);
  } catch (error) {
    logMessage('error', `Error finding relevant tools: ${String(error)}`, context.toMetadata());
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
    const { instruction, payload = {}, integrationIds, responseSchema } = args;

    if (!instruction || instruction.trim() === "") {
      throw new Error("Instruction is required to build a workflow.");
    }

    let resolvedIntegrations: Integration[] = [];
    if (integrationIds && integrationIds.length > 0) {
      const datastoreAdapter = {
        getIntegration: async (id: string): Promise<Integration | null> => {
          const result = await context.datastore.getIntegration({ id, includeDocs: true, orgId: context.orgId });
          return result || null;
        },
        getManyIntegrations: async (ids: string[]): Promise<Integration[]> => {
          return await context.datastore.getManyIntegrations({ ids, includeDocs: true, orgId: context.orgId });
        }
      };
      resolvedIntegrations = await waitForIntegrationProcessing(datastoreAdapter, integrationIds);
    }

    const builder = new ToolBuilder(
      instruction,
      resolvedIntegrations,
      payload,
      responseSchema,
      metadata
    );
    const workflow = await builder.buildTool();

    workflow.id = await generateUniqueId({
      baseId: workflow.id,
      exists: async (id) => !!(await context.datastore.getWorkflow({ id, orgId: context.orgId }))
    });

    return workflow;
  } catch (error) {
    logMessage('error', `Failed to build workflow: ${error}`, metadata);
    throw error;
  }
};