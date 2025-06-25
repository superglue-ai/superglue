import { SuperglueClient } from '@superglue/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationTestingFramework } from './integration-testing-framework.js';
import { EnvVarManager } from './test-utils.js';

// Mock the SuperglueClient
vi.mock('@superglue/client', () => ({
    SuperglueClient: vi.fn().mockImplementation(() => ({
        upsertIntegration: vi.fn(),
        getIntegration: vi.fn(),
        deleteIntegration: vi.fn(),
        buildWorkflow: vi.fn(),
        executeWorkflow: vi.fn(),
        deleteWorkflow: vi.fn()
    }))
}));

describe('IntegrationTestingFramework', () => {
    let framework: IntegrationTestingFramework;
    let mockClient: any;
    const envManager = new EnvVarManager();

    beforeEach(() => {
        vi.clearAllMocks();
        envManager.set('GRAPHQL_ENDPOINT', 'http://test.example.com/graphql');
        envManager.set('AUTH_TOKEN', 'test-token');

        // Get the mocked client instance
        mockClient = new SuperglueClient({ endpoint: 'test', apiKey: 'test' });
        framework = new IntegrationTestingFramework('http://test.example.com/graphql', 'test-token');
    });

    envManager.setupHooks();

    describe('setupIntegrations', () => {
        it('should create all integrations successfully', async () => {
            // Mock successful integration creation
            mockClient.upsertIntegration.mockResolvedValue({
                id: 'test-integration',
                name: 'Test Integration',
                documentationPending: false
            });

            const setupTime = await framework.setupIntegrations();

            expect(typeof setupTime).toBe('number');
            expect(setupTime).toBeGreaterThan(0);
            // Should create all 10 integrations
            expect(mockClient.upsertIntegration).toHaveBeenCalledTimes(10);
        });

        it('should handle integration creation failures', async () => {
            mockClient.upsertIntegration.mockRejectedValueOnce(new Error('API Error'));

            await expect(framework.setupIntegrations()).rejects.toThrow('API Error');
        });

        it('should wait for documentation processing when needed', async () => {
            mockClient.upsertIntegration.mockResolvedValue({
                id: 'test-integration',
                name: 'Test Integration',
                documentationPending: true
            });

            mockClient.getIntegration
                .mockResolvedValueOnce({ documentationPending: true })
                .mockResolvedValueOnce({ documentationPending: false });

            const setupTime = await framework.setupIntegrations();

            expect(setupTime).toBeGreaterThan(0);
            expect(mockClient.getIntegration).toHaveBeenCalled();
        });
    });

    describe('cleanup', () => {
        it('should clean up all created resources', async () => {
            mockClient.deleteIntegration.mockResolvedValue(true);
            mockClient.deleteWorkflow.mockResolvedValue(true);

            // First setup some integrations
            mockClient.upsertIntegration.mockResolvedValue({
                id: 'test-integration',
                documentationPending: false
            });

            await framework.setupIntegrations();
            const cleanupTime = await framework.cleanup();

            expect(typeof cleanupTime).toBe('number');
            expect(cleanupTime).toBeGreaterThan(0);
            expect(mockClient.deleteIntegration).toHaveBeenCalled();
        });

        it('should handle cleanup failures gracefully', async () => {
            mockClient.deleteIntegration.mockRejectedValue(new Error('Delete failed'));

            // Should not throw, just log warnings
            const cleanupTime = await framework.cleanup();
            expect(typeof cleanupTime).toBe('number');
        });
    });

    describe('runTestSuite', () => {
        it('should run full test suite successfully', async () => {
            // Mock integration setup
            mockClient.upsertIntegration.mockResolvedValue({
                id: 'test-integration',
                documentationPending: false
            });

            // Mock successful workflow building and execution
            mockClient.buildWorkflow.mockResolvedValue({
                id: 'test-workflow',
                steps: [],
                integrationIds: ['hubspot-crm']
            });

            mockClient.executeWorkflow.mockResolvedValue({
                id: 'test-run',
                success: true,
                data: { contacts: [], updated_count: 0 }
            });

            // Mock cleanup
            mockClient.deleteIntegration.mockResolvedValue(true);
            mockClient.deleteWorkflow.mockResolvedValue(true);

            const testSuite = await framework.runTestSuite('Test Suite');

            expect(testSuite).toBeDefined();
            expect(testSuite.suiteName).toBe('Test Suite');
            expect(testSuite.totalTests).toBe(10); // Total number of test workflows
            expect(typeof testSuite.integrationSetupTime).toBe('number');
            expect(typeof testSuite.cleanupTime).toBe('number');
            expect(Array.isArray(testSuite.results)).toBe(true);
        });

        it('should handle partial failures', async () => {
            // Mock setup
            mockClient.upsertIntegration.mockResolvedValue({
                id: 'test-integration',
                documentationPending: false
            });

            // Mock some workflows failing
            mockClient.buildWorkflow
                .mockResolvedValueOnce({ id: 'workflow1', steps: [] })
                .mockRejectedValueOnce(new Error('Build failed'))
                .mockResolvedValue({ id: 'workflow2', steps: [] });

            mockClient.executeWorkflow.mockResolvedValue({
                id: 'test-run',
                success: true,
                data: {}
            });

            mockClient.deleteIntegration.mockResolvedValue(true);

            const testSuite = await framework.runTestSuite();

            expect(testSuite.failed).toBeGreaterThan(0);  // Some tests should fail
            expect(testSuite.passed).toBeGreaterThan(0);  // Some tests should pass
        });

        it('should cleanup even when tests fail', async () => {
            mockClient.upsertIntegration.mockRejectedValue(new Error('Setup failed'));
            mockClient.deleteIntegration.mockResolvedValue(true);

            await expect(framework.runTestSuite()).rejects.toThrow('Setup failed');

            // Cleanup should still be called
            expect(mockClient.deleteIntegration).toHaveBeenCalled();
        });
    });

    describe('static runFullTestSuite method', () => {
        it('should create framework instance and run tests', async () => {
            mockClient.upsertIntegration.mockResolvedValue({
                id: 'test-integration',
                documentationPending: false
            });

            mockClient.buildWorkflow.mockResolvedValue({
                id: 'test-workflow',
                steps: []
            });

            mockClient.executeWorkflow.mockResolvedValue({
                id: 'test-run',
                success: true,
                data: {}
            });

            mockClient.deleteIntegration.mockResolvedValue(true);

            const testSuite = await IntegrationTestingFramework.runFullTestSuite(
                'http://test.example.com/graphql',
                'test-token'
            );

            expect(testSuite).toBeDefined();
            expect(testSuite.totalTests).toBeGreaterThan(0);
        });
    });
});

