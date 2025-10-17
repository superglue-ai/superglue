import { Metrics, WorkflowAttempt, WorkflowFailureReason, WorkflowMetrics } from "./types.js";


export function calculateMetrics(workflowAttempts: WorkflowAttempt[]): Metrics {
    const groupedByWorkflowId = groupByWorkflowId(workflowAttempts);
    const workflowMetrics = determineWorkflowMetrics(groupedByWorkflowId);
    const { strictValidationFailureRate, buildFailureRate, executionFailureRate } = calculateWorkflowFailureRates(workflowMetrics);

    return {
        totalAttempts: workflowAttempts.length,
        totalSuccessfulAttempts: calculateSuccessfulAttempts(workflowAttempts),
        totalFailedAttempts: calculateFailedAttempts(workflowAttempts),
        overallAverageBuildTimeMs: calculateAverageBuildTime(workflowAttempts),
        overallAverageExecutionTimeMs: calculateAverageExecutionTime(workflowAttempts),
        overallSuccessRate: calculateOverallSuccessRate(workflowAttempts),
        overallSelfHealingSuccessRate: calculateSelfHealingSuccessRate(workflowAttempts),
        overallOneShotSuccessRate: calculateOneShotSuccessRate(workflowAttempts),
        workflowSuccessRate: calculateWorkflowSuccessRate(groupedByWorkflowId),
        workflowStrictValidationFailureRate: strictValidationFailureRate,
        workflowBuildFailureRate: buildFailureRate,
        workflowExecutionFailureRate: executionFailureRate,
        workflowMetrics: workflowMetrics,
    };
}

function calculateSuccessfulAttempts(workflowAttempts: WorkflowAttempt[]): number {
    return workflowAttempts.filter(attempt => attempt.executionSuccess).length;
}

function calculateFailedAttempts(workflowAttempts: WorkflowAttempt[]): number {
    return workflowAttempts.filter(attempt => !attempt.executionSuccess).length;
}

function calculateAverageBuildTime(workflowAttempts: WorkflowAttempt[]): number {
    return workflowAttempts.reduce((acc, attempt) => acc + attempt.buildTime, 0) / workflowAttempts.length;
}

function calculateAverageExecutionTime(workflowAttempts: WorkflowAttempt[]): number {
    return workflowAttempts.reduce((acc, attempt) => acc + attempt.executionTime, 0) / workflowAttempts.length;
}

function calculateOverallSuccessRate(workflowAttempts: WorkflowAttempt[]): number {
    return workflowAttempts.filter(attempt => attempt.executionSuccess).length / workflowAttempts.length;
}

function calculateSelfHealingSuccessRate(workflowAttempts: WorkflowAttempt[]): number {
    const selfHealingAttempts = workflowAttempts.filter(attempt => attempt.selfHealingEnabled);
    if (selfHealingAttempts.length === 0) return NaN;

    const successfulSelfhealingAttempts = selfHealingAttempts.filter(attempt => attempt.executionSuccess).length;
    return successfulSelfhealingAttempts / selfHealingAttempts.length;
}

function calculateOneShotSuccessRate(workflowAttempts: WorkflowAttempt[]): number {
    const oneShotAttempts = workflowAttempts.filter(attempt => !attempt.selfHealingEnabled);
    if (oneShotAttempts.length === 0) return NaN;

    const successfulOneShotAttempts = oneShotAttempts.filter(attempt => attempt.executionSuccess).length;
    return successfulOneShotAttempts / oneShotAttempts.length;
}

// WORKFLOW METRICS
function calculateWorkflowSuccessRate(workflowAttemptsById: Record<string, WorkflowAttempt[]>): number {
    let successfulWorkflowCount = 0;
    Object.values(workflowAttemptsById).forEach((workflowAttempts) => {
        const successfulAttempts = workflowAttempts.filter(attempt => attempt.executionSuccess).length;
        if (successfulAttempts > 0) {
            successfulWorkflowCount++;
        }
    });

    return successfulWorkflowCount / Object.keys(workflowAttemptsById).length;
}

function determineWorkflowMetrics(workflowAttemptsByWorkflowId: Record<string, WorkflowAttempt[]>): WorkflowMetrics[] {
    return Object.values(workflowAttemptsByWorkflowId).map(workflowAttempts => ({
        workflowConfig: workflowAttempts[0].workflowConfig,
        totalAttempts: workflowAttempts.length,
        totalSuccessfulAttempts: calculateSuccessfulAttempts(workflowAttempts),
        totalFailedAttempts: calculateFailedAttempts(workflowAttempts),
        selfHealingSuccessRate: calculateSelfHealingSuccessRate(workflowAttempts),
        oneShotSuccessRate: calculateOneShotSuccessRate(workflowAttempts),
        latestFailureReason: findNewestFailureReason(workflowAttempts),
    }));
}

function calculateWorkflowFailureRates(workflowMetrics: WorkflowMetrics[]): {
    strictValidationFailureRate: number;
    buildFailureRate: number;
    executionFailureRate: number;
} {
    let totalFailedWorkflows = 0;
    let strictValidationFailures = 0;
    let buildFailures = 0;
    let executionFailures = 0;

    workflowMetrics.forEach(metric => {
        if (metric.totalFailedAttempts <= 0) {
            return;
        }

        totalFailedWorkflows++;
        if (metric.latestFailureReason === WorkflowFailureReason.STRICT_VALIDATION) strictValidationFailures++;
        if (metric.latestFailureReason === WorkflowFailureReason.BUILD) buildFailures++;
        if (metric.latestFailureReason === WorkflowFailureReason.EXECUTION) executionFailures++;
    });

    return {
        strictValidationFailureRate: strictValidationFailures / totalFailedWorkflows,
        buildFailureRate: buildFailures / totalFailedWorkflows,
        executionFailureRate: executionFailures / totalFailedWorkflows,
    };
}

function findNewestFailureReason(workflowAttempts: WorkflowAttempt[]): WorkflowFailureReason | undefined {
    const failedAttempts = workflowAttempts
        .filter(attempt => !attempt.executionSuccess)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return failedAttempts[0]?.failureReason;
}

function groupByWorkflowId(workflowAttempts: WorkflowAttempt[]): Record<string, WorkflowAttempt[]> {
    const grouped: Record<string, WorkflowAttempt[]> = {};
    workflowAttempts.forEach(attempt => {
        const id = attempt.workflowConfig.id;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(attempt);
    });

    return grouped;
}
