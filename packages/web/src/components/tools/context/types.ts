import { UploadedFileInfo } from "@/src/lib/file-utils";
import { ExecutionStep, Integration } from "@superglue/shared";

export interface PayloadState {
  manualPayloadText: string;
  uploadedFiles: UploadedFileInfo[];
  filePayloads: Record<string, any>;
  computedPayload: Record<string, any>;
  hasUserEdited: boolean;
}

export interface ToolDefinition {
  id: string;
  instruction: string;
  finalTransform: string;
  inputSchema: any | null;
  responseSchema: any | null;
  folder?: string;
  isArchived: boolean;
}

export interface ToolConfigContextValue {
  tool: ToolDefinition;
  steps: ExecutionStep[];
  payload: PayloadState;
  integrations: Integration[];

  inputSchema: string | null;
  responseSchema: string;
  finalTransform: string;

  setToolId: (id: string) => void;
  setInstruction: (instruction: string) => void;
  setFinalTransform: (transform: string) => void;
  setInputSchema: (schema: string | null) => void;
  setResponseSchema: (schema: string) => void;
  setFolder: (folder: string | undefined) => void;
  setIsArchived: (archived: boolean) => void;

  setPayloadText: (text: string) => void;
  setUploadedFiles: (files: UploadedFileInfo[]) => void;
  setFilePayloads: (payloads: Record<string, any>) => void;
  markPayloadEdited: () => void;

  addStep: (step: ExecutionStep, afterIndex?: number) => void;
  removeStep: (stepId: string) => void;
  updateStep: (stepId: string, updates: Partial<ExecutionStep>) => void;
  setSteps: (steps: ExecutionStep[]) => void;

  getStepConfig: (stepId: string) => ExecutionStep | undefined;
  getStepIndex: (stepId: string) => number;
  getStepIntegration: (stepId: string) => Integration | undefined;
}

export type StepStatus = "pending" | "running" | "completed" | "failed" | "aborted";

export interface StepExecutionState {
  status: StepStatus;
  result: any | null;
  error: string | null;
  runId: string | null;
}

export const DEFAULT_STEP_EXECUTION: StepExecutionState = {
  status: "pending",
  result: null,
  error: null,
  runId: null,
};

export type TransformStatus = "idle" | "running" | "fixing" | "completed" | "failed" | "aborted";

export interface DataSelectorResult {
  output: any | null;
  error: string | null;
}

export interface CategorizedVariables {
  credentials: string[];
  toolInputs: string[];
  fileInputs: string[];
  currentStepData: string[];
  previousStepData: string[];
  paginationVariables: string[];
}

export interface CategorizedSources {
  manualPayload: Record<string, unknown>;
  filePayloads: Record<string, unknown>;
  previousStepResults: Record<string, unknown>;
  currentItem: unknown;
  paginationData: Record<string, unknown>;
}

export interface StepTemplateData {
  sourceData: Record<string, any>;
  credentials: Record<string, string>;
  categorizedVariables: CategorizedVariables;
  categorizedSources: CategorizedSources;
  dataSelectorOutput: any | null;
  dataSelectorError: string | null;
  canExecute: boolean;
}

export interface StepStatusInfo {
  text: string;
  color: string;
  dotColor: string;
  animate: boolean;
}

export interface ExecutionContextValue {
  // === PER-STEP EXECUTION STATE ===
  stepExecutions: Record<string, StepExecutionState>;

  // === TOOL-LEVEL EXECUTION STATE ===
  isExecutingAny: boolean;
  currentExecutingStepIndex: number | null;
  currentRunId: string | null;
  isStopping: boolean;

  // === FINAL TRANSFORM STATE ===
  finalResult: any | null;
  finalError: string | null;
  transformStatus: TransformStatus;

  // === TRANSFORM STATUS CONVENIENCE GETTERS ===
  isRunningTransform: boolean;
  isFixingTransform: boolean;
  isExecutingTransform: boolean;
  canExecuteTransform: boolean;

  // === STEP MUTATIONS ===
  setStepResult: (stepId: string, result: any, status: StepStatus, error?: string) => void;
  setStepRunning: (stepId: string, runId: string) => void;
  clearStepExecution: (stepId: string) => void;
  clearExecutionsFrom: (stepIndex: number) => void;
  clearAllExecutions: () => void;

  // === EXECUTION CONTROL ===
  startExecution: (runId: string) => void;
  stopExecution: () => void;
  markAsStopping: () => void;
  finishExecution: () => void;
  setCurrentExecutingStepIndex: (index: number | null) => void;
  skipNextHashInvalidation: () => void;

  // === TRANSFORM MUTATIONS ===
  setFinalResult: (result: any, status: TransformStatus, error?: string) => void;
  setTransformRunning: (runId: string) => void;
  setTransformStatus: (status: TransformStatus) => void;
  clearFinalResult: () => void;

  // === STEP QUERIES ===
  getStepExecution: (stepId: string) => StepExecutionState;
  getStepStatus: (stepId: string) => StepStatus;
  getStepResult: (stepId: string) => any | null;
  getStepStatusInfo: (stepId: string) => StepStatusInfo;
  isStepCompleted: (stepId: string) => boolean;
  isStepFailed: (stepId: string) => boolean;
  isStepAborted: (stepId: string) => boolean;
  isStepRunning: (stepId: string) => boolean;
  canExecuteStep: (stepIndex: number) => boolean;

  // === PAYLOAD HELPERS ===
  getStepInput: (stepId?: string) => Record<string, any>;
  stepResultsMap: Record<string, any>;
  sourceDataVersion: number;

  // === PER-STEP TEMPLATE DATA ===
  getStepTemplateData: (stepId: string) => StepTemplateData;
  getSourceData: (stepId: string) => Record<string, any>;
  getCredentials: (stepId: string) => Record<string, string>;
  getCategorizedVariables: (stepId: string) => CategorizedVariables;
  getCategorizedSources: (stepId: string) => CategorizedSources;
  getDataSelectorResult: (stepId: string) => DataSelectorResult;
}
