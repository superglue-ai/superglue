import type { GraphQLResolveInfo } from "graphql";
import { ApiWorkflowOrchestrator } from "../../components/workflow/apiWorkflowOrchestrator.js";
import type { WorkflowInput, WorkflowResult } from "../../components/workflow/domain/workflow.types.js";

/**
 * GraphQL resolver for executing workflows
 */
export const workflowResolver = async (
  _: unknown,
  { input }: { input: WorkflowInput },
  context: unknown,
  info: GraphQLResolveInfo,
): Promise<WorkflowResult> => {
  const orchestrator = new ApiWorkflowOrchestrator(input.baseApiInput);
  return await orchestrator.executeWorkflow(input);
};
