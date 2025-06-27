import { SuperglueClient, Workflow, WorkflowResult } from '@superglue/client';
import { waitForIntegrationProcessing } from '@superglue/shared/utils';
import fs from 'fs';
import path from 'path';
import { logMessage } from '../utils/logs.js';

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
        available: string[];
    };
    workflows: {
        enabled: string[];
        available: string[];
    };
    testSuite: {
        name: string;
        runCleanupTest: boolean;
        waitForDocumentation: boolean;
    };
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
    suiteAnalysis?: string;
}

export class IntegrationTestingFramework {
    private client: SuperglueClient;
    private createdIntegrations: string[] = [];
    private createdWorkflows: string[] = [];
    private config: TestConfiguration;
    private metadata = { orgId: 'integration-test', userId: 'system' };

    constructor(endpoint: string, apiKey: string, configPath?: string) {
        this.client = new SuperglueClient({ endpoint, apiKey });
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
                integrations: { enabled: [], available: [] },
                workflows: { enabled: [], available: [] },
                testSuite: { name: 'Default Test Suite', runCleanupTest: true, waitForDocumentation: false }
            };
        }
    }

    private getEnabledIntegrations(): IntegrationConfig[] {
        const enabledIds = this.config?.integrations?.enabled || [];
        return this.INTEGRATION_CONFIGS.filter(config =>
            enabledIds.includes(config.id)
        );
    }

    private getEnabledWorkflows(): TestWorkflow[] {
        const enabledIds = this.config?.workflows?.enabled || [];
        return this.TEST_WORKFLOWS.filter(workflow =>
            enabledIds.includes(workflow.id)
        );
    }

    private readonly INTEGRATION_CONFIGS: IntegrationConfig[] = [
        {
            id: 'hubspot-crm',
            name: 'HubSpot CRM',
            urlHost: 'https://api.hubapi.com',
            urlPath: '/crm/v3',
            documentationUrl: 'https://developers.hubspot.com/docs/api/overview',
            credentials: { private_app_token: '' },
            description: 'Customer relationship management API'
        },
        {
            id: 'stripe-pay',
            name: 'Stripe Payments',
            urlHost: 'https://api.stripe.com',
            urlPath: '/v1',
            documentationUrl: 'https://stripe.com/docs/api',
            credentials: {
                secret_key: '',
                publishable_key: ''
            },
            description: 'Payment processing and subscription management'
        },
        {
            id: 'timbuk2-shopify',
            name: 'Timbuk2 Shopify Demo',
            urlHost: 'https://www.timbuk2.com',
            urlPath: '/products.json',
            documentationUrl: 'https://shopify.dev/docs/api/ajax/reference/product',
            credentials: {},
            description: 'Public Shopify API demo'
        },
        {
            id: 'postgres-lego',
            name: 'LEGO Database',
            urlHost: 'postgres://superglue:superglue@database-1.c01e6ms2cdvl.us-east-1.rds.amazonaws.com:5432',
            urlPath: '/lego',
            documentationUrl: '',
            credentials: {},
            description: 'PostgreSQL LEGO database for testing'
        },
        {
            id: 'shopify-hydrogen',
            name: 'Shopify Hydrogen',
            urlHost: 'https://hydrogen-preview.myshopify.com',
            urlPath: '/products.json',
            documentationUrl: '',
            credentials: {},
            description: 'Shopify product catalog API'
        },
        {
            id: 'jira-projects',
            name: 'JIRA Projects',
            urlHost: 'https://superglue-team-test.atlassian.net/',
            urlPath: '',
            documentationUrl: 'https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json?_v=1.7687.0-0.1317.0',
            credentials: { api_token: '' },
            description: 'JIRA project management API'
        },
        {
            id: 'attio-crm',
            name: 'Attio CRM',
            urlHost: 'https://api.attio.com/',
            urlPath: '/v2',
            documentationUrl: 'https://docs.attio.com/docs/overview',
            credentials: { api_token: '' },
            description: 'Modern CRM with OpenAPI specification'
        },
        {
            id: 'supabase-db',
            name: 'Supabase Database',
            urlHost: 'https://fmcghdcrnnsdbtdriycm.supabase.co',
            urlPath: '/rest/v1',
            documentationUrl: 'https://supabase.com/dashboard/project/fmcghdcrnnsdbtdriycm/api',
            credentials: {
                password: '',
                public_api_key: '',
                secret_key: ''
            },
            description: 'Backend database for multi-workflow setups'
        },
        {
            id: 'twilio-comm',
            name: 'Twilio Communications',
            urlHost: 'https://api.twilio.com/',
            urlPath: '/2010-04-01',
            documentationUrl: 'https://www.twilio.com/docs/api',
            credentials: {
                account_sid: '',
                sid: '',
                test_auth_token: '',
                secret_key: ''
            },
            description: 'Phone and SMS communications API'
        },
        {
            id: 'sendgrid-email',
            name: 'SendGrid Email',
            urlHost: 'https://api.sendgrid.com/',
            urlPath: '/v3',
            documentationUrl: 'https://docs.sendgrid.com/api-reference',
            credentials: { api_key: '' },
            description: 'Email delivery and marketing API'
        }
    ];

    private readonly TEST_WORKFLOWS: TestWorkflow[] = [
        {
            id: 'hubspot-lead-qualification',
            name: 'HubSpot Lead Qualification Pipeline',
            instruction: 'Get all HubSpot contacts created in the 30 days after the payload date, filter out contacts working at the companies in the payload company list, and update the lead status of remaining contacts to Marketing Qualified Lead',
            integrationIds: ['hubspot-crm'],
            payload: { date: '2025-06-01', companies: ['COMPANY A', 'COMPANY B'] },
            complexityLevel: 'medium',
            category: 'single-system'
        },
        {
            id: 'stripe-revenue-analytics',
            name: 'Stripe Revenue Analytics Dashboard',
            instruction: 'Fetch all Stripe charges in the 3 months following the payload date, group by customer and calculate my monthly recurring revenue',
            integrationIds: ['stripe-pay'],
            payload: { date: '2025-06-01' },
            complexityLevel: 'high',
            category: 'single-system'
        },
        {
            id: 'jira-sprint-health',
            name: 'JIRA Sprint Health Check',
            instruction: 'Get all issues from the current active sprint, categorize them by status, calculate completion percentage, and identify any issues marked as Blocked or High Priority that are still in progress',
            integrationIds: ['jira-projects'],
            payload: {},
            complexityLevel: 'medium',
            category: 'single-system'
        },
        {
            id: 'attio-contact-enrichment',
            name: 'Attio Contact Enrichment',
            instruction: 'Find all Attio contacts that dont have a company assigned, check if their email domain matches any existing companies in the system, and automatically link them to the matching company record',
            integrationIds: ['attio-crm'],
            payload: {},
            complexityLevel: 'medium',
            category: 'single-system'
        },
        {
            id: 'lego-inventory-analysis',
            name: 'LEGO Database Inventory Analysis',
            instruction: 'Query the LEGO database to find the most popular LEGO themes by number of sets.',
            integrationIds: ['postgres-lego'],
            payload: {},
            complexityLevel: 'low',
            category: 'single-system'
        },
        {
            id: 'timbuk2-product-analysis',
            name: 'Timbuk2 Product Analysis',
            instruction: 'Get all products from Timbuk2 with automatic pagination. This is a public endpoint.',
            integrationIds: ['timbuk2-shopify'],
            payload: {},
            complexityLevel: 'low',
            category: 'single-system'
        },
        {
            id: 'crm-to-email-workflow',
            name: 'CRM to Email Marketing Workflow',
            instruction: 'Get all qualified leads from HubSpot created in the last 7 days after the payload date, segment them by industry, create an email saying "Hello [name] and welcome to the [industry] industry", and send them welcome emails via SendGrid',
            integrationIds: ['hubspot-crm', 'sendgrid-email'],
            payload: { date: '2025-05-01' },
            complexityLevel: 'medium',
            category: 'multi-system'
        },
        {
            id: 'payment-to-db-sync',
            name: 'Payment to Database Sync',
            instruction: 'Fetch all successful Stripe payments from the last 24 hours, transform the data to match the database schema, and insert the records into Supabase for analytics',
            integrationIds: ['stripe-pay', 'supabase-db'],
            payload: { hours: 24 },
            complexityLevel: 'medium',
            category: 'multi-system'
        },
        {
            id: 'project-notification-system',
            name: 'Project Status Notification System',
            instruction: 'Monitor JIRA for overdue high-priority tickets, check if they have been updated in the last 48 hours, and send SMS notifications to project managers via Twilio for any stale tickets',
            integrationIds: ['jira-projects', 'twilio-comm'],
            payload: { hours: 48 },
            complexityLevel: 'medium',
            category: 'multi-system'
        },
        {
            id: 'customer-lifecycle-automation',
            name: 'Customer Lifecycle Automation',
            instruction: 'Identify customers who have not made a purchase in Stripe in the 90 days since the payload date, check their engagement score in HubSpot, and send re-engagement emails via SendGrid',
            integrationIds: ['stripe-pay', 'hubspot-crm', 'sendgrid-email'],
            payload: { date: '2025-05-01' },
            complexityLevel: 'medium',
            category: 'multi-system'
        },
        {
            id: 'comprehensive-analytics-pipeline',
            name: 'Comprehensive Analytics Pipeline',
            instruction: 'Collect sales data from Stripe, customer data from HubSpot, project data from JIRA, combine all data sources, generate weekly analytics report, store results in Supabase, and email the report to stakeholders via SendGrid',
            integrationIds: ['stripe-pay', 'hubspot-crm', 'jira-projects', 'supabase-db', 'sendgrid-email'],
            payload: { period: 'weekly' },
            complexityLevel: 'high',
            category: 'multi-system'
        }
    ];

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
                const result = await this.client.upsertIntegration(integration.id, {
                    id: integration.id,
                    name: integration.name,
                    urlHost: integration.urlHost,
                    urlPath: integration.urlPath,
                    documentationUrl: integration.documentationUrl,
                    credentials: integration.credentials
                });

                this.createdIntegrations.push(integration.id);
                const integrationSetupTime = Date.now() - integrationStartTime;

                setupResults.push({
                    integrationId: integration.id,
                    name: integration.name,
                    setupTime: integrationSetupTime,
                    success: true
                });

                logMessage('info', `✅ Successfully created integration: ${integration.name} (setup: ${integrationSetupTime}ms, pending: ${result.documentationPending})`, this.metadata);

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

        // Wait for documentation processing to complete if configured
        let documentationProcessingTime = 0;
        if (this.config?.testSuite?.waitForDocumentation && pendingIntegrations.length > 0) {
            logMessage('info', `⏳ Waiting for documentation processing to complete for ${pendingIntegrations.length} integrations...`, this.metadata);

            const docStartTime = Date.now();
            try {
                await waitForIntegrationProcessing(
                    this.client, // SuperglueClient implements the IntegrationGetter interface
                    pendingIntegrations,
                    120000 // 120 seconds timeout (doubled from 60)
                );
                documentationProcessingTime = Date.now() - docStartTime;
                logMessage('info', `✅ All documentation processing completed in ${documentationProcessingTime}ms`, this.metadata);

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
        logMessage('info', `✅ Integration setup completed in ${setupTime}ms (documentation: ${documentationProcessingTime}ms)`, this.metadata);

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
        let workflow: Workflow | undefined;
        let outputKeys: string[] | undefined;
        let dataQuality: 'pass' | 'fail' | 'unknown' = 'fail';

        // Track workflow plans locally for debugger analysis (not saved to JSON)
        const workflowPlans: Array<{
            plan: any;
            buildSuccess: boolean;
            executionSuccess: boolean;
            attemptNumber: number;
        }> = [];

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const buildStart = Date.now();
            let buildSuccess = false;
            let buildError: string | undefined = undefined;
            let currentWorkflow: Workflow | undefined = undefined;

            try {
                currentWorkflow = await this.client.buildWorkflow({
                    instruction: testWorkflow.instruction,
                    payload: testWorkflow.payload || {},
                    integrationIds: testWorkflow.integrationIds,
                    save: false
                });
                buildSuccess = true;
            } catch (error) {
                buildError = String(error);
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
                try {
                    const workflowResult = await this.client.executeWorkflow({
                        workflow: currentWorkflow,
                        payload: testWorkflow.payload || {},
                        credentials: this.gatherCredentials(testWorkflow.integrationIds)
                    });
                    execSuccess = workflowResult.success;
                    if (execSuccess) {
                        outputKeys = this.extractOutputKeys(workflowResult.data);
                        dataQuality = this.evaluateDataQuality(workflowResult, testWorkflow.expectedKeys);
                        succeededOnAttempt = attempt;
                    }
                } catch (error) {
                    execError = String(error);
                }
                executionTime = Date.now() - execStart;
                executionAttempts.push({ executionTime, success: execSuccess, error: execError });
            }

            // Record the workflow plan locally for debugger analysis
            workflowPlans.push({
                plan: currentWorkflow,
                buildSuccess,
                executionSuccess: execSuccess,
                attemptNumber: attempt
            });

            // Break if both build and execution succeeded
            if (buildSuccess && execSuccess) {
                break;
            }

            if (attempt < maxRetries) await new Promise(res => setTimeout(res, Math.pow(2, attempt - 1) * 1000));
        }

        // Generate error summary and execution report using the debugger with workflow plans
        let errorSummary: string | undefined = undefined;
        let executionReport: any | undefined = undefined;
        try {
            const { WorkflowReportGenerator } = await import('./workflow-report-generator.js');
            const workflowReportGenerator = new WorkflowReportGenerator();

            // Generate error summary
            errorSummary = await workflowReportGenerator.generateErrorSummary({
                workflowId: testWorkflow.id,
                workflowName: testWorkflow.name,
                originalInstruction: testWorkflow.instruction,
                buildAttempts,
                executionAttempts,
                workflowPlans,
                integrationIds: testWorkflow.integrationIds,
                payload: testWorkflow.payload,
                expectedKeys: testWorkflow.expectedKeys
            });

            // Generate detailed execution report
            executionReport = await workflowReportGenerator.generateWorkflowExecutionReport({
                workflowId: testWorkflow.id,
                workflowName: testWorkflow.name,
                originalInstruction: testWorkflow.instruction,
                buildAttempts,
                executionAttempts,
                workflowPlans,
                integrationIds: testWorkflow.integrationIds,
                payload: testWorkflow.payload,
                expectedKeys: testWorkflow.expectedKeys
            });
        } catch (error) {
            logMessage('warn', `Failed to generate workflow analysis for ${testWorkflow.name}: ${error}`, this.metadata);
        }

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
            executionReport
        };
    }

    private gatherCredentials(integrationIds: string[]): Record<string, string> {
        const credentials: Record<string, string> = {};

        for (const integrationId of integrationIds) {
            const config = this.INTEGRATION_CONFIGS.find(c => c.id === integrationId);
            if (config) {
                Object.entries(config.credentials).forEach(([key, value]) => {
                    credentials[`${integrationId}_${key}`] = value;
                });
            }
        }

        return credentials;
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

    async cleanup(): Promise<number> {
        const startTime = Date.now();
        logMessage('info', '🧹 Starting cleanup...', this.metadata);

        // Clean up workflows
        for (const workflowId of this.createdWorkflows) {
            try {
                await this.client.deleteWorkflow(workflowId);
                // Verify deletion
                try {
                    const deletedWorkflow = await this.client.getWorkflow(workflowId);
                    if (deletedWorkflow) {
                        logMessage('warn', `⚠️  Workflow ${workflowId} still exists after deletion attempt`, this.metadata);
                    }
                } catch (error) {
                    // Expected - workflow should not be found
                }
                logMessage('info', `🗑️  Deleted workflow: ${workflowId}`, this.metadata);
            } catch (error) {
                logMessage('warn', `⚠️  Failed to delete workflow ${workflowId}: ${String(error)}`, this.metadata);
            }
        }

        // Clean up integrations
        for (const integrationId of this.createdIntegrations) {
            try {
                await this.client.deleteIntegration(integrationId);
                logMessage('info', `🗑️  Deleted integration: ${integrationId}`, this.metadata);
            } catch (error) {
                logMessage('warn', `⚠️  Failed to delete integration ${integrationId}: ${String(error)}`, this.metadata);
            }
        }

        const cleanupTime = Date.now() - startTime;
        logMessage('info', `✅ Cleanup completed in ${cleanupTime}ms`, this.metadata);
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

            const MAX_OUTER_RETRIES = 3;
            for (const testWorkflow of enabledWorkflows) {
                logMessage('info', `🔄 Starting workflow: ${testWorkflow.name}`, this.metadata);
                let lastResult: TestResult | undefined = undefined;
                let workflowSucceeded = false;
                let allBuildAttempts: BuildAttempt[] = [];
                let allExecutionAttempts: ExecutionAttempt[] = [];
                let succeededOnAttempt: number | undefined = undefined;

                for (let attempt = 1; attempt <= MAX_OUTER_RETRIES; attempt++) {
                    logMessage('info', `🔁 Attempt ${attempt}/${MAX_OUTER_RETRIES} for workflow: ${testWorkflow.name}`, this.metadata);
                    const result = await this.buildAndTestWorkflow(testWorkflow, 1); // Only 1 inner retry per outer attempt
                    allBuildAttempts = allBuildAttempts.concat(result.buildAttempts);
                    allExecutionAttempts = allExecutionAttempts.concat(result.executionAttempts);

                    // Success means both build AND execution succeeded
                    const attemptSucceeded = result.succeededOnAttempt && result.executionAttempts.length > 0 && result.executionAttempts.some(e => e.success);

                    if (attemptSucceeded) {
                        workflowSucceeded = true;
                        succeededOnAttempt = attempt;
                        lastResult = result;
                        logMessage('info', `✅ Workflow ${testWorkflow.name} succeeded on attempt ${attempt}`, this.metadata);
                        break;
                    } else {
                        logMessage('warn', `⚠️  Workflow ${testWorkflow.name} failed on attempt ${attempt}`, this.metadata);
                        lastResult = result;
                        if (attempt < MAX_OUTER_RETRIES) {
                            logMessage('info', `⏳ Retrying workflow ${testWorkflow.name} in 2 seconds...`, this.metadata);
                            await new Promise(res => setTimeout(res, 2000));
                        }
                    }
                }

                if (!workflowSucceeded) {
                    logMessage('error', `❌ Workflow ${testWorkflow.name} failed after ${MAX_OUTER_RETRIES} attempts`, this.metadata);
                }

                results.push({
                    ...lastResult!,
                    buildAttempts: allBuildAttempts,
                    executionAttempts: allExecutionAttempts,
                    succeededOnAttempt: workflowSucceeded ? succeededOnAttempt : undefined,
                });
            }

            // Generate error summaries for workflows that encountered errors
            logMessage('info', '🤖 Generating AI error analysis...', this.metadata);
            // Error summaries are now generated in buildAndTestWorkflow method

            // Generate suite-level analysis
            logMessage('info', '🔍 Generating suite-level analysis...', this.metadata);
            const { WorkflowReportGenerator } = await import('./workflow-report-generator.js');
            const analyzer = new WorkflowReportGenerator();
            const suiteAnalysis = await analyzer.generateSuiteAnalysis(
                results.map(r => ({
                    workflowName: r.workflowName,
                    succeeded: r.succeededOnAttempt !== undefined,
                    errorSummary: r.errorSummary,
                    complexity: r.complexity,
                    category: r.category
                }))
            );

            // Calculate metrics (cleanup will happen in finally block)
            const passed = results.filter(r => r.succeededOnAttempt !== undefined).length;
            const failed = results.length - passed;
            const averageBuildTime = results.reduce((sum, r) => sum + r.buildAttempts.reduce((sum, b) => sum + b.buildTime, 0), 0) / results.length;
            const averageExecutionTime = results.reduce((sum, r) => sum + r.executionAttempts.reduce((sum, e) => sum + e.executionTime, 0), 0) / results.length;

            // Calculate retry statistics
            const totalRetries = results.reduce((sum, r) => sum + (r.buildAttempts.length - 1), 0);
            const averageAttempts = results.reduce((sum, r) => sum + r.buildAttempts.length, 0) / results.length;
            const firstTrySuccesses = results.filter(r => r.succeededOnAttempt === 1).length;
            const maxAttemptsNeeded = Math.max(...results.map(r => r.buildAttempts.length));

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
                suiteAnalysis
            };

            this.logTestSummary(testSuite);
            return testSuite;

        } catch (error) {
            logMessage('error', `❌ Test suite failed: ${String(error)}`, this.metadata);
            throw error;
        } finally {
            // Always cleanup, regardless of success/failure
            try {
                const cleanupTime = await this.cleanup();
                logMessage('info', `✅ Final cleanup completed in ${cleanupTime}ms`, this.metadata);
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

        const detailedResults = testSuite.results.map(r => {
            let result = `${r.succeededOnAttempt !== undefined ? '✓' : '✗'} ${r.workflowName} (${r.complexity}/${r.category})
    Build Attempts: ${r.buildAttempts.length} | Times: [${r.buildAttempts.map(b => b.buildTime).join(', ')}] | Success: ${r.buildAttempts.some(b => b.success)}
    Execution Attempts: ${r.executionAttempts.length} | Times: [${r.executionAttempts.map(e => e.executionTime).join(', ')}] | Success: ${r.executionAttempts.some(e => e.success)}
    Overall Success: ${r.succeededOnAttempt !== undefined ? `Yes (attempt ${r.succeededOnAttempt})` : 'No'}`;

            if (r.outputKeys) result += `\n    Output: [${r.outputKeys.join(', ')}]`;
            if (r.expectedKeys) result += `\n    Expected: [${r.expectedKeys.join(', ')}]`;

            if (r.errorSummary) {
                result += `\n    🤖 AI Analysis: ${r.errorSummary}`;
            }

            if (r.executionReport) {
                const report = r.executionReport;
                result += `\n    📊 Performance Breakdown:`;
                result += `\n       Planning: ${report.planning.status} ${report.planning.issues.length > 0 ? `(${report.planning.issues.join(', ')})` : ''}`;
                result += `\n       API Understanding: ${report.apiUnderstanding.status} ${report.apiUnderstanding.issues.length > 0 ? `(${report.apiUnderstanding.issues.join(', ')})` : ''}`;
                result += `\n       Integration Config: ${report.integrationConfig.status} ${report.integrationConfig.issues.length > 0 ? `(${report.integrationConfig.issues.join(', ')})` : ''}`;
                result += `\n       Schema/Mapping: ${report.schemaMapping.status} ${report.schemaMapping.issues.length > 0 ? `(${report.schemaMapping.issues.join(', ')})` : ''}`;
                if (report.primaryFailureCategory) {
                    result += `\n       Primary Issue: ${report.primaryFailureCategory}`;
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

        logMessage('info', `\n=== TEST SUITE SUMMARY ===\nSuite: ${testSuite.suiteName}\nTimestamp: ${testSuite.timestamp.toISOString()}\nTotal Tests: ${testSuite.totalTests}\nPassed: ${passed}\nFailed: ${failed}\nSuccess Rate: ${((passed / testSuite.totalTests) * 100).toFixed(1)}%\n\n=== INTEGRATION SETUP ===\nTotal Setup Time: ${testSuite.integrationSetupTime}ms\nDocumentation Processing: ${testSuite.documentationProcessingTime}ms\nAvg Integration Setup: ${avgIntegrationSetup.toFixed(0)}ms\nAvg Documentation Processing: ${avgDocProcessing.toFixed(0)}ms\n${integrationBreakdown}\n\n=== BUILD TIME (SUCCESSFUL) ===\nAvg: ${avg(buildSuccessTimes).toFixed(0)}ms | Min: ${min(buildSuccessTimes)}ms | Max: ${max(buildSuccessTimes)}ms\n=== BUILD TIME (FAILED) ===\nAvg: ${avg(buildFailTimes).toFixed(0)}ms | Min: ${min(buildFailTimes)}ms | Max: ${max(buildFailTimes)}ms\n=== EXECUTION TIME (SUCCESSFUL) ===\nAvg: ${avg(execSuccessTimes).toFixed(0)}ms | Min: ${min(execSuccessTimes)}ms | Max: ${max(execSuccessTimes)}ms\n=== EXECUTION TIME (FAILED) ===\nAvg: ${avg(execFailTimes).toFixed(0)}ms | Min: ${min(execFailTimes)}ms | Max: ${max(execFailTimes)}ms\n\nCleanup Time: ${testSuite.cleanupTime}ms\n\n=== DETAILED RESULTS ===\n${detailedResults}${testSuite.suiteAnalysis ? `\n\n=== SUITE ANALYSIS ===\n🤖 ${testSuite.suiteAnalysis}` : ''}\n=========================`, this.metadata);
    }

    private loadCredentialsFromEnv(): void {
        // HubSpot CRM
        const hubspotConfig = this.INTEGRATION_CONFIGS.find(c => c.id === 'hubspot-crm');
        if (hubspotConfig && process.env.HUBSPOT_PRIVATE_APP_TOKEN) {
            hubspotConfig.credentials.private_app_token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
        }

        // Stripe
        const stripeConfig = this.INTEGRATION_CONFIGS.find(c => c.id === 'stripe-pay');
        if (stripeConfig) {
            if (process.env.STRIPE_SECRET_KEY) stripeConfig.credentials.secret_key = process.env.STRIPE_SECRET_KEY;
            if (process.env.STRIPE_PUBLISHABLE_KEY) stripeConfig.credentials.publishable_key = process.env.STRIPE_PUBLISHABLE_KEY;
        }

        // JIRA
        const jiraConfig = this.INTEGRATION_CONFIGS.find(c => c.id === 'jira-projects');
        if (jiraConfig && process.env.JIRA_API_TOKEN) {
            jiraConfig.credentials.api_token = process.env.JIRA_API_TOKEN;
        }

        // Attio CRM
        const attioConfig = this.INTEGRATION_CONFIGS.find(c => c.id === 'attio-crm');
        if (attioConfig && process.env.ATTIO_API_TOKEN) {
            attioConfig.credentials.api_token = process.env.ATTIO_API_TOKEN;
        }

        // Supabase
        const supabaseConfig = this.INTEGRATION_CONFIGS.find(c => c.id === 'supabase-db');
        if (supabaseConfig) {
            if (process.env.SUPABASE_PASSWORD) supabaseConfig.credentials.password = process.env.SUPABASE_PASSWORD;
            if (process.env.SUPABASE_PUBLIC_API_KEY) supabaseConfig.credentials.public_api_key = process.env.SUPABASE_PUBLIC_API_KEY;
            if (process.env.SUPABASE_SECRET_KEY) supabaseConfig.credentials.secret_key = process.env.SUPABASE_SECRET_KEY;
        }

        // Twilio
        const twilioConfig = this.INTEGRATION_CONFIGS.find(c => c.id === 'twilio-comm');
        if (twilioConfig) {
            if (process.env.TWILIO_ACCOUNT_SID) twilioConfig.credentials.account_sid = process.env.TWILIO_ACCOUNT_SID;
            if (process.env.TWILIO_SID) twilioConfig.credentials.sid = process.env.TWILIO_SID;
            if (process.env.TWILIO_TEST_AUTH_TOKEN) twilioConfig.credentials.test_auth_token = process.env.TWILIO_TEST_AUTH_TOKEN;
            if (process.env.TWILIO_SECRET_KEY) twilioConfig.credentials.secret_key = process.env.TWILIO_SECRET_KEY;
        }

        // SendGrid
        const sendgridConfig = this.INTEGRATION_CONFIGS.find(c => c.id === 'sendgrid-email');
        if (sendgridConfig && process.env.SENDGRID_API_KEY) {
            sendgridConfig.credentials.api_key = process.env.SENDGRID_API_KEY;
        }
    }

    // Static method for easy script execution
    static async runFullTestSuite(endpoint: string, apiKey: string): Promise<TestSuite> {
        const framework = new IntegrationTestingFramework(endpoint, apiKey);
        return await framework.runTestSuite();
    }
}

export { TestResult, TestSuite };
