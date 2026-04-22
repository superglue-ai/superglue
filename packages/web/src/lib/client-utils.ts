import {
  ExecutionFileEnvelope,
  ToolStep,
  System,
  ResponseFilter,
  SuperglueClient,
  Tool,
  isTransformConfig,
} from "@superglue/shared";
import { isAbortError } from "./general-utils";
import { tokenRegistry } from "./token-registry";
import { connectionMonitor } from "./connection-monitor";

const BASE62_REGEX = /^[a-zA-Z0-9_-]*$/;

export const ABORT_DEBOUNCE_MS = 2000;

export function shouldDebounceAbort(lastAbortTime: number): boolean {
  const now = Date.now();
  return now - lastAbortTime < ABORT_DEBOUNCE_MS;
}

export function isValidToolName(name: string): boolean {
  return BASE62_REGEX.test(name);
}

export function validateToolName(name: string): string | null {
  if (!name) {
    return "Tool name cannot be empty";
  }
  if (name.length > 100) {
    return "Tool name cannot be longer than 100 characters";
  }
  if (!isValidToolName(name)) {
    return "Tool name can only contain letters, numbers, hyphens, and underscores";
  }

  return null;
}

export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  data?: any;
  error?: string;
  updatedStep?: any;
  runId?: string;
  stepFileKeys?: string[];
  producedFiles?: Record<string, ExecutionFileEnvelope>;
}

export interface FinalTransformExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  updatedTransform?: string;
  updatedResponseSchema?: any;
  runId?: string;
}

export interface ToolExecutionState {
  originalTool: Tool;
  currentTool: Tool;
  stepResults: Record<string, StepExecutionResult>;
  completedSteps: string[];
  failedSteps: string[];
  abortedSteps: string[];
  isExecuting: boolean;
  currentStepIndex: number;
  interrupted?: boolean;
}

export async function abortExecution(
  client: SuperglueClient,
  runId: string | null,
): Promise<boolean> {
  if (!runId) return false;

  try {
    const result = await client.abortStep(runId);
    return result.success;
  } catch (error) {
    console.error("Failed to abort step:", error);
    return false;
  }
}

export async function executeSingleStep({
  client,
  step,
  payload,
  files,
  previousResults,
  onRunIdGenerated,
  mode,
  systemIds,
}: {
  client: SuperglueClient;
  step: ToolStep;
  payload: any;
  files?: Record<string, ExecutionFileEnvelope>;
  previousResults: Record<string, any>;
  onRunIdGenerated?: (runId: string) => void;
  mode?: "dev" | "prod";
  systemIds?: string[];
}): Promise<StepExecutionResult> {
  const stepRunId = generateUUID();

  if (onRunIdGenerated) {
    onRunIdGenerated(stepRunId);
  }

  try {
    // Use the new REST endpoint that doesn't create a run
    const result = await client.executeStep({
      step,
      payload,
      files,
      previousResults,
      runId: stepRunId,
      mode,
      systemIds,
    });

    return {
      stepId: step.id,
      success: result.success,
      data: result.data,
      error: result.error,
      updatedStep: result.updatedStep,
      runId: stepRunId,
      stepFileKeys: result.stepFileKeys,
      producedFiles: result.producedFiles,
    };
  } catch (error: any) {
    return {
      stepId: step.id,
      success: false,
      error: error.message || "Step execution failed",
      runId: stepRunId,
    };
  }
}

