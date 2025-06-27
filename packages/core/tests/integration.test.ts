import { config } from 'dotenv';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IntegrationTestingFramework } from './integration-testing-framework.js';
import { DataStoreFactory, EnvVarManager, GraphQLServerFactory } from './test-utils.js';

// Load environment variables from project root .env file
const envPath = process.cwd().endsWith('packages/core')
    ? path.join(process.cwd(), '../../.env')
    : path.join(process.cwd(), '.env');
config({ path: envPath });

// Test environment overrides for isolation
process.env.DATA_STORE_TYPE = 'FILE';
process.env.DATA_STORE_FILE_PATH = './tests/test-data';

describe('Integration Tests', () => {
    let serverFactory: GraphQLServerFactory;
    let dataStoreFactory: DataStoreFactory;
    let envManager: EnvVarManager;
    let serverUrl: string;

    beforeAll(async () => {
        envManager = new EnvVarManager();
        dataStoreFactory = new DataStoreFactory();
        serverFactory = new GraphQLServerFactory();

        // Setup test environment
        dataStoreFactory.init();

        // Start GraphQL server
        serverUrl = await serverFactory.start();
        console.log(`🚀 Test server started at ${serverUrl}`);
    }, 30000);

    afterAll(async () => {
        // Cleanup in reverse order
        if (serverFactory) {
            await serverFactory.stop();
        }
        if (dataStoreFactory) {
            await dataStoreFactory.cleanup();
        }
        if (envManager) {
            envManager.resetAll();
        }
    });

    it('should run integration tests successfully', async () => {
        const framework = new IntegrationTestingFramework(
            serverUrl,
            process.env.AUTH_TOKEN!,
            './tests/integration-test-config.json'
        );

        const results = await framework.runTestSuite();

        expect(results).toBeDefined();
        expect(results.totalTests).toBeGreaterThan(0);
    }, 300000);
}); 