import { Metrics, ToolMetrics, MetricsComparisonResult, MetricsComparison, ToolMetricsComparisonResult, ToolFailureReason } from "../types.js";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

export class MetricsComparer {
    constructor(private baseDir: string) {}

    public compare(current: Metrics): MetricsComparisonResult {
        const lastRunMetrics = this.loadLastRunMetrics();
        const benchmarkMetrics = this.loadBenchmarkMetrics();

        return {
            lastRun: this.compareMetrics(current, lastRunMetrics),
            benchmark: this.compareMetrics(current, benchmarkMetrics),
        };
    }

    private compareMetrics(current: Metrics, previous?: Metrics): MetricsComparison {
        if (!previous) {
            return this.emptyComparison(current);
        }

        const prevById = new Map(previous.toolMetrics.map(m => [m.toolId, m]));

        const shDiff = (current.toolSelfHealingSuccessRate ?? 0) - (previous.toolSelfHealingSuccessRate ?? 0);
        const osDiff = (current.toolOneShotSuccessRate ?? 0) - (previous.toolOneShotSuccessRate ?? 0);

        return {
            toolSelfHealingSuccessRateDifference: shDiff,
            toolOneShotSuccessRateDifference: osDiff,
            overallAverageBuildTimeMsDifference: current.overallAverageBuildTimeMs - previous.overallAverageBuildTimeMs,
            overallAverageExecutionTimeMsDifference: current.overallAverageExecutionTimeMs - previous.overallAverageExecutionTimeMs,
            oneShotAverageExecutionTimeMsDifference: (current.oneShotAverageExecutionTimeMs ?? 0) - (previous.oneShotAverageExecutionTimeMs ?? 0),
            selfHealingAverageExecutionTimeMsDifference: (current.selfHealingAverageExecutionTimeMs ?? 0) - (previous.selfHealingAverageExecutionTimeMs ?? 0),
            toolMetrics: current.toolMetrics.map(t => this.compareToolMetrics(t, prevById.get(t.toolId))),
        };
    }

    private emptyComparison(current: Metrics): MetricsComparison {
        return {
            toolSelfHealingSuccessRateDifference: null,
            toolOneShotSuccessRateDifference: null,
            overallAverageBuildTimeMsDifference: null,
            overallAverageExecutionTimeMsDifference: null,
            oneShotAverageExecutionTimeMsDifference: null,
            selfHealingAverageExecutionTimeMsDifference: null,
            toolMetrics: current.toolMetrics.map(t => ({
                toolId: t.toolId,
                toolName: t.toolName,
                oneShotSuccessChange: 0,
                selfHealingSuccessChange: 0,
            })),
        };
    }

    private compareToolMetrics(current: ToolMetrics, previous?: ToolMetrics): ToolMetricsComparisonResult {
        if (!previous) {
            return {
                toolId: current.toolId,
                toolName: current.toolName,
                oneShotSuccessChange: 0,
                selfHealingSuccessChange: 0,
            };
        }

        const delta = (now: boolean, old: boolean): -1 | 0 | 1 => {
            if (now === old) return 0;
            return now ? 1 : -1;
        };

        return {
            toolId: current.toolId,
            toolName: current.toolName,
            oneShotSuccessChange: delta(current.hadOneShotSuccess, previous.hadOneShotSuccess),
            selfHealingSuccessChange: delta(current.hadSelfHealingSuccess, previous.hadSelfHealingSuccess),
        };
    }

    private loadLastRunMetrics(): Metrics | undefined {
        const resultsDir = join(this.baseDir, "data/results");
        if (!existsSync(resultsDir)) {
            return undefined;
        }

        const files = readdirSync(resultsDir)
            .filter(f => f.startsWith("agent-eval-") && f.endsWith(".csv"))
            .sort()
            .reverse();

        if (files.length === 0) {
            return undefined;
        }

        const lastRunFile = join(resultsDir, files[0]);
        return this.loadMetricsFromCsv(lastRunFile);
    }

    private loadBenchmarkMetrics(): Metrics | undefined {
        const benchmarkFile = join(this.baseDir, "data/benchmark", "agent-eval-benchmark.csv");
        if (!existsSync(benchmarkFile)) {
            return undefined;
        }

        return this.loadMetricsFromCsv(benchmarkFile);
    }

