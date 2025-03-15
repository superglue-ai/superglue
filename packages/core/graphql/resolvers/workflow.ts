import type { GraphQLResolveInfo } from "graphql";
import { ApiWorkflowOrchestrator } from "../../components/workflow/apiWorkflowOrchestrator.js";
import type { WorkflowInput, WorkflowResult } from "../../components/workflow/domain/workflow.types.js";

export const workflowResolver = async (
  _: unknown,
  { input }: { input: WorkflowInput },
  context: unknown,
  info: GraphQLResolveInfo,
): Promise<WorkflowResult> => {
  try {
    console.log("Received workflow input:", JSON.stringify(input.plan, null, 2));
    
    // Initialize orchestrator with base API input
    const orchestrator = new ApiWorkflowOrchestrator(input.baseApiInput);
    
    // Check if we have a documentationUrl in the baseApiInput
    if (input.baseApiInput?.documentationUrl) {
      console.log("Retrieving API documentation from URL:", input.baseApiInput.documentationUrl);
      // Explicitly retrieve the API documentation before proceeding
      await orchestrator.retrieveApiDocumentation(
        input.baseApiInput.documentationUrl,
        input.baseApiInput.headers,
        undefined,
        input.baseApiInput.urlHost
      );
      console.log("API documentation retrieved successfully");
    } else {
      console.warn("No documentation URL provided in baseApiInput");
    }
    
    // If we have a plan but no planId, register the plan
    if (input.plan && !input.planId) {
      console.log("Registering execution plan");
      const planId = await orchestrator.registerExecutionPlan(input.plan);
      
      // Set step mappings for each step in the plan
      for (const step of input.plan.steps) {
        await orchestrator.setStepMapping(planId, step.id, {
          inputMapping: "$", // Default identity mapping
          responseMapping: "$"
        });
      }
      
      // Execute with the registered plan
      return await orchestrator.executeWorkflowPlan(planId, input.payload || {}, input.credentials || {});
    }
    
    // If we have a planId, execute with that plan
    if (input.planId) {
      return await orchestrator.executeWorkflowPlan(input.planId, input.payload || {}, input.credentials || {});
    }
    
    // Execute the workflow (for backward compatibility)
    return await orchestrator.executeWorkflow(input);
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
