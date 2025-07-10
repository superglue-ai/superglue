import { WorkflowResult } from '@superglue/client';
import fs from 'fs';
import path from 'path';
import { DataStore } from '../../datastore/types.js';
import { logMessage } from '../../utils/logs.js';
import {
    ConfigLoader,
    IntegrationConfig,
    IntegrationTestConfig as TestConfiguration,
    TestWorkflowConfig as TestWorkflow
} from '../utils/config-loader.js';
import { IntegrationSetupResult, SetupManager } from '../utils/setup-manager.js';
import type { BuildAttempt, ExecutionAttempt } from '../utils/workflow-report-generator.js';
import { WorkflowRunner } from '../utils/workflow-runner.js';
// Documentation will be imported dynamically to ensure env vars are loaded first

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
}

export class IntegrationTestingFramework {
    private datastore!: DataStore; // Will be set during setup
    private config!: TestConfiguration; // Will be set after initialization
    private configLoader: ConfigLoader;
    private setupManager: SetupManager;
    private workflowRunner!: WorkflowRunner; // Will be set during setup
    private metadata = { orgId: 'integration-test', userId: 'system' };
    private cleanupFunction?: () => Promise<void>;

    private constructor() {
        this.configLoader = new ConfigLoader();
        this.setupManager = new SetupManager('./.test-integration-data', 'integration-test', 'system');
    }

    /**
     * Factory method to create and initialize the framework
     */
    static async create(configPath?: string): Promise<IntegrationTestingFramework> {
        const framework = new IntegrationTestingFramework();
        await framework.initialize(configPath);
        return framework;
    }

    private async initialize(configPath?: string): Promise<void> {
        try {
            // Load config
            this.config = await this.configLoader.loadIntegrationTestConfig(configPath);

            // Validate and load credentials
            const credentialResult = this.configLoader.validateIntegrationTestCredentials(this.config);

            if (!credentialResult.isValid) {
                const errorMessage = `Missing required environment variables:\n${credentialResult.missingEnvVars.map(v => `  - ${v}`).join('\n')}`;
                logMessage('error', errorMessage, this.metadata);
                throw new Error(errorMessage);
            }

            // Apply loaded credentials to the config
            const enabledIntegrations = this.configLoader.getEnabledIntegrations(this.config);
            this.configLoader.applyCredentials(enabledIntegrations, credentialResult.loadedCredentials);

            logMessage('info', `✅ Successfully loaded config and credentials for ${enabledIntegrations.length} integrations`, this.metadata);
        } catch (error) {
            logMessage('error', `Failed to initialize framework: ${error}`, this.metadata);
            throw error;
        }
    }

    private getEnabledIntegrations(): IntegrationConfig[] {
        return this.configLoader.getEnabledIntegrations(this.config);
    }

    private getEnabledWorkflows(): TestWorkflow[] {
        return this.configLoader.getEnabledWorkflows(this.config);
    }

