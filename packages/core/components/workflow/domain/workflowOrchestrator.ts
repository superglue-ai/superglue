import type { ApiInput, RequestOptions } from "@superglue/shared";
import type { ExecutionPlan, ExecutionPlanId, StepMapping, WorkflowInput, WorkflowResult } from "./workflow.types.js";

export interface WorkflowOrchestrator {
  retrieveApiDocumentation(
    documentationUrl: string,
    headers?: Record<string, any>,
    queryParams?: Record<string, any>,
    apiHost?: string,
  ): Promise<void>;

  getApiDocumentation(): string;

  setBaseApiInput(input: ApiInput): void;

  getBaseApiInput(): ApiInput;

  getExecutionPlans(): Record<string, ExecutionPlan>;

  registerExecutionPlan(plan: ExecutionPlan): Promise<ExecutionPlanId>;

  setStepMapping(planId: ExecutionPlanId, stepId: string, mapping: StepMapping): Promise<void>;

  executeWorkflow(input: WorkflowInput): Promise<WorkflowResult>;

  executeWorkflowPlan(
    planId: ExecutionPlanId,
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<WorkflowResult>;
}
