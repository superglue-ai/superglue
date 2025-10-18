import { Metrics, WorkflowMetrics, MetricsComparisonResult, WorkflowMetricsComparisonResult } from "./types.js";

export class MetricsComparer {
    public compare(current: Metrics, previous?: Metrics): MetricsComparisonResult {
        if (!previous) {
            return {
                workflowSuccessRateDifference: 0,
                workflowSelfHealingSuccessRateDifference: 0,
                workflowOneShotSuccessRateDifference: 0,
                overallAverageBuildTimeMsDifference: 0,
                overallAverageExecutionTimeMsDifference: 0,
                workflowMetrics: current.workflowMetrics.map(w => ({
                    workflowId: w.workflowId,
                    workflowName: w.workflowName,
                    oneShotSuccessChange: 0,
                    selfHealingSuccessChange: 0,
                })),
            };
        }

        const prevById = new Map(previous.workflowMetrics.map(m => [m.workflowId, m]));

        const shDiff = (current.workflowSelfHealingSuccessRate ?? 0) - (previous.workflowSelfHealingSuccessRate ?? 0);
        const osDiff = (current.workflowOneShotSuccessRate ?? 0) - (previous.workflowOneShotSuccessRate ?? 0);

        return {
            workflowSuccessRateDifference: current.workflowSuccessRate - previous.workflowSuccessRate,
            workflowSelfHealingSuccessRateDifference: shDiff,
            workflowOneShotSuccessRateDifference: osDiff,
            overallAverageBuildTimeMsDifference: current.overallAverageBuildTimeMs - previous.overallAverageBuildTimeMs,
            overallAverageExecutionTimeMsDifference: current.overallAverageExecutionTimeMs - previous.overallAverageExecutionTimeMs,
            workflowMetrics: current.workflowMetrics.map(w => this.compareWorkflowMetrics(w, prevById.get(w.workflowId))),
        };
    }

    private compareWorkflowMetrics(current: WorkflowMetrics, previous?: WorkflowMetrics): WorkflowMetricsComparisonResult {
        if (!previous) {
            return {
                workflowId: current.workflowId,
                workflowName: current.workflowName,
                oneShotSuccessChange: 0,
                selfHealingSuccessChange: 0,
            };
        }

        const delta = (now: boolean, old: boolean): -1 | 0 | 1 => {
            if (now === old) return 0;
            return now ? 1 : -1;
        };

        return {
            workflowId: current.workflowId,
            workflowName: current.workflowName,
            oneShotSuccessChange: delta(current.hadOneShotSuccess, previous.hadOneShotSuccess),
            selfHealingSuccessChange: delta(current.hadSelfHealingSuccess, previous.hadSelfHealingSuccess),
        };
    }
}
