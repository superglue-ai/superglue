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

export interface WorkflowConfig {
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
    workflows: WorkflowConfig[];
    enabledWorkflows: 'all' | string[];
    settings: TestSuiteSettings;
}

export enum WorkflowFailureReason {
    BUILD = 'build',
    EXECUTION = 'execution',
    STRICT_VALIDATION = 'strict_validation',
}

export type FailureCountsByReason = Record<WorkflowFailureReason, number>;

export interface WorkflowAttempt {
    workflowConfig: WorkflowConfig;
    selfHealingEnabled: boolean;

    buildTime: number | null;
    buildSuccess: boolean;
    buildError?: string;

    executionTime: number | null;
    executionSuccess: boolean;
    executionError?: string;

    failureReason?: WorkflowFailureReason;

    workflow?: Workflow;
    result?: WorkflowResult;

    createdAt: Date;
}

export interface Metrics {
    workflowCount: number;
    workflowSelfHealingSuccessRate: number | null;
    workflowOneShotSuccessRate: number | null;
    overallAverageBuildTimeMs: number;
    overallAverageExecutionTimeMs: number;
    oneShotAverageExecutionTimeMs: number | null;
    selfHealingAverageExecutionTimeMs: number | null;
    workflowMetrics: WorkflowMetrics[];
}

export interface WorkflowMetrics {
    workflowId: string;
    workflowName: string;
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
    workflowSelfHealingSuccessRateDifference: number | null;
    workflowOneShotSuccessRateDifference: number | null;
    overallAverageBuildTimeMsDifference: number | null;
    overallAverageExecutionTimeMsDifference: number | null;
    oneShotAverageExecutionTimeMsDifference: number | null;
    selfHealingAverageExecutionTimeMsDifference: number | null;
    workflowMetrics: WorkflowMetricsComparisonResult[];
}

export interface WorkflowMetricsComparisonResult {
    workflowId: string;
    workflowName: string;
    oneShotSuccessChange: -1 | 0 | 1;
    selfHealingSuccessChange: -1 | 0 | 1;
}
