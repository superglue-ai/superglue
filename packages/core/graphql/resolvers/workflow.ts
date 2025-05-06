import type { GraphQLResolveInfo } from "graphql";
import { WorkflowExecutor } from "../../workflow/workflow-executor.js";
import { Context, Metadata, RequestOptions, Workflow, WorkflowResult } from "@superglue/shared";
import { createHash } from "crypto";
import { WorkflowBuilder } from "../../workflow/workflow-builder.js";
import type { SystemDefinition } from "../../workflow/workflow-builder.js";
import { logMessage } from "../../utils/logs.js";
import { JSONSchema } from "openai/lib/jsonschema.mjs";

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

interface ExecuteWorkflowArgs {
  input:  { workflow: Workflow; id?: never } | { workflow?: never; id: string };
  payload?: any;
  credentials?: any;
  options?: RequestOptions;
}

interface BuildWorkflowArgs {
  instruction: string;
  payload?: Record<string, unknown>;
  systems: SystemDefinition[];
  responseSchema?: JSONSchema;
}

export const executeWorkflowResolver = async (
  _: unknown,
  args: ExecuteWorkflowArgs,
  context: Context,
  info: GraphQLResolveInfo,
): Promise<WorkflowResult> => {
  let runId: string | undefined;
  let metadata: Metadata | undefined;
  try {
    const workflow: Workflow = args.input.workflow ||
      await context.datastore.getWorkflow(args.input.id, context.orgId);
    if(!workflow) {
      throw new Error("Workflow not found");
    }
    runId = crypto.randomUUID();
    metadata = { orgId: context.orgId, runId: runId };
    const executor = new WorkflowExecutor(workflow, metadata);
    const result = await executor.execute(args.payload, args.credentials, args.options);
    return result;
  } catch (error) {
    logMessage('error', "Workflow execution error: " + String(error), metadata || { orgId: context.orgId, runId });
    return {
      success: false,
      error: String(error),
      data: {},
      stepResults: [],
      startedAt: new Date(),
      completedAt: new Date(),
    };
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
      finalTransform: resolveField(input.finalTransform, oldWorkflow?.finalTransform, "$"),
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
    if(!workflow) {
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
    return result.items;
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
    const { instruction, payload = {}, systems, responseSchema } = args;

    if (!instruction || instruction.trim() === "") {
      throw new Error("Instruction is required to build a workflow.");
    }
    if (!systems || systems.length === 0) {
      throw new Error("At least one system definition is required.");
    }

    // Validate systems structure (basic validation, could be more robust)
    systems.forEach((sys, index) => {
      if (!sys.id || !sys.urlHost) {
        throw new Error(`Invalid system definition at index ${index}: 'id', and 'urlHost' are required.`);
      }
    });

    const builder = new WorkflowBuilder(systems, instruction, payload, responseSchema, metadata);
    const workflow = await builder.build();

    await context.datastore.upsertWorkflow(workflow.id, workflow, context.orgId);

    return workflow;
  } catch (error) {
    logMessage('error', "Workflow building error: " + String(error), { orgId: context.orgId });
    // Rethrow or return a structured error for GraphQL
    throw new Error(`Failed to build workflow: ${error}`);
  }
};

