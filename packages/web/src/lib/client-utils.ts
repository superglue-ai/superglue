import { Integration, SelfHealingMode, SuperglueClient, Workflow } from "@superglue/client";

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

export interface WorkflowExecutionState {
  originalWorkflow: Workflow;
  currentWorkflow: Workflow;
  stepResults: Record<string, StepExecutionResult>;
  completedSteps: string[];
  failedSteps: string[];
  isExecuting: boolean;
  currentStepIndex: number;
  interrupted?: boolean;
}

export function createSingleStepWorkflow(
  workflow: Workflow,
  stepIndex: number,
  previousResults: Record<string, any> = {}
): Workflow {
  if (stepIndex < 0 || stepIndex >= workflow.steps.length) {
    throw new Error(`Invalid step index: ${stepIndex}`);
  }

  const step = workflow.steps[stepIndex];

  const singleStepWorkflow: any = {
    id: `${workflow.id}_step_${stepIndex}`,
    steps: [step],
    finalTransform: '(sourceData) => sourceData'
  };

  return singleStepWorkflow;
}

export async function executeSingleStep(
  client: SuperglueClient,
  workflow: Workflow,
  stepIndex: number,
  payload: any,
  previousResults: Record<string, any> = {},
  selfHealing: boolean = true
): Promise<StepExecutionResult> {
  const step = workflow.steps[stepIndex];

  try {
    const singleStepWorkflow = createSingleStepWorkflow(workflow, stepIndex, previousResults);

    const executionPayload = {
      ...payload,
      ...Object.keys(previousResults).reduce((acc, stepId) => ({
        ...acc,
        [`${stepId}`]: previousResults[stepId]
      }), {})
    };

    const result = await client.executeWorkflow({
      workflow: singleStepWorkflow,
      payload: executionPayload,
      options: {
        testMode: false,
        selfHealing: selfHealing ? SelfHealingMode.ENABLED : SelfHealingMode.DISABLED
      }
    });

    const stepResult: any = Array.isArray(result.stepResults)
      ? result.stepResults[0]
      : result.stepResults?.[step.id];

    return {
      stepId: step.id,
      success: result.success,
      data: stepResult?.data || stepResult?.transformedData || stepResult || result.data,
      error: result.error,
      // If self-healing modified the step, capture the updated configuration
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

export async function executeWorkflowStepByStep(
  client: SuperglueClient,
  workflow: Workflow,
  payload: any,
  onStepComplete?: (stepIndex: number, result: StepExecutionResult) => void,
  selfHealing: boolean = true,
  shouldStop?: () => boolean
): Promise<WorkflowExecutionState> {
  const state: WorkflowExecutionState = {
    originalWorkflow: workflow,
    currentWorkflow: { ...workflow },
    stepResults: {},
    completedSteps: [],
    failedSteps: [],
    isExecuting: true,
    currentStepIndex: 0,
    interrupted: false
  };

  const previousResults: Record<string, any> = {};

  for (let i = 0; i < workflow.steps.length; i++) {
    if (shouldStop && shouldStop()) {
      state.isExecuting = false;
      state.interrupted = true;
      return state;
    }

    state.currentStepIndex = i;
    const step = workflow.steps[i];

    const result = await executeSingleStep(
      client,
      state.currentWorkflow,
      i,
      payload,
      previousResults,
      selfHealing
    );

    state.stepResults[step.id] = result;

    if (result.success) {
      state.completedSteps.push(step.id);
      previousResults[step.id] = result.data;

      // Update the workflow if self-healing modified the step
      if (result.updatedStep) {
        state.currentWorkflow = {
          ...state.currentWorkflow,
          steps: state.currentWorkflow.steps.map((s, idx) =>
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

  if (workflow.finalTransform && state.failedSteps.length === 0) {
    // Final guard before executing transform
    if (shouldStop && shouldStop()) {
      state.isExecuting = false;
      state.interrupted = true;
      return state;
    }
    const finalResult = await executeFinalTransform(
      client,
      workflow.id || 'workflow',
      state.currentWorkflow.finalTransform || workflow.finalTransform,
      workflow.responseSchema,
      workflow.inputSchema,
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
        state.currentWorkflow = {
          ...state.currentWorkflow,
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
  workflowId: string,
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
        id: `${workflowId}_final_transform`,
        steps: [],
        finalTransform,
        // Only include responseSchema if it's actually defined (not null/undefined)
        ...(responseSchema ? { responseSchema } : {}),
        inputSchema: inputSchema || { type: 'object' }
      },
      payload: finalPayload,
      options: {
        testMode: !!responseSchema,  // Always use test mode if responseSchema is provided
        selfHealing: selfHealing ? SelfHealingMode.ENABLED : SelfHealingMode.DISABLED
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
  workflow: Workflow,
  stepResults?: Record<string, any>
): boolean {
  if (stepIndex === 0) {
    return true;
  }

  // Check that all previous steps are completed and have results
  for (let i = 0; i < stepIndex; i++) {
    const stepId = workflow.steps[i].id;
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