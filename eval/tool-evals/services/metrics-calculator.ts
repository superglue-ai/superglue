import { Metrics, ToolAttempt, ToolMetrics, ToolFailureReason, FailureCountsByReason } from "../types.js";

export class MetricsCalculator {
    public calculateMetrics(toolAttempts: ToolAttempt[]): Metrics {
        const groupedByToolId = this.groupByToolId(toolAttempts);
        const toolMetrics = this.determineToolMetrics(groupedByToolId);

        const toolCount = toolMetrics.length;

        const oneShotSuccessfulTools = toolMetrics.filter(t => t.hadOneShotSuccess).length;
        const hasSuccessfulToolsWithSelfHealing = toolMetrics.filter(t => t.hadSelfHealingSuccess || t.hadOneShotSuccess).length;

        const toolOneShotSuccessRate = toolCount === 0 
            ? null 
            : oneShotSuccessfulTools / toolCount;

        const toolSelfHealingSuccessRate = toolCount === 0 
            ? null 
            : hasSuccessfulToolsWithSelfHealing / toolCount;

        return {
            toolCount,
            toolSelfHealingSuccessRate,
            toolOneShotSuccessRate,
            overallAverageBuildTimeMs: this.calculateAverageBuildTime(toolAttempts),
            overallAverageExecutionTimeMs: this.calculateAverageExecutionTime(toolAttempts),
            oneShotAverageExecutionTimeMs: this.calculateOneShotAverageExecutionTime(toolAttempts),
            selfHealingAverageExecutionTimeMs: this.calculateSelfHealingAverageExecutionTime(toolAttempts),
            toolMetrics: toolMetrics,
        };
    }

    private calculateAverageBuildTime(toolAttempts: ToolAttempt[]): number {
        const validTimes = toolAttempts
            .map(a => a.buildTime)
            .filter((t): t is number => t !== null);
        if (validTimes.length === 0) return 0;
        return validTimes.reduce((acc, t) => acc + t, 0) / validTimes.length;
    }

    private calculateAverageExecutionTime(toolAttempts: ToolAttempt[]): number {
        const validTimes = toolAttempts
            .map(a => a.executionTime)
            .filter((t): t is number => t !== null);
        if (validTimes.length === 0) return 0;
        return validTimes.reduce((acc, t) => acc + t, 0) / validTimes.length;
    }

    private calculateOneShotAverageExecutionTime(toolAttempts: ToolAttempt[]): number | null {
        const validTimes = toolAttempts
            .filter(a => !a.selfHealingEnabled)
            .map(a => a.executionTime)
            .filter((t): t is number => t !== null);
        if (validTimes.length === 0) return null;
        return validTimes.reduce((acc, t) => acc + t, 0) / validTimes.length;
    }

    private calculateSelfHealingAverageExecutionTime(toolAttempts: ToolAttempt[]): number | null {
        const validTimes = toolAttempts
            .filter(a => a.selfHealingEnabled)
            .map(a => a.executionTime)
            .filter((t): t is number => t !== null);
        if (validTimes.length === 0) return null;
        return validTimes.reduce((acc, t) => acc + t, 0) / validTimes.length;
    }

    private determineToolMetrics(toolAttemptsByToolId: Record<string, ToolAttempt[]>): ToolMetrics[] {
        return Object.values(toolAttemptsByToolId).map(toolAttempts => {
            const hasOneShotAttempts = toolAttempts.some(a => !a.selfHealingEnabled);
            const hasSelfHealingAttempts = toolAttempts.some(a => a.selfHealingEnabled);
            const hadOneShotSuccess = toolAttempts.some(a => !a.selfHealingEnabled && a.executionSuccess);
            const hadSelfHealingSuccess = toolAttempts.some(a => a.selfHealingEnabled && a.executionSuccess);
            const totalSuccessfulAttempts = toolAttempts.filter(a => a.executionSuccess).length;
            const totalFailedAttempts = toolAttempts.filter(a => !a.executionSuccess).length;

            const initCounts: FailureCountsByReason = {
                [ToolFailureReason.BUILD]: 0,
                [ToolFailureReason.EXECUTION]: 0,
            };
            const oneShotFailuresByReason: FailureCountsByReason = { ...initCounts };
            const selfHealingFailuresByReason: FailureCountsByReason = { ...initCounts };

            for (const attempt of toolAttempts) {
                if (!attempt.failureReason) continue;
                if (attempt.selfHealingEnabled) {
                    selfHealingFailuresByReason[attempt.failureReason]++;
                } else {
                    oneShotFailuresByReason[attempt.failureReason]++;
                }
            }

            const toolId = toolAttempts[0].toolConfig.id;
            const toolName = toolAttempts[0].toolConfig.name;

            const oneShotAttempts = toolAttempts.filter(a => !a.selfHealingEnabled);
            const selfHealingAttempts = toolAttempts.filter(a => a.selfHealingEnabled);

            const validBuildTimes = toolAttempts
                .map(a => a.buildTime)
                .filter((t): t is number => t !== null);
            const averageBuildTimeMs = validBuildTimes.length > 0
                ? validBuildTimes.reduce((acc, t) => acc + t, 0) / validBuildTimes.length
                : null;
            
            const validOneShotExecTimes = oneShotAttempts
                .map(a => a.executionTime)
                .filter((t): t is number => t !== null);
            const oneShotAverageExecutionTimeMs = validOneShotExecTimes.length > 0
                ? validOneShotExecTimes.reduce((acc, t) => acc + t, 0) / validOneShotExecTimes.length
                : null;
            
            const validSelfHealingExecTimes = selfHealingAttempts
                .map(a => a.executionTime)
                .filter((t): t is number => t !== null);
            const selfHealingAverageExecutionTimeMs = validSelfHealingExecTimes.length > 0
                ? validSelfHealingExecTimes.reduce((acc, t) => acc + t, 0) / validSelfHealingExecTimes.length
                : null;

            return {
                toolId,
                toolName,
                totalAttempts: toolAttempts.length,
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

    private groupByToolId(toolAttempts: ToolAttempt[]): Record<string, ToolAttempt[]> {
        const grouped: Record<string, ToolAttempt[]> = {};
        toolAttempts.forEach(attempt => {
            const id = attempt.toolConfig.id;
            if (!grouped[id]) grouped[id] = [];
            grouped[id].push(attempt);
        });

        return grouped;
    }
}