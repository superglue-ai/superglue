import { Integration, SelfHealingMode, SuperglueClient, Workflow as Tool } from "@superglue/client";
import { tokenRegistry } from "./token-registry";

export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  data?: any;
  error?: string;
  updatedStep?: any;
}

export interface FinalTransformExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  updatedTransform?: string;
  updatedResponseSchema?: any;
}

export interface ToolExecutionState {
  originalTool: Tool;
  currentTool: Tool;
  stepResults: Record<string, StepExecutionResult>;
  completedSteps: string[];
  failedSteps: string[];
  isExecuting: boolean;
  currentStepIndex: number;
  interrupted?: boolean;
}

export function createSingleStepTool(
  tool: Tool,
  stepIndex: number,
  previousResults: Record<string, any> = {}
): Tool {
  if (stepIndex < 0 || stepIndex >= tool.steps.length) {
    throw new Error(`Invalid step index: ${stepIndex}`);
  }

  const step = tool.steps[stepIndex];

  const singleStepTool: any = {
    id: `${tool.id}_step_${stepIndex}`,
    steps: [step],
    finalTransform: ''
  };

  return singleStepTool;
}

export async function executeSingleStep(
  client: SuperglueClient,
  tool: Tool,
  stepIndex: number,
  payload: any,
  previousResults: Record<string, any> = {},
  selfHealing: boolean = false
): Promise<StepExecutionResult> {
  const step = tool.steps[stepIndex];

  try {
    const singleStepTool = createSingleStepTool(tool, stepIndex, previousResults);

    const executionPayload = {
      ...payload,
      ...Object.keys(previousResults).reduce((acc, stepId) => ({
        ...acc,
        [`${stepId}`]: previousResults[stepId]
      }), {})
    };

    const result = await client.executeWorkflow({
      workflow: singleStepTool,
      payload: executionPayload,
      options: {
        testMode: selfHealing,
        selfHealing: selfHealing ? SelfHealingMode.REQUEST_ONLY : SelfHealingMode.DISABLED
      }
    });

    const stepResult = result.stepResults[0];

    return {
      stepId: step.id,
      success: result.success,
      data: stepResult.transformedData,
      error: result.error,
      updatedStep: result.config?.steps?.[0]
    };
  } catch (error: any) {
    return {
      stepId: step.id,
      success: false,
      error: error.message || 'Step execution failed'
    };
  }
}

export async function executeToolStepByStep(
  client: SuperglueClient,
  tool: Tool,
  payload: any,
  onStepComplete?: (stepIndex: number, result: StepExecutionResult) => void,
  selfHealing: boolean = false,
  shouldStop?: () => boolean
): Promise<ToolExecutionState> {
  const state: ToolExecutionState = {
    originalTool: tool,
    currentTool: { ...tool },
    stepResults: {},
    completedSteps: [],
    failedSteps: [],
    isExecuting: true,
    currentStepIndex: 0,
    interrupted: false
  };

  const previousResults: Record<string, any> = {};

  for (let i = 0; i < tool.steps.length; i++) {
    if (shouldStop && shouldStop()) {
      state.isExecuting = false;
      state.interrupted = true;
      return state;
    }

    state.currentStepIndex = i;
    const step = tool.steps[i];

    const result = await executeSingleStep(
      client,
      state.currentTool,
      i,
      payload,
      previousResults,
      selfHealing
    );

    state.stepResults[step.id] = result;

    if (result.success) {
      state.completedSteps.push(step.id);
      previousResults[step.id] = result.data;

      // Update the tool with any returned step configuration (normalization, self-healing, etc.)
      if (result.updatedStep) {
        state.currentTool = {
          ...state.currentTool,
          steps: state.currentTool.steps.map((s, idx) =>
            idx === i ? result.updatedStep : s
          )
        };
      }
    } else {
      state.failedSteps.push(step.id);
      state.isExecuting = false;

      // Stop execution on failure
      if (onStepComplete) {
        onStepComplete(i, result);
      }
      return state;
    }

    if (onStepComplete) {
      onStepComplete(i, result);
    }
    if (shouldStop && shouldStop()) {
      state.isExecuting = false;
      state.interrupted = true;
      return state;
    }
  }

  if (tool.finalTransform && state.failedSteps.length === 0) {
    // Final guard before executing transform
    if (shouldStop && shouldStop()) {
      state.isExecuting = false;
      state.interrupted = true;
      return state;
    }
    const finalResult = await executeFinalTransform(
      client,
      tool.id || 'tool',
      state.currentTool.finalTransform || tool.finalTransform,
      tool.responseSchema,
      tool.inputSchema,
      payload,
      previousResults,
      selfHealing
    );

    state.stepResults['__final_transform__'] = {
      stepId: '__final_transform__',
      success: finalResult.success,
      data: finalResult.data,
      error: finalResult.error
    };

    if (finalResult.success) {
      state.completedSteps.push('__final_transform__');

      if (finalResult.updatedTransform && selfHealing) {
        state.currentTool = {
          ...state.currentTool,
          finalTransform: finalResult.updatedTransform
        };
      }
    } else {
      state.failedSteps.push('__final_transform__');
    }
  }

  state.isExecuting = false;
  return state;
}

