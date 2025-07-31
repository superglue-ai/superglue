import { Integration, Workflow, WorkflowResult } from '@superglue/client';
import { generateUniqueId } from '@superglue/shared/utils';
import { DataStore } from '../../datastore/types.js';
import { IntegrationManager } from '../../integrations/integration-manager.js';
import { logEmitter, logMessage } from '../../utils/logs.js';
import { BaseWorkflowConfig } from './config-loader.js';

export interface WorkflowRunAttempt {
    attemptNumber: number;
    buildTime: number;
    buildSuccess: boolean;
    buildError?: string;
    executionTime: number;
    executionSuccess: boolean;
    executionError?: string;
    workflowPlan?: Workflow;
    result?: WorkflowResult;
}

export interface WorkflowRunResult {
    workflowId: string;
    workflowName: string;
    totalAttempts: number;
    successfulAttempts: number;
    successRate: number;
    attempts: WorkflowRunAttempt[];
    finalResult?: WorkflowResult;
    collectedLogs?: any[];
}

export interface WorkflowRunnerOptions {
    maxAttemptsPerWorkflow: number;
    collectLogs?: boolean;
    saveRuns?: boolean;
    delayBetweenAttempts?: number;  // Set to 0 for testing, use 1000-2000ms for production APIs to avoid rate limiting
    onAttemptComplete?: (attempt: WorkflowRunAttempt) => void;
}

/**
 * Count API call failures from collected logs
 */
export function countApiFailures(logs: any[] = []): number {
    return logs.filter(log =>
        log.level === 'WARN' && log.message?.includes('API call failed')
    ).length;
}

export class WorkflowRunner {
    private metadata: { orgId: string; userId: string };

    constructor(
        private datastore: DataStore,
        orgId: string = 'workflow-runner',
        userId: string = 'system'
    ) {
        this.metadata = { orgId, userId };
    }

    /**
     * Run a workflow with multiple attempts
     */
    async runWorkflow(
        workflowConfig: BaseWorkflowConfig,
        integrations: Integration[],
        options: WorkflowRunnerOptions
    ): Promise<WorkflowRunResult> {
        const attempts: WorkflowRunAttempt[] = [];
        const collectedLogs: any[] = [];
        let successfulAttempts = 0;
        let finalResult: WorkflowResult | undefined;

        // Set up log collection if requested
        const logListener = options.collectLogs ? (entry: any) => {
            if (entry.level !== 'INFO') {
                collectedLogs.push(entry);
            }
        } : undefined;

        if (logListener) {
            logEmitter.on('log', logListener);
        }

        try {
            // Run multiple attempts
            for (let attemptNum = 1; attemptNum <= options.maxAttemptsPerWorkflow; attemptNum++) {
                logMessage('info',
                    `🔄 Starting attempt ${attemptNum}/${options.maxAttemptsPerWorkflow} for workflow: ${workflowConfig.name}`,
                    this.metadata
                );

                const attempt = await this.runSingleAttempt(
                    workflowConfig,
                    integrations,
                    attemptNum,
                    options.saveRuns ?? false
                );

                attempts.push(attempt);

                if (attempt.executionSuccess && attempt.result) {
                    successfulAttempts++;
                    finalResult = attempt.result;
                    logMessage('info',
                        `✅ Workflow ${workflowConfig.name} succeeded on attempt ${attemptNum}`,
                        this.metadata
                    );
                } else {
                    logMessage('warn',
                        `⚠️  Workflow ${workflowConfig.name} failed on attempt ${attemptNum}`,
                        this.metadata
                    );
                }

                // Call hook if provided
                if (options.onAttemptComplete) {
                    options.onAttemptComplete(attempt);
                }

                // Add delay between attempts if not the last one
                if (attemptNum < options.maxAttemptsPerWorkflow && options.delayBetweenAttempts) {
                    logMessage('info',
                        `⏳ Waiting ${options.delayBetweenAttempts}ms before next attempt...`,
                        this.metadata
                    );
                    await new Promise(resolve => setTimeout(resolve, options.delayBetweenAttempts));
                }
            }

        } finally {
            // Clean up log listener
            if (logListener) {
                logEmitter.off('log', logListener);
            }
        }

        const successRate = successfulAttempts / options.maxAttemptsPerWorkflow;

        logMessage('info',
            `📊 Workflow ${workflowConfig.name} completed: ${successfulAttempts}/${options.maxAttemptsPerWorkflow} successful (${(successRate * 100).toFixed(1)}% success rate)`,
            this.metadata
        );

        return {
            workflowId: workflowConfig.id,
            workflowName: workflowConfig.name,
            totalAttempts: options.maxAttemptsPerWorkflow,
            successfulAttempts,
            successRate,
            attempts,
            finalResult,
            collectedLogs: options.collectLogs ? collectedLogs : undefined
        };
    }

