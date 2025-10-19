import { Metrics, WorkflowMetrics, MetricsComparisonResult, MetricsComparison, WorkflowMetricsComparisonResult, WorkflowFailureReason } from "./types.js";
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

        const prevById = new Map(previous.workflowMetrics.map(m => [m.workflowId, m]));

        const shDiff = (current.workflowSelfHealingSuccessRate ?? 0) - (previous.workflowSelfHealingSuccessRate ?? 0);
        const osDiff = (current.workflowOneShotSuccessRate ?? 0) - (previous.workflowOneShotSuccessRate ?? 0);

        return {
            workflowSelfHealingSuccessRateDifference: shDiff,
            workflowOneShotSuccessRateDifference: osDiff,
            overallAverageBuildTimeMsDifference: current.overallAverageBuildTimeMs - previous.overallAverageBuildTimeMs,
            overallAverageExecutionTimeMsDifference: current.overallAverageExecutionTimeMs - previous.overallAverageExecutionTimeMs,
            oneShotAverageExecutionTimeMsDifference: (current.oneShotAverageExecutionTimeMs ?? 0) - (previous.oneShotAverageExecutionTimeMs ?? 0),
            selfHealingAverageExecutionTimeMsDifference: (current.selfHealingAverageExecutionTimeMs ?? 0) - (previous.selfHealingAverageExecutionTimeMs ?? 0),
            workflowMetrics: current.workflowMetrics.map(w => this.compareWorkflowMetrics(w, prevById.get(w.workflowId))),
        };
    }

    private emptyComparison(current: Metrics): MetricsComparison {
        return {
            workflowSelfHealingSuccessRateDifference: null,
            workflowOneShotSuccessRateDifference: null,
            overallAverageBuildTimeMsDifference: null,
            overallAverageExecutionTimeMsDifference: null,
            oneShotAverageExecutionTimeMsDifference: null,
            selfHealingAverageExecutionTimeMsDifference: null,
            workflowMetrics: current.workflowMetrics.map(w => ({
                workflowId: w.workflowId,
                workflowName: w.workflowName,
                oneShotSuccessChange: 0,
                selfHealingSuccessChange: 0,
            })),
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

    private loadLastRunMetrics(): Metrics | undefined {
        const resultsDir = join(this.baseDir, "results");
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
        const benchmarkFile = join(this.baseDir, "benchmark", "agent-eval-benchmark.csv");
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

            const workflowMetricsMap = new Map<string, Partial<WorkflowMetrics>>();

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const parts = this.parseCsvLine(line);
                
                if (parts.length < 16) continue;

                const [
                    workflowId, 
                    workflowName, 
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
                
                if (!workflowMetricsMap.has(workflowId)) {
                    workflowMetricsMap.set(workflowId, {
                        workflowId,
                        workflowName,
                        totalAttempts: parseInt(totalAttempts) || 0,
                        totalSuccessfulAttempts: parseInt(totalSuccessfulAttempts) || 0,
                        totalFailedAttempts: parseInt(totalFailedAttempts) || 0,
                        hasOneShotAttempts: hasOneShotAttempts === "true",
                        hasSelfHealingAttempts: hasSelfHealingAttempts === "true",
                        hadOneShotSuccess: hadOneShotSuccess === "true",
                        hadSelfHealingSuccess: hadSelfHealingSuccess === "true",
                        oneShotFailuresByReason: {
                            [WorkflowFailureReason.BUILD]: 0,
                            [WorkflowFailureReason.EXECUTION]: 0,
                            [WorkflowFailureReason.STRICT_VALIDATION]: 0,
                        },
                        selfHealingFailuresByReason: {
                            [WorkflowFailureReason.BUILD]: 0,
                            [WorkflowFailureReason.EXECUTION]: 0,
                            [WorkflowFailureReason.STRICT_VALIDATION]: 0,
                        },
                        averageBuildTimeMs: avgBuildTime ? parseFloat(avgBuildTime) : null,
                        oneShotAverageExecutionTimeMs: null,
                        selfHealingAverageExecutionTimeMs: null,
                    });
                }

                const wm = workflowMetricsMap.get(workflowId)!;

                if (mode === "one-shot") {
                    wm.oneShotAverageExecutionTimeMs = avgExecTime ? parseFloat(avgExecTime) : null;
                    wm.oneShotFailuresByReason = {
                        [WorkflowFailureReason.BUILD]: parseInt(failBuild) || 0,
                        [WorkflowFailureReason.EXECUTION]: parseInt(failExec) || 0,
                        [WorkflowFailureReason.STRICT_VALIDATION]: parseInt(failStrict) || 0,
                    };
                } else if (mode === "self-healing") {
                    wm.selfHealingAverageExecutionTimeMs = avgExecTime ? parseFloat(avgExecTime) : null;
                    wm.selfHealingFailuresByReason = {
                        [WorkflowFailureReason.BUILD]: parseInt(failBuild) || 0,
                        [WorkflowFailureReason.EXECUTION]: parseInt(failExec) || 0,
                        [WorkflowFailureReason.STRICT_VALIDATION]: parseInt(failStrict) || 0,
                    };
                }
            }

            const workflowMetrics = Array.from(workflowMetricsMap.values()) as WorkflowMetrics[];
            
            const workflowCount = workflowMetrics.length;
            const oneShotSuccessful = workflowMetrics.filter(w => w.hadOneShotSuccess).length;
            const selfHealingSuccessful = workflowMetrics.filter(w => w.hadSelfHealingSuccess || w.hadOneShotSuccess).length;

            const allBuildTimes = workflowMetrics.map(w => w.averageBuildTimeMs).filter((t): t is number => t !== null);
            const allOneShotExecTimes = workflowMetrics.map(w => w.oneShotAverageExecutionTimeMs).filter((t): t is number => t !== null);
            const allSelfHealingExecTimes = workflowMetrics.map(w => w.selfHealingAverageExecutionTimeMs).filter((t): t is number => t !== null);

            const allExecTimes = [...allOneShotExecTimes, ...allSelfHealingExecTimes];

            return {
                workflowCount,
                workflowOneShotSuccessRate: workflowCount === 0 ? null : oneShotSuccessful / workflowCount,
                workflowSelfHealingSuccessRate: workflowCount === 0 ? null : selfHealingSuccessful / workflowCount,
                overallAverageBuildTimeMs: allBuildTimes.length > 0 ? allBuildTimes.reduce((a, b) => a + b, 0) / allBuildTimes.length : 0,
                overallAverageExecutionTimeMs: allExecTimes.length > 0 ? allExecTimes.reduce((a, b) => a + b, 0) / allExecTimes.length : 0,
                oneShotAverageExecutionTimeMs: allOneShotExecTimes.length > 0 ? allOneShotExecTimes.reduce((a, b) => a + b, 0) / allOneShotExecTimes.length : null,
                selfHealingAverageExecutionTimeMs: allSelfHealingExecTimes.length > 0 ? allSelfHealingExecTimes.reduce((a, b) => a + b, 0) / allSelfHealingExecTimes.length : null,
                workflowMetrics,
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
