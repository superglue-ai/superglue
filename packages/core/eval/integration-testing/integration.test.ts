import { config } from 'dotenv';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { IntegrationTestingFramework } from './integration-testing-framework.js';
const envPath = process.cwd().endsWith('packages/core')
    ? path.join(process.cwd(), '../../.env')
    : path.join(process.cwd(), '.env');
config({ path: envPath });
process.env.DATA_STORE_TYPE = 'FILE';
process.env.DATA_STORE_FILE_PATH = './tests/test-data';

describe('Integration Tests', () => {
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

    afterAll(async () => {
        // Ensure all logs are flushed before test runner exits
        await new Promise(resolve => setTimeout(resolve, 500));
    });
}); 