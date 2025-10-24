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
    validationFunction?: string;
    skipValidationFunction?: boolean;
    expectedResultDescription?: string;
    payload?: any;
}

export interface TestSuiteSettings {
    runOneShotMode: boolean;
    runSelfHealingMode: boolean;
    attemptsEachMode: number;
}

export interface ValidationLLMConfig {
    provider: string;
    model: string;
}

export interface AgentEvalConfig {
    integrations: IntegrationConfig[];
    tools: ToolConfig[];
    enabledTools: 'all' | string[];
    settings: TestSuiteSettings;
    validationLlmConfig?: ValidationLLMConfig;
}

export enum ToolFailureReason {
    BUILD = 'build',
    EXECUTION = 'execution',
    VALIDATION = 'validation',
}

export type FailureCountsByReason = Record<ToolFailureReason, number>;

export enum AttemptStatus {
    BUILD_FAILED = 'build_failed',
    EXECUTION_FAILED = 'execution_failed',
    VALIDATION_PASSED = 'validation_passed',
    VALIDATION_FAILED_LLM_PASSED = 'validation_failed_llm_passed',
    VALIDATION_FAILED_LLM_PARTIAL = 'validation_failed_llm_partial',
    VALIDATION_FAILED_LLM_FAILED = 'validation_failed_llm_failed',
    VALIDATION_SKIPPED_LLM_PASSED = 'validation_skipped_llm_passed',
    VALIDATION_SKIPPED_LLM_PARTIAL = 'validation_skipped_llm_partial',
    VALIDATION_SKIPPED_LLM_FAILED = 'validation_skipped_llm_failed'
}

export interface ValidationResult {
    passed: boolean; // Overall validation passed (function passed OR LLM says "passes")
    functionPassed: boolean; // Did the validation function pass?
    functionError?: string;
    llmJudgment?: 'passes' | 'partial' | 'failed';
    llmReason?: string;
}

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
    status: AttemptStatus;
    validationResult?: ValidationResult;

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
