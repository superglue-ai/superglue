#!/usr/bin/env node

import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { logMessage } from '../utils/logs.js';
import { IntegrationTestingFramework } from './integration-testing-framework.js';

// Load environment variables from project root
const envPath = process.cwd().endsWith('packages/core')
    ? path.join(process.cwd(), '../../.env')
    : path.join(process.cwd(), '.env');
config({ path: envPath });

const TEST_ENDPOINT = 'http://localhost:3000/graphql';

async function main() {
    // Set integration test mode to reduce server logging noise
    process.env.INTEGRATION_TEST_MODE = 'true';

    const args = process.argv.slice(2);
    const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1];
    const endpoint = process.env.GRAPHQL_ENDPOINT || TEST_ENDPOINT;
    const apiKey = process.env.AUTH_TOKEN;

    if (!apiKey) {
        logMessage('error', 'ERROR: AUTH_TOKEN environment variable is required');
        process.exit(1);
    }

    // Check for credentials
    const requiredCredentials = [
        'HUBSPOT_PRIVATE_APP_TOKEN',
        'STRIPE_SECRET_KEY',
        'JIRA_API_TOKEN',
        'ATTIO_API_TOKEN',
        'SUPABASE_PASSWORD',
        'TWILIO_ACCOUNT_SID',
        'SENDGRID_API_KEY'
    ];

    // Check for LLM provider credentials (needed for WorkflowReportGenerator AI analysis)
    const llmProvider = process.env.LLM_PROVIDER?.toUpperCase() || 'OPENAI';
    const llmCredentialsCheck = llmProvider === 'GEMINI'
        ? !process.env.GEMINI_API_KEY
        : !process.env.OPENAI_API_KEY;

    if (llmCredentialsCheck) {
        const missingKey = llmProvider === 'GEMINI' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
        logMessage('error', `ERROR: ${missingKey} environment variable is required for AI analysis in WorkflowReportGenerator`);
        logMessage('error', `Current LLM_PROVIDER: ${llmProvider}`);
        logMessage('error', 'Set the appropriate API key or the workflow execution reports will use fallback mode.');
        // Don't exit - allow tests to run but warn that AI analysis will be limited
    }

    const missingCredentials = requiredCredentials.filter(cred => !process.env[cred]);
    if (missingCredentials.length > 0) {
        logMessage('warn', `WARNING: Missing credentials: ${missingCredentials.join(', ')}`);
        logMessage('warn', 'Some integrations may fail. Set these environment variables for full testing.');
    }

    try {
        logMessage('info', '🚀 Starting Integration Testing Framework', { framework: 'integration-test' });
        logMessage('info', `Using endpoint: ${endpoint}`, { framework: 'integration-test' });
        logMessage('info', `TEST_ENDPOINT: ${TEST_ENDPOINT}`, { framework: 'integration-test' });
        logMessage('info', `GRAPHQL_ENDPOINT env: ${process.env.GRAPHQL_ENDPOINT}`, { framework: 'integration-test' });

        if (configPath) {
            logMessage('info', `Using config file: ${configPath}`, { framework: 'integration-test' });
        }

        const framework = new IntegrationTestingFramework(endpoint, apiKey, configPath);
        const testSuite = await framework.runTestSuite();

        // Save results to file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsPath = path.join(process.cwd(), `integration-test-results-${timestamp}.json`);

        fs.writeFileSync(resultsPath, JSON.stringify(testSuite, null, 2));
        logMessage('info', `Test results saved to: ${resultsPath}`);

        // Print summary
        logMessage('info', '\n' + '='.repeat(50));
        logMessage('info', 'INTEGRATION TEST SUMMARY');
        logMessage('info', '='.repeat(50));
        const passed = testSuite.results.filter(r => r.succeededOnAttempt !== undefined).length;
        const failed = testSuite.totalTests - passed;
        logMessage('info', `✅ Passed: ${passed}/${testSuite.totalTests}`);
        logMessage('info', `❌ Failed: ${failed}/${testSuite.totalTests}`);
        logMessage('info', `📈 Success Rate: ${((passed / testSuite.totalTests) * 100).toFixed(1)}%`);
        logMessage('info', `⏱️  Total Time: ${Date.now() - new Date(testSuite.timestamp).getTime()}ms`);
        logMessage('info', `🔧 Setup Time: ${testSuite.integrationSetupTime}ms`);
        logMessage('info', `🧹 Cleanup Time: ${testSuite.cleanupTime}ms`);

        if (failed > 0) {
            logMessage('info', '\nFAILED TESTS:');
            const failedResults = testSuite.results.filter(r => r.succeededOnAttempt === undefined);
            failedResults.forEach(r => {
                const lastError = r.executionAttempts.length > 0
                    ? r.executionAttempts[r.executionAttempts.length - 1].error
                    : r.buildAttempts[r.buildAttempts.length - 1]?.error;
                const errorMsg = lastError ? lastError.substring(0, 100) + (lastError.length > 100 ? '...' : '') : 'Unknown error';
                logMessage('info', `  - ${r.workflowName}: ${errorMsg}`);
            });
        }

        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        logMessage('error', '❌ Integration tests failed: ' + String(error));
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        logMessage('error', String(error));
        process.exit(1);
    });
}

export { main };
