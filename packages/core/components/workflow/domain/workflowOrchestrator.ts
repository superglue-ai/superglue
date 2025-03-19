import type { ApiInput, RequestOptions } from "@superglue/shared";
import type { ExecutionPlan, ExecutionPlanId, WorkflowResult } from "./workflow.types.js";

export interface WorkflowOrchestrator {
  retrieveApiDocumentation(
    documentationUrl: string,
    headers?: Record<string, any>,
    queryParams?: Record<string, any>,
  ): Promise<void>;

  getApiDocumentation(): string;

  setBaseApiInput(input: ApiInput): void;

  getBaseApiInput(): ApiInput;

  getExecutionPlans(): Record<string, ExecutionPlan>;

  registerExecutionPlan(plan: ExecutionPlan): Promise<ExecutionPlanId>;

  executeWorkflowPlan(
    planId: ExecutionPlanId,
    payload: Record<string, unknown>,
    credentials: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<WorkflowResult>;
}
