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
  integrations: ({ integration: Integration; id?: never } | { integration?: never; id: string })[];
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
    const workflowFromStore = await context.datastore.getWorkflow(args.input.id || args.input.workflow?.id, context.orgId);
    workflow = { ...workflowFromStore, ...args.input.workflow };
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    if (workflow.inputSchema && typeof workflow.inputSchema == 'string') {
      workflow.inputSchema = JSON.parse(workflow.inputSchema);
    }
    if (workflow.responseSchema && typeof workflow.responseSchema == 'string') {
      workflow.responseSchema = JSON.parse(workflow.responseSchema);
    }

    let mergedCredentials = args.credentials || {};
    if (Array.isArray(workflow.integrationIds) && workflow.integrationIds.length > 0) {
      const integrations = (
        await Promise.all(
          workflow.integrationIds.map(async (id) => {
            const integration = await context.datastore.getIntegration(id, context.orgId);
            if (!integration) {
              logMessage('warn', `Integration with id "${id}" not found, skipping.`, metadata);
            }
            return integration;
          })
        )
      ).filter(Boolean);

      const integrationCreds = flattenAndNamespaceWorkflowCredentials(
        integrations.map((i) => ({ id: i.id, credentials: i.credentials || {} }))
      );
      mergedCredentials = { ...integrationCreds, ...(args.credentials ?? {}) };
    }

    const executor = new WorkflowExecutor(workflow, metadata);
    const result = await executor.execute(args.payload, mergedCredentials, args.options);
    // Save run to datastore
    context.datastore.createRun({
      id: runId,
      success: result.success,
      error: result.error || undefined,
      config: result.config || workflow || { id: args.input.id, steps: [] },
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
  try {
    const metadata: Metadata = { orgId: context.orgId, runId: crypto.randomUUID() };
    const { instruction, payload = {}, integrations, responseSchema } = args;

    if (!instruction || instruction.trim() === "") {
      throw new Error("Instruction is required to build a workflow.");
    }
    if (!integrations || integrations.length === 0) {
      throw new Error("At least one integration is required.");
    }

    // Resolve integrations: fetch by id or use provided object
    const resolvedIntegrations: Integration[] = await Promise.all(
      integrations.map(async (item, index) => {
        if ("id" in item && item.id) {
          const integration = await context.datastore.getIntegration(item.id, context.orgId);
          if (!integration) {
            throw new Error(`Integration with id "${item.id}" not found (index ${index})`);
          }
          return integration;
        } else if ("integration" in item && item.integration) {
          return item.integration;
        } else {
          throw new Error(`Invalid integration input at index ${index}: must provide either id or integration`);
        }
      })
    );

    const blocked = resolvedIntegrations.find(
      i => (i as any).documentationPending || !i.documentation
    );
    if (blocked) {
      const reason = (blocked as any).documentationPending
        ? `documentation is still being fetched`
        : `documentation could not be fetched`;
      logMessage(
        'warn',
        `Workflow build blocked: ${reason} for integration "${blocked.id}"`,
        metadata
      );
      throw new Error(
        `Cannot build workflow: ${reason} for integration "${blocked.id}".`
      );
    }

    const builder = new WorkflowBuilder(resolvedIntegrations, instruction, payload, responseSchema, metadata);
    const workflow = await builder.build();
    // prevent collisions with existing workflows
    while (await context.datastore.getWorkflow(workflow.id, context.orgId)) {
      workflow.id = workflow.id + "-1";
    }

    return workflow;
  } catch (error) {
    logMessage('error', "Workflow building error: " + String(error), { orgId: context.orgId });
    // Rethrow or return a structured error for GraphQL
    throw new Error(`Failed to build workflow: ${error}`);
  }
};