export async function executeFinalTransform(
  client: SuperglueClient,
  toolId: string,
  finalTransform: string,
  responseSchema: any,
  inputSchema: any,
  payload: any,
  previousResults: Record<string, any>,
  selfHealing: boolean = false
): Promise<FinalTransformExecutionResult> {
  try {
    const finalPayload = {
      ...payload,
      ...previousResults
    };
    const result = await client.executeWorkflow({
      workflow: {
        id: `${toolId}_final_transform`,
        steps: [],
        finalTransform,
        responseSchema,
        inputSchema: inputSchema
      },
      payload: finalPayload,
      options: {
        testMode: selfHealing,
        selfHealing: selfHealing ? SelfHealingMode.TRANSFORM_ONLY : SelfHealingMode.DISABLED
      }
    });
    return {
      success: result.success,
      data: result.data,
      error: result.error,
      updatedTransform: result.config?.finalTransform,
      updatedResponseSchema: result.config?.responseSchema
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Final transform execution failed'
    };
  }
}

export function canExecuteStep(
  stepIndex: number,
  completedSteps: string[],
  tool: Tool,
  stepResults?: Record<string, any>
): boolean {
  if (stepIndex === 0) {
    return true;
  }

  // Check that all previous steps are completed and have results
  for (let i = 0; i < stepIndex; i++) {
    const stepId = tool.steps[i].id;
    if (!completedSteps.includes(stepId)) {
      return false;
    }
    // If stepResults is provided, also check that the step has a result
    if (stepResults && !stepResults[stepId]) {
      return false;
    }
  }

  return true;
}


export const isJsonEmpty = (inputJson: string): boolean => {
  try {
    if (!inputJson) return true
    const parsedJson = JSON.parse(inputJson)
    return Object.keys(parsedJson).length === 0
  } catch (error) {
    // If invalid JSON, we consider it empty
    return true
  }
}

export const findArraysOfObjects = (obj: any): Record<string, any[]> => {
  const arrays: Record<string, any[]> = {};

  const traverse = (value: any, path: string = '') => {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      arrays[path] = value;
    }

    if (typeof value === 'object' && value !== null) {
      Object.entries(value).forEach(([key, val]) => {
        traverse(val, `${path ? `${path}.` : ''}${key}`);
      });
    }
  };
  traverse(obj);

  if (Object.keys(arrays).length === 0) {
    if (Object.keys(obj).length === 1) {
      const [key, value] = Object.entries(obj)[0];
      return { [key]: [value] };
    }
    return { response: [obj] };
  }
  return arrays;
};

export const parseCredentialsHelper = (simpleCreds: string): Record<string, string> => {
  try {
    const creds = simpleCreds?.trim() || ""
    if (!creds) {
      return {}
    }

    if (creds.startsWith('{')) {
      return JSON.parse(creds)
    }

    if (creds.startsWith('Bearer ')) {
      return { token: creds.replace('Bearer ', '') }
    }

    if (creds.startsWith('Basic ')) {
      return { token: creds.replace('Basic ', '') }
    }

    return { token: creds }
  } catch (error) {
    return {}
  }
}

export const splitUrl = (url: string) => {
  if (!url) {
    return {
      urlHost: '',
      urlPath: ''
    }
  }

  // Find the position after the protocol (://)
  const protocolEnd = url.indexOf('://');
  // Find the first slash after the protocol
  const firstSlashAfterProtocol = url.indexOf('/', protocolEnd + 3);

  if (firstSlashAfterProtocol === -1) {
    // No path, entire URL is the host
    return {
      urlHost: url,
      urlPath: ''
    }
  }

  // Split at the first slash after protocol
  return {
    urlHost: url.substring(0, firstSlashAfterProtocol),
    urlPath: url.substring(firstSlashAfterProtocol)
  }
}

export function needsUIToTriggerDocFetch(newIntegration: Integration, oldIntegration: Integration | null): boolean {
  // If documentation was manually provided, no fetch needed.
  if (newIntegration.documentation && newIntegration.documentation.trim()) {
    return false;
  }

  // If it's a new integration with a doc URL, fetch is needed.
  if (!oldIntegration) {
    return true;
  }

  // If any of the relevant URLs have changed, fetch is needed.
  if (newIntegration.urlHost !== oldIntegration.urlHost ||
    newIntegration.urlPath !== oldIntegration.urlPath ||
    newIntegration.documentationUrl !== oldIntegration.documentationUrl) {
    return true;
  }

  return false;
}

export const deepMergePreferRight = (left: any, right: any): any => {
  if (Array.isArray(left) && Array.isArray(right)) return right;
  if (typeof left !== 'object' || left === null) return right ?? left;
  if (typeof right !== 'object' || right === null) return right ?? left;
  const result: Record<string, any> = { ...left };
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    result[key] = deepMergePreferRight(left[key], right[key]);
  }
  return result;
};

/**
 * Generate a UUID v4 with fallback for browsers that don't support crypto.randomUUID
 * Works in both secure and non-secure contexts
 */
export function generateUUID(): string {
  // Use native crypto.randomUUID if available (secure contexts only)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fall through to manual implementation
    }
  }

  // Fallback implementation using crypto.getRandomValues (available in more contexts)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    
    // Set the version to 4 (random)
    array[6] = (array[6] & 0x0f) | 0x40;
    // Set the variant to 1 (RFC4122)
    array[8] = (array[8] & 0x3f) | 0x80;

    return [...array].map((b, i) => {
      const hex = b.toString(16).padStart(2, '0');
      return (i === 4 || i === 6 || i === 8 || i === 10) ? `-${hex}` : hex;
    }).join('');
  }

  // Final fallback for environments without crypto (should be rare)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function createSuperglueClient(endpoint: string): SuperglueClient {
  return new SuperglueClient({
    endpoint,
    apiKey: tokenRegistry.getToken(),
  })
}