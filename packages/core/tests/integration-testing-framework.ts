import { Workflow, WorkflowResult } from '@superglue/client';
import { generateUniqueId, waitForIntegrationProcessing } from '@superglue/shared/utils';
import fs from 'fs';
import path from 'path';
import { toJsonSchema } from '../external/json-schema.js';
import { logMessage } from '../utils/logs.js';

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
        attemptsPerWorkflow?: number; // Number of times to build/execute each workflow
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
    actualData?: any;
    // New fields for tracking multiple attempts
    totalAttempts: number;
    successfulAttempts: number;
    successRate: number; // Success rate for this specific workflow
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
    // New metrics
    globalMetrics?: {
        totalWorkflowAttempts: number;
        totalSuccessfulAttempts: number;
        globalSuccessRate: number;
        workflowLevelSuccessRate: number;
        averageWorkflowSuccessRate: number;
    };
}

export class IntegrationTestingFramework {
    private datastore: DataStore;
    private createdIntegrations: string[] = [];
    private createdWorkflows: string[] = [];
    private config: TestConfiguration;
    private metadata = { orgId: 'integration-test', userId: 'system' };
    private testDir = './.test-integration-data';

    constructor(configPath?: string) {
        // Validate environment variables are loaded
        this.validateEnvironment();

        // Create a test-specific FileStore instance
        this.datastore = new FileStore(this.testDir);
        this.config = this.loadConfiguration(configPath);
        this.loadCredentialsFromEnv();

        // Validate workflow configuration
        this.validateWorkflowConfiguration();
    }

    private validateEnvironment(): void {
        // Check if LLM provider is configured
        if (!process.env.LLM_PROVIDER) {
            process.env.LLM_PROVIDER = 'OPENAI'; // Default to OpenAI
        }

        // Validate API keys based on provider
        if (process.env.LLM_PROVIDER === 'OPENAI' && !process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not set. Please ensure environment variables are loaded before running tests.');
        }

        if (process.env.LLM_PROVIDER === 'GEMINI' && !process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set. Please ensure environment variables are loaded before running tests.');
        }

        logMessage('info', `🔐 Environment validated. LLM Provider: ${process.env.LLM_PROVIDER}`, this.metadata);
    }

