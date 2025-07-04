import { Workflow, WorkflowResult } from '@superglue/client';
import { generateUniqueId, waitForIntegrationProcessing } from '@superglue/shared/utils';
import fs from 'fs';
import path from 'path';
import { logEmitter, logMessage } from '../utils/logs.js';

import { Integration } from '@superglue/client';
import { FileStore } from '../datastore/filestore.js';
import { DataStore } from '../datastore/types.js';
// Documentation will be imported dynamically to ensure env vars are loaded first

interface IntegrationConfig {
    id: string;
    name: string;
    urlHost: string;
    urlPath?: string;
    documentationUrl?: string;
    credentials: Record<string, string>;
    description: string;
}

interface TestWorkflow {
    id: string;
    name: string;
    instruction: string;
    integrationIds: string[];
    payload?: Record<string, any>;
    expectedKeys?: string[];
    complexityLevel: 'low' | 'medium' | 'high';
    category: 'single-system' | 'multi-system';
}

interface TestConfiguration {
    integrations: {
        enabled: string[];
        definitions: Record<string, IntegrationConfig>;
    };
    workflows: {
        enabled: string[];
        definitions: Record<string, TestWorkflow>;
    };
    testSuite: {
        name: string;
        attemptsPerWorkflow?: number;
        enableApiRanking?: boolean;
    };
    apiRankingWorkflowIds?: string[];
}

interface BuildAttempt {
    buildTime: number;
    success: boolean;
    error?: string;
}

interface ExecutionAttempt {
    executionTime: number;
    success: boolean;
    error?: string;
}

interface TestResult {
    workflowId: string;
    workflowName: string;
    buildAttempts: BuildAttempt[];
    executionAttempts: ExecutionAttempt[];
    succeededOnAttempt?: number;
    dataQuality: 'pass' | 'fail' | 'unknown';
    complexity: 'low' | 'medium' | 'high';
    category: 'single-system' | 'multi-system' | 'transform-heavy';
    outputKeys: string[];
    expectedKeys?: string[];
    errorSummary?: string;
    executionReport?: any;
    actualData?: any;
    dataPreview?: string;
    totalAttempts: number;
    successfulAttempts: number;
    successRate: number;
    workflowPlans?: Array<{
        plan: any;
        buildSuccess: boolean;
        executionSuccess: boolean;
        attemptNumber: number;
    }>;
    integrationIds?: string[];
    collectedLogs?: any[];
}

interface IntegrationSetupResult {
    integrationId: string;
    name: string;
    setupTime: number;
    documentationProcessingTime?: number;
    success: boolean;
    error?: string;
}

interface TestSuite {
    suiteName: string;
    timestamp: Date;
    totalTests: number;
    passed: number;
    failed: number;
    averageBuildTime: number;
    averageExecutionTime: number;
    results: TestResult[];
    integrationSetupTime: number;
    integrationSetupResults: IntegrationSetupResult[];
    documentationProcessingTime: number;
    cleanupTime: number;
    retryStatistics: {
        totalRetries: number;
        averageAttempts: number;
        firstTrySuccesses: number;
        maxAttemptsNeeded: number;
    };
    globalMetrics?: {
        totalWorkflowAttempts: number;
        totalSuccessfulAttempts: number;
        globalSuccessRate: number;
        workflowLevelSuccessRate: number;
        averageWorkflowSuccessRate: number;
    };
    workflowMetaReports?: Array<{
        workflowId: string;
        workflowName: string;
        successRate: number;
        totalAttempts: number;
        successfulAttempts: number;
        summaries: string[];
        primaryIssues: string[];
        authenticationIssues: string[];
        errorPatterns: string[];
        recommendations: string[];
    }>;
    apiRankingResults?: any[];
    apiRankingMarkdown?: string;
}

export class IntegrationTestingFramework {
    private datastore: DataStore;
    private config: TestConfiguration;
    private metadata = { orgId: 'integration-test', userId: 'system' };
    private testDir = './.test-integration-data';

    constructor(configPath?: string) {
        this.datastore = new FileStore(this.testDir);
        this.config = this.loadConfiguration(configPath);
        this.loadCredentialsFromEnv();
    }

