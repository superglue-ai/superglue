import { ApiConfig, ExtractConfig, HttpMethod, RunResult, TransformConfig } from '@superglue/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresService } from './postgres.js';

// Mock Postgres client configuration
const testConfig = {
    host: process.env.VITE_POSTGRES_HOST,
    port: parseInt(process.env.VITE_POSTGRES_PORT || '5432'),
    user: process.env.VITE_POSTGRES_USERNAME,
    password: process.env.VITE_POSTGRES_PASSWORD,
    database: process.env.VITE_POSTGRES_DATABASE || 'superglue_test'
};

if (!testConfig.host || !testConfig.user || !testConfig.password) {
    describe('PostgresService (skipped)', () => {
        it.skip('Skipping Postgres tests due to missing configuration', () => {
            console.warn('Postgres configuration is not set. Skipping tests.');
        });
    });
} else {
    describe('PostgresService', () => {
        let store: PostgresService;
        const testOrgId = 'test-org';

        // Create a single connection for all tests
        beforeAll(async () => {
            try {
                store = new PostgresService(testConfig);
                // Table initialization happens once here
            } catch (error) {
                console.error('Failed to connect to Postgres:', error);
                throw error;
            }
        });

        // Clean up after all tests
        afterAll(async () => {
            try {
                await store.disconnect();
            } catch (error) {
                console.error('Failed to disconnect from Postgres:', error);
            }
        });

        // Add this beforeEach to clean up data between test suites
        beforeEach(async () => {
            // Clear all data for the test org
            await store.clearAll(testOrgId);
            
            // Also clean up tenant_info table since clearAll doesn't handle it
            const client = await store['pool'].connect();
            try {
                await client.query('DELETE FROM tenant_info WHERE id = $1', ['default']);
            } finally {
                client.release();
            }
        });

        describe('API Config', () => {
            const testConfig: ApiConfig = {
                id: 'test-id',
                createdAt: new Date(),
                updatedAt: new Date(),
                urlHost: 'https://test.com',
                method: HttpMethod.GET,
                headers: {},
                queryParams: {},
                instruction: 'Test API',
            };

            it('should store and retrieve API configs', async () => {
                await store.upsertApiConfig(testConfig.id, testConfig, testOrgId);
                const retrieved = await store.getApiConfig(testConfig.id, testOrgId);
                expect(retrieved).toEqual(testConfig);
            });

            it('should list API configs', async () => {
                await store.upsertApiConfig(testConfig.id, testConfig, testOrgId);
                const { items, total } = await store.listApiConfigs(10, 0, testOrgId);
                expect(items).toHaveLength(1);
                expect(total).toBe(1);
                expect(items[0]).toEqual(testConfig);
            });

            it('should delete API configs', async () => {
                await store.upsertApiConfig(testConfig.id, testConfig, testOrgId);
                await store.deleteApiConfig(testConfig.id, testOrgId);
                const retrieved = await store.getApiConfig(testConfig.id, testOrgId);
                expect(retrieved).toBeNull();
            });
        });

        describe('Extract Config', () => {
            const testExtractConfig: ExtractConfig = {
                id: 'test-extract-id',
                createdAt: new Date(),
                updatedAt: new Date(),
                instruction: 'Test extraction',
                urlHost: 'https://test.com',
            };

            it('should store and retrieve extract configs', async () => {
                await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig, testOrgId);
                const retrieved = await store.getExtractConfig(testExtractConfig.id, testOrgId);
                expect(retrieved).toEqual(testExtractConfig);
            });

            it('should list extract configs', async () => {
                await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig, testOrgId);
                const { items, total } = await store.listExtractConfigs(10, 0, testOrgId);
                expect(items).toHaveLength(1);
                expect(total).toBe(1);
                expect(items[0]).toEqual(testExtractConfig);
            });

            it('should delete extract configs', async () => {
                await store.upsertExtractConfig(testExtractConfig.id, testExtractConfig, testOrgId);
                await store.deleteExtractConfig(testExtractConfig.id, testOrgId);
                const retrieved = await store.getExtractConfig(testExtractConfig.id, testOrgId);
                expect(retrieved).toBeNull();
            });
        });

        describe('Transform Config', () => {
            const testTransformConfig: TransformConfig = {
                id: 'test-transform-id',
                createdAt: new Date(),
                updatedAt: new Date(),
                instruction: 'Test transformation',
                responseSchema: {},
                responseMapping: ''
            };

            it('should store and retrieve transform configs', async () => {
                await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig, testOrgId);
                const retrieved = await store.getTransformConfig(testTransformConfig.id, testOrgId);
                expect(retrieved).toEqual(testTransformConfig);
            });

            it('should list transform configs', async () => {
                await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig, testOrgId);
                const { items, total } = await store.listTransformConfigs(10, 0, testOrgId);
                expect(items).toHaveLength(1);
                expect(total).toBe(1);
                expect(items[0]).toEqual(testTransformConfig);
            });

            it('should delete transform configs', async () => {
                await store.upsertTransformConfig(testTransformConfig.id, testTransformConfig, testOrgId);
                await store.deleteTransformConfig(testTransformConfig.id, testOrgId);
                const retrieved = await store.getTransformConfig(testTransformConfig.id, testOrgId);
                expect(retrieved).toBeNull();
            });
        });

        describe('Run Results', () => {
            const testApiConfig: ApiConfig = {
                id: 'test-api-id',
                createdAt: new Date(),
                updatedAt: new Date(),
                urlHost: 'https://test.com',
                method: HttpMethod.GET,
                headers: {},
                queryParams: {},
                instruction: 'Test API',
            };

            const testRun: RunResult = {
                id: 'test-run-id',
                startedAt: new Date(),
                completedAt: new Date(),
                success: true,
                config: testApiConfig,
                error: null,
            };

            it('should store and retrieve runs', async () => {
                await store.createRun(testRun, testOrgId);
                const retrieved = await store.getRun(testRun.id, testOrgId);
                expect(retrieved).toEqual(testRun);
            });

            it('should list runs in chronological order', async () => {
                const run1: RunResult = {
                    ...testRun,
                    id: 'run1',
                    startedAt: new Date(Date.now() - 1000),
                };
                const run2: RunResult = {
                    ...testRun,
                    id: 'run2',
                    startedAt: new Date(),
                };

                await store.createRun(run1, testOrgId);
                await store.createRun(run2, testOrgId);

                const { items, total } = await store.listRuns(10, 0, null, testOrgId);
                expect(items).toHaveLength(2);
                expect(total).toBe(2);
                expect(items[0].id).toBe(run2.id); // Most recent first
                expect(items[1].id).toBe(run1.id);
            });

            it('should delete runs', async () => {
                await store.createRun(testRun, testOrgId);
                await store.deleteRun(testRun.id, testOrgId);
                const retrieved = await store.getRun(testRun.id, testOrgId);
                expect(retrieved).toBeNull();
            });

            it('should delete all runs', async () => {
                await store.createRun(testRun, testOrgId);
                await store.deleteAllRuns(testOrgId);
                const { items, total } = await store.listRuns(10, 0, null, testOrgId);
                expect(items).toHaveLength(0);
                expect(total).toBe(0);
            });
        });

        describe('Workflow', () => {
            const testWorkflow = {
                id: 'test-workflow-id',
                name: 'Test Workflow',
                steps: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            it('should store and retrieve workflows', async () => {
                await store.upsertWorkflow(testWorkflow.id, testWorkflow, testOrgId);
                const retrieved = await store.getWorkflow(testWorkflow.id, testOrgId);
                expect(retrieved).toEqual(testWorkflow);
            });

            it('should list workflows', async () => {
                await store.upsertWorkflow(testWorkflow.id, testWorkflow, testOrgId);
                const { items, total } = await store.listWorkflows(10, 0, testOrgId);
                expect(items).toHaveLength(1);
                expect(total).toBe(1);
                expect(items[0]).toEqual(testWorkflow);
            });

            it('should delete workflows', async () => {
                await store.upsertWorkflow(testWorkflow.id, testWorkflow, testOrgId);
                await store.deleteWorkflow(testWorkflow.id, testOrgId);
                const retrieved = await store.getWorkflow(testWorkflow.id, testOrgId);
                expect(retrieved).toBeNull();
            });

            it('should store workflow with integration dependencies', async () => {
                const integrationIds = ['int1', 'int2'];
                await store.upsertWorkflow(testWorkflow.id, testWorkflow, testOrgId, integrationIds);
                const retrieved = await store.getWorkflow(testWorkflow.id, testOrgId);
                expect(retrieved).toEqual(testWorkflow);
            });
        });

        describe('Integration', () => {
            const testIntegration = {
                id: 'test-int-id',
                name: 'Test Integration',
                urlHost: 'https://integration.test',
                credentials: { apiKey: 'secret' },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            it('should store and retrieve integrations', async () => {
                await store.upsertIntegration(testIntegration.id, testIntegration, testOrgId);
                const retrieved = await store.getIntegration(testIntegration.id, true, testOrgId);
                expect(retrieved).toEqual({ ...testIntegration, id: testIntegration.id });
            });

            it('should list integrations', async () => {
                await store.upsertIntegration(testIntegration.id, testIntegration, testOrgId);
                const { items, total } = await store.listIntegrations(10, 0, true, testOrgId);
                expect(items).toHaveLength(1);
                expect(total).toBe(1);
                expect(items[0]).toEqual({ ...testIntegration, id: testIntegration.id });
            });

            it('should delete integrations', async () => {
                await store.upsertIntegration(testIntegration.id, testIntegration, testOrgId);
                await store.deleteIntegration(testIntegration.id, testOrgId);
                const retrieved = await store.getIntegration(testIntegration.id, true, testOrgId);
                expect(retrieved).toBeNull();
            });

            it('should return null for missing integration', async () => {
                const retrieved = await store.getIntegration('does-not-exist', true, testOrgId);
                expect(retrieved).toBeNull();
            });
        });

        describe('Tenant Information', () => {
            it('should store and retrieve tenant info', async () => {
                await store.setTenantInfo('test@example.com', false);
                const info = await store.getTenantInfo();
                expect(info.email).toBe('test@example.com');
                expect(info.emailEntrySkipped).toBe(false);
            });

            it('should update existing tenant info', async () => {
                await store.setTenantInfo('test@example.com', false);
                await store.setTenantInfo('updated@example.com', true);
                const info = await store.getTenantInfo();
                expect(info.email).toBe('updated@example.com');
                expect(info.emailEntrySkipped).toBe(true);
            });

            it('should return default values for missing tenant info', async () => {
                const info = await store.getTenantInfo();
                expect(info.email).toBeNull();
                expect(info.emailEntrySkipped).toBe(false);
            });
        });

        describe('Health Check', () => {
            it('should return true when postgres is connected', async () => {
                const result = await store.ping();
                expect(result).toBe(true);
            });
        });
    });
} 