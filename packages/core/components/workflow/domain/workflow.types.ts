import type { ApiConfig, ApiInput, RequestOptions } from "@superglue/shared";

export type ExecutionPlanId = string;

export interface ExecutionStep {
  id: string;
  description: string;
  endpoint: string;
  method: string;
  apiConfig?: ApiConfig;
  dependencies?: string[];
  generateSchema?: boolean;
}

export interface ExecutionPlan {
  id: string;
  apiHost: string;
  steps: ExecutionStep[];
  finalTransform?: string;
}

export interface StepMapping {
  inputMapping: string;
  responseMapping: string;
}

export interface StepMappings {
  [stepId: string]: StepMapping;
}

export interface WorkflowStepResult {
  stepId: string;
  success: boolean;
  rawData?: unknown;
  transformedData?: unknown;
  error?: string;
}

export interface WorkflowResult {
  success: boolean;
  data: Record<string, unknown>;
  stepResults: Record<string, WorkflowStepResult>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface WorkflowInput {
  planId?: string;
  plan?: ExecutionPlan;
  payload: Record<string, unknown>;
  credentials: Record<string, unknown>;
  options?: RequestOptions;
  baseApiInput?: ApiInput;
}
