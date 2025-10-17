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

export interface WorkflowAttempt {
    workflowConfig: WorkflowConfig;
    selfHealingEnabled: boolean;
    
    buildTime: number;
    buildSuccess: boolean;
    buildError?: string;

    executionTime: number;
    executionSuccess: boolean;
    executionError?: string;
    
    failureReason? : WorkflowFailureReason;
    
    workflow?: Workflow;
    result?: WorkflowResult;
    
    createdAt: Date;
}

export interface Metrics {
    totalAttempts: number;
    totalSuccessfulAttempts: number;
    totalFailedAttempts: number;
    overallSuccessRate: number;
    overallSelfHealingSuccessRate: number;
    overallOneShotSuccessRate: number;
    overallAverageBuildTimeMs: number;
    overallAverageExecutionTimeMs: number;
    workflowSuccessRate: number;
    workflowStrictValidationFailureRate: number;
    workflowBuildFailureRate: number;
    workflowExecutionFailureRate: number;
    workflowMetrics: WorkflowMetrics[];
}

export interface WorkflowMetrics {
    workflowConfig: WorkflowConfig;
    totalAttempts: number;
    totalSuccessfulAttempts: number;
    totalFailedAttempts: number;
    selfHealingSuccessRate: number;
    oneShotSuccessRate: number;
    latestFailureReason?: WorkflowFailureReason;
}
