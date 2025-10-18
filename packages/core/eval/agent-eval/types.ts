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
}

export interface WorkflowConfig {
    id: string;
    name: string;
    type: 'retrieval' | 'action' | 'upsert';
    instruction: string;
    integrationIds: string[];
    expectedData?: any;
    payload?: any;
}

export interface TestSuiteSettings {
    runOneShotMode: boolean;
    runSelfHealingMode: boolean;
    attempts: number;
}

export interface AgentEvalConfig {
    integrations: IntegrationConfig[];
    workflows: WorkflowConfig[];
    enabledWorkflows: string[];
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

    buildTime: number;
    buildSuccess: boolean;
    buildError?: string;

    executionTime: number;
    executionSuccess: boolean;
    executionError?: string;

    failureReason?: WorkflowFailureReason;

    workflow?: Workflow;
    result?: WorkflowResult;

    createdAt: Date;
}

export interface Metrics {
    workflowCount: number;
    successfulWorkflowCount: number;
    workflowSuccessRate: number;
    workflowSelfHealingSuccessRate: number | null; // null if no self-healing attempts exist
    workflowOneShotSuccessRate: number | null; // null if no one-shot attempts exist
    overallAverageBuildTimeMs: number;
    overallAverageExecutionTimeMs: number;
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
    hadAnySuccess: boolean;
    hadOneShotSuccess: boolean;
    hadSelfHealingSuccess: boolean;
    oneShotFailuresByReason: FailureCountsByReason;
    selfHealingFailuresByReason: FailureCountsByReason;
}

export interface MetricsComparisonResult {
    workflowSuccessRateDifference: number;
    workflowSelfHealingSuccessRateDifference: number;
    workflowOneShotSuccessRateDifference: number;
    overallAverageBuildTimeMsDifference: number;
    overallAverageExecutionTimeMsDifference: number;
    workflowMetrics: WorkflowMetricsComparisonResult[];
}

export interface WorkflowMetricsComparisonResult {
    workflowId: string;
    workflowName: string;
    anySuccessChange: -1 | 0 | 1;
    oneShotSuccessChange: -1 | 0 | 1;
    selfHealingSuccessChange: -1 | 0 | 1;
}
