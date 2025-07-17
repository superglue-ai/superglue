import { Integration, RequestOptions, Workflow, WorkflowResult } from "@superglue/client";
import { Context, Metadata } from "@superglue/shared";
import { flattenAndNamespaceWorkflowCredentials } from "@superglue/shared/utils";
import type { GraphQLResolveInfo } from "graphql";
import { WorkflowExecutor } from "../../workflow/workflow-executor.js";

import { JSONSchema } from "openai/lib/jsonschema.mjs";
import { logMessage } from "../../utils/logs.js";
import { WorkflowBuilder } from "../../workflow/workflow-builder.js";

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
  integrationIds: string[];
  responseSchema?: JSONSchema;
  useTools?: boolean; // Add optional flag for tool-based building
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
      workflow = await context.datastore.getWorkflow(args.input.id, context.orgId);
      if (!workflow) {
        throw new Error("Workflow not found");
      }
    } else if (args.input.workflow) {
      workflow = args.input.workflow;
      // Validate required workflow fields
      if (!workflow.id) throw new Error("Workflow must have an ID");
      if (!workflow.steps || !Array.isArray(workflow.steps)) throw new Error("Workflow must have steps array");
      logMessage('info', `Executing workflow ${workflow.id}`, metadata);
    } else {
      throw new Error("Must provide either workflow ID or workflow object");
    }

    // Parse schemas if they're strings
    if (workflow.inputSchema && typeof workflow.inputSchema === 'string') {
      workflow.inputSchema = JSON.parse(workflow.inputSchema);
    }
    if (workflow.responseSchema && typeof workflow.responseSchema === 'string') {
      workflow.responseSchema = JSON.parse(workflow.responseSchema);
    }

    let mergedCredentials = args.credentials || {};
    let integrations: Integration[] = [];

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
      integrations = await context.datastore.getManyIntegrations(requestedIds, context.orgId);
      const foundIds = new Set(integrations.map(i => i.id));
      requestedIds.forEach(id => {
        if (!foundIds.has(id)) {
          logMessage('warn', `Integration with id "${id}" not found, skipping.`, metadata);
        }
      });
      const integrationCreds = flattenAndNamespaceWorkflowCredentials(integrations);
      mergedCredentials = { ...integrationCreds, ...(args.credentials || {}) };
    }

    const executor = new WorkflowExecutor(workflow, metadata, integrations);
    const result = await executor.execute(args.payload, mergedCredentials, args.options);

    // Save run to datastore
    context.datastore.createRun({
      id: runId,
      success: result.success,
      error: result.error || undefined,
      config: result.config || workflow,
      stepResults: result.stepResults || [],
      startedAt,
      completedAt: new Date()
    }, context.orgId);

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
    context.datastore.createRun(result, context.orgId);

    return { ...result, data: {}, stepResults: [] } as WorkflowResult;
  }
};

export const upsertWorkflowResolver = async (_: unknown, { id, input }: { id: string; input: any }, context: any) => {
  if (!id) {
    throw new Error("id is required");
  }

  try {
    const now = new Date();
    const oldWorkflow = await context.datastore.getWorkflow(id, context.orgId);

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

    return await context.datastore.upsertWorkflow(id, workflow, context.orgId);
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
    return await context.datastore.deleteWorkflow(id, context.orgId);
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
    const workflow = await context.datastore.getWorkflow(id, context.orgId);
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
    const result = await context.datastore.listWorkflows(limit, offset, context.orgId);
    return {
      items: result.items,
      total: result.total,
    };
  } catch (error) {
    logMessage('error', "Error listing workflows: " + String(error), { orgId: context.orgId });
    throw error;
  }
};

export const buildWorkflowResolver = async (
  _: unknown,
  args: BuildWorkflowArgs,
  context: Context,
  info: GraphQLResolveInfo,
): Promise<Workflow> => {
  const { instruction, payload, integrationIds, responseSchema, useTools = true } = args;
  const metadata: Metadata = { runId: crypto.randomUUID(), orgId: context.orgId };

  try {
    // Fetch all integrations
    const allIntegrations = await context.datastore.listIntegrations(1000, 0, context.orgId);
    const integrations = allIntegrations.items.filter(int => integrationIds.includes(int.id));

    if (integrations.length !== integrationIds.length) {
      const missingIds = integrationIds.filter(id => !integrations.find(int => int.id === id));
      throw new Error(`Integration(s) not found: ${missingIds.join(', ')}`);
    }

    const builder = new WorkflowBuilder(
      instruction,
      integrations,
      payload || {},
      responseSchema || {},
      metadata
    );

    // Use tool-based building if requested
    const workflow = useTools ? await builder.buildWorkflow() : await builder.buildWorkflow();

    logMessage('info', `Workflow built successfully: ${workflow.id}`, metadata);
    return workflow;
  } catch (error) {
    logMessage('error', `Failed to build workflow: ${error}`, metadata);
    throw error;
  }
};