    private validateWorkflowConfiguration(): void {
        const enabledWorkflows = this.getEnabledWorkflows();
        const enabledIntegrations = this.getEnabledIntegrations();
        const enabledIntegrationIds = new Set(enabledIntegrations.map(i => i.id));

        const validationErrors: string[] = [];

        for (const workflow of enabledWorkflows) {
            const missingIntegrations = workflow.integrationIds.filter(id => !enabledIntegrationIds.has(id));

            if (missingIntegrations.length > 0) {
                validationErrors.push(
                    `Workflow "${workflow.name}" (${workflow.id}) requires integrations that are not enabled: ${missingIntegrations.join(', ')}`
                );
            }
        }

        if (validationErrors.length > 0) {
            const errorMessage = `\n❌ Workflow configuration validation failed:\n${validationErrors.map(e => `  - ${e}`).join('\n')}\n\nPlease update your integration-test-config.json to enable the required integrations or disable the affected workflows.`;
            logMessage('error', errorMessage, this.metadata);
            throw new Error(errorMessage);
        }

        logMessage('info', `🔍 Workflow configuration validated. ${enabledWorkflows.length} workflows ready with all required integrations.`, this.metadata);
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
            id: 'jira-projects',
            name: 'JIRA Projects',
            urlHost: 'https://superglue-team-test.atlassian.net',
            urlPath: '/rest/api/3',
            documentationUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3',
            credentials: {
                email: 'michael@superglue.ai', // Add your Atlassian account email here
                api_token: ''
            },
            description: 'JIRA project management API'
        },
        {
            id: 'attio-crm',
            name: 'Attio CRM',
            urlHost: 'https://api.attio.com/v2',
            urlPath: '',
            documentationUrl: 'https://api.attio.com/openapi/api',
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
            instruction: 'Get all HubSpot contacts created in the 30 days after the payload date, filter out contacts working at the companies in the payload company list, and update the lead status of remaining contacts to In Progress',
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
            instruction: 'Get all lifecycle status: marketing qualified leads from HubSpot created in the last 100 days after the payload date, create an email saying "Hello [name]", and send them a welcome email via my SendGrid using sender michael@superglue.ai',
            integrationIds: ['hubspot-crm', 'sendgrid-email'],
            payload: { date: '2025-06-01' },
            complexityLevel: 'high',
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

                // Save integration to datastore
                const result = await this.datastore.upsertIntegration(integration.id, integrationData, this.metadata.orgId);

                this.createdIntegrations.push(integration.id);
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

        // Wait for documentation processing to complete if configured
        let documentationProcessingTime = 0;
        if (this.config?.testSuite?.waitForDocumentation && pendingIntegrations.length > 0) {
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
                    120000 // 120 seconds timeout (doubled from 60)
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
        let workflow: Workflow | undefined;
        let outputKeys: string[] | undefined;
        let dataQuality: 'pass' | 'fail' | 'unknown' = 'fail';
        let actualData: any | undefined; // Store the actual workflow data

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

            logMessage('info', `📝 Building workflow ${testWorkflow.name} (attempt ${attempt}/${maxRetries})...`, this.metadata);

            try {
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

                // Build workflow using WorkflowBuilder directly
                const { WorkflowBuilder } = await import('../workflow/workflow-builder.js');
                const builder = new WorkflowBuilder(
                    testWorkflow.instruction,
                    integrations,
                    testWorkflow.payload || {},
                    {}, // responseSchema
                    this.metadata
                );

                currentWorkflow = await builder.build();

                // Generate unique ID for the workflow to prevent collisions
                currentWorkflow.id = await generateUniqueId({
                    baseId: currentWorkflow.id,
                    exists: async (id) => !!(await this.datastore.getWorkflow(id, this.metadata.orgId))
                });

                buildSuccess = true;
                logMessage('info', `🔨 Build successful for ${testWorkflow.name} in ${Date.now() - buildStart}ms`, this.metadata);
            } catch (error) {
                buildError = String(error);

                // Log full error details
                logMessage('error', `❌ Build failed for ${testWorkflow.name}: ${buildError}`, this.metadata);

                // Log stack trace if available
                if (error instanceof Error && error.stack) {
                    logMessage('error', `Stack trace for ${testWorkflow.name} build failure:\n${error.stack}`, this.metadata);
                }

                // Log additional context
                logMessage('error', `Build context - Workflow: ${testWorkflow.id}, Integrations: ${testWorkflow.integrationIds.join(', ')}`, this.metadata);
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
                    // Get integrations again for executor (they might have been updated)
                    const integrations = await Promise.all(
                        testWorkflow.integrationIds.map(async (id) => {
                            const integration = await this.datastore.getIntegration(id, this.metadata.orgId);
                            if (!integration) {
                                throw new Error(`Integration not found: ${id}`);
                            }
                            return integration;
                        })
                    );

                    // Execute workflow using WorkflowExecutor directly
                    const { WorkflowExecutor } = await import('../workflow/workflow-executor.js');
                    const executor = new WorkflowExecutor(
                        currentWorkflow,
                        this.metadata,
                        integrations
                    );

                    const workflowResult = await executor.execute(
                        testWorkflow.payload || {},
                        this.gatherCredentials(testWorkflow.integrationIds),
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
                        logMessage('warn', `❌ Execution failed for ${testWorkflow.name}: Workflow returned success=false`, this.metadata);
                    }
                } catch (error) {
                    execError = String(error);

                    // Log full error details
                    logMessage('error', `❌ Execution failed for ${testWorkflow.name}: ${execError}`, this.metadata);

                    // Log stack trace if available
                    if (error instanceof Error && error.stack) {
                        logMessage('error', `Stack trace for ${testWorkflow.name} execution failure:\n${error.stack}`, this.metadata);
                    }

                    // Log workflow details
                    if (currentWorkflow) {
                        logMessage('error', `Execution context - Workflow ID: ${currentWorkflow.id}, Steps: ${currentWorkflow.steps.length}`, this.metadata);
                    }
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
                expectedKeys: testWorkflow.expectedKeys,
                actualData
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
                expectedKeys: testWorkflow.expectedKeys,
                actualData
            });
        } catch (error) {
            logMessage('warn', `Failed to generate workflow analysis for ${testWorkflow.name}: ${error}`, this.metadata);
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
            // These will be properly set in runTestSuite after all attempts
            totalAttempts: 1,
            successfulAttempts: succeededOnAttempt ? 1 : 0,
            successRate: succeededOnAttempt ? 1 : 0
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

    /**
     * Generate a compact schema representation with example values
     */
    private generateDataSchema(data: any): any {
        // Use the existing toJsonSchema utility
        const schema = toJsonSchema(data, { arrays: { mode: 'first' } });

        // Add examples for arrays
        if (Array.isArray(data) && data.length > 0) {
            return {
                type: 'array',
                length: data.length,
                itemSchema: schema.items,
                examples: data.slice(0, 2) // Show first 2 items as examples
            };
        }

        // For objects, add the schema and show sample values
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            const keys = Object.keys(data);
            const sampleData: any = {};

            // Include up to 5 sample fields
            keys.slice(0, 5).forEach(key => {
                const value = data[key];
                if (typeof value === 'string' && value.length > 50) {
                    sampleData[key] = value.substring(0, 50) + '...';
                } else if (Array.isArray(value)) {
                    sampleData[key] = `Array(${value.length})`;
                } else if (value && typeof value === 'object') {
                    sampleData[key] = '{...}';
                } else {
                    sampleData[key] = value;
                }
            });

            if (keys.length > 5) {
                sampleData['...'] = `${keys.length - 5} more fields`;
            }

            return {
                schema: schema,
                sample: sampleData
            };
        }

        // For primitive values, just return the schema
        return schema;
    }