    private loadConfiguration(configPath?: string): TestConfiguration {
        const __dirname = path.dirname(new URL(import.meta.url).pathname);

        // Try multiple possible paths for the config file
        const possiblePaths = [
            configPath,
            // When running from compiled dist folder, look for source file
            path.join(__dirname, '../../tests/integration-test-config.json'),
            // When running from source, look locally
            path.join(__dirname, 'integration-test-config.json'),
            // When running from project root
            path.join(process.cwd(), 'packages/core/tests/integration-test-config.json'),
            path.join(process.cwd(), 'integration-test-config.json')
        ].filter(Boolean) as string[];

        let finalConfigPath: string | null = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                finalConfigPath = testPath;
                break;
            }
        }

        if (!finalConfigPath) {
            finalConfigPath = possiblePaths[0] || path.join(__dirname, 'integration-test-config.json');
        }

        try {
            const configContent = fs.readFileSync(finalConfigPath, 'utf-8');
            return JSON.parse(configContent);
        } catch (error) {
            logMessage('warn', `⚠️  Could not load config from ${finalConfigPath}, using defaults: ${String(error)}`, this.metadata);
            return {
                integrations: { enabled: [], definitions: {} },
                workflows: { enabled: [], definitions: {} },
                testSuite: { name: 'Default Test Suite' }
            };
        }
    }

    private getEnabledIntegrations(): IntegrationConfig[] {
        const enabledIds = this.config?.integrations?.enabled || [];
        const definitions = this.config?.integrations?.definitions || {};

        return enabledIds
            .map(id => definitions[id])
            .filter((config): config is IntegrationConfig => config !== undefined);
    }

    private getEnabledWorkflows(): TestWorkflow[] {
        const enabledIds = this.config?.workflows?.enabled || [];
        const definitions = this.config?.workflows?.definitions || {};

        return enabledIds
            .map(id => definitions[id])
            .filter((workflow): workflow is TestWorkflow => workflow !== undefined);
    }

    async setupIntegrations(): Promise<{ setupTime: number; results: IntegrationSetupResult[]; documentationProcessingTime: number }> {
        const startTime = Date.now();
        const enabledIntegrations = this.getEnabledIntegrations();
        logMessage('info', `🔧 Starting integration setup for ${enabledIntegrations.length} integrations...`, this.metadata);

        const pendingIntegrations: string[] = [];
        const setupResults: IntegrationSetupResult[] = [];

        for (const integration of enabledIntegrations) {
            const integrationStartTime = Date.now();
            logMessage('info', `⚙️  Setting up integration: ${integration.name}`, this.metadata);

            try {
                const now = new Date();
                const shouldFetchDoc = !!integration.documentationUrl;

                // Create integration object matching the resolver logic
                const integrationData: Integration = {
                    id: integration.id,
                    name: integration.name,
                    urlHost: integration.urlHost,
                    urlPath: integration.urlPath || '',
                    documentationUrl: integration.documentationUrl || '',
                    documentation: '',
                    documentationPending: shouldFetchDoc,
                    credentials: integration.credentials || {},
                    createdAt: now,
                    updatedAt: now
                };

                // Handle async documentation fetch if needed
                if (shouldFetchDoc) {
                    pendingIntegrations.push(integration.id);

                    // Fire-and-forget async doc fetch (same as resolver)
                    (async () => {
                        try {
                            logMessage('info', `Starting async documentation fetch for integration ${integration.id}`, this.metadata);
                            const { Documentation } = await import('../utils/documentation.js');
                            const docFetcher = new Documentation(
                                {
                                    urlHost: integration.urlHost,
                                    urlPath: integration.urlPath,
                                    documentationUrl: integration.documentationUrl,
                                },
                                integration.credentials || {},
                                this.metadata
                            );
                            const docString = await docFetcher.fetchAndProcess();

                            // Check if integration still exists before updating
                            const stillExists = await this.datastore.getIntegration(integration.id, this.metadata.orgId);
                            if (!stillExists) {
                                logMessage('warn', `Integration ${integration.id} was deleted while fetching documentation. Skipping update.`, this.metadata);
                                return;
                            }

                            await this.datastore.upsertIntegration(integration.id, {
                                ...integrationData,
                                documentation: docString,
                                documentationPending: false,
                                updatedAt: new Date()
                            }, this.metadata.orgId);

                            logMessage('info', `Completed documentation fetch for integration ${integration.id}`, this.metadata);
                        } catch (err) {
                            logMessage('error', `Documentation fetch failed for integration ${integration.id}: ${String(err)}`, this.metadata);
                            // Reset documentationPending to false on failure
                            try {
                                const stillExists = await this.datastore.getIntegration(integration.id, this.metadata.orgId);
                                if (stillExists) {
                                    await this.datastore.upsertIntegration(integration.id, {
                                        ...integrationData,
                                        documentationPending: false,
                                        updatedAt: new Date()
                                    }, this.metadata.orgId);
                                }
                            } catch (resetError) {
                                logMessage('error', `Failed to reset documentationPending for integration ${integration.id}: ${String(resetError)}`, this.metadata);
                            }
                        }
                    })();
                }
                const result = await this.datastore.upsertIntegration(integration.id, integrationData, this.metadata.orgId);
                const integrationSetupTime = Date.now() - integrationStartTime;

                setupResults.push({
                    integrationId: integration.id,
                    name: integration.name,
                    setupTime: integrationSetupTime,
                    success: true
                });

                logMessage('info', `⚙️  Successfully created integration: ${integration.name} (setup: ${integrationSetupTime}ms, pending: ${result.documentationPending})`, this.metadata);

                if (result.documentationPending) {
                    pendingIntegrations.push(integration.id);
                }
            } catch (error) {
                const integrationSetupTime = Date.now() - integrationStartTime;
                setupResults.push({
                    integrationId: integration.id,
                    name: integration.name,
                    setupTime: integrationSetupTime,
                    success: false,
                    error: String(error)
                });
                logMessage('error', `❌ Failed to create integration ${integration.name}: ${String(error)}`, this.metadata);
                throw error;
            }
        }

        // Always wait for documentation processing to complete
        let documentationProcessingTime = 0;
        if (pendingIntegrations.length > 0) {
            logMessage('info', `⏳ Waiting for documentation processing to complete for ${pendingIntegrations.length} integrations...`, this.metadata);

            const docStartTime = Date.now();
            try {
                // Create adapter for waitForIntegrationProcessing
                const datastoreAdapter = {
                    getIntegration: async (id: string): Promise<Integration | null> => {
                        return await this.datastore.getIntegration(id, this.metadata.orgId);
                    }
                };

                await waitForIntegrationProcessing(
                    datastoreAdapter,
                    pendingIntegrations,
                    120000
                );
                documentationProcessingTime = Date.now() - docStartTime;
                logMessage('info', `📚 All documentation processing completed in ${documentationProcessingTime}ms`, this.metadata);

                // Update setup results with documentation processing times
                for (const integrationId of pendingIntegrations) {
                    const result = setupResults.find(r => r.integrationId === integrationId);
                    if (result) {
                        result.documentationProcessingTime = documentationProcessingTime / pendingIntegrations.length;
                    }
                }
            } catch (error) {
                documentationProcessingTime = Date.now() - docStartTime;
                logMessage('warn', `⚠️  Timeout waiting for documentation processing after ${documentationProcessingTime}ms: ${String(error)}`, this.metadata);
            }
        }

        const setupTime = Date.now() - startTime;
        logMessage('info', `🔧 Integration setup completed in ${setupTime}ms (documentation: ${documentationProcessingTime}ms)`, this.metadata);

        return {
            setupTime,
            results: setupResults,
            documentationProcessingTime
        };
    }

    private async buildAndTestWorkflow(testWorkflow: TestWorkflow, maxRetries: number = 3): Promise<TestResult> {
        let succeededOnAttempt: number | undefined = undefined;
        const buildAttempts: BuildAttempt[] = [];
        const executionAttempts: ExecutionAttempt[] = [];
        let outputKeys: string[] | undefined;
        let dataQuality: 'pass' | 'fail' | 'unknown' = 'fail';
        let actualData: any | undefined;
        let workflow: Workflow | undefined;
        const workflowLogs: any[] = [];
        const workflowPlans: Array<{
            plan: any;
            buildSuccess: boolean;
            executionSuccess: boolean;
            attemptNumber: number;
        }> = [];

        const workflowLogListener = (entry: any) => {
            if (entry.level !== 'INFO') {
                workflowLogs.push(entry);
            }
        };
        logEmitter.on('log', workflowLogListener);
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const buildStart = Date.now();
            let buildSuccess = false;
            let buildError: string | undefined = undefined;
            let currentWorkflow: Workflow | undefined = undefined;

            logMessage('info', `📝 Building workflow ${testWorkflow.name} (attempt ${attempt}/${maxRetries})...`, this.metadata);

            // Get integrations for the workflow
            const integrations = await Promise.all(
                testWorkflow.integrationIds.map(async (id) => {
                    const integration = await this.datastore.getIntegration(id, this.metadata.orgId);
                    if (!integration) {
                        throw new Error(`Integration not found: ${id}`);
                    }
                    return integration;
                })
            );

            try {

                const { WorkflowBuilder } = await import('../workflow/workflow-builder.js');
                const builder = new WorkflowBuilder(
                    testWorkflow.instruction,
                    integrations,
                    testWorkflow.payload || {},
                    {},
                    this.metadata
                );

                currentWorkflow = await builder.build();
                currentWorkflow.id = await generateUniqueId({
                    baseId: currentWorkflow.id,
                    exists: async (id) => !!(await this.datastore.getWorkflow(id, this.metadata.orgId))
                });

                buildSuccess = true;
                logMessage('info', `🔨 Build successful for ${testWorkflow.name} in ${Date.now() - buildStart}ms`, this.metadata);
            } catch (error) {
                buildError = String(error);
                logMessage('error', `❌ Build failed for ${testWorkflow.name}: ${buildError}`, this.metadata);
            }
            const buildTime = Date.now() - buildStart;
            buildAttempts.push({ buildTime, success: buildSuccess, error: buildError });

            // Track execution if build succeeded
            let execSuccess = false;
            let execError: string | undefined = undefined;
            let executionTime = 0;

            if (buildSuccess && currentWorkflow) {
                workflow = currentWorkflow; // Keep the successful workflow
                const execStart = Date.now();
                logMessage('info', `🚀 Executing workflow ${testWorkflow.name}...`, this.metadata);

                try {
                    const { WorkflowExecutor } = await import('../workflow/workflow-executor.js');
                    const metadataWithWorkflowId = { ...this.metadata, workflowId: testWorkflow.id, runId: testWorkflow.id };
                    const executor = new WorkflowExecutor(
                        currentWorkflow,
                        metadataWithWorkflowId,
                        integrations
                    );
                    const allCredentials = integrations.reduce((acc, integ) => {
                        if (integ.credentials && typeof integ.credentials === 'object') {
                            for (const [key, value] of Object.entries(integ.credentials)) {
                                acc[`${integ.id}_${key}`] = value;
                            }
                        }
                        return acc;
                    }, {} as Record<string, string>);
                    const workflowResult = await executor.execute(
                        testWorkflow.payload || {},
                        allCredentials,
                        {} // options
                    );

                    // Save the run to datastore (matching resolver behavior)
                    await this.datastore.createRun({
                        id: workflowResult.id,
                        success: workflowResult.success,
                        error: workflowResult.error || undefined,
                        config: workflowResult.config || currentWorkflow,
                        stepResults: workflowResult.stepResults || [],
                        startedAt: workflowResult.startedAt,
                        completedAt: workflowResult.completedAt || new Date()
                    }, this.metadata.orgId);

                    execSuccess = workflowResult.success;
                    if (execSuccess) {
                        outputKeys = this.extractOutputKeys(workflowResult.data);
                        dataQuality = this.evaluateDataQuality(workflowResult, testWorkflow.expectedKeys);
                        succeededOnAttempt = attempt;
                        actualData = workflowResult.data;
                        logMessage('info', `✅ Execution successful for ${testWorkflow.name} in ${Date.now() - execStart}ms`, this.metadata);
                    } else {
                        // Capture the error from the workflow result
                        if (workflowResult.error) {
                            const errorObj = workflowResult.error as any;
                            execError = typeof errorObj === 'string'
                                ? errorObj
                                : errorObj.message || JSON.stringify(errorObj);
                            logMessage('debug', `📝 Captured workflow error: ${execError}`, this.metadata);
                        }
                        logMessage('warn', `❌ Execution failed for ${testWorkflow.name}: Workflow returned success=false${execError ? ` - ${execError}` : ''}`, this.metadata);
                    }
                } catch (error) {
                    // Capture full error details including status codes and response data
                    if (error instanceof Error && error.message) {
                        execError = error.message;
                        // Try to extract more details if available
                        if ('response' in error && error.response) {
                            const response = error.response as any;
                            execError = JSON.stringify({
                                message: error.message,
                                status: response.status,
                                statusText: response.statusText,
                                data: response.data,
                                config: response.config ? {
                                    method: response.config.method,
                                    url: response.config.url,
                                    headers: response.config.headers
                                } : undefined
                            }, null, 2);
                        }
                    } else {
                        execError = String(error);
                    }
                    logMessage('error', `❌ Execution failed for ${testWorkflow.name}: ${execError}`, this.metadata);
                }
                executionTime = Date.now() - execStart;
                executionAttempts.push({ executionTime, success: execSuccess, error: execError });
            }

            // Record the workflow plan locally for debugger analysis
            if (currentWorkflow) {
                workflowPlans.push({
                    plan: currentWorkflow,
                    buildSuccess,
                    executionSuccess: execSuccess,
                    attemptNumber: attempt
                });
            }

            // Break if both build and execution succeeded
            if (buildSuccess && execSuccess) {
                break;
            }

            if (attempt < maxRetries) await new Promise(res => setTimeout(res, Math.pow(2, attempt - 1) * 1000));
        }
        logEmitter.off('log', workflowLogListener);
        let errorSummary: string | undefined = undefined;
        let executionReport: any | undefined = undefined;
        try {
            const { WorkflowReportGenerator } = await import('./workflow-report-generator.js');
            const reportGenerator = new WorkflowReportGenerator();
            const analysis = await reportGenerator.analyzeWorkflowExecution({
                workflowId: testWorkflow.id,
                workflowName: testWorkflow.name,
                originalInstruction: testWorkflow.instruction,
                buildAttempts,
                executionAttempts,
                workflowPlans,
                integrationIds: testWorkflow.integrationIds,
                logs: workflowLogs
            });
            logMessage('info', `Collected ${workflowLogs.length} logs for ${testWorkflow.name}`, this.metadata);
            errorSummary = analysis.summary;
            executionReport = analysis.report;
        } catch (err) {
            logMessage('warn', `Failed to generate workflow analysis for ${testWorkflow.name}: ${err}`, this.metadata);
        }
        logMessage('info', `🏁 Completed buildAndTestWorkflow for ${testWorkflow.name}`, this.metadata);
        return {
            workflowId: testWorkflow.id,
            workflowName: testWorkflow.name,
            buildAttempts,
            executionAttempts,
            succeededOnAttempt,
            dataQuality,
            complexity: testWorkflow.complexityLevel,
            category: testWorkflow.category,
            outputKeys,
            expectedKeys: testWorkflow.expectedKeys,
            errorSummary,
            executionReport,
            actualData,
            dataPreview: actualData ? this.generateDataPreview(actualData) : undefined,
            totalAttempts: 1,
            successfulAttempts: succeededOnAttempt ? 1 : 0,
            successRate: succeededOnAttempt ? 1 : 0,
            workflowPlans,
            collectedLogs: workflowLogs
        };
    }

    private evaluateDataQuality(result: WorkflowResult, expectedKeys?: string[]): 'pass' | 'fail' | 'unknown' {
        if (!result.success || !result.data) return 'fail';
        if (!expectedKeys || expectedKeys.length === 0) return 'pass';

        const outputKeys = this.extractOutputKeys(result.data);
        const foundKeys = expectedKeys.filter(key => outputKeys.includes(key));

        if (foundKeys.length === expectedKeys.length) return 'pass';
        if (foundKeys.length > 0) return 'unknown';
        return 'fail';
    }

    private extractOutputKeys(data: any): string[] {
        if (!data || typeof data !== 'object') return [];
        return Object.keys(data);
    }

    /**
     * Generate a compact schema representation with example values
     */
    private generateDataSchema(data: any): any {
        if (!data) return { type: 'null' };

        // For arrays, just show type and count
        if (Array.isArray(data)) {
            return {
                type: 'array',
                count: data.length,
                firstItemType: data.length > 0 ? typeof data[0] : 'unknown'
            };
        }

        // For objects, just show top-level keys
        if (data && typeof data === 'object') {
            const keys = Object.keys(data);
            return {
                type: 'object',
                keys: keys.length > 10 ? [...keys.slice(0, 10), `...${keys.length - 10} more`] : keys
            };
        }

        // For primitives, just return type
        return { type: typeof data };
    }

    /**
     * Generate a preview of the data (first 1000 characters)
     */
    private generateDataPreview(data: any): string {
        if (data === null || data === undefined) {
            return 'null/undefined';
        }

        let stringified: string;
        try {
            // Pretty print for better readability
            stringified = JSON.stringify(data, null, 2);
        } catch (error) {
            // Fallback for circular references or other issues
            stringified = String(data);
        }

        // Take first 1000 characters and add ellipsis if truncated
        if (stringified.length <= 1000) {
            return stringified;
        }

        return stringified.substring(0, 1000) + '...';
    }

    async cleanup(): Promise<number> {
        const startTime = Date.now();
        logMessage('info', '🧹 Cleaning up test directory...', this.metadata);

        try {
            const fs = await import('fs');
            if (fs.existsSync(this.testDir)) {
                fs.rmSync(this.testDir, { recursive: true, force: true });
                logMessage('info', `🗑️  Removed test directory: ${this.testDir}`, this.metadata);
            }
        } catch (error) {
            logMessage('warn', `⚠️  Failed to clean up test directory: ${String(error)}`, this.metadata);
        }

        const cleanupTime = Date.now() - startTime;
        return cleanupTime;
    }

    async runTestSuite(suiteName?: string): Promise<TestSuite> {
        const finalSuiteName = suiteName || this.config?.testSuite?.name || 'Default Test Suite';
        const startTime = Date.now();
        logMessage('info', `🚀 Starting test suite: ${finalSuiteName}`, this.metadata);

        try {
            // Setup integrations
            const integrationSetupResults = await this.setupIntegrations();

            // Run enabled workflow tests
            const results: TestResult[] = [];
            const enabledWorkflows = this.getEnabledWorkflows();
            logMessage('info', `📋 Running ${enabledWorkflows.length} enabled workflows...`, this.metadata);

            const ATTEMPTS_PER_WORKFLOW = this.config?.testSuite?.attemptsPerWorkflow || 3;

            for (const testWorkflow of enabledWorkflows) {
                logMessage('info', `🔄 Starting workflow: ${testWorkflow.name} (will run ${ATTEMPTS_PER_WORKFLOW} times)`, this.metadata);

                let allBuildAttempts: BuildAttempt[] = [];
                let allExecutionAttempts: ExecutionAttempt[] = [];
                let successfulAttempts = 0;
                let firstSuccessAttempt: number | undefined = undefined;
                let lastResult: TestResult | undefined = undefined;
                let actualDataSamples: any[] = [];
                let allWorkflowLogs: any[] = []; // Aggregate logs across all attempts

                // Run the workflow the configured number of times
                for (let attempt = 1; attempt <= ATTEMPTS_PER_WORKFLOW; attempt++) {
                    logMessage('info', `🔁 Attempt ${attempt}/${ATTEMPTS_PER_WORKFLOW} for workflow: ${testWorkflow.name}`, this.metadata);

                    const result = await this.buildAndTestWorkflow(testWorkflow, 1); // Only 1 inner retry per build attempt
                    allBuildAttempts = allBuildAttempts.concat(result.buildAttempts);
                    allExecutionAttempts = allExecutionAttempts.concat(result.executionAttempts);

                    // Aggregate logs from this attempt
                    if (result.collectedLogs) {
                        allWorkflowLogs = allWorkflowLogs.concat(result.collectedLogs);
                    }

                    // Success means both build AND execution succeeded
                    const attemptSucceeded = result.succeededOnAttempt && result.executionAttempts.length > 0 && result.executionAttempts.some(e => e.success);

                    logMessage('info', `🔍 Attempt ${attempt} result: succeededOnAttempt=${result.succeededOnAttempt}, executionAttempts=${result.executionAttempts.length}, hasSuccessfulExec=${result.executionAttempts.some(e => e.success)}, attemptSucceeded=${attemptSucceeded}`, this.metadata);

                    if (attemptSucceeded) {
                        successfulAttempts++;
                        if (!firstSuccessAttempt) {
                            firstSuccessAttempt = attempt;
                        }
                        if (result.actualData) {
                            actualDataSamples.push(result.actualData);
                        }
                        logMessage('info', `✅ Workflow ${testWorkflow.name} execution succeeded on attempt ${attempt} (${successfulAttempts}/${attempt} successful so far)`, this.metadata);
                    } else {
                        logMessage('warn', `⚠️  Workflow ${testWorkflow.name} failed on attempt ${attempt}`, this.metadata);
                    }

                    lastResult = result;

                    // Add delay between attempts for consistency
                    if (attempt < ATTEMPTS_PER_WORKFLOW) {
                        logMessage('info', `⏳ Waiting 2 seconds before next attempt...`, this.metadata);
                        await new Promise(res => setTimeout(res, 2000));
                    }
                }

                const successRate = (successfulAttempts / ATTEMPTS_PER_WORKFLOW) * 100;
                logMessage('info', `📊 Workflow ${testWorkflow.name} completed: ${successfulAttempts}/${ATTEMPTS_PER_WORKFLOW} successful (${successRate.toFixed(1)}% success rate)`, this.metadata);

                // Use the last successful data sample if available, otherwise the last attempt's data
                const finalData = actualDataSamples.length > 0 ? actualDataSamples[actualDataSamples.length - 1] : lastResult?.actualData;

                results.push({
                    ...lastResult!,
                    buildAttempts: allBuildAttempts,
                    executionAttempts: allExecutionAttempts,
                    succeededOnAttempt: firstSuccessAttempt,
                    actualData: finalData,
                    dataPreview: finalData ? this.generateDataPreview(finalData) : lastResult?.dataPreview,
                    // New fields
                    totalAttempts: ATTEMPTS_PER_WORKFLOW,
                    successfulAttempts,
                    successRate: successRate / 100,
                    collectedLogs: allWorkflowLogs // Store aggregated logs
                });
            }

            // --- API RANKING LOGIC ---
            const enableApiRanking = this.config?.testSuite?.enableApiRanking;
            const apiRankingWorkflowIds = this.config?.apiRankingWorkflowIds || [];
            let apiRankingResults: any[] = [];
            let apiRankingWarnings: string[] = [];
            let apiRankingMarkdown: string | undefined = undefined;
            if (enableApiRanking && apiRankingWorkflowIds.length > 0) {
                const integrationStats: Array<{
                    integrationId: string;
                    workflowId: string;
                    workflowName: string;
                    workflowDescription: string;
                    successRate: number;
                    avgExecutionTime: number;
                    totalRetries: number;
                    combinedScore: number;
                }> = [];
                const enabledWorkflowIds = new Set(this.config?.workflows?.enabled || []);
                for (const wfId of apiRankingWorkflowIds) {
                    if (!enabledWorkflowIds.has(wfId)) {
                        apiRankingWarnings.push(`⚠️ Workflow '${wfId}' is listed in apiRankingWorkflowIds but is not enabled. It will not be ranked.`);
                        continue;
                    }
                    const result = results.find(r => r.workflowId === wfId);
                    if (!result) continue;
                    const integrationId = result.integrationIds?.[0] || result.workflowId;
                    const totalAttempts = result.totalAttempts || 1;
                    const successfulAttempts = result.successfulAttempts || 0;
                    const allExecTimes = result.executionAttempts.map(e => e.executionTime);
                    const avgExecutionTime = allExecTimes.length ? allExecTimes.reduce((a, b) => a + b, 0) / allExecTimes.length : 0;
                    // Count actual API call failures from the collected logs
                    let totalRetries = 0;
                    if (result.collectedLogs) {
                        const apiFailureLogs = result.collectedLogs.filter((log: any) =>
                            log.level === 'WARN' &&
                            log.message &&
                            log.message.includes('API call failed')
                        );
                        totalRetries = apiFailureLogs.length;
                    }
                    const workflowDef = this.config?.workflows?.definitions?.[wfId];
                    integrationStats.push({
                        integrationId,
                        workflowId: result.workflowId,
                        workflowName: result.workflowName,
                        workflowDescription: workflowDef?.instruction || '',
                        successRate: (successfulAttempts / totalAttempts) * 100,
                        avgExecutionTime,
                        totalRetries,
                        combinedScore: 0 // placeholder
                    });
                }
                // Normalize for combined score
                const maxExecTime = Math.max(...integrationStats.map(s => s.avgExecutionTime), 1);
                const maxRetries = Math.max(...integrationStats.map(s => s.totalRetries), 1);
                for (const stat of integrationStats) {
                    const normExec = 1 - (stat.avgExecutionTime / maxExecTime); // higher is better
                    const normRetries = 1 - (stat.totalRetries / maxRetries); // higher is better
                    stat.combinedScore = 0.6 * (stat.successRate / 100) + 0.3 * normExec + 0.1 * normRetries;
                }
                apiRankingResults = integrationStats.sort((a, b) => b.combinedScore - a.combinedScore);
                let rankingTable = '| Rank | Integration | Workflow | Success % | Avg. Exec Time (ms) | Total Retries | Combined Score |\n';
                rankingTable += '|------|-------------|----------|-----------|---------------------|---------------|---------------|\n';
                apiRankingResults.forEach((r, i) => {
                    rankingTable += `| ${i + 1} | ${r.integrationId} | ${r.workflowName} | ${r.successRate.toFixed(0)}% | ${r.avgExecutionTime.toFixed(0)} | ${r.totalRetries} | ${r.combinedScore.toFixed(2)} |\n`;
                });
                if (apiRankingWarnings.length > 0) {
                    rankingTable = apiRankingWarnings.join('\n') + '\n' + rankingTable;
                }
                logMessage('info', `\n=== API RANKING ===\n${rankingTable}`, this.metadata);
                apiRankingMarkdown = rankingTable;
            }

            // Generate error summaries for workflows that encountered errors
            logMessage('info', '🤖 Generating AI error analysis...', this.metadata);
            // No longer need WorkflowReportGenerator for batch analysis

            // Build workflow-level meta report from individual execution reports
            for (const result of results) {
                // Already have per-execution errorSummary and executionReport
                // Nothing to do here
            }

            // Generate workflow-level meta reports
            const workflowMetaReports = results.map(r => ({
                workflowId: r.workflowId,
                workflowName: r.workflowName,
                successRate: r.successRate,
                totalAttempts: r.totalAttempts,
                successfulAttempts: r.successfulAttempts,
                summaries: r.executionReport ? [r.executionReport.executionSummary] : [],
                primaryIssues: r.executionReport ? r.executionReport.primaryIssues : [],
                authenticationIssues: r.executionReport ? r.executionReport.authenticationIssues : [],
                errorPatterns: r.executionReport ? r.executionReport.errorPatterns : [],
                recommendations: r.executionReport ? r.executionReport.recommendations : []
            }));

            // Calculate metrics (cleanup will happen in finally block)
            const passed = results.filter(r => r.succeededOnAttempt !== undefined).length;
            const failed = results.length - passed;
            const averageBuildTime = results.reduce((sum, r) => sum + r.buildAttempts.reduce((sum, b) => sum + b.buildTime, 0), 0) / results.length;
            const averageExecutionTime = results.reduce((sum, r) => sum + r.executionAttempts.reduce((sum, e) => sum + e.executionTime, 0), 0) / results.length;

            // Calculate retry statistics
            const totalRetries = results.reduce((sum, r) => sum + (r.buildAttempts.length - 1), 0);

            // Calculate average attempts until first success (only for workflows that eventually succeeded)
            const successfulWorkflows = results.filter(r => r.succeededOnAttempt !== undefined);
            const averageAttempts = successfulWorkflows.length > 0
                ? successfulWorkflows.reduce((sum, r) => sum + (r.succeededOnAttempt || 0), 0) / successfulWorkflows.length
                : 0;

            const firstTrySuccesses = results.filter(r => r.succeededOnAttempt === 1).length;
            const maxAttemptsNeeded = Math.max(...results.filter(r => r.succeededOnAttempt !== undefined).map(r => r.succeededOnAttempt || 0), 0);

            // Calculate new global metrics
            const totalWorkflowAttempts = results.reduce((sum, r) => sum + r.totalAttempts, 0);
            const totalSuccessfulAttempts = results.reduce((sum, r) => sum + r.successfulAttempts, 0);
            const globalSuccessRate = totalWorkflowAttempts > 0 ? totalSuccessfulAttempts / totalWorkflowAttempts : 0;
            const workflowLevelSuccessRate = results.length > 0 ? passed / results.length : 0;
            const averageWorkflowSuccessRate = results.reduce((sum, r) => sum + r.successRate, 0) / results.length;

            logMessage('info', `📊 All workflows completed. Passed: ${passed}/${results.length}`, this.metadata);

            const testSuite: TestSuite = {
                suiteName: finalSuiteName,
                timestamp: new Date(),
                totalTests: results.length,
                passed,
                failed,
                averageBuildTime,
                averageExecutionTime,
                results,
                integrationSetupTime: integrationSetupResults.setupTime,
                integrationSetupResults: integrationSetupResults.results,
                documentationProcessingTime: integrationSetupResults.documentationProcessingTime,
                cleanupTime: 0, // Will be updated in finally block
                retryStatistics: {
                    totalRetries,
                    averageAttempts,
                    firstTrySuccesses,
                    maxAttemptsNeeded
                },
                globalMetrics: {
                    totalWorkflowAttempts,
                    totalSuccessfulAttempts,
                    globalSuccessRate,
                    workflowLevelSuccessRate,
                    averageWorkflowSuccessRate
                },
                workflowMetaReports,
                apiRankingResults,
                apiRankingMarkdown
            };

            this.logTestSummary(testSuite);
            await this.saveTestReports(testSuite);

            return testSuite;

        } catch (error) {
            logMessage('error', `❌ Test suite failed: ${String(error)}`, this.metadata);
            throw error;
        } finally {
            // Always cleanup, regardless of success/failure
            try {
                const cleanupTime = await this.cleanup();
                logMessage('info', `🧹 Final cleanup completed in ${cleanupTime}ms`, this.metadata);
            } catch (cleanupError) {
                logMessage('error', `❌ Cleanup failed: ${String(cleanupError)}`, this.metadata);
            }
        }
    }

    private logTestSummary(testSuite: TestSuite): void {
        // Aggregate build and execution times properly
        const allBuildAttempts = testSuite.results.flatMap(r => r.buildAttempts);
        const allExecutionAttempts = testSuite.results.flatMap(r => r.executionAttempts);

        const buildSuccessTimes = allBuildAttempts.filter(b => b.success).map(b => b.buildTime);
        const buildFailTimes = allBuildAttempts.filter(b => !b.success).map(b => b.buildTime);
        const execSuccessTimes = allExecutionAttempts.filter(e => e.success).map(e => e.executionTime);
        const execFailTimes = allExecutionAttempts.filter(e => !e.success).map(e => e.executionTime);

        const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        const min = (arr: number[]) => arr.length ? Math.min(...arr) : 0;
        const max = (arr: number[]) => arr.length ? Math.max(...arr) : 0;

        const passed = testSuite.results.filter(r => r.succeededOnAttempt !== undefined).length;
        const failed = testSuite.results.length - passed;

        // --- NEW: Workflow-level meta summary ---
        let metaSummary = '';
        if (testSuite.workflowMetaReports && testSuite.workflowMetaReports.length > 0) {
            metaSummary += '\n=== WORKFLOW META REPORTS ===\n';
            for (const meta of testSuite.workflowMetaReports) {
                metaSummary += `Workflow: ${meta.workflowName}\n`;
                metaSummary += `  Success Rate: ${(meta.successRate * 100).toFixed(1)}% (${meta.successfulAttempts}/${meta.totalAttempts})\n`;
                if (meta.primaryIssues.length > 0) {
                    metaSummary += `  Primary Issues: ${meta.primaryIssues.join('; ')}\n`;
                }
                if (meta.authenticationIssues.length > 0) {
                    metaSummary += `  Auth Issues: ${meta.authenticationIssues.join('; ')}\n`;
                }
                if (meta.errorPatterns.length > 0) {
                    metaSummary += `  Error Patterns: ${meta.errorPatterns.join('; ')}\n`;
                }
                if (meta.recommendations.length > 0) {
                    metaSummary += `  Recommendations: ${meta.recommendations.join('; ')}\n`;
                }
                if (meta.summaries.length > 0) {
                    metaSummary += `  Summary: ${meta.summaries.join(' | ')}\n`;
                }
                metaSummary += '\n';
            }
        }

        const detailedResults = testSuite.results.map(r => {
            let result = `${r.succeededOnAttempt !== undefined ? '✓' : '✗'} ${r.workflowName} (${r.complexity}/${r.category})
    Build Attempts: ${r.buildAttempts.length} | Times: [${r.buildAttempts.map(b => b.buildTime).join(', ')}] | Success: ${r.buildAttempts.some(b => b.success)}
    Execution Attempts: ${r.executionAttempts.length} | Times: [${r.executionAttempts.map(e => e.executionTime).join(', ')}] | Success: ${r.executionAttempts.some(e => e.success)}
    Success Rate: ${(r.successRate * 100).toFixed(1)}% (${r.successfulAttempts}/${r.totalAttempts} attempts)
    First Success: ${r.succeededOnAttempt !== undefined ? `Attempt ${r.succeededOnAttempt}` : 'Never'}`;

            if (r.outputKeys) result += `\n    Output: [${r.outputKeys.join(', ')}]`;
            if (r.expectedKeys) result += `\n    Expected: [${r.expectedKeys.join(', ')}]`;

            // Add data schema instead of full data
            if (r.actualData) {
                const schema = this.generateDataSchema(r.actualData);
                result += `\n    Data: ${JSON.stringify(schema)}`;
            }

            // Add data preview
            if (r.dataPreview) {
                result += `\n    Data Preview: ${r.dataPreview}`;
            }

            if (r.errorSummary) {
                result += `\n    🤖 AI Analysis: ${r.errorSummary}`;
            }

            if (r.executionReport) {
                const execReport = r.executionReport;
                result += `\n    📊 Detailed Analysis:`;
                if (execReport.primaryIssues?.length > 0) {
                    result += `\n       Primary Issues: ${execReport.primaryIssues.join('; ')}`;
                }
                if (execReport.authenticationIssues?.length > 0) {
                    result += `\n       🔐 Auth Issues: ${execReport.authenticationIssues.join('; ')}`;
                }
                if (execReport.errorPatterns?.length > 0) {
                    result += `\n       🔄 Error Patterns: ${execReport.errorPatterns.join('; ')}`;
                }
                if (execReport.recommendations?.length > 0) {
                    result += `\n       💡 Recommendations: ${execReport.recommendations.join('; ')}`;
                }
                if (execReport.executionSummary) {
                    result += `\n       📝 Summary: ${execReport.executionSummary}`;
                }
            }

            return result;
        }).join('\n\n');

        // Integration setup breakdown
        const integrationBreakdown = testSuite.integrationSetupResults.map(r =>
            `${r.success ? '✓' : '✗'} ${r.name}: ${r.setupTime}ms${r.documentationProcessingTime ? ` + ${r.documentationProcessingTime.toFixed(0)}ms doc` : ''}`
        ).join('\n');

        const avgIntegrationSetup = avg(testSuite.integrationSetupResults.map(r => r.setupTime));
        const avgDocProcessing = avg(testSuite.integrationSetupResults.filter(r => r.documentationProcessingTime).map(r => r.documentationProcessingTime!));

        const globalMetrics = testSuite.globalMetrics;
        const globalMetricsStr = globalMetrics ? `\n\n=== GLOBAL METRICS ===\nTotal Workflow Attempts: ${globalMetrics.totalWorkflowAttempts}\nTotal Successful Attempts: ${globalMetrics.totalSuccessfulAttempts}\nGlobal Success Rate: ${(globalMetrics.globalSuccessRate * 100).toFixed(1)}%\nWorkflow-Level Success Rate: ${(globalMetrics.workflowLevelSuccessRate * 100).toFixed(1)}% (${passed}/${testSuite.totalTests} workflows had at least one success)\nAverage Per-Workflow Success Rate: ${(globalMetrics.averageWorkflowSuccessRate * 100).toFixed(1)}%` : '';

        logMessage('info', `\n=== TEST SUITE SUMMARY ===\nSuite: ${testSuite.suiteName}\nTimestamp: ${testSuite.timestamp.toISOString()}\nTotal Tests: ${testSuite.totalTests}\nPassed: ${passed}\nFailed: ${failed}\nSuccess Rate: ${((passed / testSuite.totalTests) * 100).toFixed(1)}%${globalMetricsStr}${metaSummary}\n\n=== INTEGRATION SETUP ===\nTotal Setup Time: ${testSuite.integrationSetupTime}ms\nDocumentation Processing: ${testSuite.documentationProcessingTime}ms\nAvg Integration Setup: ${avgIntegrationSetup.toFixed(0)}ms\nAvg Documentation Processing: ${avgDocProcessing.toFixed(0)}ms\n${integrationBreakdown}\n\n=== BUILD TIME (SUCCESSFUL) ===\nAvg: ${avg(buildSuccessTimes).toFixed(0)}ms | Min: ${min(buildSuccessTimes)}ms | Max: ${max(buildSuccessTimes)}ms\n=== BUILD TIME (FAILED) ===\nAvg: ${avg(buildFailTimes).toFixed(0)}ms | Min: ${min(buildFailTimes)}ms | Max: ${max(buildFailTimes)}ms\n=== EXECUTION TIME (SUCCESSFUL) ===\nAvg: ${avg(execSuccessTimes).toFixed(0)}ms | Min: ${min(execSuccessTimes)}ms | Max: ${max(execSuccessTimes)}ms\n=== EXECUTION TIME (FAILED) ===\nAvg: ${avg(execFailTimes).toFixed(0)}ms | Min: ${min(execFailTimes)}ms | Max: ${max(execFailTimes)}ms\n\nCleanup Time: ${testSuite.cleanupTime}ms\n\n=== DETAILED RESULTS ===\n${detailedResults}\n=========================`, this.metadata);
    }

    private loadCredentialsFromEnv(): void {
        const definitions = this.config?.integrations?.definitions;
        if (!definitions) return;

        const enabledIntegrations = this.config.integrations.enabled || [];
        const missingEnvVars: string[] = [];

        for (const integrationId of enabledIntegrations) {
            const integrationConfig = definitions[integrationId];
            if (!integrationConfig) {
                logMessage('warn', `Integration ${integrationId} is enabled but not defined in definitions`, this.metadata);
                continue;
            }

            if (!integrationConfig.credentials || Object.keys(integrationConfig.credentials).length === 0) {
                logMessage('info', `Integration ${integrationId} requires no credentials`, this.metadata);
                continue;
            }

            // Process each credential key for this integration
            for (const credentialKey of Object.keys(integrationConfig.credentials)) {
                // Generate the expected environment variable name
                const envVarName = `${integrationId.toUpperCase().replace(/-/g, '_')}_${credentialKey.toUpperCase()}`;
                const envValue = process.env[envVarName];

                if (envValue) {
                    // Map the environment variable to the credential
                    integrationConfig.credentials[credentialKey] = envValue;
                    logMessage('info', `✓ Mapped ${envVarName} to ${integrationId}.credentials.${credentialKey}`, this.metadata);
                } else {
                    // Track missing environment variables
                    missingEnvVars.push(envVarName);
                }
            }

            // Special handling for postgres connection strings that also set urlHost
            if (integrationId === 'postgres-lego' && integrationConfig.credentials.connection_string) {
                integrationConfig.urlHost = integrationConfig.credentials.connection_string;
            }
        }

        // Report any missing environment variables
        if (missingEnvVars.length > 0) {
            const errorMessage = `Missing required environment variables for enabled integrations:\n${missingEnvVars.map(v => `  - ${v}`).join('\n')}`;
            logMessage('error', errorMessage, this.metadata);
            throw new Error(errorMessage);
        }

        logMessage('info', `✅ Successfully loaded credentials for ${enabledIntegrations.length} integrations`, this.metadata);
    }

    /**
     * Saves test reports in both JSON and Markdown formats
     */
    private async saveTestReports(testSuite: TestSuite): Promise<void> {
        logMessage('info', '📝 Starting to save test reports...', this.metadata);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportDir = path.join(process.cwd(), 'test-reports');

        logMessage('info', `📝 Report directory will be: ${reportDir}`, this.metadata);

        // Ensure report directory exists
        try {
            await fs.promises.mkdir(reportDir, { recursive: true });
            logMessage('info', `📝 Created report directory: ${reportDir}`, this.metadata);
        } catch (error) {
            logMessage('warn', `Failed to create report directory: ${error}`, this.metadata);
            return;
        }

        // Save JSON report with full details
        const jsonReportPath = path.join(reportDir, `integration-test-${timestamp}.json`);
        const jsonReport = {
            metadata: {
                suiteName: testSuite.suiteName,
                timestamp: testSuite.timestamp,
                environment: {
                    llmProvider: process.env.LLM_PROVIDER || 'OPENAI',
                    dataStoreType: process.env.DATA_STORE_TYPE || 'default',
                    nodeVersion: process.version
                }
            },
            summary: {
                totalTests: testSuite.totalTests,
                passed: testSuite.passed,
                failed: testSuite.failed,
                successRate: ((testSuite.passed / testSuite.totalTests) * 100).toFixed(1) + '%'
            },
            keyMetrics: {
                averageWorkflowBuildTime: `${testSuite.averageBuildTime.toFixed(0)}ms`,
                averageWorkflowExecutionTime: `${testSuite.averageExecutionTime.toFixed(0)}ms`,
                overallSuccessRate: `${((testSuite.passed / testSuite.totalTests) * 100).toFixed(1)}%`,
                averageAttemptsUntilSuccess: testSuite.retryStatistics.averageAttempts > 0 ? testSuite.retryStatistics.averageAttempts.toFixed(2) : 'N/A',
                firstTrySuccessRate: `${((testSuite.retryStatistics.firstTrySuccesses / testSuite.totalTests) * 100).toFixed(1)}%`,
                maxAttemptsNeeded: testSuite.retryStatistics.maxAttemptsNeeded,
                // New global metrics
                ...(testSuite.globalMetrics ? {
                    globalSuccessRate: `${(testSuite.globalMetrics.globalSuccessRate * 100).toFixed(1)}%`,
                    workflowLevelSuccessRate: `${(testSuite.globalMetrics.workflowLevelSuccessRate * 100).toFixed(1)}%`,
                    averageWorkflowSuccessRate: `${(testSuite.globalMetrics.averageWorkflowSuccessRate * 100).toFixed(1)}%`,
                    totalWorkflowAttempts: testSuite.globalMetrics.totalWorkflowAttempts,
                    totalSuccessfulAttempts: testSuite.globalMetrics.totalSuccessfulAttempts
                } : {})
            },
            performanceBreakdown: {
                integrationSetup: {
                    totalTime: `${testSuite.integrationSetupTime}ms`,
                    documentationProcessing: `${testSuite.documentationProcessingTime}ms`,
                    averagePerIntegration: `${(testSuite.integrationSetupTime / testSuite.integrationSetupResults.length).toFixed(0)}ms`
                },
                workflowTiming: {
                    buildTimes: this.calculateTimingStats(testSuite.results.flatMap(r => r.buildAttempts.filter(b => b.success).map(b => b.buildTime))),
                    executionTimes: this.calculateTimingStats(testSuite.results.flatMap(r => r.executionAttempts.filter(e => e.success).map(e => e.executionTime)))
                }
            },
            workflowResults: testSuite.results.map(r => ({
                workflowId: r.workflowId,
                workflowName: r.workflowName,
                success: r.succeededOnAttempt !== undefined,
                succeededOnAttempt: r.succeededOnAttempt,
                complexity: r.complexity,
                category: r.category,
                buildAttempts: r.buildAttempts.length,
                executionAttempts: r.executionAttempts.length,
                totalTime: r.buildAttempts.reduce((sum, b) => sum + b.buildTime, 0) + r.executionAttempts.reduce((sum, e) => sum + e.executionTime, 0),
                dataQuality: r.dataQuality,
                outputKeys: r.outputKeys,
                expectedKeys: r.expectedKeys,
                errorSummary: r.errorSummary,
                executionReport: r.executionReport,
                actualData: r.actualData,
                dataSchema: r.actualData ? this.generateDataSchema(r.actualData) : undefined,
                // New per-workflow metrics
                totalAttempts: r.totalAttempts,
                successfulAttempts: r.successfulAttempts,
                successRate: (r.successRate * 100).toFixed(1) + '%'
            })),
            integrationSetupResults: testSuite.integrationSetupResults,
            retryStatistics: testSuite.retryStatistics,
            integrationSetup: {
                totalTime: testSuite.integrationSetupTime,
                documentationProcessingTime: testSuite.documentationProcessingTime,
                results: testSuite.integrationSetupResults
            },
            workflowMetaReports: testSuite.workflowMetaReports,
            apiRankingResults: testSuite.apiRankingResults,
            apiRankingMarkdown: testSuite.apiRankingMarkdown
        };

        // Save JSON report
        await fs.promises.writeFile(jsonReportPath, JSON.stringify(jsonReport, null, 2));
        logMessage('info', `📄 JSON report saved to: ${jsonReportPath}`, this.metadata);

        // Save Markdown report
        const markdownReportPath = path.join(reportDir, `integration-test-${timestamp}.md`);
        const markdownReport = this.generateMarkdownReport(testSuite, jsonReport);
        await fs.promises.writeFile(markdownReportPath, markdownReport);
        logMessage('info', `📄 Markdown report saved to: ${markdownReportPath}`, this.metadata);

        // Create symlinks to latest reports for easy access
        try {
            const latestJsonPath = path.join(reportDir, 'latest.json');
            const latestMdPath = path.join(reportDir, 'latest.md');

            // Remove existing files if they exist
            try {
                await fs.promises.unlink(latestJsonPath);
            } catch (e) {
                // Ignore error if file doesn't exist
            }
            try {
                await fs.promises.unlink(latestMdPath);
            } catch (e) {
                // Ignore error if file doesn't exist
            }

            // Try to create symlinks first
            try {
                await fs.promises.symlink(path.basename(jsonReportPath), latestJsonPath);
                await fs.promises.symlink(path.basename(markdownReportPath), latestMdPath);
            } catch (symlinkError) {
                // Fall back to copying if symlinks aren't supported
                await fs.promises.copyFile(jsonReportPath, latestJsonPath);
                await fs.promises.copyFile(markdownReportPath, latestMdPath);
            }

            logMessage('info', `📄 Latest reports available at: ${reportDir}/latest.{json,md}`, this.metadata);
        } catch (error) {
            logMessage('debug', `Could not create latest report links: ${error}`, this.metadata);
        }
    }

    private calculateTimingStats(times: number[]): { avg: number; min: number; max: number } {
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        return { avg, min, max };
    }

    private generateMarkdownReport(testSuite: TestSuite, jsonReport: any): string {
        let report = `# Integration Test Report\n\n`;
        report += `**Suite:** ${testSuite.suiteName}\n`;
        report += `**Date:** ${testSuite.timestamp.toISOString()}\n`;
        report += `**Environment:** ${process.env.LLM_PROVIDER || 'OPENAI'}\n\n`;
        // --- API RANKING ---
        if (testSuite.apiRankingMarkdown) {
            report += `## API Ranking\n\n`;
            report += testSuite.apiRankingMarkdown + '\n';
        }
        // Summary
        report += `## Summary\n\n`;
        report += `- **Total Tests:** ${testSuite.totalTests}\n`;
        report += `- **Passed:** ${testSuite.passed} (${((testSuite.passed / testSuite.totalTests) * 100).toFixed(1)}%)\n`;
        report += `- **Failed:** ${testSuite.failed}\n`;

        if (testSuite.globalMetrics) {
            report += `\n### Global Success Metrics\n`;
            report += `- **Total Attempts:** ${testSuite.globalMetrics.totalWorkflowAttempts}\n`;
            report += `- **Successful Attempts:** ${testSuite.globalMetrics.totalSuccessfulAttempts}\n`;
            report += `- **Global Success Rate:** ${(testSuite.globalMetrics.globalSuccessRate * 100).toFixed(1)}%\n`;
            report += `- **Workflow Success Rate:** ${(testSuite.globalMetrics.workflowLevelSuccessRate * 100).toFixed(1)}%\n`;
        }

        // --- NEW: Workflow-level meta summary ---
        if (testSuite.workflowMetaReports && testSuite.workflowMetaReports.length > 0) {
            report += `\n## Workflow Meta Reports\n`;
            for (const meta of testSuite.workflowMetaReports) {
                report += `### ${meta.workflowName}\n`;
                report += `- Success Rate: ${(meta.successRate * 100).toFixed(1)}% (${meta.successfulAttempts}/${meta.totalAttempts})\n`;
                if (meta.primaryIssues.length > 0) {
                    report += `- Primary Issues: ${meta.primaryIssues.join('; ')}\n`;
                }
                if (meta.authenticationIssues.length > 0) {
                    report += `- Auth Issues: ${meta.authenticationIssues.join('; ')}\n`;
                }
                if (meta.errorPatterns.length > 0) {
                    report += `- Error Patterns: ${meta.errorPatterns.join('; ')}\n`;
                }
                if (meta.recommendations.length > 0) {
                    report += `- Recommendations: ${meta.recommendations.join('; ')}\n`;
                }
                if (meta.summaries.length > 0) {
                    report += `- Summary: ${meta.summaries.join(' | ')}\n`;
                }
                report += '\n';
            }
        }

        // Results Table
        report += `\n## Workflow Results\n\n`;
        report += `| Workflow | Status | Success Rate | Build Time | Exec Time | Category | Complexity |\n`;
        report += `|----------|--------|--------------|------------|-----------|----------|------------|\n`;

        for (const result of jsonReport.workflowResults) {
            const status = result.success ? '✅' : '❌';
            const buildTime = testSuite.results.find(r => r.workflowId === result.workflowId)?.buildAttempts.reduce((sum, b) => sum + b.buildTime, 0) || 0;
            const execTime = testSuite.results.find(r => r.workflowId === result.workflowId)?.executionAttempts.reduce((sum, e) => sum + e.executionTime, 0) || 0;

            report += `| ${result.workflowName} | ${status} | ${result.successRate} | ${buildTime}ms | ${execTime}ms | ${result.category} | ${result.complexity} |\n`;
        }

        // Add successful workflow details with data preview
        const successfulWorkflows = jsonReport.workflowResults.filter((r: any) => r.success);
        if (successfulWorkflows.length > 0) {
            report += `\n## ✅ Successful Workflows - Data Preview\n\n`;

            for (const success of successfulWorkflows) {
                const originalResult = testSuite.results.find(r => r.workflowId === success.workflowId);
                if (originalResult?.dataPreview) {
                    report += `**${success.workflowName}:** \`${originalResult.dataPreview}\`\n\n`;
                }
            }
        }

        // Add failed workflow details
        const failedWorkflows = jsonReport.workflowResults.filter((r: any) => !r.success);
        if (failedWorkflows.length > 0) {
            report += `\n## ❌ Failed Workflows Analysis\n\n`;

            for (const failed of failedWorkflows) {
                report += `### ${failed.workflowName}\n\n`;

                // Add data preview if available
                const originalResult = testSuite.results.find(r => r.workflowId === failed.workflowId);
                if (originalResult?.dataPreview) {
                    report += `**Data Preview:** ${originalResult.dataPreview}\n\n`;
                }

                if (failed.errorSummary) {
                    report += `**AI Analysis:** ${failed.errorSummary}\n\n`;
                }

                if (failed.executionReport) {
                    const execReport = failed.executionReport;
                    if (execReport.primaryIssues?.length > 0) {
                        report += `**Primary Issues:**\n`;
                        execReport.primaryIssues.forEach((issue: string) => {
                            report += `- ${issue}\n`;
                        });
                        report += `\n`;
                    }

                    if (execReport.authenticationIssues?.length > 0) {
                        report += `**🔐 Authentication Issues:**\n`;
                        execReport.authenticationIssues.forEach((issue: string) => {
                            report += `- ${issue}\n`;
                        });
                        report += `\n`;
                    }

                    if (execReport.errorPatterns?.length > 0) {
                        report += `**🔄 Error Patterns:**\n`;
                        execReport.errorPatterns.forEach((pattern: string) => {
                            report += `- ${pattern}\n`;
                        });
                        report += `\n`;
                    }

                    if (execReport.recommendations?.length > 0) {
                        report += `**💡 Recommendations:**\n`;
                        execReport.recommendations.forEach((rec: string) => {
                            report += `- ${rec}\n`;
                        });
                        report += `\n`;
                    }
                }
            }
        }

        return report;
    }
}
