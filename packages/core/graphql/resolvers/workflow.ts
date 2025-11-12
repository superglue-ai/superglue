import { Integration, RequestOptions, Workflow, WorkflowResult } from "@superglue/client";
import { flattenAndNamespaceWorkflowCredentials, generateUniqueId, waitForIntegrationProcessing } from "@superglue/shared/utils";
import type { GraphQLResolveInfo } from "graphql";
import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { WorkflowBuilder } from "../../build/workflow-builder.js";
import { ToolSelector } from "../../execute/tool-selector.js";
import { WorkflowExecutor } from "../../execute/workflow-executor.js";
import { parseJSON } from "../../files/index.js";
import { IntegrationManager } from "../../integrations/integration-manager.js";
import { logMessage } from "../../utils/logs.js";
import { replaceVariables } from "../../utils/tools.js";
import { notifyWebhook } from "../../utils/webhook.js";
import { Context, Metadata } from '../types.js';

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

interface ExecuteWorkflowArgs {
  input: { workflow: Workflow; id?: never } | { workflow?: never; id: string };
  payload?: any;
  credentials?: any;
  options?: RequestOptions;
}

interface BuildWorkflowArgs {
  instruction: string;
  payload?: Record<string, unknown>;
  integrationIds?: string[];
  responseSchema?: JSONSchema;
}

export const executeWorkflowResolver = async (
  _: unknown,
  args: ExecuteWorkflowArgs,
  context: Context,
  info: GraphQLResolveInfo,
): Promise<WorkflowResult> => {
  let runId = crypto.randomUUID();
  let startedAt = new Date();
  let metadata: Metadata = { orgId: context.orgId, runId };
  let workflow: Workflow | undefined;

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

    // Parse schemas if they're strings
    if (workflow.inputSchema && typeof workflow.inputSchema === 'string') {
      workflow.inputSchema = parseJSON(workflow.inputSchema);
    }
    if (workflow.responseSchema && typeof workflow.responseSchema === 'string') {
      workflow.responseSchema = parseJSON(workflow.responseSchema);
    }

    let mergedCredentials = args.credentials || {};
    let integrationManagers: IntegrationManager[] = [];

    // Collect integration IDs from workflow level and steps
    const allIntegrationIds = new Set<string>();

    // Add workflow-level integration IDs
    if (Array.isArray(workflow.integrationIds)) {
      workflow.integrationIds.forEach(id => allIntegrationIds.add(id));
    }

    // Add integration IDs from each step
    if (Array.isArray(workflow.steps)) {
      workflow.steps.forEach(step => {
        if (step.integrationId) {
          allIntegrationIds.add(step.integrationId);
        }
      });
    }

    if (allIntegrationIds.size > 0) {
      const requestedIds = Array.from(allIntegrationIds);
      integrationManagers = await IntegrationManager.fromIds(requestedIds, context.datastore, context.orgId);

      const foundIds = new Set(integrationManagers.map(i => i.id));
      requestedIds.forEach(id => {
        if (!foundIds.has(id)) {
          logMessage('warn', `Integration with id "${id}" not found, skipping.`, metadata);
        }
      });

      // refresh oauth tokens if needed
      await Promise.all(integrationManagers.map(i => i.refreshTokenIfNeeded()));
      const integrations = await Promise.all(integrationManagers.map(i => i.getIntegration()));
      const integrationCreds = flattenAndNamespaceWorkflowCredentials(integrations);

      // Process args.credentials with variable replacement
      const processedCredentials = await Promise.all(
        Object.entries(args.credentials || {}).map(async ([key, value]) => {
          return {
            [key]: await replaceVariables(String(value), integrationCreds)
          };
        })
      );

      // Merge all credential objects
      mergedCredentials = Object.assign(
        {},
        integrationCreds,
        ...processedCredentials
      );
    }

    const executor = new WorkflowExecutor({ workflow, metadata, integrations: integrationManagers });
    const result = await executor.execute({ payload: args.payload, credentials: mergedCredentials, options: args.options });

    // Save run to datastore
    context.datastore.createRun({
      result: {
        id: runId,
        success: result.success,
        error: result.error || undefined,
        config: result.config || workflow,
        stepResults: [],
        startedAt,
        completedAt: new Date()
      },
      orgId: context.orgId
    });

    // Notify webhook if configured (fire-and-forget)
    if (args.options?.webhookUrl?.startsWith('http')) {
      notifyWebhook(args.options.webhookUrl, runId, result.success, result.data, result.error);
    }
    else if(args.options?.webhookUrl?.startsWith('tool:')) {
      const toolId = args.options.webhookUrl.split(':')[1];
      if(toolId == args.input.id) {
        logMessage('warn', "Tool cannot trigger itself", metadata);
        return;
      }
      executeWorkflowResolver(_, { input: { id: toolId }, payload: result.data, credentials: args.credentials, options: { ...args.options, webhookUrl: undefined } }, context, info);
    }

    return result;

  } catch (error) {
    logMessage('error', "Workflow execution error: " + String(error), metadata || { orgId: context.orgId, runId });
    const result = {
      id: runId,
      success: false,
      config: workflow || { id: args.input.id, steps: [] },
      error: String(error),
      stepResults: [],
      startedAt,
      completedAt: new Date(),
    };
    // Save run to datastore
    // do not trigger webhook on failure
    context.datastore.createRun({ result, orgId: context.orgId });
    return { ...result, data: {}, stepResults: [] } as WorkflowResult;
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
      createdAt: oldWorkflow?.createdAt || now,
      updatedAt: now
    };

    // for each step, make sure that the apiConfig has an id. if not, set it to the step id
    workflow.steps.forEach((step: any) => {
      if (!step.apiConfig.id) {
        step.apiConfig.id = step.id;
      }
    });

    return await context.datastore.upsertWorkflow({ id, workflow, orgId: context.orgId });
  } catch (error) {
    logMessage('error', "Error upserting workflow: " + String(error), { orgId: context.orgId });
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
    logMessage('error', "Error deleting workflow: " + String(error), { orgId: context.orgId });
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
    logMessage('error', "Error getting workflow: " + String(error), { orgId: context.orgId });
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
    logMessage('error', "Error listing workflows: " + String(error), { orgId: context.orgId });
    throw error;
  }
};

