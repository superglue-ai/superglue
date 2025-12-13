import { UploadedFileInfo } from '@/src/lib/file-utils';
import { Integration } from '@superglue/shared';

export interface StepConfig {
  id: string;
  integrationId?: string;
  dataSelector?: string;
  failureBehavior?: 'FAIL' | 'CONTINUE';
  apiConfig: {
    id: string;
    instruction?: string;
    urlHost: string;
    urlPath: string;
    method: string;
    headers: Record<string, string> | string;
    queryParams: Record<string, string> | string;
    body?: string;
    pagination?: any;
  };
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';

export interface StepExecutionState {
  stepInput: Record<string, any>;
  dataSelectorOutput: any | null;
  dataSelectorError: string | null;
  result: any | null;
  error: string | null;
  status: StepStatus;
  isLoopStep: boolean;
  loopItemCount: number | null;
  currentRunId: string | null;
}

export interface PayloadState {
  manualPayloadText: string;
  uploadedFiles: UploadedFileInfo[];
  filePayloads: Record<string, any>;
  computedPayload: Record<string, any>;
  isValid: boolean;
  hasUserEdited: boolean;
}

export interface ToolDefinition {
  id: string;
  instruction: string;
  finalTransform: string;
  inputSchema: any | null;
  responseSchema: any | null;
}

export interface ToolConfigContextValue {
  tool: ToolDefinition;
  steps: StepConfig[];
  payload: PayloadState;
  integrations: Integration[];
  readOnly: boolean;
  
  // Tool mutations
  setToolId: (id: string) => void;
  setInstruction: (instruction: string) => void;
  setFinalTransform: (transform: string) => void;
  setInputSchema: (schema: string | null) => void;
  setResponseSchema: (schema: string) => void;
  
  // Payload mutations
  setPayloadText: (text: string) => void;
  uploadFiles: (files: File[]) => Promise<void>;
  removeFile: (key: string) => void;
  markPayloadEdited: () => void;
  
  // Step config mutations
  addStep: (step: StepConfig, afterIndex?: number) => void;
  removeStep: (stepId: string) => void;
  updateStep: (stepId: string, updates: Partial<StepConfig>, isUserInitiated?: boolean) => void;
  reorderSteps: (fromIndex: number, toIndex: number) => void;
  setSteps: (steps: StepConfig[]) => void;
  
  // Helpers
  getStepConfig: (stepId: string) => StepConfig | undefined;
  getStepIndex: (stepId: string) => number;
}

export type TransformStatus = 'idle' | 'running' | 'fixing';

export interface ToolExecutionState {
  finalResult: any | null;
  finalError: string | null;
  transformStatus: TransformStatus;
  isExecutingAny: boolean;
  currentExecutingStepId: string | null;
  currentRunId: string | null;
}

export const DEFAULT_STEP_EXECUTION_STATE: StepExecutionState = {
  stepInput: {},
  dataSelectorOutput: null,
  dataSelectorError: null,
  result: null,
  error: null,
  status: 'pending',
  isLoopStep: false,
  loopItemCount: null,
  currentRunId: null,
};

export interface ExecutionContextValue {
  toolExecution: ToolExecutionState;
  stepExecutions: Record<string, StepExecutionState>;
  
  // Step execution mutations
  setStepInput: (stepId: string, input: Record<string, any>) => void;
  setStepDataSelector: (stepId: string, output: any, error: string | null) => void;
  setStepResult: (stepId: string, result: any, error: string | null, status: 'completed' | 'failed' | 'aborted') => void;
  setStepRunning: (stepId: string, runId: string) => void;
  resetStepExecution: (stepId: string) => void;
  resetExecutionsFrom: (stepIndex: number) => void;  // cascade reset from step onwards
  resetAllExecutions: () => void;
  
  // Transform mutations
  setFinalResult: (result: any, error: string | null) => void;
  setTransformStatus: (status: TransformStatus) => void;
  setTransformRunning: (runId: string) => void;
  resetTransform: () => void;
  
  // Execution control mutations
  setCurrentExecutingStep: (stepId: string | null) => void;
  setIsExecutingAny: (isExecuting: boolean) => void;
  
  // Helpers
  getStepExecution: (stepId: string) => StepExecutionState;
  getStepStatus: (stepId: string) => StepStatus;
  isStepCompleted: (stepId: string) => boolean;
  isStepFailed: (stepId: string) => boolean;
  isStepAborted: (stepId: string) => boolean;
  canExecuteStep: (stepIndex: number) => boolean;  // all previous completed
}