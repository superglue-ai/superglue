import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IntegrationTestingFramework } from './integration-testing-framework.js';

describe('Integration Tests', () => {
    let originalDataStoreType: string | undefined;
    let originalDataStorePath: string | undefined;

    beforeAll(async () => {
        // Load environment variables from .env file
        const envPath = process.cwd().endsWith('packages/core')
            ? path.join(process.cwd(), '../../.env')
            : path.join(process.cwd(), '.env');
        require('dotenv').config({ path: envPath });

        // Save original environment variables
        originalDataStoreType = process.env.DATA_STORE_TYPE;
        originalDataStorePath = process.env.DATA_STORE_FILE_PATH;

        // Set test-specific environment variables
        process.env.DATA_STORE_TYPE = 'FILE';
        process.env.DATA_STORE_FILE_PATH = './.test-integration-data';
    });

    afterAll(async () => {
        // Restore original environment variables
        if (originalDataStoreType !== undefined) {
            process.env.DATA_STORE_TYPE = originalDataStoreType;
        } else {
            delete process.env.DATA_STORE_TYPE;
        }

        if (originalDataStorePath !== undefined) {
            process.env.DATA_STORE_FILE_PATH = originalDataStorePath;
        } else {
            delete process.env.DATA_STORE_FILE_PATH;
        }

        // Ensure all logs are flushed before test runner exits
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    it('should run integration tests successfully', async () => {
        const framework = await IntegrationTestingFramework.create(
            './eval/integration-testing/integration-test-config.json'
        );

        const results = await framework.runTestSuite();

        expect(results).toBeDefined();
        expect(results.totalTests).toBeGreaterThan(0);

        // Give time for logs to flush
        await new Promise(resolve => setTimeout(resolve, 1000));
    });
}); 