    async cleanup(): Promise<number> {
        const startTime = Date.now();
        logMessage('info', '🧹 Starting cleanup...', this.metadata);

        // Clean up workflows
        for (const workflowId of this.createdWorkflows) {
            try {
                await this.datastore.deleteWorkflow(workflowId, this.metadata.orgId);
                // Verify deletion
                try {
                    const deletedWorkflow = await this.datastore.getWorkflow(workflowId, this.metadata.orgId);
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
                await this.datastore.deleteIntegration(integrationId, this.metadata.orgId);
                logMessage('info', `🗑️  Deleted integration: ${integrationId}`, this.metadata);
            } catch (error) {
                logMessage('warn', `⚠️  Failed to delete integration ${integrationId}: ${String(error)}`, this.metadata);
            }
        }

        // Clean up test directory
        try {
            // Clean up all runs
            await this.datastore.deleteAllRuns(this.metadata.orgId);

            // Remove the test directory if it exists
            const fs = await import('fs');
            if (fs.existsSync(this.testDir)) {
                fs.rmSync(this.testDir, { recursive: true, force: true });
                logMessage('info', `🗑️  Removed test directory: ${this.testDir}`, this.metadata);
            }
        } catch (error) {
            logMessage('warn', `⚠️  Failed to clean up test directory: ${String(error)}`, this.metadata);
        }

        const cleanupTime = Date.now() - startTime;
        logMessage('info', `🧹 Cleanup completed in ${cleanupTime}ms`, this.metadata);
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

                // Run the workflow the configured number of times
                for (let attempt = 1; attempt <= ATTEMPTS_PER_WORKFLOW; attempt++) {
                    logMessage('info', `🔁 Attempt ${attempt}/${ATTEMPTS_PER_WORKFLOW} for workflow: ${testWorkflow.name}`, this.metadata);

                    const result = await this.buildAndTestWorkflow(testWorkflow, 1); // Only 1 inner retry per build attempt
                    allBuildAttempts = allBuildAttempts.concat(result.buildAttempts);
                    allExecutionAttempts = allExecutionAttempts.concat(result.executionAttempts);

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
                    // New fields
                    totalAttempts: ATTEMPTS_PER_WORKFLOW,
                    successfulAttempts,
                    successRate: successRate / 100
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
                suiteAnalysis,
                globalMetrics: {
                    totalWorkflowAttempts,
                    totalSuccessfulAttempts,
                    globalSuccessRate,
                    workflowLevelSuccessRate,
                    averageWorkflowSuccessRate
                }
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
                const schemaStr = JSON.stringify(schema, null, 2);
                result += `\n    Data Schema: ${schemaStr}`;
            }

            if (r.errorSummary) {
                result += `\n    🤖 AI Analysis: ${r.errorSummary}`;
            }

            if (r.executionReport) {
                const execReport = r.executionReport;
                result += `\n    📊 Performance Breakdown:`;
                if (execReport.planningIssues?.length > 0) {
                    result += `\n       Planning Issues: ${execReport.planningIssues.join('; ')}`;
                }
                if (execReport.apiIssues?.length > 0) {
                    result += `\n       API Issues: ${execReport.apiIssues.join('; ')}`;
                }
                if (execReport.integrationIssues?.length > 0) {
                    result += `\n       Integration Issues: ${execReport.integrationIssues.join('; ')}`;
                }
                if (execReport.dataIssues?.length > 0) {
                    result += `\n       Data Issues: ${execReport.dataIssues.join('; ')}`;
                }
                if (execReport.primaryFailureCategory) {
                    result += `\n       Primary Issue: ${execReport.primaryFailureCategory}`;
                }
                if (execReport.recommendations?.length > 0) {
                    result += `\n       Recommendations: ${execReport.recommendations.join('; ')}`;
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

        logMessage('info', `\n=== TEST SUITE SUMMARY ===\nSuite: ${testSuite.suiteName}\nTimestamp: ${testSuite.timestamp.toISOString()}\nTotal Tests: ${testSuite.totalTests}\nPassed: ${passed}\nFailed: ${failed}\nSuccess Rate: ${((passed / testSuite.totalTests) * 100).toFixed(1)}%${globalMetricsStr}\n\n=== INTEGRATION SETUP ===\nTotal Setup Time: ${testSuite.integrationSetupTime}ms\nDocumentation Processing: ${testSuite.documentationProcessingTime}ms\nAvg Integration Setup: ${avgIntegrationSetup.toFixed(0)}ms\nAvg Documentation Processing: ${avgDocProcessing.toFixed(0)}ms\n${integrationBreakdown}\n\n=== BUILD TIME (SUCCESSFUL) ===\nAvg: ${avg(buildSuccessTimes).toFixed(0)}ms | Min: ${min(buildSuccessTimes)}ms | Max: ${max(buildSuccessTimes)}ms\n=== BUILD TIME (FAILED) ===\nAvg: ${avg(buildFailTimes).toFixed(0)}ms | Min: ${min(buildFailTimes)}ms | Max: ${max(buildFailTimes)}ms\n=== EXECUTION TIME (SUCCESSFUL) ===\nAvg: ${avg(execSuccessTimes).toFixed(0)}ms | Min: ${min(execSuccessTimes)}ms | Max: ${max(execSuccessTimes)}ms\n=== EXECUTION TIME (FAILED) ===\nAvg: ${avg(execFailTimes).toFixed(0)}ms | Min: ${min(execFailTimes)}ms | Max: ${max(execFailTimes)}ms\n\nCleanup Time: ${testSuite.cleanupTime}ms\n\n=== DETAILED RESULTS ===\n${detailedResults}${testSuite.suiteAnalysis ? `\n\n=== SUITE ANALYSIS ===\n🤖 ${testSuite.suiteAnalysis}` : ''}\n=========================`, this.metadata);
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
                averageAttemptsRequired: testSuite.retryStatistics.averageAttempts.toFixed(2),
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
            suiteAnalysis: testSuite.suiteAnalysis
        };

        try {
            await fs.promises.writeFile(jsonReportPath, JSON.stringify(jsonReport, null, 2));
            logMessage('info', `📄 JSON report saved to: ${jsonReportPath}`, this.metadata);
        } catch (error) {
            logMessage('error', `Failed to save JSON report: ${error}`, this.metadata);
        }

        // Save Markdown summary for easy reading
        const markdownReportPath = path.join(reportDir, `integration-test-${timestamp}.md`);
        const markdownReport = this.generateMarkdownReport(testSuite, jsonReport);

        try {
            await fs.promises.writeFile(markdownReportPath, markdownReport);
            logMessage('info', `📄 Markdown report saved to: ${markdownReportPath}`, this.metadata);
        } catch (error) {
            logMessage('error', `Failed to save Markdown report: ${error}`, this.metadata);
        }

        // Save latest files for easy access (copy instead of symlink for better compatibility)
        try {
            const latestJsonPath = path.join(reportDir, 'latest.json');
            const latestMarkdownPath = path.join(reportDir, 'latest.md');

            // Copy the reports to latest.json and latest.md
            await fs.promises.copyFile(jsonReportPath, latestJsonPath);
            await fs.promises.copyFile(markdownReportPath, latestMarkdownPath);

            logMessage('info', `📄 Latest reports available at: ${reportDir}/latest.{json,md}`, this.metadata);
        } catch (error) {
            logMessage('warn', `Failed to create latest report files: ${error}`, this.metadata);
        }
    }

    /**
     * Calculate timing statistics (min, max, avg, p50, p95)
     */
    private calculateTimingStats(times: number[]): Record<string, string> {
        if (times.length === 0) {
            return { min: '0ms', max: '0ms', avg: '0ms', p50: '0ms', p95: '0ms' };
        }

        const sorted = [...times].sort((a, b) => a - b);
        const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
        const p50Index = Math.floor(sorted.length * 0.5);
        const p95Index = Math.floor(sorted.length * 0.95);

        return {
            min: `${Math.min(...times)}ms`,
            max: `${Math.max(...times)}ms`,
            avg: `${avg.toFixed(0)}ms`,
            p50: `${sorted[p50Index]}ms`,
            p95: `${sorted[p95Index] || sorted[sorted.length - 1]}ms`
        };
    }

    /**
     * Generate a markdown report for easy reading
     */
    private generateMarkdownReport(testSuite: TestSuite, jsonReport: any): string {
        const { keyMetrics, performanceBreakdown } = jsonReport;

        let report = `# Integration Test Report

**Suite:** ${testSuite.suiteName}  
**Date:** ${testSuite.timestamp.toISOString()}  
**Environment:** ${process.env.LLM_PROVIDER || 'OPENAI'} / ${process.env.DATA_STORE_TYPE || 'default'}

## 🎯 Key Metrics

| Metric | Value |
|--------|-------|
| **Overall Success Rate** | ${keyMetrics.overallSuccessRate} |
| **Average Workflow Build Time** | ${keyMetrics.averageWorkflowBuildTime} |
| **Average Workflow Execution Time** | ${keyMetrics.averageWorkflowExecutionTime} |
| **Average Attempts Required** | ${keyMetrics.averageAttemptsRequired} |
| **First Try Success Rate** | ${keyMetrics.firstTrySuccessRate} |
| **Max Attempts Needed** | ${keyMetrics.maxAttemptsNeeded} |

## 📊 Performance Breakdown

### Integration Setup
- **Total Setup Time:** ${performanceBreakdown.integrationSetup.totalTime}
- **Documentation Processing:** ${performanceBreakdown.integrationSetup.documentationProcessing}
- **Average per Integration:** ${performanceBreakdown.integrationSetup.averagePerIntegration}

### Workflow Timing Distribution

**Build Times (Successful)**
- Min: ${performanceBreakdown.workflowTiming.buildTimes.min}
- Max: ${performanceBreakdown.workflowTiming.buildTimes.max}
- Average: ${performanceBreakdown.workflowTiming.buildTimes.avg}
- P50: ${performanceBreakdown.workflowTiming.buildTimes.p50}
- P95: ${performanceBreakdown.workflowTiming.buildTimes.p95}

**Execution Times (Successful)**
- Min: ${performanceBreakdown.workflowTiming.executionTimes.min}
- Max: ${performanceBreakdown.workflowTiming.executionTimes.max}
- Average: ${performanceBreakdown.workflowTiming.executionTimes.avg}
- P50: ${performanceBreakdown.workflowTiming.executionTimes.p50}
- P95: ${performanceBreakdown.workflowTiming.executionTimes.p95}

## 📋 Workflow Results Summary

| Workflow | Success | Attempts | Build Time | Exec Time | Category | Complexity |
|----------|---------|----------|------------|-----------|----------|------------|
`;

        // Add workflow results table
        for (const result of jsonReport.workflowResults) {
            const buildTime = testSuite.results.find(r => r.workflowId === result.workflowId)?.buildAttempts.reduce((sum, b) => sum + b.buildTime, 0) || 0;
            const execTime = testSuite.results.find(r => r.workflowId === result.workflowId)?.executionAttempts.reduce((sum, e) => sum + e.executionTime, 0) || 0;

            report += `| ${result.workflowName} | ${result.success ? '✅' : '❌'} | ${result.buildAttempts}/${result.executionAttempts} | ${buildTime}ms | ${execTime}ms | ${result.category} | ${result.complexity} |\n`;
        }

        // Add failed workflow details
        const failedWorkflows = jsonReport.workflowResults.filter((r: any) => !r.success);
        if (failedWorkflows.length > 0) {
            report += `\n## ❌ Failed Workflows Analysis\n\n`;

            for (const failed of failedWorkflows) {
                report += `### ${failed.workflowName}\n\n`;

                if (failed.errorSummary) {
                    report += `**AI Analysis:** ${failed.errorSummary}\n\n`;
                }

                if (failed.executionReport) {
                    const execReport = failed.executionReport;
                    if (execReport.planningIssues?.length > 0) {
                        report += `**Planning Issues:**\n${execReport.planningIssues.map((i: string) => `- ${i}`).join('\n')}\n\n`;
                    }
                    if (execReport.apiIssues?.length > 0) {
                        report += `**API Issues:**\n${execReport.apiIssues.map((i: string) => `- ${i}`).join('\n')}\n\n`;
                    }
                    if (execReport.integrationIssues?.length > 0) {
                        report += `**Integration Issues:**\n${execReport.integrationIssues.map((i: string) => `- ${i}`).join('\n')}\n\n`;
                    }
                    if (execReport.recommendations?.length > 0) {
                        report += `**Recommendations:**\n${execReport.recommendations.map((r: string) => `- ${r}`).join('\n')}\n\n`;
                    }
                }
            }
        }

        // Add suite analysis
        if (testSuite.suiteAnalysis) {
            report += `\n## 🤖 Suite Analysis\n\n${testSuite.suiteAnalysis}\n`;
        }

        // Add integration setup details
        report += `\n## 🔧 Integration Setup Details\n\n`;
        report += `| Integration | Success | Setup Time | Doc Processing |\n`;
        report += `|-------------|---------|------------|----------------|\n`;

        for (const integration of testSuite.integrationSetupResults) {
            report += `| ${integration.name} | ${integration.success ? '✅' : '❌'} | ${integration.setupTime}ms | ${integration.documentationProcessingTime ? integration.documentationProcessingTime + 'ms' : 'N/A'} |\n`;
        }

        return report;
    }

    // Static method for easy script execution
    static async runFullTestSuite(configPath?: string): Promise<TestSuite> {
        const framework = new IntegrationTestingFramework(configPath);
        return await framework.runTestSuite();
    }
}

export { TestResult, TestSuite };
