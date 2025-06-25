#!/usr/bin/env ts-node

import { logMessage } from '../utils/logs.js';
import { IntegrationTestingFramework } from './integration-testing-framework.js';

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';
const API_KEY = process.env.AUTH_TOKEN || 'local-development-key';

async function main() {
    logMessage('info', 'Starting Integration Test Suite...', { script: 'run-integration-tests' });

    try {
        const testSuite = await IntegrationTestingFramework.runFullTestSuite(
            GRAPHQL_ENDPOINT,
            API_KEY
        );

        // Save results to file for analysis
        const resultsFileName = `integration-test-results-${Date.now()}.json`;
        const fs = await import('fs/promises');
        await fs.writeFile(resultsFileName, JSON.stringify(testSuite, null, 2));

        logMessage('info', `Test results saved to: ${resultsFileName}`, { script: 'run-integration-tests' });

        // Exit with appropriate code
        const exitCode = testSuite.failed > 0 ? 1 : 0;
        process.exit(exitCode);

    } catch (error) {
        logMessage('error', `Integration test suite failed: ${String(error)}`, { script: 'run-integration-tests' });
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { main };
