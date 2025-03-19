import type { ApiConfig, ApiInput, RequestOptions } from "@superglue/shared";

export type ExecutionPlanId = string;

export type ExecutionMode = "DIRECT" | "LOOP";

export interface VariableMapping {
  source: string;
  path: string;
  isArray: boolean;
  selectedValues?: string[];
}

export interface StepAnalysis {
  executionMode: ExecutionMode;
  variableMapping: Record<string, VariableMapping>;
}

export interface ExecutionStep {
  id: string;
  apiConfig: ApiConfig;
  executionMode: ExecutionMode;
  loopVariable?: string;
  loopMaxIters?: number;

  inputMapping?: string;
  responseMapping?: string;

  // Output extraction configurations
  arrayPath?: string; // JSONPath-like path to array data (e.g., "message.items")
  objectKeysAsArray?: boolean; // Use object keys as array values
  responseField?: string; // Primary field containing response data (e.g., "message" for Dog API)
}

export interface ExecutionPlan {
  id: string;
  apiHost: string;
  steps: ExecutionStep[];
  finalTransform?: string;
}

// StepMapping and StepMappings are removed as mappings are now part of ExecutionStep

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
