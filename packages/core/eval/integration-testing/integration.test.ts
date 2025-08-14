import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IntegrationTestingFramework } from './integration-testing-framework.js';

// Register cleanup handlers for process termination
let isCleaningUp = false;
const cleanup = async (signal?: string) => {
    if (!isCleaningUp) {
        isCleaningUp = true;
        if (signal) {
            console.log(`\n🧹 Cleaning up test resources due to ${signal}...`);
        }
        try {
            const { PlaywrightFetchingStrategy } = await import('../../utils/documentation.js');
            await PlaywrightFetchingStrategy.closeBrowser();
        } catch (e) {
            console.error('Error during cleanup:', e);
        }

        // Kill any remaining vitest processes
        if (signal === 'SIGINT' || signal === 'SIGTERM') {
            process.exit(0);
        }
    }
};

process.once('SIGINT', () => cleanup('SIGINT'));
process.once('SIGTERM', () => cleanup('SIGTERM'));
process.once('exit', () => cleanup());
process.once('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanup('uncaughtException');
});

describe('Integration Tests', () => {
    let originalDataStoreType: string | undefined;
    let originalDataStorePath: string | undefined;
    let framework: IntegrationTestingFramework | null = null;

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
        try {
            const { PlaywrightFetchingStrategy } = await import('../../utils/documentation.js');
            await PlaywrightFetchingStrategy.closeBrowser();
        } catch (e) {
        }

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
        // Use custom config path from environment variable if provided
        const configPath = process.env.INTEGRATION_TEST_CONFIG_PATH || './eval/integration-testing/integration-test-config.json';
        const framework = await IntegrationTestingFramework.create(configPath);

        const results = await framework.runTestSuite();

        expect(results).toBeDefined();
        expect(results.totalTests).toBeGreaterThan(0);

        // Give time for logs to flush
        await new Promise(resolve => setTimeout(resolve, 1000));
    });
}); 