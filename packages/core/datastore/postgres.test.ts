import { ApiConfig, HttpMethod, System, Run, RunStatus, Tool } from "@superglue/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresService } from "./postgres.js";
import { ToolScheduleInternal } from "./types.js";

// Mock Postgres client configuration
const testConfig = {
  host: process.env.VITE_POSTGRES_HOST,
  port: parseInt(process.env.VITE_POSTGRES_PORT || "5432"),
  user: process.env.VITE_POSTGRES_USERNAME,
  password: process.env.VITE_POSTGRES_PASSWORD,
  database: process.env.VITE_POSTGRES_DATABASE || "superglue_test",
};

if (!testConfig.host || !testConfig.user || !testConfig.password) {
  describe("PostgresService (skipped)", () => {
    it.skip("Skipping Postgres tests due to missing configuration", () => {
      console.warn("Postgres configuration is not set. Skipping tests.");
    });
  });
} else {
  describe("PostgresService", () => {
    let store: PostgresService;
    const testOrgId = "test-org";
    const testOrgId2 = "test-org-2";

    // Create a single connection for all tests
    beforeAll(async () => {
      try {
        store = new PostgresService(testConfig);
        // Table initialization happens once here
      } catch (error) {
        console.error("Failed to connect to Postgres:", error);
        throw error;
      }
    });

    // Clean up after all tests
    afterAll(async () => {
      try {
        await store.disconnect();
      } catch (error) {
        console.error("Failed to disconnect from Postgres:", error);
      }
    });

    // Add this beforeEach to clean up data between test suites
    beforeEach(async () => {
      // Clear all data for the test org
      await store.clearAll(testOrgId);
      await store.clearAll(testOrgId2);

      // Also clean up tenant_info table since clearAll doesn't handle it
      const client = await store["pool"].connect();
      try {
        await client.query("DELETE FROM tenant_info WHERE id = $1", ["default"]);
      } finally {
        client.release();
      }
    });

    describe("API Config", () => {
      const testApiConfig: ApiConfig = {
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
          id: testApiConfig.id,
          config: testApiConfig,
          orgId: testOrgId,
        });
        const retrieved = await store.getApiConfig({ id: testApiConfig.id, orgId: testOrgId });
        expect(retrieved).toEqual(testApiConfig);
      });

      it("should list API configs", async () => {
        await store.upsertApiConfig({
          id: testApiConfig.id,
          config: testApiConfig,
          orgId: testOrgId,
        });
        const { items, total } = await store.listApiConfigs({
          limit: 10,
          offset: 0,
          orgId: testOrgId,
        });
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual(testApiConfig);
      });

      it("should delete API configs", async () => {
        await store.upsertApiConfig({
          id: testApiConfig.id,
          config: testApiConfig,
          orgId: testOrgId,
        });
        await store.deleteApiConfig({ id: testApiConfig.id, orgId: testOrgId });
        const retrieved = await store.getApiConfig({ id: testApiConfig.id, orgId: testOrgId });
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
        id: "test-run-id",
        toolId: "test-api-id",
        orgId: testOrgId,
        status: RunStatus.SUCCESS,
        toolConfig: { id: "test-api-id", steps: [{ id: "step1", apiConfig: testApiConfig }] },
        startedAt: new Date(),
        completedAt: new Date(),
      };

      it("should store and retrieve runs", async () => {
        await store.createRun({ run: testRun });
        const retrieved = await store.getRun({ id: testRun.id, orgId: testOrgId });
        expect(retrieved?.id).toEqual(testRun.id);
        expect(retrieved?.status).toEqual(testRun.status);
      });

      it("should list runs in chronological order", async () => {
        const run1: Run = {
          ...testRun,
          id: "run1",
          startedAt: new Date(Date.now() - 1000),
        };
        const run2: Run = {
          ...testRun,
          id: "run2",
          startedAt: new Date(),
        };

        await store.createRun({ run: run1 });
        await store.createRun({ run: run2 });

        const { items, total } = await store.listRuns({
          limit: 10,
          offset: 0,
          configId: null,
          orgId: testOrgId,
        });
        expect(items).toHaveLength(2);
        expect(total).toBe(2);
        expect(items[0].id).toBe(run2.id);
        expect(items[1].id).toBe(run1.id);
      });

      it("should list runs filtered by config ID", async () => {
        const run1: Run = { ...testRun, id: "run1", toolId: "config1" };
        const run2: Run = { ...testRun, id: "run2", toolId: "config2" };
        const run3: Run = { ...testRun, id: "run3", toolId: "config1" };

        await store.createRun({ run: run1 });
        await store.createRun({ run: run2 });
        await store.createRun({ run: run3 });

        const { items, total } = await store.listRuns({
          limit: 10,
          offset: 0,
          configId: "config1",
          orgId: testOrgId,
        });
        expect(items.length).toBe(2);
        expect(total).toBe(2);
        expect(items.map((run) => run.id).sort()).toEqual(["run1", "run3"]);
      });

      it("should store and retrieve requestSource correctly", async () => {
        const runWithSource: Run = {
          ...testRun,
          id: "run-with-source",
          requestSource: "api" as any,
        };
        await store.createRun({ run: runWithSource });
        const retrieved = await store.getRun({ id: runWithSource.id, orgId: testOrgId });
        expect(retrieved?.requestSource).toEqual("api");
      });

      it("should default requestSource to 'api' when not provided", async () => {
        const runWithoutSource: Run = {
          ...testRun,
          id: "run-without-source",
          requestSource: undefined,
        };
        await store.createRun({ run: runWithoutSource });
        const retrieved = await store.getRun({ id: runWithoutSource.id, orgId: testOrgId });
        // Column defaults to 'api', extractRun should return it
        expect(retrieved?.requestSource).toEqual("api");
      });

      it("should preserve all valid requestSource values", async () => {
        const sources = ["api", "frontend", "scheduler", "mcp", "tool-chain", "webhook"] as const;
        for (const source of sources) {
          const run: Run = {
            ...testRun,
            id: `run-source-${source}`,
            requestSource: source as any,
          };
          await store.createRun({ run });
          const retrieved = await store.getRun({ id: run.id, orgId: testOrgId });
          expect(retrieved?.requestSource).toEqual(source);
        }
      });

      it("should include requestSource in listRuns results", async () => {
        const run1: Run = { ...testRun, id: "list-run-1", requestSource: "api" as any };
        const run2: Run = { ...testRun, id: "list-run-2", requestSource: "scheduler" as any };
        await store.createRun({ run: run1 });
        await store.createRun({ run: run2 });

        const { items } = await store.listRuns({ limit: 10, offset: 0, orgId: testOrgId });
        const sources = items.map((r) => r.requestSource).sort();
        expect(sources).toContain("api");
        expect(sources).toContain("scheduler");
      });

      it("should preserve requestSource during updateRun", async () => {
        const run: Run = { ...testRun, id: "update-source-run", requestSource: "mcp" as any };
        await store.createRun({ run });

        await store.updateRun({
          id: run.id,
          orgId: testOrgId,
          updates: { status: RunStatus.FAILED, error: "Test error" },
        });

        const retrieved = await store.getRun({ id: run.id, orgId: testOrgId });
        expect(retrieved?.requestSource).toEqual("mcp");
        expect(retrieved?.status).toEqual(RunStatus.FAILED);
      });
    });

    describe("System", () => {
      const testSystem: System = {
        id: "test-system-id",
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
        expect(retrieved).toMatchObject({ ...testSystem, id: testSystem.id });
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
        expect(items[0]).toMatchObject({ ...testSystem, id: testSystem.id });
      });

      it("should delete systems without details", async () => {
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

      it("should delete systems with details", async () => {
        const systemWithDetails: System = {
          ...testSystem,
          id: "test-int-with-details",
          documentation: "Test documentation content",
          openApiSchema: '{"openapi": "3.0.0", "info": {"title": "Test API"}}',
        };

        await store.upsertSystem({
          id: systemWithDetails.id,
          system: systemWithDetails,
          orgId: testOrgId,
        });
        await store.deleteSystem({ id: systemWithDetails.id, orgId: testOrgId });
        const retrieved = await store.getSystem({
          id: systemWithDetails.id,
          includeDocs: true,
          orgId: testOrgId,
        });
        expect(retrieved).toBeNull();
      });

      it("should return null for missing system", async () => {
        const retrieved = await store.getSystem({
          id: "does-not-exist",
          includeDocs: true,
          orgId: testOrgId,
        });
        expect(retrieved).toBeNull();
      });

      it("should get many systems by ids, skipping missing ones", async () => {
        const system2 = { ...testSystem, id: "test-system-id-2", name: "System 2" };
        await store.upsertSystem({
          id: testSystem.id,
          system: testSystem,
          orgId: testOrgId,
        });
        await store.upsertSystem({ id: system2.id, system: system2, orgId: testOrgId });
        const result = await store.getManySystems({
          ids: [testSystem.id, system2.id, "missing-id"],
          orgId: testOrgId,
        });
        expect(result).toHaveLength(2);
        expect(result.map((i) => i.id).sort()).toEqual([testSystem.id, system2.id].sort());
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
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });
        const retrieved = await store.getWorkflow({ id: testWorkflow.id, orgId: testOrgId });
        expect(retrieved).toEqual(testWorkflow);
      });

      it("should list workflows", async () => {
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });
        const { items, total } = await store.listWorkflows({
          limit: 10,
          offset: 0,
          orgId: testOrgId,
        });
        expect(items).toHaveLength(1);
        expect(total).toBe(1);
        expect(items[0]).toEqual(testWorkflow);
      });

      it("should delete workflows", async () => {
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });
        await store.deleteWorkflow({ id: testWorkflow.id, orgId: testOrgId });
        const retrieved = await store.getWorkflow({ id: testWorkflow.id, orgId: testOrgId });
        expect(retrieved).toBeNull();
      });

      it("should return null for missing workflow", async () => {
        const retrieved = await store.getWorkflow({ id: "does-not-exist", orgId: testOrgId });
        expect(retrieved).toBeNull();
      });
    });

    describe("Tool History", () => {
      const testWorkflow: Tool = {
        id: "test-history-workflow",
        createdAt: new Date(),
        updatedAt: new Date(),
        instruction: "Test workflow v1",
        steps: [],
        inputSchema: {},
      };

      it("should archive previous version on upsert", async () => {
        // First save
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
          userId: "user-1",
          userEmail: "user1@test.com",
        });

        // Second save with changes
        const updatedWorkflow = { ...testWorkflow, instruction: "Test workflow v2" };
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: updatedWorkflow,
          orgId: testOrgId,
          userId: "user-2",
          userEmail: "user2@test.com",
        });

        // Check history
        const history = await store.listToolHistory({
          toolId: testWorkflow.id,
          orgId: testOrgId,
        });

        expect(history).toHaveLength(1);
        expect(history[0].version).toBe(1);
        expect(history[0].tool.instruction).toBe("Test workflow v1");
        expect(history[0].createdByUserId).toBe("user-2");
        expect(history[0].createdByEmail).toBe("user2@test.com");
      });

      it("should return empty history for new tool", async () => {
        await store.upsertWorkflow({
          id: "brand-new-tool",
          workflow: { ...testWorkflow, id: "brand-new-tool" },
          orgId: testOrgId,
        });

        const history = await store.listToolHistory({
          toolId: "brand-new-tool",
          orgId: testOrgId,
        });

        expect(history).toHaveLength(0);
      });

      it("should restore a previous version", async () => {
        // Create initial version
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: { ...testWorkflow, instruction: "Original" },
          orgId: testOrgId,
        });

        // Update to v2
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: { ...testWorkflow, instruction: "Updated" },
          orgId: testOrgId,
        });

        // Update to v3
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: { ...testWorkflow, instruction: "Updated again" },
          orgId: testOrgId,
        });

        // History should have 2 entries (v1 and v2)
        let history = await store.listToolHistory({
          toolId: testWorkflow.id,
          orgId: testOrgId,
        });
        expect(history).toHaveLength(2);

        // Restore v1
        const restored = await store.restoreToolVersion({
          toolId: testWorkflow.id,
          version: 1,
          orgId: testOrgId,
          userId: "restorer",
          userEmail: "restorer@test.com",
        });

        expect(restored.instruction).toBe("Original");

        // Current should now be "Original"
        const current = await store.getWorkflow({ id: testWorkflow.id, orgId: testOrgId });
        expect(current?.instruction).toBe("Original");

        // History should now have 3 entries (v1, v2, v3 - the "Updated again" that was current)
        history = await store.listToolHistory({
          toolId: testWorkflow.id,
          orgId: testOrgId,
        });
        expect(history).toHaveLength(3);
      });

      it("should throw error when restoring non-existent version", async () => {
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });

        await expect(
          store.restoreToolVersion({
            toolId: testWorkflow.id,
            version: 999,
            orgId: testOrgId,
          }),
        ).rejects.toThrow("Version 999 not found");
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
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });
        await store.upsertToolSchedule({ schedule: testWorkflowSchedule });
        const retrieved = await store.listToolSchedules({
          toolId: testWorkflow.id,
          orgId: testOrgId,
        });

        expect(retrieved).toHaveLength(1);
        expect(retrieved[0]).toMatchObject({
          ...testWorkflowSchedule,
          nextRunAt: expect.any(Date),
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
          nextRunAt: expect.any(Date),
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
          nextRunAt: expect.any(Date),
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
          nextRunAt: expect.any(Date),
          updatedAt: expect.any(Date),
          createdAt: expect.any(Date),
        });
      });

      it("should list all workflow schedules for org when toolId is not provided", async () => {
        const testWorkflow2 = { ...testWorkflow, id: "test-workflow-2" };
        const testSchedule2: ToolScheduleInternal = {
          ...testWorkflowSchedule,
          id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          toolId: testWorkflow2.id,
        };

        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });
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

        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });
        await store.upsertToolSchedule({ schedule: testWorkflowSchedule });
        await store.upsertToolSchedule({ schedule: futureSchedule });

        const retrieved = await store.listDueToolSchedules();

        expect(retrieved).toHaveLength(1);
        expect(retrieved[0]).toMatchObject({
          ...testWorkflowSchedule,
          nextRunAt: expect.any(Date),
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

        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });
        await store.upsertToolSchedule({ schedule: testWorkflowSchedule });
        await store.upsertToolSchedule({ schedule: disabledSchedule });

        const retrieved = await store.listDueToolSchedules();
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0]).toMatchObject({
          ...testWorkflowSchedule,
          nextRunAt: expect.any(Date),
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
        await store.upsertWorkflow({
          id: testWorkflow.id,
          workflow: testWorkflow,
          orgId: testOrgId,
        });
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

        // Calculate timezone offset and adjust expected time
        const timezoneOffsetMs = newNextRunAt.getTimezoneOffset() * 60 * 1000;
        const expectedTime = new Date(newNextRunAt.getTime() + timezoneOffsetMs);

        expect(retrieved[0].nextRunAt.getTime()).toEqual(expectedTime.getTime());
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

    describe("Health Check", () => {
      it("should return true when postgres is connected", async () => {
        const result = await store.ping();
        expect(result).toBe(true);
      });
    });
  });
}
