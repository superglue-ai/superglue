import { ApiConfig, HttpMethod, RunResult, Workflow } from "@superglue/client";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStore } from "./filestore.js";
import { WorkflowScheduleInternal } from "./types.js";

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
      await store.upsertApiConfig({
        id: testConfig.id,
        config: testConfig,
        orgId: testOrgId,
      });
      const retrieved = await store.getApiConfig({
        id: testConfig.id,
        orgId: testOrgId,
      });
      expect(retrieved).toEqual(testConfig);
    });

    it("should list API configs", async () => {
      await store.upsertApiConfig({
        id: testConfig.id,
        config: testConfig,
        orgId: testOrgId,
      });
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
      await store.upsertApiConfig({
        id: testConfig.id,
        config: testConfig,
        orgId: testOrgId,
      });
      await store.deleteApiConfig({ id: testConfig.id, orgId: testOrgId });
      const retrieved = await store.getApiConfig({
        id: testConfig.id,
        orgId: testOrgId,
      });
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

    const testRun: RunResult = {
      id: "test-run-id",
      startedAt: new Date(),
      completedAt: new Date(),
      success: true,
      config: testApiConfig,
      error: null,
    };

    it("should store and retrieve runs", async () => {
      await store.createRun({ result: testRun, orgId: testOrgId });
      const retrieved = await store.getRun({
        id: testRun.id,
        orgId: testOrgId,
      });
      expect(retrieved).toEqual(testRun);
    });

    it("should list runs in chronological order", async () => {
      const run1 = {
        ...testRun,
        id: "run1",
        startedAt: new Date("2023-01-01"),
        completedAt: new Date("2023-01-01"),
      };
      const run2 = {
        ...testRun,
        id: "run2",
        startedAt: new Date("2023-01-02"),
        completedAt: new Date("2023-01-02"),
      };

      await store.createRun({ result: run1, orgId: testOrgId });
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
      await store.createRun({ result: run2, orgId: testOrgId });

      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: null,
        orgId: testOrgId,
      });
      expect(items).toHaveLength(2);
      expect(total).toBe(2);
      expect(items[0].id).toBe(run2.id); // Most recent first
      expect(items[1].id).toBe(run1.id);
    });

    it("should delete runs", async () => {
      await store.createRun({ result: testRun, orgId: testOrgId });
      const deleted = await store.deleteRun({
        id: testRun.id,
        orgId: testOrgId,
      });
      expect(deleted).toBe(true);
      const retrieved = await store.getRun({
        id: testRun.id,
        orgId: testOrgId,
      });
      expect(retrieved).toBeNull();
    });

    it("should list runs filtered by config ID", async () => {
      const run1 = {
        ...testRun,
        id: "run1",
        config: { ...testApiConfig, id: "config1" },
      };
      const run2 = {
        ...testRun,
        id: "run2",
        config: { ...testApiConfig, id: "config2" },
      };
      const run3 = {
        ...testRun,
        id: "run3",
        config: { ...testApiConfig, id: "config1" },
      };

      await store.createRun({ result: run1, orgId: testOrgId });
      await store.createRun({ result: run2, orgId: testOrgId });
      await store.createRun({ result: run3, orgId: testOrgId });

      const { items, total } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: "config1",
        orgId: testOrgId,
      });
      expect(items.length).toBe(2);
      expect(total).toBe(2); // Total should match filtered results since we changed the implementation
      expect(items.map((run) => run.id).sort()).toEqual(["run1", "run3"]);
    });

    it("should persist data between store instances", async () => {
      await store.createRun({ result: testRun, orgId: testOrgId });
      await store.disconnect();

      const newStore = new FileStore(testDir);
      const retrieved = await newStore.getRun({
        id: testRun.id,
        orgId: testOrgId,
      });
      expect(retrieved).toEqual(testRun);
    });

    it("should not log runs when DISABLE_LOGS is set", async () => {
      process.env.DISABLE_LOGS = "true";

      await store.createRun({ result: testRun, orgId: testOrgId });
      const { items } = await store.listRuns({
        limit: 10,
        offset: 0,
        configId: null,
        orgId: testOrgId,
      });

      expect(items).toHaveLength(0);
    });

    it("should filter out corrupted runs and continue listing valid ones", async () => {
      // Create a valid run
      const validRun = { ...testRun, id: "valid-run" };
      await store.createRun({ result: validRun, orgId: testOrgId });

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
      expect(items[0].id).toBe("valid-run");
    });

    it("should handle runs with missing startedAt dates", async () => {
      // Create a valid run
      const validRun = { ...testRun, id: "valid-run" };
      await store.createRun({ result: validRun, orgId: testOrgId });

      // Manually write a run without startedAt to the logs file
      const invalidRun = {
        id: "invalid-run",
        config: testApiConfig,
        success: true,
        completedAt: new Date(),
        error: null,
        orgId: testOrgId,
      };
      await fs.promises.appendFile(
        testLogsPath,
        JSON.stringify(invalidRun) + "\n",
      );

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
      expect(items[0].id).toBe("valid-run");
    });

    it("should handle runs with missing config IDs", async () => {
      // Create a valid run
      const validRun = { ...testRun, id: "valid-run" };
      await store.createRun({ result: validRun, orgId: testOrgId });

      // Manually write a run without config.id to the logs file
      const invalidRun = {
        id: "invalid-run",
        config: { urlHost: "test" },
        startedAt: new Date(),
        success: true,
        completedAt: new Date(),
        error: null,
        orgId: testOrgId,
      };
      await fs.promises.appendFile(
        testLogsPath,
        JSON.stringify(invalidRun) + "\n",
      );

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
      expect(items[0].id).toBe("valid-run");
    });
  });

  describe("Integration", () => {
    const testIntegration = {
      id: "test-int-id",
      name: "Test Integration",
      urlHost: "https://integration.test",
      credentials: { apiKey: "secret" },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should store and retrieve integrations", async () => {
      await store.upsertIntegration({
        id: testIntegration.id,
        integration: testIntegration,
        orgId: testOrgId,
      });
      const retrieved = await store.getIntegration({
        id: testIntegration.id,
        includeDocs: true,
        orgId: testOrgId,
      });
      expect(retrieved).toEqual({ ...testIntegration, id: testIntegration.id });
    });

    it("should list integrations", async () => {
      await store.upsertIntegration({
        id: testIntegration.id,
        integration: testIntegration,
        orgId: testOrgId,
      });
      const { items, total } = await store.listIntegrations({
        limit: 10,
        offset: 0,
        includeDocs: true,
        orgId: testOrgId,
      });
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
      expect(items[0]).toEqual({ ...testIntegration, id: testIntegration.id });
    });

    it("should delete integrations", async () => {
      await store.upsertIntegration({
        id: testIntegration.id,
        integration: testIntegration,
        orgId: testOrgId,
      });
      await store.deleteIntegration({
        id: testIntegration.id,
        orgId: testOrgId,
      });
      const retrieved = await store.getIntegration({
        id: testIntegration.id,
        includeDocs: true,
        orgId: testOrgId,
      });
      expect(retrieved).toBeNull();
    });

    it("should return null for missing integration", async () => {
      const retrieved = await store.getIntegration({
        id: "non-existent",
        includeDocs: true,
        orgId: testOrgId,
      });
      expect(retrieved).toBeNull();
    });

    it("should get many integrations by ids, skipping missing ones", async () => {
      const int1 = { ...testIntegration, id: "int1" };
      const int2 = { ...testIntegration, id: "int2" };

      await store.upsertIntegration({
        id: int1.id,
        integration: int1,
        orgId: testOrgId,
      });
      await store.upsertIntegration({
        id: int2.id,
        integration: int2,
        orgId: testOrgId,
      });

      const results = await store.getManyIntegrations({
        ids: ["int1", "missing", "int2"],
        orgId: testOrgId,
      });

      expect(results).toHaveLength(2);
      expect(results.map((i) => i.id).sort()).toEqual(["int1", "int2"]);
    });
  });

  describe("Workflow", () => {
    const testWorkflow = {
      id: "test-workflow-id",
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should get many workflows by ids, skipping missing ones", async () => {
      const workflow1: Workflow = {
        id: "workflow1",
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: "Test workflow 1",
        steps: [],
        inputSchema: {},
      };

      const workflow2: Workflow = {
        id: "workflow2",
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: "Test workflow 2",
        steps: [],
        inputSchema: {},
      };

      await store.upsertWorkflow({
        id: workflow1.id,
        workflow: workflow1,
        orgId: testOrgId,
      });
      await store.upsertWorkflow({
        id: workflow2.id,
        workflow: workflow2,
        orgId: testOrgId,
      });

      const results = await store.getManyWorkflows({
        ids: ["workflow1", "missing", "workflow2"],
        orgId: testOrgId,
      });

      expect(results).toHaveLength(2);
      expect(results.map((w) => w.id).sort()).toEqual([
        "workflow1",
        "workflow2",
      ]);
    });
  });

  describe("Workflow Schedule", () => {
    const testWorkflow: Workflow = {
      id: "test-workflow-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      instruction: "Test workflow",
      steps: [],
      inputSchema: {},
    };

    const testWorkflowSchedule: WorkflowScheduleInternal = {
      id: "68d51b90-605d-4e85-8c9a-c82bad2c7337",
      orgId: testOrgId,
      workflowId: testWorkflow.id,
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
      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId,
      });
      await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
      const retrieved = await store.listWorkflowSchedules({
        workflowId: testWorkflow.id,
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
      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId,
      });
      await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
      const updatedSchedule = {
        ...testWorkflowSchedule,
        cronExpression: "*/15 * * * * *",
      };

      await store.upsertWorkflowSchedule({ schedule: updatedSchedule });

      const retrieved = await store.getWorkflowSchedule({
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
      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId,
      });
      await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });

      const success = await store.deleteWorkflowSchedule({
        id: testWorkflowSchedule.id,
        orgId: testOrgId,
      });
      expect(success).toBe(true);

      const retrieved = await store.listWorkflowSchedules({
        workflowId: testWorkflow.id,
        orgId: testOrgId,
      });
      expect(retrieved).toHaveLength(0);
    });

    it("should only return workflow schedules for the specified org", async () => {
      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId,
      });
      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId2,
      });

      await store.upsertWorkflowSchedule({
        schedule: {
          ...testWorkflowSchedule,
          orgId: testOrgId,
        },
      });

      await store.upsertWorkflowSchedule({
        schedule: {
          ...testWorkflowSchedule,
          orgId: testOrgId2,
        },
      });

      const workflowSchedulesFromFirstOrg = await store.listWorkflowSchedules({
        workflowId: testWorkflow.id,
        orgId: testOrgId,
      });
      expect(workflowSchedulesFromFirstOrg).toHaveLength(1);
      expect(workflowSchedulesFromFirstOrg[0]).toMatchObject({
        ...testWorkflowSchedule,
        orgId: testOrgId,
        updatedAt: expect.any(Date),
        createdAt: expect.any(Date),
      });

      const workflowSchedulesFromSecondOrg = await store.listWorkflowSchedules({
        workflowId: testWorkflow.id,
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

    it("should list due workflow schedules only", async () => {
      const futureSchedule: WorkflowScheduleInternal = {
        ...testWorkflowSchedule,
        id: "57f65914-69fa-40ad-a4d1-6d2c372619c4",
        nextRunAt: new Date(Date.now() + 1000 * 60),
      };

      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId,
      });
      await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
      await store.upsertWorkflowSchedule({ schedule: futureSchedule });

      const retrieved = await store.listDueWorkflowSchedules();

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]).toMatchObject({
        ...testWorkflowSchedule,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it("should list enabled due workflow schedules only", async () => {
      const disabledSchedule: WorkflowScheduleInternal = {
        ...testWorkflowSchedule,
        id: "57f65914-69fa-40ad-a4d1-6d2c372619c4",
        enabled: false,
      };

      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId,
      });
      await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });
      await store.upsertWorkflowSchedule({ schedule: disabledSchedule });

      const retrieved = await store.listDueWorkflowSchedules();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]).toMatchObject({
        ...testWorkflowSchedule,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it("should return null for missing workflow schedule", async () => {
      const retrieved = await store.getWorkflowSchedule({
        id: "550e8400-e29b-41d4-a716-446655440005",
        orgId: testOrgId,
      });
      expect(retrieved).toBeNull();
    });

    it("should update workflow schedule next run", async () => {
      const newNextRunAt = new Date("2022-01-01T10:00:00.000Z");
      await store.upsertWorkflow({
        id: testWorkflow.id,
        workflow: testWorkflow,
        orgId: testOrgId,
      });
      await store.upsertWorkflowSchedule({ schedule: testWorkflowSchedule });

      const success = await store.updateScheduleNextRun({
        id: testWorkflowSchedule.id,
        nextRunAt: newNextRunAt,
        lastRunAt: new Date(),
      });
      expect(success).toBe(true);

      const retrieved = await store.listWorkflowSchedules({
        workflowId: testWorkflow.id,
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

      const testRunResult: RunResult = {
        id: "test-clear-run",
        startedAt: new Date(),
        completedAt: new Date(),
        success: true,
        config: testApiConfig,
        error: null,
      };

      // Add some data
      await store.upsertApiConfig({
        id: testApiConfig.id,
        config: testApiConfig,
        orgId: testOrgId,
      });
      await store.createRun({ result: testRunResult, orgId: testOrgId });

      // Clear all
      await store.clearAll();

      // Check that data is gone
      const apiConfig = await store.getApiConfig({
        id: testApiConfig.id,
        orgId: testOrgId,
      });
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