describe('Integration Test Configuration', () => {
    it('should have all required integration configurations', () => {
        const framework = new IntegrationTestingFramework('test', 'test');
        const integrationConfigs = (framework as any).INTEGRATION_CONFIGS;

        expect(integrationConfigs).toHaveLength(10);

        // Check that all required integrations are present
        const expectedIds = [
            'hubspot-crm', 'stripe-pay', 'timbuk2-shopify', 'postgres-lego',
            'shopify-hydrogen', 'jira-projects', 'attio-crm', 'supabase-db',
            'twilio-comm', 'sendgrid-email'
        ];

        const configIds = integrationConfigs.map((c: any) => c.id);
        expectedIds.forEach(id => {
            expect(configIds).toContain(id);
        });
    });

    it('should have all required test workflows', () => {
        const framework = new IntegrationTestingFramework('test', 'test');
        const testWorkflows = (framework as any).TEST_WORKFLOWS;

        expect(testWorkflows).toHaveLength(10);

        // Check workflow categories
        const singleSystemWorkflows = testWorkflows.filter((w: any) => w.category === 'single-system');
        const multiSystemWorkflows = testWorkflows.filter((w: any) => w.category === 'multi-system');

        expect(singleSystemWorkflows).toHaveLength(5);
        expect(multiSystemWorkflows).toHaveLength(5);

        // Check complexity levels
        const complexityLevels = testWorkflows.map((w: any) => w.complexityLevel);
        expect(complexityLevels).toContain('low');
        expect(complexityLevels).toContain('medium'); 
        expect(complexityLevels).toContain('high');
    });
}); 