    /**
     * Run a single attempt of building and executing a workflow
     */
    private async runSingleAttempt(
        workflowConfig: BaseWorkflowConfig,
        integrations: Integration[],
        attemptNumber: number,
        saveRun: boolean
    ): Promise<WorkflowRunAttempt> {
        const attempt: WorkflowRunAttempt = {
            attemptNumber,
            buildTime: 0,
            buildSuccess: false,
            executionTime: 0,
            executionSuccess: false
        };

        // Build phase
        const buildStart = Date.now();
        let workflow: Workflow | undefined;

        try {
            logMessage('info', `📝 Building workflow ${workflowConfig.name}...`, this.metadata);

            const { WorkflowBuilder } = await import('../../workflow/workflow-builder.js');
            const builder = new WorkflowBuilder(
                workflowConfig.instruction,
                integrations,
                workflowConfig.payload || {},
                {},
                this.metadata
            );

            workflow = await builder.buildWorkflow();
            workflow.id = await generateUniqueId({
                baseId: workflow.id,
                exists: async (id) => !!(await this.datastore.getWorkflow(id, this.metadata.orgId))
            });

            attempt.buildSuccess = true;
            attempt.workflowPlan = workflow;
            attempt.buildTime = Date.now() - buildStart;

            logMessage('info',
                `🔨 Build successful for ${workflowConfig.name} in ${attempt.buildTime}ms`,
                this.metadata
            );

        } catch (error) {
            attempt.buildTime = Date.now() - buildStart;
            attempt.buildError = error instanceof Error ? error.message : String(error);

            logMessage('error',
                `❌ Build failed for ${workflowConfig.name}: ${attempt.buildError}`,
                this.metadata
            );

            return attempt;
        }

        // Execute phase
        if (workflow) {
            const execStart = Date.now();

            try {
                logMessage('info', `🚀 Executing workflow ${workflowConfig.name}...`, this.metadata);

                const { WorkflowExecutor } = await import('../../workflow/workflow-executor.js');
                const metadataWithWorkflowId = {
                    ...this.metadata,
                    workflowId: workflowConfig.id,
                    runId: `${workflowConfig.id}-${attemptNumber}`
                };

                const executor = new WorkflowExecutor(
                    workflow,
                    metadataWithWorkflowId,
                    IntegrationManager.fromIntegrations(integrations, this.datastore, this.metadata.orgId)
                );

                // Combine all credentials from integrations
                const allCredentials = integrations.reduce((acc, integ) => {
                    if (integ.credentials && typeof integ.credentials === 'object') {
                        for (const [key, value] of Object.entries(integ.credentials)) {
                            acc[`${integ.id}_${key}`] = value;
                        }
                    }
                    return acc;
                }, {} as Record<string, string>);

                const workflowResult = await executor.execute(
                    workflowConfig.payload || {},
                    allCredentials,
                    {}
                );

                attempt.executionTime = Date.now() - execStart;
                attempt.result = workflowResult;
                attempt.executionSuccess = workflowResult.success;

                // Save run if requested
                if (saveRun) {
                    await this.datastore.createRun({
                        id: workflowResult.id,
                        success: workflowResult.success,
                        error: workflowResult.error || undefined,
                        config: workflowResult.config || workflow,
                        stepResults: workflowResult.stepResults || [],
                        startedAt: workflowResult.startedAt,
                        completedAt: workflowResult.completedAt || new Date()
                    }, this.metadata.orgId);
                }

                if (attempt.executionSuccess) {
                    logMessage('info',
                        `✅ Execution successful for ${workflowConfig.name} in ${attempt.executionTime}ms`,
                        this.metadata
                    );
                } else {
                    const errorMsg = workflowResult.error
                        ? (typeof workflowResult.error === 'string'
                            ? workflowResult.error
                            : JSON.stringify(workflowResult.error))
                        : 'Unknown error';

                    attempt.executionError = errorMsg;

                    logMessage('warn',
                        `❌ Execution failed for ${workflowConfig.name}: ${errorMsg}`,
                        this.metadata
                    );
                }

            } catch (error) {
                attempt.executionTime = Date.now() - execStart;
                attempt.executionError = error instanceof Error ? error.message : String(error);

                logMessage('error',
                    `❌ Execution error for ${workflowConfig.name}: ${attempt.executionError}`,
                    this.metadata
                );
            }
        }

        return attempt;
    }

    /**
     * Run multiple workflows in sequence
     */
    async runWorkflows(
        workflows: BaseWorkflowConfig[],
        integrations: Integration[],
        options: WorkflowRunnerOptions,
        onWorkflowComplete?: (result: WorkflowRunResult) => void
    ): Promise<WorkflowRunResult[]> {
        const results: WorkflowRunResult[] = [];

        for (const workflow of workflows) {
            // Get integrations for this workflow
            const workflowIntegrations = integrations.filter(i =>
                workflow.integrationIds.includes(i.id)
            );

            if (workflowIntegrations.length !== workflow.integrationIds.length) {
                logMessage('warn',
                    `⚠️  Workflow ${workflow.name} requires integrations that are not available`,
                    this.metadata
                );
                continue;
            }

            const result = await this.runWorkflow(workflow, workflowIntegrations, options);
            results.push(result);

            if (onWorkflowComplete) {
                onWorkflowComplete(result);
            }
        }

        return results;
    }
} 