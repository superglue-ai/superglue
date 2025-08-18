import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IntegrationTestingFramework } from './integration-testing-framework.js';

// Shared cleanup function
let isCleaningUp = false;
async function cleanupResources(): Promise<void> {
    if (isCleaningUp) return;
    isCleaningUp = true;

    const cleanupTasks = [];

    // Clean up Playwright browser
    try {
        const { PlaywrightFetchingStrategy } = await import('../../utils/documentation.js');
        cleanupTasks.push(PlaywrightFetchingStrategy.closeBrowser());
    } catch (e) {
        console.error('Error during browser cleanup:', e);
    }

    // Clean up HTML-to-Markdown worker pool
    try {
        const { shutdownSharedHtmlMarkdownPool } = await import('../../utils/html-markdown-pool.js');
        cleanupTasks.push(shutdownSharedHtmlMarkdownPool());
    } catch (e) {
        console.error('Error during worker pool cleanup:', e);
    }

    // Wait for all cleanup tasks to complete
    await Promise.all(cleanupTasks);
}

// Register cleanup handlers for process termination
let interruptCount = 0;
const handleInterrupt = async (signal: string) => {
    interruptCount++;

    if (interruptCount === 1) {
        console.log(`\n🧹 Cleaning up test resources due to ${signal}...`);
        console.log('⏳ Please wait for cleanup to complete (or press Ctrl+C again to force quit)');

        // Set a timeout to force exit if cleanup takes too long
        const forceExitTimeout = setTimeout(() => {
            console.log('⚠️ Cleanup taking too long, forcing exit...');
            process.exit(1);
        }, 10000); // 10 second timeout

        try {
            await cleanupResources();
            clearTimeout(forceExitTimeout);
            console.log('✅ Cleanup completed successfully');
            process.exit(0);
        } catch (e) {
            clearTimeout(forceExitTimeout);
            console.error('❌ Cleanup failed:', e);
            process.exit(1);
        }
    } else if (interruptCount === 2) {
        console.log('\n⚠️ Second interrupt received, forcing immediate exit...');
        console.log('⚠️ Warning: Browser/worker processes may be left running!');
        console.log('💡 Run this to clean up: pkill -f "chromium|headless" && pkill -f "vitest"');
        process.exit(1);
    }
};

process.on('SIGINT', () => handleInterrupt('SIGINT'));
process.on('SIGTERM', () => handleInterrupt('SIGTERM'));

process.once('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    await cleanupResources();
    process.exit(1);
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
        // Clean up browser and worker pool
        await cleanupResources();

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