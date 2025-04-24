import type { GraphQLResolveInfo } from "graphql";
import { WorkflowExecutor } from "../../workflow/workflow-executor.js";
import { Context, Metadata, RequestOptions, Workflow, WorkflowResult } from "@superglue/shared";
import { createHash } from "crypto";

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


export const executeWorkflowResolver = async (
  _: unknown,
  args: ExecuteWorkflowArgs,
  context: Context,
  info: GraphQLResolveInfo,
): Promise<WorkflowResult> => {
  try {
    const workflow: Workflow = args.input.workflow || 
      await context.datastore.getWorkflow(args.input.id, context.orgId);
    const runId = crypto.randomUUID();
    const metadata: Metadata = { orgId: context.orgId, runId: runId };
    const executor = new WorkflowExecutor(workflow, metadata);
    const result = await executor.execute(args.payload, args.credentials, args.options);
    return result;
  } catch (error) {
    console.error("Workflow execution error:", error);
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
    console.error("Error upserting workflow:", error);
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
    console.error("Error deleting workflow:", error);
    throw error;
  }
};

export const getWorkflowResolver = async (_: unknown, { id }: { id: string }, context: any) => {
  if (!id) {
    throw new Error("id is required");
  }

  try {
    const workflow = await context.datastore.getWorkflow(id, context.orgId);

    // for each step, make sure that the apiConfig has an id. if not, set it to the step id
    workflow.steps.forEach((step: any) => {
      if (!step.apiConfig.id) {
        step.apiConfig.id = step.id;
      }
    });
    return workflow;
  } catch (error) {
    console.error("Error getting workflow:", error);
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
    console.error("Error listing workflows:", error);
    throw error;
  }
};
