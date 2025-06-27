import { config } from 'dotenv';
import path from 'path';
const envPath = process.cwd().endsWith('packages/core')
    ? path.join(process.cwd(), '../../.env')
    : path.join(process.cwd(), '.env');
config({ path: envPath });
process.env.DATA_STORE_TYPE = 'FILE';
process.env.DATA_STORE_FILE_PATH = './tests/test-data';
import { describe, expect, it } from 'vitest';
import { IntegrationTestingFramework } from './integration-testing-framework.js';

describe('Integration Tests', () => {
    it('should run integration tests successfully', async () => {
        const framework = new IntegrationTestingFramework(
            './tests/integration-test-config.json'
        );

        const results = await framework.runTestSuite();

        expect(results).toBeDefined();
        expect(results.totalTests).toBeGreaterThan(0);
    });
}); 