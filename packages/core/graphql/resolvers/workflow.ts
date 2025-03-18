import type { GraphQLResolveInfo } from "graphql";
import { ApiWorkflowOrchestrator } from "../../components/workflow/apiWorkflowOrchestrator.js";
import type { WorkflowInput, WorkflowResult } from "../../components/workflow/domain/workflow.types.js";

function resolveField<T>(newValue: T | null | undefined, oldValue: T | undefined, defaultValue?: T): T | undefined {
  if (newValue === null) return undefined;
  if (newValue !== undefined) return newValue;
  if (oldValue !== undefined) return oldValue;
  return defaultValue;
}

export const workflowResolver = async (
  _: unknown,
  { input }: { input: WorkflowInput },
  context: any,
  info: GraphQLResolveInfo,
): Promise<WorkflowResult> => {
  try {
    const orchestrator = new ApiWorkflowOrchestrator(input.baseApiInput);
    let planId: string;

    // If we have a plan, register it first
    if (input.plan) {
      // Register the plan to ensure it exists
      planId = await orchestrator.registerExecutionPlan(input.plan);

      // Set step mappings for each step in the plan
      for (const step of input.plan.steps) {
        await orchestrator.setStepMapping(planId, step.id, {
          inputMapping: "$", // Default identity mapping
          responseMapping: "$",
        });
      }
    } else if (input.planId) {
      planId = input.planId;
    } else {
      throw new Error("Either a plan or a planId must be provided");
    }

    return await orchestrator.executeWorkflowPlan(planId, input.payload || {}, input.credentials || {}, input.options);
  } catch (error) {
    console.error("Workflow execution error:", error);
    return {
      success: false,
      error: String(error),
      data: {},
      stepResults: {},
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

    if (oldWorkflow) {
      // Update existing workflow
      const updatedWorkflow = {
        id,
        name: resolveField(input.name, oldWorkflow.name, ""),
        plan: resolveField(input.plan, oldWorkflow.plan),
        createdAt: oldWorkflow.createdAt,
        updatedAt: now,
      };

      return context.datastore.upsertWorkflow(id, updatedWorkflow, context.orgId);
    }

    // Else create new workflow
    const newWorkflow = {
      id,
      name: input.name,
      plan: input.plan,
      createdAt: now,
      updatedAt: now,
    };

    return context.datastore.upsertWorkflow(id, newWorkflow, context.orgId);
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
    return context.datastore.deleteWorkflow(id, context.orgId);
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
    return context.datastore.getWorkflow(id, context.orgId);
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
