import { SelfHealingMode, SuperglueClient, Workflow } from '@superglue/client';

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

/**
 * Creates a single-step workflow from a multi-step workflow
 * @param workflow The original workflow
 * @param stepIndex The index of the step to extract
 * @param previousResults Results from previous step executions
 * @returns A single-step workflow
 */
export function createSingleStepWorkflow(
    workflow: Workflow,
    stepIndex: number,
    previousResults: Record<string, any> = {}
): Workflow {
    if (stepIndex < 0 || stepIndex >= workflow.steps.length) {
        throw new Error(`Invalid step index: ${stepIndex}`);
    }

    const step = workflow.steps[stepIndex];

    // Build the accumulated payload from previous results
    const accumulatedPayload = Object.keys(previousResults).reduce((acc, stepId) => {
        return {
            ...acc,
            [`step_${stepId}_result`]: previousResults[stepId]
        };
    }, {});

    return {
        ...workflow,
        id: `${workflow.id}_step_${stepIndex}`,
        steps: [step],
        // For intermediate steps, we don't apply the final transform
        finalTransform: stepIndex === workflow.steps.length - 1 ? workflow.finalTransform : '(data) => data',
        // Pass accumulated results as part of the workflow context
        inputSchema: {
            type: 'object',
            properties: {
                ...accumulatedPayload
            }
        }
    };
}

/**
 * Executes a single workflow step
 * @param client SuperglueClient instance
 * @param workflow The original workflow
 * @param stepIndex The step index to execute
 * @param payload The initial payload
 * @param previousResults Results from previous steps
 * @param selfHealing Whether to enable self-healing
 * @returns The execution result
 */
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
                [`step_${stepId}_result`]: previousResults[stepId]
            }), {})
        };

        // Execute the single-step workflow
        const result = await client.executeWorkflow({
            workflow: singleStepWorkflow,
            payload: executionPayload,
            options: {
                testMode: true,
                selfHealing: selfHealing ? SelfHealingMode.ENABLED : SelfHealingMode.DISABLED
            }
        });

        // Extract the step result
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

/**
 * Executes all workflow steps sequentially
 * @param client SuperglueClient instance
 * @param workflow The workflow to execute
 * @param payload The initial payload
 * @param onStepComplete Callback for each step completion
 * @param selfHealing Whether to enable self-healing
 * @returns The final execution state
 */
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
                    testMode: true,
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

/**
 * Reconstructs the full workflow from individual step executions
 * @param originalWorkflow The original workflow
 * @param stepResults The results from step executions
 * @returns The reconstructed workflow with any self-healing updates
 */
export function reconstructWorkflow(
    originalWorkflow: Workflow,
    executionState: WorkflowExecutionState
): Workflow {
    return executionState.currentWorkflow;
}

/**
 * Checks if a step can be executed based on previous step results
 * @param stepIndex The step index to check
 * @param completedSteps Array of completed step IDs
 * @param workflow The workflow
 * @returns Whether the step can be executed
 */
export function canExecuteStep(
    stepIndex: number,
    completedSteps: string[],
    workflow: Workflow
): boolean {
    if (stepIndex === 0) {
        return true;
    }

    // Check if all previous steps have been completed
    for (let i = 0; i < stepIndex; i++) {
        if (!completedSteps.includes(workflow.steps[i].id)) {
            return false;
        }
    }

    return true;
}
