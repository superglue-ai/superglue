import { UploadedFileInfo } from '@/src/lib/file-utils';
import { ExecutionStep, Integration } from '@superglue/shared';


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
  
  // Raw string versions for editing (tool has parsed objects)
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
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';

export interface StepExecutionState {
  status: StepStatus;
  result: any | null;
  error: string | null;
  runId: string | null;
}

export const DEFAULT_STEP_EXECUTION: StepExecutionState = {
  status: 'pending',
  result: null,
  error: null,
  runId: null,
};

export type TransformStatus = 'idle' | 'running' | 'fixing' | 'completed' | 'failed' | 'aborted';

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
  
  // === TRANSFORM MUTATIONS ===
  setFinalResult: (result: any, status: TransformStatus, error?: string) => void;
  setTransformRunning: (runId: string) => void;
  setTransformStatus: (status: TransformStatus) => void;
  clearFinalResult: () => void;
  
  // === STEP QUERIES (all O(1)) ===
  getStepExecution: (stepId: string) => StepExecutionState;
  getStepStatus: (stepId: string) => StepStatus;
  getStepResult: (stepId: string) => any | null;
  isStepCompleted: (stepId: string) => boolean;
  isStepFailed: (stepId: string) => boolean;
  isStepAborted: (stepId: string) => boolean;
  isStepRunning: (stepId: string) => boolean;
  canExecuteStep: (stepIndex: number) => boolean;
  
  // === PAYLOAD HELPERS ===
  getEvolvingPayload: (stepIndex: number) => Record<string, any>;
  getStepResultsMap: () => Record<string, any>;
  
  // === DATA VERSIONING ===
  sourceDataVersion: number;
  incrementSourceDataVersion: () => void;
}
