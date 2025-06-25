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

async function main() {
    const args = process.argv.slice(2);
    const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1];
    const endpoint = process.env.GRAPHQL_ENDPOINT || 'http://localhost:3000/graphql';
    const apiKey = process.env.AUTH_TOKEN;

    if (!apiKey) {
        console.error('ERROR: AUTH_TOKEN environment variable is required');
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

    const missingCredentials = requiredCredentials.filter(cred => !process.env[cred]);
    if (missingCredentials.length > 0) {
        console.warn(`WARNING: Missing credentials: ${missingCredentials.join(', ')}`);
        console.warn('Some integrations may fail. Set these environment variables for full testing.');
    }

    try {
        logMessage('info', '🚀 Starting Integration Testing Framework', { framework: 'integration-test' });
        logMessage('info', `Using endpoint: ${endpoint}`, { framework: 'integration-test' });

        if (configPath) {
            logMessage('info', `Using config file: ${configPath}`, { framework: 'integration-test' });
        }

        const serverConfig = process.env.AUTOSTART_SERVER === 'true' ? { autoStart: true } : { autoStart: false };
        const framework = new IntegrationTestingFramework(endpoint, apiKey, configPath, serverConfig);
        const testSuite = await framework.runTestSuite();

        // Save results to file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsPath = path.join(process.cwd(), `integration-test-results-${timestamp}.json`);

        fs.writeFileSync(resultsPath, JSON.stringify(testSuite, null, 2));
        logMessage('info', `Test results saved to: ${resultsPath}`, { framework: 'integration-test' });

        // Print summary
        console.log('\n' + '='.repeat(50));
        console.log('INTEGRATION TEST SUMMARY');
        console.log('='.repeat(50));
        console.log(`✅ Passed: ${testSuite.passed}/${testSuite.totalTests}`);
        console.log(`❌ Failed: ${testSuite.failed}/${testSuite.totalTests}`);
        console.log(`📈 Success Rate: ${((testSuite.passed / testSuite.totalTests) * 100).toFixed(1)}%`);
        console.log(`⏱️  Total Time: ${Date.now() - testSuite.timestamp.getTime()}ms`);
        console.log(`🔧 Setup Time: ${testSuite.integrationSetupTime}ms`);
        console.log(`🧹 Cleanup Time: ${testSuite.cleanupTime}ms`);

        if (testSuite.failed > 0) {
            console.log('\nFAILED TESTS:');
            testSuite.results
                .filter(r => !r.success)
                .forEach(r => console.log(`  - ${r.workflowName}: ${r.error}`));
        }

        process.exit(testSuite.failed > 0 ? 1 : 0);

    } catch (error) {
        logMessage('error', `Integration test framework failed: ${String(error)}`, { framework: 'integration-test' });
        console.error('❌ Integration tests failed:', error);
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { main };
