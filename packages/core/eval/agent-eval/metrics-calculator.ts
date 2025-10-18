import { Metrics, WorkflowAttempt, WorkflowMetrics, WorkflowFailureReason, FailureCountsByReason } from "./types.js";

export class MetricsCalculator {
    public calculateMetrics(workflowAttempts: WorkflowAttempt[]): Metrics {
        const groupedByWorkflowId = this.groupByWorkflowId(workflowAttempts);
        const workflowMetrics = this.determineWorkflowMetrics(groupedByWorkflowId);

        const workflowCount = workflowMetrics.length;
        const successfulWorkflowCount = workflowMetrics.filter(w => w.hadAnySuccess).length;

        const workflowsWithSH = workflowMetrics.filter(w => w.hasSelfHealingAttempts).length;
        const workflowsWithOS = workflowMetrics.filter(w => w.hasOneShotAttempts).length;

        const workflowSelfHealingSuccessRate = workflowsWithSH === 0
            ? null
            : workflowMetrics.filter(w => w.hadSelfHealingSuccess).length / workflowsWithSH;

        const workflowOneShotSuccessRate = workflowsWithOS === 0
            ? null
            : workflowMetrics.filter(w => w.hadOneShotSuccess).length / workflowsWithOS;

        return {
            workflowCount,
            successfulWorkflowCount,
            workflowSuccessRate: workflowCount === 0 ? Number.NaN : successfulWorkflowCount / workflowCount,
            workflowSelfHealingSuccessRate,
            workflowOneShotSuccessRate,
            overallAverageBuildTimeMs: this.calculateAverageBuildTime(workflowAttempts),
            overallAverageExecutionTimeMs: this.calculateAverageExecutionTime(workflowAttempts),
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

    private determineWorkflowMetrics(workflowAttemptsByWorkflowId: Record<string, WorkflowAttempt[]>): WorkflowMetrics[] {
        return Object.values(workflowAttemptsByWorkflowId).map(workflowAttempts => {
            const hasOneShotAttempts = workflowAttempts.some(a => !a.selfHealingEnabled);
            const hasSelfHealingAttempts = workflowAttempts.some(a => a.selfHealingEnabled);
            const hadOneShotSuccess = workflowAttempts.some(a => !a.selfHealingEnabled && a.executionSuccess);
            const hadSelfHealingSuccess = workflowAttempts.some(a => a.selfHealingEnabled && a.executionSuccess);
            const hadAnySuccess = hadOneShotSuccess || hadSelfHealingSuccess;

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

            return {
                workflowId,
                workflowName,
                totalAttempts: workflowAttempts.length,
                totalSuccessfulAttempts,
                totalFailedAttempts,
                hasOneShotAttempts,
                hasSelfHealingAttempts,
                hadAnySuccess,
                hadOneShotSuccess,
                hadSelfHealingSuccess,
                oneShotFailuresByReason,
                selfHealingFailuresByReason,
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