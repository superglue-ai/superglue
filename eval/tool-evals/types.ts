import { Workflow, WorkflowResult } from "@superglue/client";

export interface IntegrationConfig {
    id: string;
    name: string;
    urlHost: string;
    urlPath?: string;
    documentationUrl?: string;
    openApiUrl?: string;
    credentials: Record<string, string>;
    description?: string;
    keywords: string[];
}

export interface ToolConfig {
    id: string;
    name: string;
    type: 'retrieval' | 'action' | 'upsert';
    instruction: string;
    integrationIds: string[];
    expectedData?: any;
    allowAdditionalProperties?: boolean;
    payload?: any;
}

export interface TestSuiteSettings {
    runOneShotMode: boolean;
    runSelfHealingMode: boolean;
    attemptsEachMode: number;
}

export interface AgentEvalConfig {
    integrations: IntegrationConfig[];
    tools: ToolConfig[];
    enabledTools: 'all' | string[];
    settings: TestSuiteSettings;
}

export enum ToolFailureReason {
    BUILD = 'build',
    EXECUTION = 'execution',
    STRICT_VALIDATION = 'strict_validation',
}

export type FailureCountsByReason = Record<ToolFailureReason, number>;

export interface ToolAttempt {
    toolConfig: ToolConfig;
    selfHealingEnabled: boolean;

    buildTime: number | null;
    buildSuccess: boolean;
    buildError?: string;

    executionTime: number | null;
    executionSuccess: boolean;
    executionError?: string;

    failureReason?: ToolFailureReason;

    workflow?: Workflow;
    result?: WorkflowResult;

    createdAt: Date;
}

export interface Metrics {
    toolCount: number;
    toolSelfHealingSuccessRate: number | null;
    toolOneShotSuccessRate: number | null;
    overallAverageBuildTimeMs: number;
    overallAverageExecutionTimeMs: number;
    oneShotAverageExecutionTimeMs: number | null;
    selfHealingAverageExecutionTimeMs: number | null;
    toolMetrics: ToolMetrics[];
}

export interface ToolMetrics {
    toolId: string;
    toolName: string;
    totalAttempts: number;
    totalSuccessfulAttempts: number;
    totalFailedAttempts: number;
    hasOneShotAttempts: boolean;
    hasSelfHealingAttempts: boolean;
    hadOneShotSuccess: boolean;
    hadSelfHealingSuccess: boolean;
    oneShotFailuresByReason: FailureCountsByReason;
    selfHealingFailuresByReason: FailureCountsByReason;
    averageBuildTimeMs: number | null;
    oneShotAverageExecutionTimeMs: number | null;
    selfHealingAverageExecutionTimeMs: number | null;
}

export interface MetricsComparisonResult {
    lastRun: MetricsComparison;
    benchmark: MetricsComparison;
}

export interface MetricsComparison {
    toolSelfHealingSuccessRateDifference: number | null;
    toolOneShotSuccessRateDifference: number | null;
    overallAverageBuildTimeMsDifference: number | null;
    overallAverageExecutionTimeMsDifference: number | null;
    oneShotAverageExecutionTimeMsDifference: number | null;
    selfHealingAverageExecutionTimeMsDifference: number | null;
    toolMetrics: ToolMetricsComparisonResult[];
}

export interface ToolMetricsComparisonResult {
    toolId: string;
    toolName: string;
    oneShotSuccessChange: -1 | 0 | 1;
    selfHealingSuccessChange: -1 | 0 | 1;
}
