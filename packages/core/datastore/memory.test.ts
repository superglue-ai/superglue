import { ApiConfig, HttpMethod, Integration, Run, RunStatus, Tool } from '@superglue/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from './memory.js';
import { ToolScheduleInternal } from './types.js';

describe('MemoryStore', () => {
  let store: MemoryStore;
  const testOrgId = 'test-org';
  const testOrgId2 = 'test-org-2'

  beforeEach(() => {
    store = new MemoryStore();
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

    it('should store and retrieve API configs', async ()   => {
      await store.upsertApiConfig({ id: testConfig.id, config: testConfig });
      const retrieved = await store.getApiConfig({ id: testConfig.id });
      expect(retrieved).toEqual(testConfig);
    });

    it('should list API configs', async () => {
      await store.upsertApiConfig({ id: testConfig.id, config: testConfig });
      const { items, total } = await store.listApiConfigs({ limit: 10, offset: 0 });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual(testConfig);
    });

    it('should delete API configs', async () => {
      await store.upsertApiConfig({ id: testConfig.id, config: testConfig });
      await store.deleteApiConfig({ id: testConfig.id });
      const retrieved = await store.getApiConfig({ id: testConfig.id });
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

    const testRun: Run = {
      id: 'test-run-id',
      toolId: 'test-api-id',
      orgId: testOrgId,
      status: RunStatus.SUCCESS,
      startedAt: new Date(),
      completedAt: new Date(),
      toolConfig: testApiConfig as any,
      error: undefined,
    };

    it('should store and retrieve runs', async () => {
      await store.createRun({ run: testRun });
      const retrieved = await store.getRun({ id: testRun.id, orgId: testOrgId });
      expect(retrieved).toEqual(testRun);
    });

    it('should list runs in chronological order', async () => {
      const run1: Run = {
        ...testRun,
        id: 'run1',
        startedAt: new Date(Date.now() - 1000),
      };
      const run2: Run = {
        ...testRun,
        id: 'run2',
        startedAt: new Date(),
      };

      await store.createRun({ run: run1 });
      await store.createRun({ run: run2 });

      const { items, total } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });
      expect(items).toHaveLength(2);
      expect(total).toBe(2);
      expect(items[0].id).toBe(run2.id); // Most recent first
      expect(items[1].id).toBe(run1.id);
    });

    it('should delete runs', async () => {
      await store.createRun({ run: testRun });
      await store.deleteRun({ id: testRun.id });
      const retrieved = await store.getRun({ id: testRun.id });
      expect(retrieved).toBeNull();
    });

    it('should list runs filtered by config ID', async () => {
      const run1 = { ...testRun, id: 'run1', toolId: 'config1', toolConfig: { ...testRun.toolConfig, id: 'config1' } };
      const run2 = { ...testRun, id: 'run2', toolId: 'config2', toolConfig: { ...testRun.toolConfig, id: 'config2' } };
      const run3 = { ...testRun, id: 'run3', toolId: 'config1', toolConfig: { ...testRun.toolConfig, id: 'config1' } };

      await store.createRun({ run: run1 });
      await store.createRun({ run: run2 });
      await store.createRun({ run: run3 });

      const { items, total } = await store.listRuns({ limit: 10, offset: 0, configId: 'config1', orgId: testOrgId });
      expect(items.length).toBe(2);
      expect(total).toBe(2);
      expect(items.map(run => run.id).sort()).toEqual(['run1', 'run3']);
    });

    it('should handle listing runs when configs have missing IDs', async () => {
      const runWithoutConfigId = {
        ...testRun,
        id: 'run1',
        toolId: undefined,
        toolConfig: { ...testRun.toolConfig, id: undefined }
      };
      const runWithConfigId = {
        ...testRun,
        id: 'run2',
        toolId: 'config1',
        toolConfig: { ...testRun.toolConfig, id: 'config1' }
      };

      await store.createRun({ run: runWithoutConfigId });
      await store.createRun({ run: runWithConfigId });

      const { items: filteredItems } = await store.listRuns({ limit: 10, offset: 0, configId: 'config1', orgId: testOrgId });
      expect(filteredItems.length).toBe(1);
      expect(filteredItems[0].id).toBe('run2');

      const { items: allItems } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });
      expect(allItems.length).toBe(2);
    });

    it('should filter out corrupted runs and continue listing valid ones', async () => {
      // Create a valid run
      const validRun = { ...testRun, id: 'valid-run' };
      await store.createRun({ run: validRun });

      // Manually insert corrupted runs into storage to simulate corruption
      const corruptedRun1 = { id: 'corrupted-run-1', config: null, startedAt: null };
      const corruptedRun2 = { id: 'corrupted-run-2', config: { id: 'config-id' }, startedAt: null };
      const corruptedRun3 = { id: 'corrupted-run-3', config: null, startedAt: new Date() };

      const key1 = store['getKey']('run', 'corrupted-run-1', testOrgId);
      const key2 = store['getKey']('run', 'corrupted-run-2', testOrgId);
      const key3 = store['getKey']('run', 'corrupted-run-3', testOrgId);

      store['storage'].runs.set(key1, corruptedRun1 as any);
      store['storage'].runs.set(key2, corruptedRun2 as any);
      store['storage'].runs.set(key3, corruptedRun3 as any);

      // Add to index
      const index = store['storage'].runsIndex.get(testOrgId) || [];
      index.push(
        { id: 'corrupted-run-1', timestamp: Date.now(), configId: 'config1' },
        { id: 'corrupted-run-2', timestamp: Date.now(), configId: 'config2' },
        { id: 'corrupted-run-3', timestamp: Date.now(), configId: 'config3' }
      );

      const { items, total } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });

      expect(items.length).toBe(4);
      expect(total).toBe(4);
    });

    it('should handle runs with missing startedAt dates', async () => {
      const runWithoutStartedAt = {
        ...testRun,
        id: 'run-no-started-at',
        startedAt: undefined
      };
      const validRun = { ...testRun, id: 'valid-run' };

      await store.createRun({ run: runWithoutStartedAt });
      await store.createRun({ run: validRun });

      const { items, total } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });

      expect(items.length).toBe(2);
      expect(total).toBe(2);
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
      await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration });
      const retrieved = await store.getIntegration({ id: testIntegration.id, includeDocs: true });
      expect(retrieved).toEqual({ ...testIntegration, id: testIntegration.id });
    });

    it('should list integrations', async () => {
      await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration });
      const { items, total } = await store.listIntegrations({ limit: 10, offset: 0, includeDocs: true });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual({ ...testIntegration, id: testIntegration.id });
    });

    it('should delete integrations', async () => {
      await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration });
      await store.deleteIntegration({ id: testIntegration.id });
      const retrieved = await store.getIntegration({ id: testIntegration.id, includeDocs: true });
      expect(retrieved).toBeNull();
    });

    it('should return null for missing integration', async () => {
      const retrieved = await store.getIntegration({ id: 'does-not-exist', includeDocs: true });
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
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      const retrieved = await store.getWorkflow({ id: testWorkflow.id });
      expect(retrieved).toEqual(testWorkflow);
    });

    it('should list workflows', async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      const { items, total } = await store.listWorkflows({ limit: 10, offset: 0 });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual(testWorkflow);
    });

    it('should delete workflows', async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.deleteWorkflow({ id: testWorkflow.id });
      const retrieved = await store.getWorkflow({ id: testWorkflow.id });
      expect(retrieved).toBeNull();
    });

    it('should return null for missing workflow', async () => {
      const retrieved = await store.getWorkflow({ id: 'does-not-exist' });
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
            updatedAt: expect.any(Date),
            createdAt: expect.any(Date)
        });
    });

    it('should delete workflow schedules', async () => {
        await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
        await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
        
        const success = await store.deleteWorkflowSchedule({ id: testWorkflowSchedule.id, orgId: testOrgId });
        expect(success).toBe(true);
        
        const retrieved = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId });
        expect(retrieved).toHaveLength(0);
    });

    it('should only return workflow schedules for the specified org', async () => {
        await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
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
            updatedAt: expect.any(Date),
            createdAt: expect.any(Date)
        });

        const workflowSchedulesFromSecondOrg = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId2 });
        expect(workflowSchedulesFromSecondOrg).toHaveLength(1);
        expect(workflowSchedulesFromSecondOrg[0]).toMatchObject({
            ...testWorkflowSchedule,
            orgId: testOrgId2,
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

        await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
        await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
        await store.upsertWorkflowSchedule({ schedule: futureSchedule });

        const retrieved = await store.listDueWorkflowSchedules();
        
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0]).toMatchObject({
            ...testWorkflowSchedule,
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

        await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
        await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
        await store.upsertWorkflowSchedule({ schedule: disabledSchedule });

        const retrieved = await store.listDueWorkflowSchedules();
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0]).toMatchObject({
            ...testWorkflowSchedule,
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date)
        });
    });

    it('should return null for missing workflow schedule', async () => {
        const retrieved = await store.getWorkflowSchedule({ id: '550e8400-e29b-41d4-a716-446655440005' });
        expect(retrieved).toBeNull();
    });

    it('should update workflow schedule next run', async () => {
        const newNextRunAt = new Date('2022-01-01T10:00:00.000Z');
        await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
        await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });

        const success = await store.updateScheduleNextRun({ id: testWorkflowSchedule.id, nextRunAt: newNextRunAt, lastRunAt: new Date() });
        expect(success).toBe(true);
        
        const retrieved = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId });
        expect(retrieved[0].nextRunAt).toEqual(newNextRunAt);
    });

    it('should return false if workflow schedule is not found', async () => {
        const success = await store.updateScheduleNextRun({ id: testWorkflowSchedule.id, nextRunAt: new Date(), lastRunAt: new Date() });
        expect(success).toBe(false);
    });
  });
  describe('Clear All', () => {
    it('should clear all data', async () => {
      const testApiConfig: ApiConfig = {
        id: 'test-api',
        createdAt: new Date(),
        updatedAt: new Date(),
        urlHost: 'https://test.com',
        method: HttpMethod.GET,
        headers: {},
        queryParams: {},
        instruction: 'Test API',
      };
      
      const testRunResult: Run = {
        id: 'test-run',
        toolId: 'test-api-id',
        orgId: testOrgId,
        status: RunStatus.SUCCESS,
        startedAt: new Date(),
        completedAt: new Date(),
        toolConfig: testApiConfig as any,
        error: undefined,
      };

      const testIntegration: Integration = {
        id: 'test-int-id',
        name: 'Test Integration',
        urlHost: 'https://integration.test',
        credentials: { apiKey: 'secret' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const testWorkflow: Tool = {
        id: 'test-workflow',
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: 'Test workflow',
        steps: [],
        inputSchema: {}
      };

      const testWorkflowSchedule: ToolScheduleInternal = {
        id: 'test-schedule',
        orgId: testOrgId,
        workflowId: testWorkflow.id,
        payload: null,
        options: null,
        lastRunAt: null,
        cronExpression: '0 0 * * *',
        timezone: 'UTC',
        enabled: true,
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await store.upsertApiConfig({ id: 'test-api', config: testApiConfig });
      await store.createRun({ run: testRunResult });
      await store.upsertIntegration({ id: testIntegration.id, integration: testIntegration });
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
      
      await store.clearAll();
      
      const { total: apiTotal } = await store.listApiConfigs({ limit: 10, offset: 0 });
      const { total: runTotal } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });
      const { total: integrationTotal } = await store.listIntegrations({ limit: 10, offset: 0, includeDocs: true });
      const { total: workflowTotal } = await store.listWorkflows({ limit: 10, offset: 0 });
      const workflowSchedules = await store.listWorkflowSchedules({ workflowId: testWorkflow.id, orgId: testOrgId });

      expect(apiTotal).toBe(0);
      expect(runTotal).toBe(0);
      expect(integrationTotal).toBe(0);
      expect(workflowTotal).toBe(0);
      expect(workflowSchedules).toHaveLength(0);
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

  describe('Delete All Runs', () => {
    it('should delete all runs for an org', async () => {
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

      const run1: Run = {
        id: 'run1',
        toolId: 'test-api-id',
        orgId: testOrgId,
        status: RunStatus.SUCCESS,
        startedAt: new Date(),
        completedAt: new Date(),
        toolConfig: testApiConfig as any,
        error: undefined,
      };
      const run2: Run = {
        id: 'run2',
        toolId: 'test-api-id',
        orgId: testOrgId,
        status: RunStatus.SUCCESS,
        startedAt: new Date(),
        completedAt: new Date(),
        toolConfig: testApiConfig as any,
        error: undefined,
      };
      
      const anotherOrgId = 'another-org';
      const run3: Run = {
        id: 'run3',
        toolId: 'test-api-id',
        orgId: anotherOrgId,
        status: RunStatus.SUCCESS,
        startedAt: new Date(),
        completedAt: new Date(),
        toolConfig: testApiConfig as any,
        error: undefined,
      };
      
      await store.createRun({ run: run1 });
      await store.createRun({ run: run2 });
      await store.createRun({ run: run3 });
      
      await store.deleteAllRuns({ orgId: testOrgId });
      
      const { items: testOrgRuns } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });
      const { items: anotherOrgRuns } = await store.listRuns({ limit: 10, offset: 0, orgId: anotherOrgId });
      
      expect(testOrgRuns).toHaveLength(0);
      expect(anotherOrgRuns).toHaveLength(1);
      expect(anotherOrgRuns[0].id).toBe('run3');
    });
  });
}); 