    private loadMetricsFromCsv(filepath: string): Metrics | undefined {
        try {
            const content = readFileSync(filepath, "utf-8");
            const lines = content.trim().split("\n");
            
            if (lines.length <= 1) {
                return undefined;
            }

            const toolMetricsMap = new Map<string, Partial<ToolMetrics>>();

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const parts = this.parseCsvLine(line);
                
                if (parts.length < 16) continue;

                const [
                    toolId, 
                    toolName, 
                    mode, 
                    totalAttempts,
                    totalSuccessfulAttempts,
                    totalFailedAttempts,
                    hasOneShotAttempts,
                    hasSelfHealingAttempts,
                    hadOneShotSuccess,
                    hadSelfHealingSuccess,
                    success, 
                    avgBuildTime, 
                    avgExecTime, 
                    failBuild, 
                    failExec, 
                    failStrict
                ] = parts;
                
                if (!toolMetricsMap.has(toolId)) {
                    toolMetricsMap.set(toolId, {
                        toolId,
                        toolName,
                        totalAttempts: parseInt(totalAttempts) || 0,
                        totalSuccessfulAttempts: parseInt(totalSuccessfulAttempts) || 0,
                        totalFailedAttempts: parseInt(totalFailedAttempts) || 0,
                        hasOneShotAttempts: hasOneShotAttempts === "true",
                        hasSelfHealingAttempts: hasSelfHealingAttempts === "true",
                        hadOneShotSuccess: hadOneShotSuccess === "true",
                        hadSelfHealingSuccess: hadSelfHealingSuccess === "true",
                        oneShotFailuresByReason: {
                            [ToolFailureReason.BUILD]: 0,
                            [ToolFailureReason.EXECUTION]: 0,
                            [ToolFailureReason.STRICT_VALIDATION]: 0,
                        },
                        selfHealingFailuresByReason: {
                            [ToolFailureReason.BUILD]: 0,
                            [ToolFailureReason.EXECUTION]: 0,
                            [ToolFailureReason.STRICT_VALIDATION]: 0,
                        },
                        averageBuildTimeMs: avgBuildTime ? parseFloat(avgBuildTime) : null,
                        oneShotAverageExecutionTimeMs: null,
                        selfHealingAverageExecutionTimeMs: null,
                    });
                }

                const tm = toolMetricsMap.get(toolId)!;

                if (mode === "one-shot") {
                    tm.oneShotAverageExecutionTimeMs = avgExecTime ? parseFloat(avgExecTime) : null;
                    tm.oneShotFailuresByReason = {
                        [ToolFailureReason.BUILD]: parseInt(failBuild) || 0,
                        [ToolFailureReason.EXECUTION]: parseInt(failExec) || 0,
                        [ToolFailureReason.STRICT_VALIDATION]: parseInt(failStrict) || 0,
                    };
                } else if (mode === "self-healing") {
                    tm.selfHealingAverageExecutionTimeMs = avgExecTime ? parseFloat(avgExecTime) : null;
                    tm.selfHealingFailuresByReason = {
                        [ToolFailureReason.BUILD]: parseInt(failBuild) || 0,
                        [ToolFailureReason.EXECUTION]: parseInt(failExec) || 0,
                        [ToolFailureReason.STRICT_VALIDATION]: parseInt(failStrict) || 0,
                    };
                }
            }

            const toolMetrics = Array.from(toolMetricsMap.values()) as ToolMetrics[];
            
            const toolCount = toolMetrics.length;
            const oneShotSuccessful = toolMetrics.filter(t => t.hadOneShotSuccess).length;
            const selfHealingSuccessful = toolMetrics.filter(t => t.hadSelfHealingSuccess || t.hadOneShotSuccess).length;

            const allBuildTimes = toolMetrics.map(t => t.averageBuildTimeMs).filter((t): t is number => t !== null);
            const allOneShotExecTimes = toolMetrics.map(t => t.oneShotAverageExecutionTimeMs).filter((t): t is number => t !== null);
            const allSelfHealingExecTimes = toolMetrics.map(t => t.selfHealingAverageExecutionTimeMs).filter((t): t is number => t !== null);

            const allExecTimes = [...allOneShotExecTimes, ...allSelfHealingExecTimes];

            return {
                toolCount,
                toolOneShotSuccessRate: toolCount === 0 ? null : oneShotSuccessful / toolCount,
                toolSelfHealingSuccessRate: toolCount === 0 ? null : selfHealingSuccessful / toolCount,
                overallAverageBuildTimeMs: allBuildTimes.length > 0 ? allBuildTimes.reduce((a, b) => a + b, 0) / allBuildTimes.length : 0,
                overallAverageExecutionTimeMs: allExecTimes.length > 0 ? allExecTimes.reduce((a, b) => a + b, 0) / allExecTimes.length : 0,
                oneShotAverageExecutionTimeMs: allOneShotExecTimes.length > 0 ? allOneShotExecTimes.reduce((a, b) => a + b, 0) / allOneShotExecTimes.length : null,
                selfHealingAverageExecutionTimeMs: allSelfHealingExecTimes.length > 0 ? allSelfHealingExecTimes.reduce((a, b) => a + b, 0) / allSelfHealingExecTimes.length : null,
                toolMetrics,
            };
        } catch (error) {
            console.error(`Failed to load metrics from ${filepath}:`, error);
            return undefined;
        }
    }

    private parseCsvLine(line: string): string[] {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = "";
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }
}
