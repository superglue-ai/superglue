import { HttpMethod, RequestSource, System, Run, RunStatus, Tool } from "@superglue/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "./memory.js";
import { ToolScheduleInternal } from "./types.js";

describe("MemoryStore", () => {
  let store: MemoryStore;
  const testOrgId = "test-org";
  const testOrgId2 = "test-org-2";

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe("Run Results", () => {
    const testStepConfig = {
      url: "https://test.com",
      method: HttpMethod.GET,
      headers: {},
      queryParams: {},
      instruction: "Test API",
    };

    const testRun: Run = {
      runId: "test-run-id",
      toolId: "test-api-id",
      status: RunStatus.SUCCESS,
      metadata: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      tool: { id: "test-api-id", steps: [{ id: "step1", config: testStepConfig }] } as any,
      error: undefined,
    };

    it("should store and retrieve runs", async () => {
      await store.createRun({ run: testRun, orgId: testOrgId });
      const retrieved = await store.getRun({ id: testRun.runId, orgId: testOrgId });
      expect(retrieved).toEqual(testRun);
    });

    it("should list runs in chronological order", async () => {
      const run1: Run = {
        ...testRun,
        runId: "run1",
        metadata: { startedAt: new Date(Date.now() - 1000).toISOString() },
      };
      const run2: Run = {
        ...testRun,
        runId: "run2",
        metadata: { startedAt: new Date().toISOString() },
      };

      await store.createRun({ run: run1, orgId: testOrgId });
      await store.createRun({ run: run2, orgId: testOrgId });

      const { items, total } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });
      expect(items).toHaveLength(2);
      expect(total).toBe(2);
      expect(items[0].runId).toBe(run2.runId); // Most recent first
      expect(items[1].runId).toBe(run1.runId);
    });

    it("should list runs filtered by config ID", async () => {
      const run1 = {
        ...testRun,
        runId: "run1",
        toolId: "config1",
        tool: { ...testRun.tool, id: "config1" },
      };
      const run2 = {
        ...testRun,
        runId: "run2",
        toolId: "config2",
        tool: { ...testRun.tool, id: "config2" },
      };
      const run3 = {
        ...testRun,
        runId: "run3",
        toolId: "config1",
        tool: { ...testRun.tool, id: "config1" },
      };

      await store.createRun({ run: run1, orgId: testOrgId });
      await store.createRun({ run: run2, orgId: testOrgId });
      await store.createRun({ run: run3, orgId: testOrgId });

      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: "config1",
        orgId: testOrgId,
      });
      expect(items.length).toBe(2);
      expect(total).toBe(2);
      expect(items.map((run) => run.runId).sort()).toEqual(["run1", "run3"]);
    });

    it("should list runs filtered by status", async () => {
      const run1: Run = { ...testRun, runId: "run1", status: RunStatus.SUCCESS };
      const run2: Run = { ...testRun, runId: "run2", status: RunStatus.FAILED };
      const run3: Run = { ...testRun, runId: "run3", status: RunStatus.SUCCESS };
      const run4: Run = { ...testRun, runId: "run4", status: RunStatus.RUNNING };

      await store.createRun({ run: run1, orgId: testOrgId });
      await store.createRun({ run: run2, orgId: testOrgId });
      await store.createRun({ run: run3, orgId: testOrgId });
      await store.createRun({ run: run4, orgId: testOrgId });

      const { items: successItems, total: successTotal } = await store.listRuns({
        limit: 10,
        offset: 0,
        status: RunStatus.SUCCESS,
        orgId: testOrgId,
      });
      expect(successItems.length).toBe(2);
      expect(successTotal).toBe(2);
      expect(successItems.map((run) => run.runId).sort()).toEqual(["run1", "run3"]);

      const { items: failedItems, total: failedTotal } = await store.listRuns({
        limit: 10,
        offset: 0,
        status: RunStatus.FAILED,
        orgId: testOrgId,
      });
      expect(failedItems.length).toBe(1);
      expect(failedTotal).toBe(1);
      expect(failedItems[0].runId).toBe("run2");
    });

    it("should list runs filtered by requestSource", async () => {
      const run1: Run = { ...testRun, runId: "run1", requestSource: RequestSource.API };
      const run2: Run = { ...testRun, runId: "run2", requestSource: RequestSource.WEBHOOK };
      const run3: Run = { ...testRun, runId: "run3", requestSource: RequestSource.API };
      const run4: Run = { ...testRun, runId: "run4", requestSource: RequestSource.SCHEDULER };

      await store.createRun({ run: run1, orgId: testOrgId });
      await store.createRun({ run: run2, orgId: testOrgId });
      await store.createRun({ run: run3, orgId: testOrgId });
      await store.createRun({ run: run4, orgId: testOrgId });

      const { items: apiItems, total: apiTotal } = await store.listRuns({
        limit: 10,
        offset: 0,
        requestSources: [RequestSource.API],
        orgId: testOrgId,
      });
      expect(apiItems.length).toBe(2);
      expect(apiTotal).toBe(2);
      expect(apiItems.map((run) => run.runId).sort()).toEqual(["run1", "run3"]);

      const { items: webhookItems, total: webhookTotal } = await store.listRuns({
        limit: 10,
        offset: 0,
        requestSources: [RequestSource.WEBHOOK],
        orgId: testOrgId,
      });
      expect(webhookItems.length).toBe(1);
      expect(webhookTotal).toBe(1);
      expect(webhookItems[0].runId).toBe("run2");
    });

    it("should list runs filtered by multiple criteria", async () => {
      const run1: Run = {
        ...testRun,
        runId: "run1",
        toolId: "tool1",
        status: RunStatus.SUCCESS,
        requestSource: RequestSource.API,
      };
      const run2: Run = {
        ...testRun,
        runId: "run2",
        toolId: "tool1",
        status: RunStatus.FAILED,
        requestSource: RequestSource.API,
      };
      const run3: Run = {
        ...testRun,
        runId: "run3",
        toolId: "tool1",
        status: RunStatus.SUCCESS,
        requestSource: RequestSource.WEBHOOK,
      };
      const run4: Run = {
        ...testRun,
        runId: "run4",
        toolId: "tool2",
        status: RunStatus.SUCCESS,
        requestSource: RequestSource.API,
      };

      await store.createRun({ run: run1, orgId: testOrgId });
      await store.createRun({ run: run2, orgId: testOrgId });
      await store.createRun({ run: run3, orgId: testOrgId });
      await store.createRun({ run: run4, orgId: testOrgId });

      // Filter by toolId + status + requestSources
      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: "tool1",
        status: RunStatus.SUCCESS,
        requestSources: [RequestSource.API],
        orgId: testOrgId,
      });
      expect(items.length).toBe(1);
      expect(total).toBe(1);
      expect(items[0].runId).toBe("run1");
    });

    it("should handle listing runs when configs have missing IDs", async () => {
      const runWithoutConfigId = {
        ...testRun,
        runId: "run1",
        toolId: undefined,
        tool: { ...testRun.tool, id: undefined },
      };
      const runWithConfigId = {
        ...testRun,
        runId: "run2",
        toolId: "config1",
        tool: { ...testRun.tool, id: "config1" },
      };

      await store.createRun({ run: runWithoutConfigId, orgId: testOrgId });
      await store.createRun({ run: runWithConfigId, orgId: testOrgId });

      const { items: filteredItems } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: "config1",
        orgId: testOrgId,
      });
      expect(filteredItems.length).toBe(1);
      expect(filteredItems[0].runId).toBe("run2");

      const { items: allItems } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });
      expect(allItems.length).toBe(2);
    });

    it("should filter out corrupted runs and continue listing valid ones", async () => {
      // Create a valid run
      const validRun = { ...testRun, runId: "valid-run" };
      await store.createRun({ run: validRun, orgId: testOrgId });

      // Manually insert corrupted runs into storage to simulate corruption
      const corruptedRun1 = { runId: "corrupted-run-1", config: null, metadata: null };
      const corruptedRun2 = {
        runId: "corrupted-run-2",
        config: { id: "config-id" },
        metadata: null,
      };
      const corruptedRun3 = {
        runId: "corrupted-run-3",
        config: null,
        metadata: { startedAt: new Date().toISOString() },
      };

      const key1 = store["getKey"]("run", "corrupted-run-1", testOrgId);
      const key2 = store["getKey"]("run", "corrupted-run-2", testOrgId);
      const key3 = store["getKey"]("run", "corrupted-run-3", testOrgId);

      store["storage"].runs.set(key1, corruptedRun1 as any);
      store["storage"].runs.set(key2, corruptedRun2 as any);
      store["storage"].runs.set(key3, corruptedRun3 as any);

      // Add to index
      const index = store["storage"].runsIndex.get(testOrgId) || [];
      index.push(
        { id: "corrupted-run-1", timestamp: Date.now(), configId: "config1" },
        { id: "corrupted-run-2", timestamp: Date.now(), configId: "config2" },
        { id: "corrupted-run-3", timestamp: Date.now(), configId: "config3" },
      );

      const { items, total } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });

      // Should only return runs with valid metadata.startedAt (validRun + corruptedRun3)
      expect(items.length).toBe(2);
      expect(total).toBe(2);
    });

    it("should handle runs with missing startedAt dates", async () => {
      const runWithoutStartedAt = {
        ...testRun,
        runId: "run-no-started-at",
        metadata: { startedAt: undefined as any },
      };
      const validRun = { ...testRun, runId: "valid-run" };

      await store.createRun({ run: runWithoutStartedAt, orgId: testOrgId });
      await store.createRun({ run: validRun, orgId: testOrgId });

      const { items, total } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });

      // Runs without startedAt are filtered out
      expect(items.length).toBe(1);
      expect(total).toBe(1);
      expect(items[0].runId).toBe("valid-run");
    });
  });

  describe("System", () => {
    const testSystem: System = {
      id: "test-int-id",
      name: "Test System",
      urlHost: "https://system.test",
      credentials: { apiKey: "secret" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should store and retrieve systems", async () => {
      await store.upsertSystem({ id: testSystem.id, system: testSystem });
      const retrieved = await store.getSystem({ id: testSystem.id, includeDocs: true });
      expect(retrieved).toEqual({ ...testSystem, id: testSystem.id });
    });

    it("should list systems", async () => {
      await store.upsertSystem({ id: testSystem.id, system: testSystem });
      const { items, total } = await store.listSystems({
        limit: 10,
        offset: 0,
        includeDocs: true,
      });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual({ ...testSystem, id: testSystem.id });
    });

    it("should delete systems", async () => {
      await store.upsertSystem({ id: testSystem.id, system: testSystem });
      await store.deleteSystem({ id: testSystem.id });
      const retrieved = await store.getSystem({ id: testSystem.id, includeDocs: true });
      expect(retrieved).toBeNull();
    });

    it("should return null for missing system", async () => {
      const retrieved = await store.getSystem({ id: "does-not-exist", includeDocs: true });
      expect(retrieved).toBeNull();
    });

    it("should get many systems by ids, skipping missing ones", async () => {
      const int2 = { ...testSystem, id: "test-int-id-2", name: "System 2" };
      await store.upsertSystem({
        id: testSystem.id,
        system: testSystem,
        orgId: testOrgId,
      });
      await store.upsertSystem({ id: int2.id, system: int2, orgId: testOrgId });
      const result = await store.getManySystems({
        ids: [testSystem.id, int2.id, "missing-id"],
        orgId: testOrgId,
      });
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id).sort()).toEqual([testSystem.id, int2.id].sort());
    });
  });

  describe("Workflow", () => {
    const testWorkflow: Tool = {
      id: "test-workflow-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      instruction: "Test workflow",
      steps: [],
      inputSchema: {},
    };

    it("should store and retrieve workflows", async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      const retrieved = await store.getWorkflow({ id: testWorkflow.id });
      expect(retrieved).toEqual(testWorkflow);
    });

    it("should list workflows", async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      const { items, total } = await store.listWorkflows({ limit: 10, offset: 0 });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual(testWorkflow);
    });

    it("should delete workflows", async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.deleteWorkflow({ id: testWorkflow.id });
      const retrieved = await store.getWorkflow({ id: testWorkflow.id });
      expect(retrieved).toBeNull();
    });

    it("should return null for missing workflow", async () => {
      const retrieved = await store.getWorkflow({ id: "does-not-exist" });
      expect(retrieved).toBeNull();
    });
  });

  describe("Workflow Schedule", () => {
    const testWorkflow: Tool = {
      id: "test-workflow-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      instruction: "Test workflow",
      steps: [],
      inputSchema: {},
    };

    const testWorkflowSchedule: ToolScheduleInternal = {
      id: "68d51b90-605d-4e85-8c9a-c82bad2c7337",
      orgId: testOrgId,
      toolId: testWorkflow.id,
      payload: null,
      options: null,
      lastRunAt: null,
      cronExpression: "0 0 * * *",
      timezone: "UTC",
      enabled: true,
      nextRunAt: new Date("2020-01-01T10:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("upserting should store new workflow schedule", async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
      await store.upsertToolSchedule({ schedule: testWorkflowSchedule });
      const retrieved = await store.listToolSchedules({
        toolId: testWorkflow.id,
        orgId: testOrgId,
      });

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]).toMatchObject({
        ...testWorkflowSchedule,
        updatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      });
    });

    it("upserting should update existing workflow schedule", async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
      await store.upsertToolSchedule({ schedule: testWorkflowSchedule });
      const updatedSchedule = {
        ...testWorkflowSchedule,
        cronExpression: "*/15 * * * * *",
      };

      await store.upsertToolSchedule({ schedule: updatedSchedule });

      const retrieved = await store.getToolSchedule({
        id: testWorkflowSchedule.id,
        orgId: testOrgId,
      });
      expect(retrieved).toMatchObject({
        ...updatedSchedule,
        updatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      });
    });

    it("should delete workflow schedules", async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.upsertToolSchedule({ schedule: testWorkflowSchedule });

      const success = await store.deleteToolSchedule({
        id: testWorkflowSchedule.id,
        orgId: testOrgId,
      });
      expect(success).toBe(true);

      const retrieved = await store.listToolSchedules({
        toolId: testWorkflow.id,
        orgId: testOrgId,
      });
      expect(retrieved).toHaveLength(0);
    });

    it("should only return workflow schedules for the specified org", async () => {
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId2,
      });

      await store.upsertToolSchedule({
        schedule: {
          ...testWorkflowSchedule,
          orgId: testOrgId,
        },
      });

      await store.upsertToolSchedule({
        schedule: {
          ...testWorkflowSchedule,
          orgId: testOrgId2,
        },
      });

      const workflowSchedulesFromFirstOrg = await store.listToolSchedules({
        toolId: testWorkflow.id,
        orgId: testOrgId,
      });
      expect(workflowSchedulesFromFirstOrg).toHaveLength(1);
      expect(workflowSchedulesFromFirstOrg[0]).toMatchObject({
        ...testWorkflowSchedule,
        orgId: testOrgId,
        updatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      });

      const workflowSchedulesFromSecondOrg = await store.listToolSchedules({
        toolId: testWorkflow.id,
        orgId: testOrgId2,
      });
      expect(workflowSchedulesFromSecondOrg).toHaveLength(1);
      expect(workflowSchedulesFromSecondOrg[0]).toMatchObject({
        ...testWorkflowSchedule,
        orgId: testOrgId2,
        updatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      });
    });

    it("should list all workflow schedules for org when toolId is not provided", async () => {
      const testWorkflow2 = { ...testWorkflow, id: "test-workflow-2" };
      const testSchedule2: ToolScheduleInternal = {
        ...testWorkflowSchedule,
        id: "schedule-2",
        toolId: testWorkflow2.id,
      };

      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
      await store.upsertWorkflow({
        id: testWorkflow2.id,
        workflow: testWorkflow2,
        orgId: testOrgId,
      });
      await store.upsertToolSchedule({ schedule: testWorkflowSchedule });
      await store.upsertToolSchedule({ schedule: testSchedule2 });

      const allSchedules = await store.listToolSchedules({ orgId: testOrgId });
      expect(allSchedules).toHaveLength(2);

      const scheduleIds = allSchedules.map((s) => s.id);
      expect(scheduleIds).toContain(testWorkflowSchedule.id);
      expect(scheduleIds).toContain(testSchedule2.id);
    });

    it("should list due workflow schedules only", async () => {
      const futureSchedule: ToolScheduleInternal = {
        ...testWorkflowSchedule,
        id: "57f65914-69fa-40ad-a4d1-6d2c372619c4",
        nextRunAt: new Date(Date.now() + 1000 * 60),
      };

      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.upsertToolSchedule({ schedule: testWorkflowSchedule });
      await store.upsertToolSchedule({ schedule: futureSchedule });

      const retrieved = await store.listDueToolSchedules();

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]).toMatchObject({
        ...testWorkflowSchedule,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it("should list enabled due workflow schedules only", async () => {
      const disabledSchedule: ToolScheduleInternal = {
        ...testWorkflowSchedule,
        id: "57f65914-69fa-40ad-a4d1-6d2c372619c4",
        enabled: false,
      };

      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.upsertToolSchedule({ schedule: testWorkflowSchedule });
      await store.upsertToolSchedule({ schedule: disabledSchedule });

      const retrieved = await store.listDueToolSchedules();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]).toMatchObject({
        ...testWorkflowSchedule,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it("should return null for missing workflow schedule", async () => {
      const retrieved = await store.getToolSchedule({
        id: "550e8400-e29b-41d4-a716-446655440005",
      });
      expect(retrieved).toBeNull();
    });

    it("should update workflow schedule next run", async () => {
      const newNextRunAt = new Date("2022-01-01T10:00:00.000Z");
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.upsertToolSchedule({ schedule: testWorkflowSchedule });

      const success = await store.updateScheduleNextRun({
        id: testWorkflowSchedule.id,
        nextRunAt: newNextRunAt,
        lastRunAt: new Date(),
      });
      expect(success).toBe(true);

      const retrieved = await store.listToolSchedules({
        toolId: testWorkflow.id,
        orgId: testOrgId,
      });
      expect(retrieved[0].nextRunAt).toEqual(newNextRunAt);
    });

    it("should return false if workflow schedule is not found", async () => {
      const success = await store.updateScheduleNextRun({
        id: testWorkflowSchedule.id,
        nextRunAt: new Date(),
        lastRunAt: new Date(),
      });
      expect(success).toBe(false);
    });
  });
  describe("Clear All", () => {
    it("should clear all data", async () => {
      const testStepConfig = {
        url: "https://test.com",
        method: HttpMethod.GET,
        headers: {},
        queryParams: {},
        instruction: "Test API",
      };

      const testRunResult: Run = {
        runId: "test-run",
        toolId: "test-api-id",
        status: RunStatus.SUCCESS,
        metadata: {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        tool: { id: "test-api-id", steps: [{ id: "step1", config: testStepConfig }] } as any,
        error: undefined,
      };

      const testSystem: System = {
        id: "test-int-id",
        name: "Test System",
        urlHost: "https://system.test",
        credentials: { apiKey: "secret" },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const testWorkflow: Tool = {
        id: "test-workflow",
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: "Test workflow",
        steps: [],
        inputSchema: {},
      };

      const testWorkflowSchedule: ToolScheduleInternal = {
        id: "test-schedule",
        orgId: testOrgId,
        toolId: testWorkflow.id,
        payload: null,
        options: null,
        lastRunAt: null,
        cronExpression: "0 0 * * *",
        timezone: "UTC",
        enabled: true,
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await store.createRun({ run: testRunResult, orgId: testOrgId });
      await store.upsertSystem({ id: testSystem.id, system: testSystem });
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow });
      await store.upsertToolSchedule({ schedule: testWorkflowSchedule });

      await store.clearAll();

      const { total: runTotal } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });
      const { total: systemTotal } = await store.listSystems({
        limit: 10,
        offset: 0,
        includeDocs: true,
      });
      const { total: workflowTotal } = await store.listWorkflows({ limit: 10, offset: 0 });
      const workflowSchedules = await store.listToolSchedules({
        toolId: testWorkflow.id,
        orgId: testOrgId,
      });

      expect(runTotal).toBe(0);
      expect(systemTotal).toBe(0);
      expect(workflowTotal).toBe(0);
      expect(workflowSchedules).toHaveLength(0);
    });
  });

  describe("Tenant Info", () => {
    it("should set and get tenant info", async () => {
      await store.setTenantInfo({ email: "test@example.com", emailEntrySkipped: false });
      const info = await store.getTenantInfo();
      expect(info.email).toBe("test@example.com");
      expect(info.emailEntrySkipped).toBe(false);
    });

    it("should update only specified fields", async () => {
      await store.setTenantInfo({ email: "test@example.com", emailEntrySkipped: false });
      await store.setTenantInfo({ emailEntrySkipped: true });
      const info = await store.getTenantInfo();
      expect(info.email).toBe("test@example.com");
      expect(info.emailEntrySkipped).toBe(true);
    });

    it("should handle null email", async () => {
      await store.setTenantInfo({ email: null, emailEntrySkipped: true });
      const info = await store.getTenantInfo();
      expect(info.email).toBeNull();
      expect(info.emailEntrySkipped).toBe(true);
    });
  });
});