export async function executeToolStepByStep({
  client,
  tool,
  payload,
  files,
  onStepComplete,
  onBeforeStep,
  onStepRunIdChange,
  mode,
  systemIds,
}: {
  client: SuperglueClient;
  tool: Tool;
  payload: any;
  files?: Record<string, ExecutionFileEnvelope>;
  onStepComplete?: (stepIndex: number, result: StepExecutionResult) => void;
  onBeforeStep?: (stepIndex: number, step: any) => Promise<boolean>;
  onStepRunIdChange?: (stepRunId: string) => void;
  mode?: "dev" | "prod";
  systemIds?: string[];
}): Promise<ToolExecutionState> {
  const state: ToolExecutionState = {
    originalTool: tool,
    currentTool: { ...tool },
    stepResults: {},
    completedSteps: [],
    failedSteps: [],
    abortedSteps: [],
    isExecuting: true,
    currentStepIndex: 0,
    interrupted: false,
  };

  const previousResults: Record<string, any> = {};
  let currentFiles: Record<string, ExecutionFileEnvelope> = { ...(files || {}) };

  for (let i = 0; i < tool.steps.length; i++) {
    state.currentStepIndex = i;
    const step = tool.steps[i];

    if (onBeforeStep) {
      const shouldContinue = await onBeforeStep(i, step);
      if (!shouldContinue) {
        state.isExecuting = false;
        state.interrupted = true;
        return state;
      }
    }

    // Pass systemIds for transform steps so they can access system credentials
    const stepSystemIds = isTransformConfig(step.config) ? systemIds : undefined;
    const result = await executeSingleStep({
      client,
      step,
      payload,
      files: currentFiles,
      previousResults,
      onRunIdGenerated: onStepRunIdChange,
      mode,
      systemIds: stepSystemIds,
    });

    state.stepResults[step.id] = result;

    if (result.success) {
      state.completedSteps.push(step.id);
      previousResults[step.id] = result.data;
      if (result.producedFiles && Object.keys(result.producedFiles).length > 0) {
        currentFiles = { ...currentFiles, ...result.producedFiles };
      }

      // Update the tool with any returned step configuration (normalization, etc.)
      if (result.updatedStep) {
        state.currentTool = {
          ...state.currentTool,
          steps: state.currentTool.steps.map((s, idx) => (idx === i ? result.updatedStep : s)),
        };
      }
    } else {
      if (result.error && isAbortError(result.error)) {
        state.abortedSteps.push(step.id);
      } else {
        state.failedSteps.push(step.id);
      }
      state.isExecuting = false;

      if (onStepComplete) {
        onStepComplete(i, result);
      }
      return state;
    }

    if (onStepComplete) {
      onStepComplete(i, result);
    }
  }

  if ((tool.outputTransform || tool.responseFilters?.length) && state.failedSteps.length === 0) {
    const transformResult = await executeOutputTransform({
      client,
      outputTransform: state.currentTool.outputTransform || tool.outputTransform,
      outputSchema: tool.outputSchema,
      inputSchema: tool.inputSchema,
      payload,
      files: currentFiles,
      previousResults,
      responseFilters: tool.responseFilters,
      onRunIdGenerated: onStepRunIdChange,
    });

    state.stepResults["__final_transform__"] = {
      stepId: "__final_transform__",
      success: transformResult.success,
      data: transformResult.data,
      error: transformResult.error,
    };

    if (transformResult.success) {
      state.completedSteps.push("__final_transform__");
    } else {
      if (isAbortError(transformResult.error)) {
        state.abortedSteps.push("__final_transform__");
      } else {
        state.failedSteps.push("__final_transform__");
      }
    }
  }

  state.isExecuting = false;
  return state;
}

export async function executeOutputTransform({
  client,
  outputTransform,
  outputSchema,
  inputSchema,
  payload,
  files,
  previousResults,
  onRunIdGenerated,
  responseFilters,
}: {
  client: SuperglueClient;
  outputTransform: string;
  outputSchema: any;
  inputSchema: any;
  payload: any;
  files?: Record<string, ExecutionFileEnvelope>;
  previousResults: Record<string, any>;
  onRunIdGenerated?: (runId: string) => void;
  responseFilters?: ResponseFilter[];
}): Promise<FinalTransformExecutionResult> {
  const transformRunId = generateUUID();

  if (onRunIdGenerated) {
    onRunIdGenerated(transformRunId);
  }

  try {
    // Use the new REST endpoint that doesn't create a run
    const result = await client.executeTransformOnly({
      outputTransform,
      outputSchema,
      inputSchema,
      payload,
      files,
      stepResults: previousResults,
      responseFilters,
      runId: transformRunId,
    });

    return {
      success: result.success,
      data: result.data,
      error: result.error,
      updatedTransform: result.updatedTransform,
      updatedResponseSchema: result.updatedOutputSchema,
      runId: transformRunId,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Output transform execution failed",
      runId: transformRunId,
    };
  }
}

export const parseCredentialsHelper = (simpleCreds: string): Record<string, string> => {
  try {
    const creds = simpleCreds?.trim() || "";
    if (!creds) {
      return {};
    }

    if (creds.startsWith("{")) {
      return JSON.parse(creds);
    }

    if (creds.startsWith("Bearer ")) {
      return { token: creds.replace("Bearer ", "") };
    }

    if (creds.startsWith("Basic ")) {
      return { token: creds.replace("Basic ", "") };
    }

    return { token: creds };
  } catch (error) {
    return {};
  }
};

/**
 * Generate a UUID v4 with fallback for browsers that don't support crypto.randomUUID
 * Works in both secure and non-secure contexts
 */
export function generateUUID(): string {
  // Use native crypto.randomUUID if available (secure contexts only)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fall through to manual implementation
    }
  }

  // Fallback implementation using crypto.getRandomValues (available in more contexts)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);

    // Set the version to 4 (random)
    array[6] = (array[6] & 0x0f) | 0x40;
    // Set the variant to 1 (RFC4122)
    array[8] = (array[8] & 0x3f) | 0x80;

    return [...array]
      .map((b, i) => {
        const hex = b.toString(16).padStart(2, "0");
        return i === 4 || i === 6 || i === 8 || i === 10 ? `-${hex}` : hex;
      })
      .join("");
  }

  // Final fallback for environments without crypto (should be rare)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
