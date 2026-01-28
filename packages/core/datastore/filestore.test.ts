import { ApiConfig, HttpMethod, RequestSource, Run, RunStatus, Tool } from "@superglue/shared";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStore } from "./filestore.js";
import { ToolScheduleInternal } from "./types.js";

describe("FileStore", () => {
  let store: FileStore;
  const testOrgId = "test-org";
  const testOrgId2 = "test-org-2";
  const testDir = "./.test-data";
  const testLogsPath = path.join(testDir, "superglue_logs.jsonl");
  const testPath = path.join(testDir, "superglue_data.json");

  beforeEach(() => {
    // Clean up any existing test data
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
    if (fs.existsSync(testLogsPath)) {
      fs.unlinkSync(testLogsPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
    // Clear the DISABLE_LOGS environment variable for tests
    delete process.env.DISABLE_LOGS;
    store = new FileStore(testDir);
  });

  afterEach(async () => {
    await store.clearAll();
    await store.disconnect();
    // Clean up test files
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
    if (fs.existsSync(testLogsPath)) {
      fs.unlinkSync(testLogsPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
    // Clean up environment variable
    delete process.env.DISABLE_LOGS;
  });

  describe("API Config", () => {
    const testConfig: ApiConfig = {
      id: "test-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      urlHost: "https://test.com",
      method: HttpMethod.GET,
      headers: {},
      queryParams: {},
      instruction: "Test API",
    };

    it("should store and retrieve API configs", async () => {
      await store.upsertApiConfig({ id: testConfig.id, config: testConfig, orgId: testOrgId });
      const retrieved = await store.getApiConfig({ id: testConfig.id, orgId: testOrgId });
      expect(retrieved).toEqual(testConfig);
    });

    it("should list API configs", async () => {
      await store.upsertApiConfig({ id: testConfig.id, config: testConfig, orgId: testOrgId });
      const { items, total } = await store.listApiConfigs({
        limit: 10,
        offset: 0,
        orgId: testOrgId,
      });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual(testConfig);
    });

    it("should delete API configs", async () => {
      await store.upsertApiConfig({ id: testConfig.id, config: testConfig, orgId: testOrgId });
      await store.deleteApiConfig({ id: testConfig.id, orgId: testOrgId });
      const retrieved = await store.getApiConfig({ id: testConfig.id, orgId: testOrgId });
      expect(retrieved).toBeNull();
    });
  });

  describe("Run Results", () => {
    const testApiConfig: ApiConfig = {
      id: "test-api-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      urlHost: "https://test.com",
      method: HttpMethod.GET,
      headers: {},
      queryParams: {},
      instruction: "Test API",
    };

    const testRun: Run = {
      runId: "test-run-id",
      toolId: "test-config-id",
      status: RunStatus.SUCCESS,
      tool: { id: "test-config-id", steps: [{ id: "step1", apiConfig: testApiConfig }] },
      metadata: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    };

    it("should store and retrieve runs", async () => {
      await store.createRun({ run: testRun, orgId: testOrgId });
      const retrieved = await store.getRun({ id: testRun.runId, orgId: testOrgId });
      expect(retrieved.runId).toEqual(testRun.runId);
      expect(retrieved.status).toEqual(testRun.status);
    });

    it("should list runs in chronological order", async () => {
      const run1: Run = {
        ...testRun,
        runId: "run1",
        metadata: {
          startedAt: new Date("2023-01-01").toISOString(),
          completedAt: new Date("2023-01-01").toISOString(),
        },
      };
      const run2: Run = {
        ...testRun,
        runId: "run2",
        metadata: {
          startedAt: new Date("2023-01-02").toISOString(),
          completedAt: new Date("2023-01-02").toISOString(),
        },
      };

      await store.createRun({ run: run1, orgId: testOrgId });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await store.createRun({ run: run2, orgId: testOrgId });

      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: null,
        orgId: testOrgId,
      });
      expect(items).toHaveLength(2);
      expect(total).toBe(2);
      expect(items[0].runId).toBe(run2.runId); // Most recent first
      expect(items[1].runId).toBe(run1.runId);
    });

    it("should list runs filtered by config ID", async () => {
      const run1: Run = { ...testRun, runId: "run1", toolId: "config1" };
      const run2: Run = { ...testRun, runId: "run2", toolId: "config2" };
      const run3: Run = { ...testRun, runId: "run3", toolId: "config1" };

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
      expect(total).toBe(2); // Total should match filtered results since we changed the implementation
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

    it("should persist data between store instances", async () => {
      await store.createRun({ run: testRun, orgId: testOrgId });
      await store.disconnect();

      const newStore = new FileStore(testDir);
      const retrieved = await newStore.getRun({ id: testRun.runId, orgId: testOrgId });
      expect(retrieved.runId).toEqual(testRun.runId);
    });

    it("should not log runs when DISABLE_LOGS is set", async () => {
      process.env.DISABLE_LOGS = "true";

      await store.createRun({ run: testRun, orgId: testOrgId });
      const { items } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: null,
        orgId: testOrgId,
      });

      expect(items).toHaveLength(0);
    });

    it("should filter out corrupted runs and continue listing valid ones", async () => {
      const validRun: Run = { ...testRun, runId: "valid-run" };
      await store.createRun({ run: validRun, orgId: testOrgId });

      // Manually write an invalid JSON line to the logs file
      await fs.promises.appendFile(testLogsPath, "invalid json line\n");

      // Should still be able to read valid runs
      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: null,
        orgId: testOrgId,
      });

      // Should only return the valid run
      expect(items.length).toBe(1);
      expect(total).toBe(1);
      expect(items[0].runId).toBe("valid-run");
    });

    it("should handle runs with missing startedAt dates", async () => {
      const validRun: Run = { ...testRun, runId: "valid-run" };
      await store.createRun({ run: validRun, orgId: testOrgId });

      // Manually write a run without startedAt to the logs file
      const invalidRun = {
        runId: "invalid-run",
        config: testApiConfig,
        success: true,
        completedAt: new Date(),
        error: null,
        orgId: testOrgId,
      };
      await fs.promises.appendFile(testLogsPath, JSON.stringify(invalidRun) + "\n");

      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: null,
        orgId: testOrgId,
      });

      expect(items.length).toBe(2);
      expect(total).toBe(2);
    });

    it("should handle runs with missing config IDs", async () => {
      const validRun: Run = { ...testRun, runId: "valid-run" };
      await store.createRun({ run: validRun, orgId: testOrgId });

      // Manually write a run without config.id to the logs file
      const invalidRun = {
        runId: "invalid-run",
        config: { urlHost: "test" },
        startedAt: new Date(),
        success: true,
        completedAt: new Date(),
        error: null,
        orgId: testOrgId,
      };
      await fs.promises.appendFile(testLogsPath, JSON.stringify(invalidRun) + "\n");

      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: null,
        orgId: testOrgId,
      });

      expect(items.length).toBe(2);
      expect(total).toBe(2);
    });

    it("should isolate runs by orgId and not leak runs from other orgs", async () => {
      const run1: Run = { ...testRun, runId: "org1-run" };
      const run2: Run = { ...testRun, runId: "org2-run" };

      await store.createRun({ run: run1, orgId: testOrgId });
      await store.createRun({ run: run2, orgId: testOrgId2 });

      // Org 1 should only see their run
      const { items: org1Items, total: org1Total } = await store.listRuns({
        limit: 10,
        offset: 0,
        orgId: testOrgId,
      });
      expect(org1Items).toHaveLength(1);
      expect(org1Total).toBe(1);
      expect(org1Items[0].runId).toBe("org1-run");

      // Org 2 should only see their run
      const { items: org2Items, total: org2Total } = await store.listRuns({
        limit: 10,
        offset: 0,
        orgId: testOrgId2,
      });
      expect(org2Items).toHaveLength(1);
      expect(org2Total).toBe(1);
      expect(org2Items[0].runId).toBe("org2-run");
    });

    it("should not leak legacy runs without orgId when filtering by orgId", async () => {
      const validRun: Run = { ...testRun, runId: "org-run" };
      await store.createRun({ run: validRun, orgId: testOrgId });

      // Manually write a legacy run without orgId to the logs file
      const legacyRun = {
        runId: "legacy-run",
        toolId: "test-config-id",
        status: "SUCCESS",
        metadata: {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        // Note: no orgId field - simulating legacy data
      };
      await fs.promises.appendFile(testLogsPath, JSON.stringify(legacyRun) + "\n");

      // When filtering by orgId, legacy runs without orgId should NOT be returned
      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        orgId: testOrgId,
      });

      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0].runId).toBe("org-run");
    });
  });

  describe("System", () => {
    const testSystem = {
      id: "test-int-id",
      name: "Test System",
      urlHost: "https://system.test",
      credentials: { apiKey: "secret" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should store and retrieve systems", async () => {
      await store.upsertSystem({
        id: testSystem.id,
        system: testSystem,
        orgId: testOrgId,
      });
      const retrieved = await store.getSystem({
        id: testSystem.id,
        includeDocs: true,
        orgId: testOrgId,
      });
      expect(retrieved).toEqual({ ...testSystem, id: testSystem.id });
    });

    it("should list systems", async () => {
      await store.upsertSystem({
        id: testSystem.id,
        system: testSystem,
        orgId: testOrgId,
      });
      const { items, total } = await store.listSystems({
        limit: 10,
        offset: 0,
        includeDocs: true,
        orgId: testOrgId,
      });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual({ ...testSystem, id: testSystem.id });
    });

    it("should delete systems", async () => {
      await store.upsertSystem({
        id: testSystem.id,
        system: testSystem,
        orgId: testOrgId,
      });
      await store.deleteSystem({ id: testSystem.id, orgId: testOrgId });
      const retrieved = await store.getSystem({
        id: testSystem.id,
        includeDocs: true,
        orgId: testOrgId,
      });
      expect(retrieved).toBeNull();
    });

    it("should return null for missing system", async () => {
      const retrieved = await store.getSystem({
        id: "non-existent",
        includeDocs: true,
        orgId: testOrgId,
      });
      expect(retrieved).toBeNull();
    });

    it("should get many systems by ids, skipping missing ones", async () => {
      const int1 = { ...testSystem, id: "int1" };
      const int2 = { ...testSystem, id: "int2" };

      await store.upsertSystem({ id: int1.id, system: int1, orgId: testOrgId });
      await store.upsertSystem({ id: int2.id, system: int2, orgId: testOrgId });

      const results = await store.getManySystems({
        ids: ["int1", "missing", "int2"],
        orgId: testOrgId,
      });

      expect(results).toHaveLength(2);
      expect(results.map((i) => i.id).sort()).toEqual(["int1", "int2"]);
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
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
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
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
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

      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
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

      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
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
        orgId: testOrgId,
      });
      expect(retrieved).toBeNull();
    });

    it("should update workflow schedule next run", async () => {
      const newNextRunAt = new Date("2022-01-01T10:00:00.000Z");
      await store.upsertWorkflow({ id: testWorkflow.id, workflow: testWorkflow, orgId: testOrgId });
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
      const testApiConfig: ApiConfig = {
        id: "test-clear-api",
        createdAt: new Date(),
        updatedAt: new Date(),
        urlHost: "https://test.com",
        method: HttpMethod.GET,
        headers: {},
        queryParams: {},
        instruction: "Test API for clear",
      };

      const testRunResult: Run = {
        runId: "test-clear-run",
        toolId: testApiConfig.id,
        status: RunStatus.SUCCESS,
        metadata: {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      };

      await store.upsertApiConfig({
        id: testApiConfig.id,
        config: testApiConfig,
        orgId: testOrgId,
      });
      await store.createRun({ run: testRunResult, orgId: testOrgId });

      // Clear all
      await store.clearAll();

      // Check that data is gone
      const apiConfig = await store.getApiConfig({ id: testApiConfig.id, orgId: testOrgId });
      expect(apiConfig).toBeNull();

      const { items: runs } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: null,
        orgId: testOrgId,
      });
      expect(runs).toHaveLength(0);
    });
  });
});
