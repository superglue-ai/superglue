import { Metrics, WorkflowAttempt, WorkflowFailureReason, WorkflowMetrics } from "./types.js";


export class MetricsCalculatorService {
    public calculateMetrics(workflowAttempts: WorkflowAttempt[]): Metrics {
        const groupedByWorkflowId = this.groupByWorkflowId(workflowAttempts);
        const workflowMetrics = this.determineWorkflowMetrics(groupedByWorkflowId);
        const { strictValidationFailureRate, buildFailureRate, executionFailureRate } = this.calculateWorkflowFailureRates(workflowMetrics);

        return {
            totalAttempts: workflowAttempts.length,
            totalSuccessfulAttempts: this.calculateSuccessfulAttempts(workflowAttempts),
            totalFailedAttempts: this.calculateFailedAttempts(workflowAttempts),
            overallAverageBuildTimeMs: this.calculateAverageBuildTime(workflowAttempts),
            overallAverageExecutionTimeMs: this.calculateAverageExecutionTime(workflowAttempts),
            overallSuccessRate: this.calculateOverallSuccessRate(workflowAttempts),
            overallSelfHealingSuccessRate: this.calculateSelfHealingSuccessRate(workflowAttempts),
            overallOneShotSuccessRate: this.calculateOneShotSuccessRate(workflowAttempts),
            workflowSuccessRate: this.calculateWorkflowSuccessRate(groupedByWorkflowId),
            workflowStrictValidationFailureRate: strictValidationFailureRate,
            workflowBuildFailureRate: buildFailureRate,
            workflowExecutionFailureRate: executionFailureRate,
            workflowMetrics: workflowMetrics,
        };
    }

    private calculateSuccessfulAttempts(workflowAttempts: WorkflowAttempt[]): number {
        return workflowAttempts.filter(attempt => attempt.executionSuccess).length;
    }

    private calculateFailedAttempts(workflowAttempts: WorkflowAttempt[]): number {
        return workflowAttempts.filter(attempt => !attempt.executionSuccess).length;
    }

    private calculateAverageBuildTime(workflowAttempts: WorkflowAttempt[]): number {
        return workflowAttempts.reduce((acc, attempt) => acc + attempt.buildTime, 0) / workflowAttempts.length;
    }

    private calculateAverageExecutionTime(workflowAttempts: WorkflowAttempt[]): number {
        return workflowAttempts.reduce((acc, attempt) => acc + attempt.executionTime, 0) / workflowAttempts.length;
    }

    private calculateOverallSuccessRate(workflowAttempts: WorkflowAttempt[]): number {
        return workflowAttempts.filter(attempt => attempt.executionSuccess).length / workflowAttempts.length;
    }

    private calculateSelfHealingSuccessRate(workflowAttempts: WorkflowAttempt[]): number {
        const selfHealingAttempts = workflowAttempts.filter(attempt => attempt.selfHealingEnabled);
        if (selfHealingAttempts.length === 0) return NaN;
        
        const successfulSelfhealingAttempts = selfHealingAttempts.filter(attempt => attempt.executionSuccess).length;
        return successfulSelfhealingAttempts / selfHealingAttempts.length;
    }

    private calculateOneShotSuccessRate(workflowAttempts: WorkflowAttempt[]): number {
        const oneShotAttempts = workflowAttempts.filter(attempt => !attempt.selfHealingEnabled);
        if (oneShotAttempts.length === 0) return NaN;
        
        const successfulOneShotAttempts = oneShotAttempts.filter(attempt => attempt.executionSuccess).length;
        return successfulOneShotAttempts / oneShotAttempts.length;
    }

    // WORKFLOW METRICS
    private calculateWorkflowSuccessRate(workflowAttemptsById: Record<string, WorkflowAttempt[]>): number {
        let successfulWorkflowCount = 0;
        Object.values(workflowAttemptsById).forEach((workflowAttempts) => {
            const successfulAttempts = workflowAttempts.filter(attempt => attempt.executionSuccess).length;
            if (successfulAttempts > 0) {
                successfulWorkflowCount++;
            }
        });

        return successfulWorkflowCount / Object.keys(workflowAttemptsById).length;
    }

    private determineWorkflowMetrics(workflowAttemptsByWorkflowId: Record<string, WorkflowAttempt[]>): WorkflowMetrics[] {
        return Object.values(workflowAttemptsByWorkflowId).map(workflowAttempts => ({
            workflowConfig: workflowAttempts[0].workflowConfig,
            totalAttempts: workflowAttempts.length,
            totalSuccessfulAttempts: this.calculateSuccessfulAttempts(workflowAttempts),
            totalFailedAttempts: this.calculateFailedAttempts(workflowAttempts),
            selfHealingSuccessRate: this.calculateSelfHealingSuccessRate(workflowAttempts),
            oneShotSuccessRate: this.calculateOneShotSuccessRate(workflowAttempts),
            latestFailureReason: this.findNewestFailureReason(workflowAttempts),
        }));
    }

    private calculateWorkflowFailureRates(workflowMetrics: WorkflowMetrics[]): {
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

    private findNewestFailureReason(workflowAttempts: WorkflowAttempt[]): WorkflowFailureReason | undefined {
        const failedAttempts = workflowAttempts
            .filter(attempt => !attempt.executionSuccess)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return failedAttempts[0]?.failureReason;
    }

    private groupByWorkflowId(workflowAttempts: WorkflowAttempt[]): Record<string, WorkflowAttempt[]> {
        const grouped: Record<string, WorkflowAttempt[]> = {};
        workflowAttempts.forEach(attempt => {
            const id = attempt.workflowConfig.id;
            if (!grouped[id]) grouped[id] = [];
            grouped[id].push(attempt);
        });

        return grouped;
    }
}