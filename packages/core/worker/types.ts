import { WorkerPool } from './worker-pool.js';
import { Tool, RequestOptions, ToolStepResult, IntegrationManager } from '@superglue/shared';

export interface WorkerPools {
    toolExecution: WorkerPool<ToolExecutionPayload, ToolExecutionResult>;
}

export interface WorkerTask<Payload, Result> {
    run(payload: Payload): Promise<Result>;
}

export type WorkerMessageHandler<T = any> = (message: T) => void | Promise<void>;
export interface WorkerPoolOptions {
    concurrency: number;
    memoryMb?: number;
    messageHandlers?: Record<string, WorkerMessageHandler>;
}
export interface ToolExecutionPayload {
    runId: string;
    workflow: Tool;
    payload?: Record<string, any>;
    credentials?: Record<string, string>;
    options?: RequestOptions;
    integrationManagers: IntegrationManager[];
    orgId: string;
    traceId?: string;
}
export interface ToolExecutionResult {
    runId: string;
    success: boolean;
    data?: any;
    error?: string;
    stepResults: ToolStepResult[];
    config?: Tool;
    startedAt: Date;
    completedAt: Date;
}
export interface CredentialUpdateMessage {
    integrationId: string;
    orgId: string;
    credentials: Record<string, any>;
}