    async setupIntegrations(): Promise<{
        setupTime: number;
        results: IntegrationSetupResult[];
        documentationProcessingTime: number
    }> {
        const enabledIntegrations = this.getEnabledIntegrations();

        // Use SetupManager for environment setup
        const setupResult = await this.setupManager.setupTestEnvironment(enabledIntegrations);

        // Store datastore reference and create workflow runner
        this.datastore = setupResult.datastore;
        this.workflowRunner = new WorkflowRunner(this.datastore, 'integration-test', 'system');
        this.cleanupFunction = setupResult.cleanupFunction;

        // Extract integration setup results from the integrations
        const results: IntegrationSetupResult[] = enabledIntegrations.map(config => ({
            integrationId: config.id,
            name: config.name,
            setupTime: setupResult.setupTime / enabledIntegrations.length, // Approximate
            documentationProcessingTime: setupResult.documentationProcessingTime / enabledIntegrations.length,
            success: setupResult.integrations.some(i => i.id === config.id),
            error: setupResult.integrations.some(i => i.id === config.id) ? undefined : 'Not found in results'
        }));

        return {
            setupTime: setupResult.setupTime,
            results,
            documentationProcessingTime: setupResult.documentationProcessingTime
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
            if (this.cleanupFunction) {
                await this.cleanupFunction();
            } else {
                // Fallback to manual cleanup
                const fs = await import('fs');
                const testDataPath = this.setupManager.getDatastorePath();
                if (fs.existsSync(testDataPath)) {
                    fs.rmSync(testDataPath, { recursive: true, force: true });
                    logMessage('info', `🗑️  Removed test directory: ${testDataPath}`, this.metadata);
                }
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

                // Get integrations for the workflow
                const integrations = await Promise.all(
                    testWorkflow.integrationIds.map(async (id: string) => {
                        const integration = await this.datastore.getIntegration(id, this.metadata.orgId);
                        if (!integration) {
                            throw new Error(`Integration not found: ${id}`);
                        }
                        return integration;
                    })
                );

                // Use WorkflowRunner for all attempts
                const runResult = await this.workflowRunner.runWorkflow(
                    testWorkflow,
                    integrations,
                    {
                        maxAttemptsPerWorkflow: ATTEMPTS_PER_WORKFLOW,
                        collectLogs: true,
                        saveRuns: true,
                        delayBetweenAttempts: 2000, // 2 second delay between attempts
                        onAttemptComplete: (attempt) => {
                            logMessage('info',
                                `🔍 Attempt ${attempt.attemptNumber} result: buildSuccess=${attempt.buildSuccess}, executionSuccess=${attempt.executionSuccess}`,
                                this.metadata
                            );
                        }
                    }
                );

                // Convert WorkflowRunResult to TestResult format
                const buildAttempts: BuildAttempt[] = runResult.attempts.map(a => ({
                    buildTime: a.buildTime,
                    success: a.buildSuccess,
                    error: a.buildError
                }));

                const executionAttempts: ExecutionAttempt[] = runResult.attempts
                    .filter(a => a.buildSuccess)
                    .map(a => ({
                        executionTime: a.executionTime,
                        success: a.executionSuccess,
                        error: a.executionError
                    }));

                // Find first successful attempt
                const firstSuccessfulAttempt = runResult.attempts.find(a => a.executionSuccess);
                const succeededOnAttempt = firstSuccessfulAttempt?.attemptNumber;

                // Extract data from final result or last successful attempt
                let outputKeys: string[] | undefined;
                let dataQuality: 'pass' | 'fail' | 'unknown' = 'fail';
                let actualData: any | undefined;

                if (runResult.finalResult) {
                    outputKeys = this.extractOutputKeys(runResult.finalResult.data);
                    dataQuality = this.evaluateDataQuality(runResult.finalResult, testWorkflow.expectedKeys);
                    actualData = runResult.finalResult.data;
                }

                // Generate workflow plans for error analysis
                const workflowPlans = runResult.attempts
                    .filter(a => a.workflowPlan)
                    .map(a => ({
                        plan: a.workflowPlan!,
                        buildSuccess: a.buildSuccess,
                        executionSuccess: a.executionSuccess,
                        attemptNumber: a.attemptNumber
                    }));

                // Generate error analysis if needed
                let errorSummary: string | undefined = undefined;
                let executionReport: any | undefined = undefined;

                if (!runResult.finalResult?.success && runResult.collectedLogs && runResult.collectedLogs.length > 0) {
                    try {
                        const { WorkflowReportGenerator } = await import('../utils/workflow-report-generator.js');
                        const reportGenerator = new WorkflowReportGenerator();
                        const analysis = await reportGenerator.analyzeWorkflowExecution({
                            workflowId: testWorkflow.id,
                            workflowName: testWorkflow.name,
                            originalInstruction: testWorkflow.instruction,
                            buildAttempts,
                            executionAttempts,
                            workflowPlans,
                            integrationIds: testWorkflow.integrationIds,
                            logs: runResult.collectedLogs
                        });
                        logMessage('info', `Collected ${runResult.collectedLogs.length} logs for ${testWorkflow.name}`, this.metadata);
                        errorSummary = analysis.summary;
                        executionReport = analysis.report;
                    } catch (err) {
                        logMessage('warn', `Failed to generate workflow analysis for ${testWorkflow.name}: ${err}`, this.metadata);
                    }
                }

                const dataPreview = actualData ? this.generateDataPreview(actualData) : undefined;

                results.push({
                    workflowId: testWorkflow.id,
                    workflowName: testWorkflow.name,
                    buildAttempts,
                    executionAttempts,
                    succeededOnAttempt,
                    dataQuality,
                    complexity: testWorkflow.complexityLevel,
                    category: testWorkflow.category,
                    outputKeys: outputKeys || [],
                    expectedKeys: testWorkflow.expectedKeys,
                    errorSummary,
                    executionReport,
                    actualData,
                    dataPreview,
                    totalAttempts: runResult.totalAttempts,
                    successfulAttempts: runResult.successfulAttempts,
                    successRate: runResult.successRate,
                    workflowPlans,
                    integrationIds: testWorkflow.integrationIds,
                    collectedLogs: runResult.collectedLogs
                });
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
                workflowMetaReports
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
            workflowMetaReports: testSuite.workflowMetaReports
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
}