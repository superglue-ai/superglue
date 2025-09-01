import { Integration, SelfHealingMode, SuperglueClient, Workflow } from "@superglue/client";

export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  data?: any;
  error?: string;
  updatedStep?: any;
}

export interface WorkflowExecutionState {
  originalWorkflow: Workflow;
  currentWorkflow: Workflow;
  stepResults: Record<string, StepExecutionResult>;
  completedSteps: string[];
  failedSteps: string[];
  isExecuting: boolean;
  currentStepIndex: number;
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

  const accumulatedPayload = Object.keys(previousResults).reduce((acc, stepId) => {
    return {
      ...acc,
      [`${stepId}`]: previousResults[stepId]
    };
  }, {});

  return {
    ...workflow,
    id: `${workflow.id}_step_${stepIndex}`,
    steps: [step],
    finalTransform: '(sourceData) => sourceData',
    inputSchema: {
      type: 'object',
      properties: {
        ...accumulatedPayload
      }
    }
  };
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
    // Create a single-step workflow
    const singleStepWorkflow = createSingleStepWorkflow(workflow, stepIndex, previousResults);

    // Build the execution payload with accumulated results
    const executionPayload = {
      ...payload,
      ...Object.keys(previousResults).reduce((acc, stepId) => ({
        ...acc,
        [`${stepId}`]: previousResults[stepId]
      }), {})
    };

    // Execute the single-step workflow
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
  selfHealing: boolean = true
): Promise<WorkflowExecutionState> {
  const state: WorkflowExecutionState = {
    originalWorkflow: workflow,
    currentWorkflow: { ...workflow },
    stepResults: {},
    completedSteps: [],
    failedSteps: [],
    isExecuting: true,
    currentStepIndex: 0
  };

  const previousResults: Record<string, any> = {};

  for (let i = 0; i < workflow.steps.length; i++) {
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
  }

  // Execute final transformation if all steps succeeded
  if (workflow.finalTransform && state.failedSteps.length === 0) {
    try {
      const finalPayload = {
        ...payload,
        ...previousResults
      };

      const finalResult = await client.executeWorkflow({
        workflow: {
          ...state.currentWorkflow,
          steps: [],
          finalTransform: workflow.finalTransform
        },
        payload: finalPayload,
        options: {
          testMode: false,
          selfHealing: selfHealing ? SelfHealingMode.ENABLED : SelfHealingMode.DISABLED
        }
      });

      state.stepResults['__final_transform__'] = {
        stepId: '__final_transform__',
        success: finalResult.success,
        data: finalResult.data,
        error: finalResult.error
      };
    } catch (error: any) {
      state.stepResults['__final_transform__'] = {
        stepId: '__final_transform__',
        success: false,
        error: error.message
      };
    }
  }

  state.isExecuting = false;
  return state;
}

export function canExecuteStep(
  stepIndex: number,
  completedSteps: string[],
  workflow: Workflow
): boolean {
  if (stepIndex === 0) {
    return true;
  }

  for (let i = 0; i < stepIndex; i++) {
    if (!completedSteps.includes(workflow.steps[i].id)) {
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