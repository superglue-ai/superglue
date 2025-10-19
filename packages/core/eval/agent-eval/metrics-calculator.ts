import { Metrics, WorkflowAttempt, WorkflowMetrics, WorkflowFailureReason, FailureCountsByReason } from "./types.js";

export class MetricsCalculator {
    public calculateMetrics(workflowAttempts: WorkflowAttempt[]): Metrics {
        const groupedByWorkflowId = this.groupByWorkflowId(workflowAttempts);
        const workflowMetrics = this.determineWorkflowMetrics(groupedByWorkflowId);

        const workflowCount = workflowMetrics.length;

        const oneShotSuccessfulWorkflows = workflowMetrics.filter(w => w.hadOneShotSuccess).length;
        const hasSuccessfulWorkflowsWithSelfHealing = workflowMetrics.filter(w => w.hadSelfHealingSuccess || w.hadOneShotSuccess).length;

        const workflowOneShotSuccessRate = workflowCount === 0 
            ? null 
            : oneShotSuccessfulWorkflows / workflowCount;

        const workflowSelfHealingSuccessRate = workflowCount === 0 
            ? null 
            : hasSuccessfulWorkflowsWithSelfHealing / workflowCount;

        return {
            workflowCount,
            workflowSelfHealingSuccessRate,
            workflowOneShotSuccessRate,
            overallAverageBuildTimeMs: this.calculateAverageBuildTime(workflowAttempts),
            overallAverageExecutionTimeMs: this.calculateAverageExecutionTime(workflowAttempts),
            oneShotAverageExecutionTimeMs: this.calculateOneShotAverageExecutionTime(workflowAttempts),
            selfHealingAverageExecutionTimeMs: this.calculateSelfHealingAverageExecutionTime(workflowAttempts),
            workflowMetrics: workflowMetrics,
        };
    }

    private calculateAverageBuildTime(workflowAttempts: WorkflowAttempt[]): number {
        if (workflowAttempts.length === 0) return 0;
        return workflowAttempts.reduce((acc, attempt) => acc + attempt.buildTime, 0) / workflowAttempts.length;
    }

    private calculateAverageExecutionTime(workflowAttempts: WorkflowAttempt[]): number {
        if (workflowAttempts.length === 0) return 0;
        return workflowAttempts.reduce((acc, attempt) => acc + attempt.executionTime, 0) / workflowAttempts.length;
    }

    private calculateOneShotAverageExecutionTime(workflowAttempts: WorkflowAttempt[]): number | null {
        const oneShotAttempts = workflowAttempts.filter(a => !a.selfHealingEnabled);
        if (oneShotAttempts.length === 0) return null;
        return oneShotAttempts.reduce((acc, attempt) => acc + attempt.executionTime, 0) / oneShotAttempts.length;
    }

    private calculateSelfHealingAverageExecutionTime(workflowAttempts: WorkflowAttempt[]): number | null {
        const selfHealingAttempts = workflowAttempts.filter(a => a.selfHealingEnabled);
        if (selfHealingAttempts.length === 0) return null;
        return selfHealingAttempts.reduce((acc, attempt) => acc + attempt.executionTime, 0) / selfHealingAttempts.length;
    }

    private determineWorkflowMetrics(workflowAttemptsByWorkflowId: Record<string, WorkflowAttempt[]>): WorkflowMetrics[] {
        return Object.values(workflowAttemptsByWorkflowId).map(workflowAttempts => {
            const hasOneShotAttempts = workflowAttempts.some(a => !a.selfHealingEnabled);
            const hasSelfHealingAttempts = workflowAttempts.some(a => a.selfHealingEnabled);
            const hadOneShotSuccess = workflowAttempts.some(a => !a.selfHealingEnabled && a.executionSuccess);
            const hadSelfHealingSuccess = workflowAttempts.some(a => a.selfHealingEnabled && a.executionSuccess);
            const totalSuccessfulAttempts = workflowAttempts.filter(a => a.executionSuccess).length;
            const totalFailedAttempts = workflowAttempts.filter(a => !a.executionSuccess).length;

            const initCounts: FailureCountsByReason = {
                [WorkflowFailureReason.BUILD]: 0,
                [WorkflowFailureReason.EXECUTION]: 0,
                [WorkflowFailureReason.STRICT_VALIDATION]: 0,
            };
            const oneShotFailuresByReason: FailureCountsByReason = { ...initCounts };
            const selfHealingFailuresByReason: FailureCountsByReason = { ...initCounts };

            for (const attempt of workflowAttempts) {
                if (!attempt.failureReason) continue;
                if (attempt.selfHealingEnabled) {
                    selfHealingFailuresByReason[attempt.failureReason]++;
                } else {
                    oneShotFailuresByReason[attempt.failureReason]++;
                }
            }

            const workflowId = workflowAttempts[0].workflowConfig.id;
            const workflowName = workflowAttempts[0].workflowConfig.name;

            const oneShotAttempts = workflowAttempts.filter(a => !a.selfHealingEnabled);
            const selfHealingAttempts = workflowAttempts.filter(a => a.selfHealingEnabled);

            const averageBuildTimeMs = workflowAttempts.length > 0
                ? workflowAttempts.reduce((acc, a) => acc + a.buildTime, 0) / workflowAttempts.length
                : null;
            const oneShotAverageExecutionTimeMs = oneShotAttempts.length > 0
                ? oneShotAttempts.reduce((acc, a) => acc + a.executionTime, 0) / oneShotAttempts.length
                : null;
            const selfHealingAverageExecutionTimeMs = selfHealingAttempts.length > 0
                ? selfHealingAttempts.reduce((acc, a) => acc + a.executionTime, 0) / selfHealingAttempts.length
                : null;

            return {
                workflowId,
                workflowName,
                totalAttempts: workflowAttempts.length,
                totalSuccessfulAttempts,
                totalFailedAttempts,
                hasOneShotAttempts,
                hasSelfHealingAttempts,
                hadOneShotSuccess,
                hadSelfHealingSuccess,
                oneShotFailuresByReason,
                selfHealingFailuresByReason,
                averageBuildTimeMs,
                oneShotAverageExecutionTimeMs,
                selfHealingAverageExecutionTimeMs,
            };
        });
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