export const findRelevantToolsResolver = async (
  _: unknown,
  { searchTerms }: { searchTerms?: string },
  context: Context,
  info: GraphQLResolveInfo,
) => {
  try {
    const metadata: Metadata = { orgId: context.orgId, runId: crypto.randomUUID() };
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

    const selector = new ToolSelector(metadata);
    return await selector.select(searchTerms, tools);
  } catch (error) {
    logMessage('error', `Error finding relevant tools: ${String(error)}`, { orgId: context.orgId });
    return [];
  }
};

export const buildWorkflowResolver = async (
  _: unknown,
  args: BuildWorkflowArgs,
  context: Context,
  info: GraphQLResolveInfo,
): Promise<Workflow> => {

  try {
    const metadata: Metadata = { orgId: context.orgId, runId: crypto.randomUUID() };
    const { instruction, payload = {}, integrationIds, responseSchema } = args;

    if (!instruction || instruction.trim() === "") {
      throw new Error("Instruction is required to build a workflow.");
    }

    let resolvedIntegrations: Integration[] = [];
    if (integrationIds && integrationIds.length > 0) {
      const datastoreAdapter = {
        getManyIntegrations: async (ids: string[]): Promise<Integration[]> => {
          return await context.datastore.getManyIntegrations({ ids, includeDocs: true, orgId: context.orgId });
        }
      };
      resolvedIntegrations = await waitForIntegrationProcessing(datastoreAdapter, integrationIds);
    }

    const builder = new WorkflowBuilder(
      instruction,
      resolvedIntegrations,
      payload,
      responseSchema,
      metadata
    );
    const workflow = await builder.buildWorkflow();

    workflow.id = await generateUniqueId({
      baseId: workflow.id,
      exists: async (id) => !!(await context.datastore.getWorkflow({ id, orgId: context.orgId }))
    });

    return workflow;
  } catch (error) {
    logMessage('error', `Failed to build workflow: ${error}`, { orgId: context.orgId });
    throw error;
  }
};
