import { ApiConfig, HttpMethod, Integration, RunResult, Tool } from '@superglue/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresService } from './postgres.js';
import { ToolScheduleInternal } from './types.js';

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
        const testOrgId2 = 'test-org-2';

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
            await store.clearAll(testOrgId2);

            // Also clean up tenant_info table since clearAll doesn't handle it
            const client = await store['pool'].connect();
            try {
                await client.query('DELETE FROM tenant_info WHERE id = $1', ['default']);
            } finally {
                client.release();
            }
        });

        describe('API Config', () => {
            const testApiConfig: ApiConfig = {
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
                await store.upsertApiConfig({ id: testApiConfig.id, config: testApiConfig, orgId: testOrgId });
                const retrieved = await store.getApiConfig({ id: testApiConfig.id, orgId: testOrgId });
                expect(retrieved).toEqual(testApiConfig);
            });

            it('should list API configs', async () => {
                await store.upsertApiConfig({ id: testApiConfig.id, config: testApiConfig, orgId: testOrgId });
                const { items, total } = await store.listApiConfigs({ limit: 10, offset: 0, orgId: testOrgId });
                expect(items).toHaveLength(1);
                expect(total).toBe(1);
                expect(items[0]).toEqual(testApiConfig);
            });

            it('should delete API configs', async () => {
                await store.upsertApiConfig({ id: testApiConfig.id, config: testApiConfig, orgId: testOrgId });
                await store.deleteApiConfig({ id: testApiConfig.id, orgId: testOrgId });
                const retrieved = await store.getApiConfig({ id: testApiConfig.id, orgId: testOrgId });
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
                await store.createRun({ result: testRun, orgId: testOrgId });
                const retrieved = await store.getRun({ id: testRun.id, orgId: testOrgId });
                expect(retrieved?.id).toEqual(testRun.id);
                expect(retrieved?.success).toEqual(testRun.success);
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

                await store.createRun({ result: run1, orgId: testOrgId });
                await store.createRun({ result: run2, orgId: testOrgId });

                const { items, total } = await store.listRuns({ limit: 10, offset: 0, configId: null, orgId: testOrgId });
                expect(items).toHaveLength(2);
                expect(total).toBe(2);
                expect(items[0].id).toBe(run2.id); // Most recent first
                expect(items[1].id).toBe(run1.id);
            });

            it('should delete runs', async () => {
                await store.createRun({ result: testRun, orgId: testOrgId });
                await store.deleteRun({ id: testRun.id, orgId: testOrgId });
                const retrieved = await store.getRun({ id: testRun.id, orgId: testOrgId });
                expect(retrieved).toBeNull();
            });

            it('should list runs filtered by config ID', async () => {
                const run1 = { ...testRun, id: 'run1', config: { ...testRun.config, id: 'config1' } };
                const run2 = { ...testRun, id: 'run2', config: { ...testRun.config, id: 'config2' } };
                const run3 = { ...testRun, id: 'run3', config: { ...testRun.config, id: 'config1' } };

                await store.createRun({ result: run1, orgId: testOrgId });
                await store.createRun({ result: run2, orgId: testOrgId });
                await store.createRun({ result: run3, orgId: testOrgId });

                const { items, total } = await store.listRuns({ limit: 10, offset: 0, configId: 'config1', orgId: testOrgId });
                expect(items.length).toBe(2);
                expect(total).toBe(2);
                expect(items.map(run => run.id).sort()).toEqual(['run1', 'run3']);
            });
        });

        describe('Integration', () => {
            const testIntegration: Integration = {
                id: 'test-int-id',
                name: 'Test Integration',
                urlHost: 'https://integration.test',
                credentials: { apiKey: 'secret' },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            it('should store and retrieve integrations', async () => {
                await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration, orgId: testOrgId });
                const retrieved = await store.getIntegration({ id: testIntegration.id, includeDocs: true, orgId: testOrgId });
                expect(retrieved).toMatchObject({ ...testIntegration, id: testIntegration.id });
            });

            it('should list integrations', async () => {
                await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration, orgId: testOrgId });
                const { items, total } = await store.listIntegrations({ limit: 10, offset: 0, includeDocs: true, orgId: testOrgId });
                expect(items).toHaveLength(1);
                expect(total).toBe(1);
                expect(items[0]).toMatchObject({ ...testIntegration, id: testIntegration.id });
            });

            it('should delete integrations without details', async () => {
                await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration, orgId: testOrgId });
                await store.deleteIntegration({ id: testIntegration.id, orgId: testOrgId });
                const retrieved = await store.getIntegration({ id: testIntegration.id, includeDocs: true, orgId: testOrgId });
                expect(retrieved).toBeNull();
            });

            it('should delete integrations with details', async () => {
                const integrationWithDetails: Integration = {
                    ...testIntegration,
                    id: 'test-int-with-details',
                    documentation: 'Test documentation content',
                    openApiSchema: '{"openapi": "3.0.0", "info": {"title": "Test API"}}'
                };
                
                await store.upsertIntegration({ id: integrationWithDetails.id, integration: integrationWithDetails, orgId: testOrgId });
                await store.deleteIntegration({ id: integrationWithDetails.id, orgId: testOrgId });
                const retrieved = await store.getIntegration({ id: integrationWithDetails.id, includeDocs: true, orgId: testOrgId });
                expect(retrieved).toBeNull();
            });

            it('should return null for missing integration', async () => {
                const retrieved = await store.getIntegration({ id: 'does-not-exist', includeDocs: true, orgId: testOrgId });
                expect(retrieved).toBeNull();
            });

            it('should get many integrations by ids, skipping missing ones', async () => {
                const int2 = { ...testIntegration, id: 'test-int-id-2', name: 'Integration 2' };
                await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration, orgId: testOrgId });
                await store.upsertIntegration({ id: int2.id, integration: int2, orgId: testOrgId });
                const result = await store.getManyIntegrations({
                    ids: [testIntegration.id, int2.id, 'missing-id'],
                    orgId: testOrgId
                });
                expect(result).toHaveLength(2);
                expect(result.map(i => i.id).sort()).toEqual([testIntegration.id, int2.id].sort());
            });
        });

        describe('Workflow', () => {
            const testWorkflow: Tool = {
                id: 'test-workflow-id',
                createdAt: new Date(),
                updatedAt: new Date(),
                instruction: 'Test workflow',
                steps: [],
                inputSchema: {}
            };

            it('should store and retrieve workflows', async () => {
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                const retrieved = await store.getWorkflow({ id: testWorkflow.id, orgId: testOrgId });
                expect(retrieved).toEqual(testWorkflow);
            });

            it('should list workflows', async () => {
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                const { items, total } = await store.listWorkflows({ limit: 10, offset: 0, orgId: testOrgId });
                expect(items).toHaveLength(1);
                expect(total).toBe(1);
                expect(items[0]).toEqual(testWorkflow);
            });

            it('should delete workflows', async () => {
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.deleteWorkflow({ id: testWorkflow.id, orgId: testOrgId });
                const retrieved = await store.getWorkflow({ id: testWorkflow.id, orgId: testOrgId });
                expect(retrieved).toBeNull();
            });

            it('should return null for missing workflow', async () => {
                const retrieved = await store.getWorkflow({ id: 'does-not-exist', orgId: testOrgId });
                expect(retrieved).toBeNull();
            });

            it('should get many workflows by ids, skipping missing ones', async () => {
                const wf2 = { ...testWorkflow, id: 'test-workflow-id-2' };
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.upsertWorkflow({ id: wf2.id, workflow: wf2, orgId: testOrgId });
                const result = await store.getManyWorkflows({
                    ids: [testWorkflow.id, wf2.id, 'missing-id'],
                    orgId: testOrgId
                });
                expect(result).toHaveLength(2);
                expect(result.map(w => w.id).sort()).toEqual([testWorkflow.id, wf2.id].sort());
            });
        });

        describe('Workflow Schedule', () => {
            const testWorkflow: Tool = {
                id: 'test-workflow-id',
                createdAt: new Date(),
                updatedAt: new Date(),
                instruction: 'Test workflow',
                steps: [],
                inputSchema: {}
            };

            const testWorkflowSchedule: ToolScheduleInternal = {
                id: '68d51b90-605d-4e85-8c9a-c82bad2c7337',
                orgId: testOrgId,
                workflowId: testWorkflow.id,
                payload: null,
                options: null,
                lastRunAt: null,
                cronExpression: '0 0 * * *',
                timezone: 'UTC',
                enabled: true,
                nextRunAt: new Date('2020-01-01T10:00:00.000Z'),
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            it('upserting should store new workflow schedule', async () => {
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
                const retrieved = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId });

                expect(retrieved).toHaveLength(1);
                expect(retrieved[0]).toMatchObject({
                    ...testWorkflowSchedule,
                    nextRunAt: expect.any(Date),
                    updatedAt: expect.any(Date),
                    createdAt: expect.any(Date)
                });
            });

            it('upserting should update existing workflow schedule', async () => {
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
                const updatedSchedule = {
                    ...testWorkflowSchedule,
                    cronExpression: '*/15 * * * * *',
                };

                await store.upsertWorkflowSchedule({ schedule: updatedSchedule });

                const retrieved = await store.getWorkflowSchedule({ id: testWorkflowSchedule.id, orgId: testOrgId });
                expect(retrieved).toMatchObject({
                    ...updatedSchedule,
                    nextRunAt: expect.any(Date),
                    updatedAt: expect.any(Date),
                    createdAt: expect.any(Date)
                });
            });

            it('should delete workflow schedules', async () => {
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
                
                const success = await store.deleteWorkflowSchedule({ id: testWorkflowSchedule.id, orgId: testOrgId });
                expect(success).toBe(true);
                
                const retrieved = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId });
                expect(retrieved).toHaveLength(0);
            });

            it('should only return workflow schedules for the specified org', async () => {
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId2 });

                await store.upsertWorkflowSchedule({ schedule: {
                    ...testWorkflowSchedule,
                    orgId: testOrgId
                } });

                await store.upsertWorkflowSchedule({ schedule: {
                    ...testWorkflowSchedule,
                    orgId: testOrgId2
                } });

                const workflowSchedulesFromFirstOrg = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId });
                expect(workflowSchedulesFromFirstOrg).toHaveLength(1);
                expect(workflowSchedulesFromFirstOrg[0]).toMatchObject({
                    ...testWorkflowSchedule,
                    orgId: testOrgId,
                    nextRunAt: expect.any(Date),
                    updatedAt: expect.any(Date),
                    createdAt: expect.any(Date)
                });

                const workflowSchedulesFromSecondOrg = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId2 });
                expect(workflowSchedulesFromSecondOrg).toHaveLength(1);
                expect(workflowSchedulesFromSecondOrg[0]).toMatchObject({
                    ...testWorkflowSchedule,
                    orgId: testOrgId2,
                    nextRunAt: expect.any(Date),
                    updatedAt: expect.any(Date),
                    createdAt: expect.any(Date)
                });
            });

            it('should list due workflow schedules only', async () => {
                const futureSchedule: ToolScheduleInternal = {
                    ...testWorkflowSchedule,
                    id: '57f65914-69fa-40ad-a4d1-6d2c372619c4',
                    nextRunAt: new Date(Date.now() + 1000 * 60),
                };

                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
                await store.upsertWorkflowSchedule({ schedule: futureSchedule });

                const retrieved = await store.listDueWorkflowSchedules();
                
                expect(retrieved).toHaveLength(1);
                expect(retrieved[0]).toMatchObject({
                    ...testWorkflowSchedule,
                    nextRunAt: expect.any(Date),
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date)
                });
            });

            it('should list enabled due workflow schedules only', async () => {
                const disabledSchedule: ToolScheduleInternal = {
                    ...testWorkflowSchedule,
                    id: '57f65914-69fa-40ad-a4d1-6d2c372619c4',
                    enabled: false,
                };

                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
                await store.upsertWorkflowSchedule({ schedule: disabledSchedule });

                const retrieved = await store.listDueWorkflowSchedules();
                expect(retrieved).toHaveLength(1);
                expect(retrieved[0]).toMatchObject({
                    ...testWorkflowSchedule,
                    nextRunAt: expect.any(Date),
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date)
                });
            });

            it('should return null for missing workflow schedule', async () => {
                const retrieved = await store.getWorkflowSchedule({ id: '550e8400-e29b-41d4-a716-446655440005', orgId: testOrgId });
                expect(retrieved).toBeNull();
            });

            it('should update workflow schedule next run', async () => {
                const newNextRunAt = new Date('2022-01-01T10:00:00.000Z');
                await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
                await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });

                const success = await store.updateScheduleNextRun({ id: testWorkflowSchedule.id, nextRunAt: newNextRunAt, lastRunAt: new Date() });
                expect(success).toBe(true);
                
                const retrieved = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId });
                
                // Calculate timezone offset and adjust expected time
                const timezoneOffsetMs = newNextRunAt.getTimezoneOffset() * 60 * 1000;
                const expectedTime = new Date(newNextRunAt.getTime() + timezoneOffsetMs);
                
                expect(retrieved[0].nextRunAt.getTime()).toEqual(expectedTime.getTime());
            });

            it('should return false if workflow schedule is not found', async () => {
                const success = await store.updateScheduleNextRun({ id: testWorkflowSchedule.id, nextRunAt: new Date(), lastRunAt: new Date() });
                expect(success).toBe(false);
            });
        });

        describe('Tenant Info', () => {
            it('should set and get tenant info', async () => {
                await store.setTenantInfo({ email: 'test@example.com', emailEntrySkipped: false });
                const info = await store.getTenantInfo();
                expect(info.email).toBe('test@example.com');
                expect(info.emailEntrySkipped).toBe(false);
            });

            it('should update only specified fields', async () => {
                await store.setTenantInfo({ email: 'test@example.com', emailEntrySkipped: false });
                await store.setTenantInfo({ emailEntrySkipped: true });
                const info = await store.getTenantInfo();
                expect(info.email).toBe('test@example.com');
                expect(info.emailEntrySkipped).toBe(true);
            });

            it('should handle null email', async () => {
                await store.setTenantInfo({ email: null, emailEntrySkipped: true });
                const info = await store.getTenantInfo();
                expect(info.email).toBeNull();
                expect(info.emailEntrySkipped).toBe(true);
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