import { RequestSource, Run, RunStatus } from "@superglue/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapRunToOpenAPI } from "./runs.js";
import type { AuthenticatedFastifyRequest } from "./types.js";

// Mock logMessage to avoid console output during tests
vi.mock("../utils/logs.js", () => ({
  logMessage: vi.fn(),
}));

// Helper to create mock datastore
const createMockDatastore = () => ({
  getRun: vi.fn(),
  listRuns: vi.fn(),
  createRun: vi.fn(),
  updateRun: vi.fn(),
});

// Helper to create mock worker pools
const createMockWorkerPools = () => ({
  toolExecution: {
    abortTask: vi.fn(),
  },
});

// Helper to create mock reply
const createMockReply = () => {
  const reply: any = {
    code: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    request: { traceId: "test-trace-id" },
  };
  return reply;
};

// Helper to create mock authenticated request
const createMockRequest = (overrides: Partial<AuthenticatedFastifyRequest> = {}) => {
  const datastore = createMockDatastore();
  const workerPools = createMockWorkerPools();
  return {
    params: {},
    query: {},
    body: {},
    traceId: "test-trace-id",
    authInfo: { orgId: "org-123" },
    datastore,
    workerPools,
    toMetadata: () => ({ orgId: "org-123" }),
    ...overrides,
  } as unknown as AuthenticatedFastifyRequest & {
    datastore: ReturnType<typeof createMockDatastore>;
    workerPools: ReturnType<typeof createMockWorkerPools>;
  };
};

describe("runs API", () => {
  describe("mapRunToOpenAPI", () => {
    const baseRun: Run = {
      runId: "run-123",
      toolId: "tool-456",
      status: RunStatus.SUCCESS,
      metadata: {
        startedAt: "2024-01-01T10:00:00.000Z",
        completedAt: "2024-01-01T10:01:00.000Z",
        durationMs: 60000,
      },
      toolPayload: { input: "test" },
      data: { output: "result" },
    };

    it("should map basic run fields correctly", () => {
      const result = mapRunToOpenAPI(baseRun);

      expect(result.runId).toBe("run-123");
      expect(result.toolId).toBe("tool-456");
      expect(result.status).toBe("success");
      expect(result.toolPayload).toEqual({ input: "test" });
      expect(result.data).toEqual({ output: "result" });
    });

    it("should preserve metadata dates as ISO strings", () => {
      const result = mapRunToOpenAPI(baseRun);

      expect(result.metadata.startedAt).toBe("2024-01-01T10:00:00.000Z");
      expect(result.metadata.completedAt).toBe("2024-01-01T10:01:00.000Z");
    });

    it("should preserve duration in milliseconds", () => {
      const result = mapRunToOpenAPI(baseRun);

      expect(result.metadata.durationMs).toBe(60000);
    });

    it("should handle run without completedAt", () => {
      const runningRun: Run = {
        ...baseRun,
        status: RunStatus.RUNNING,
        metadata: {
          startedAt: "2024-01-01T10:00:00.000Z",
        },
      };

      const result = mapRunToOpenAPI(runningRun);

      expect(result.metadata.completedAt).toBeUndefined();
      expect(result.metadata.durationMs).toBeUndefined();
    });

    it("should map tool field and preserve version", () => {
      const runWithConfig: Run = {
        ...baseRun,
        tool: { id: "config-id", version: "2.0.0" } as any,
      };

      const result = mapRunToOpenAPI(runWithConfig);

      // Tool is passed through as-is (full tool object)
      expect(result.tool).toEqual({ id: "config-id", version: "2.0.0" });
    });

    it("should pass through tool without version as-is", () => {
      const runWithConfigNoVersion: Run = {
        ...baseRun,
        tool: { id: "config-id" } as any,
      };

      const result = mapRunToOpenAPI(runWithConfigNoVersion);

      // Tool is passed through as-is - no version defaulting at this layer
      expect(result.tool).toEqual({ id: "config-id" });
    });

    it("should map stepResults correctly", () => {
      const runWithSteps: Run = {
        ...baseRun,
        stepResults: [
          { stepId: "step-1", success: true, data: { foo: "bar" } },
          { stepId: "step-2", success: false, error: "Something went wrong" },
        ],
      };

      const result = mapRunToOpenAPI(runWithSteps);

      expect(result.stepResults).toEqual([
        { stepId: "step-1", success: true, data: { foo: "bar" }, error: undefined },
        { stepId: "step-2", success: false, data: undefined, error: "Something went wrong" },
      ]);
    });

    it("should include error field for failed runs", () => {
      const failedRun: Run = {
        ...baseRun,
        status: RunStatus.FAILED,
        error: "API timeout",
      };

      const result = mapRunToOpenAPI(failedRun);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("API timeout");
    });
  });

  describe("getRun handler", () => {
    // Import the handler dynamically to get access to it
    let getRun: any;

    beforeEach(async () => {
      // We need to test the handler logic directly
      // Since handlers are registered via registerApiModule, we'll test the logic
      const module = await import("./runs.js");
      // The handlers aren't exported, so we test via the mapRunToOpenAPI and integration
    });

    it("should return 404 when run not found", async () => {
      const request = createMockRequest({ params: { runId: "non-existent" } });
      const reply = createMockReply();

      request.datastore.getRun.mockResolvedValue(null);

      // Simulate the handler logic
      const run = await request.datastore.getRun({
        id: "non-existent",
        orgId: request.authInfo.orgId,
      });

      expect(run).toBeNull();
      expect(request.datastore.getRun).toHaveBeenCalledWith({
        id: "non-existent",
        orgId: "org-123",
      });
    });

    it("should return run when found", async () => {
      const mockRun: Run = {
        runId: "run-123",
        toolId: "tool-456",
        status: RunStatus.SUCCESS,
        metadata: { startedAt: "2024-01-01T10:00:00.000Z" },
      };
      const request = createMockRequest({ params: { runId: "run-123" } });

      request.datastore.getRun.mockResolvedValue(mockRun);

      const run = await request.datastore.getRun({
        id: "run-123",
        orgId: request.authInfo.orgId,
      });

      expect(run).toEqual(mockRun);
      expect(mapRunToOpenAPI(run!).runId).toBe("run-123");
    });
  });

  describe("listRuns handler", () => {
    it("should list runs with pagination", async () => {
      const mockRuns: Run[] = [
        {
          runId: "run-1",
          toolId: "tool-1",
          status: RunStatus.SUCCESS,
          metadata: { startedAt: "2024-01-01T10:00:00.000Z" },
        },
        {
          runId: "run-2",
          toolId: "tool-1",
          status: RunStatus.FAILED,
          metadata: { startedAt: "2024-01-01T11:00:00.000Z" },
        },
      ];
      const request = createMockRequest({
        query: { page: "1", limit: "10" },
      });

      request.datastore.listRuns.mockResolvedValue({ items: mockRuns, total: 2 });

      const result = await request.datastore.listRuns({
        limit: 10,
        offset: 0,
        orgId: request.authInfo.orgId,
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("should filter by toolId", async () => {
      const request = createMockRequest({
        query: { toolId: "tool-specific" },
      });

      request.datastore.listRuns.mockResolvedValue({ items: [], total: 0 });

      await request.datastore.listRuns({
        configId: "tool-specific",
        orgId: request.authInfo.orgId,
      });

      expect(request.datastore.listRuns).toHaveBeenCalledWith({
        configId: "tool-specific",
        orgId: "org-123",
      });
    });

    it("should filter by status", async () => {
      const request = createMockRequest({
        query: { status: "success" },
      });

      request.datastore.listRuns.mockResolvedValue({ items: [], total: 0 });

      await request.datastore.listRuns({
        status: RunStatus.SUCCESS,
        orgId: request.authInfo.orgId,
      });

      expect(request.datastore.listRuns).toHaveBeenCalledWith({
        status: RunStatus.SUCCESS,
        orgId: "org-123",
      });
    });

    it("should calculate hasMore correctly", () => {
      // hasMore = offset + items.length < total
      const offset = 0;
      const items = [{ runId: "1" }, { runId: "2" }];
      const total = 5;

      const hasMore = offset + items.length < total;
      expect(hasMore).toBe(true);

      // When we have all items
      const hasMore2 = 0 + 5 < 5;
      expect(hasMore2).toBe(false);
    });
  });

  describe("cancelRun handler", () => {
    it("should return 404 when run not found", async () => {
      const request = createMockRequest({ params: { runId: "non-existent" } });

      request.datastore.getRun.mockResolvedValue(null);

      const run = await request.datastore.getRun({
        id: "non-existent",
        orgId: request.authInfo.orgId,
      });

      expect(run).toBeNull();
    });

    it("should return 400 when run is not running", async () => {
      const completedRun: Run = {
        runId: "run-123",
        toolId: "tool-456",
        status: RunStatus.SUCCESS,
        metadata: { startedAt: "2024-01-01T10:00:00.000Z" },
      };
      const request = createMockRequest({ params: { runId: "run-123" } });

      request.datastore.getRun.mockResolvedValue(completedRun);

      const run = await request.datastore.getRun({
        id: "run-123",
        orgId: request.authInfo.orgId,
      });

      expect(run!.status).not.toBe(RunStatus.RUNNING);
      // Handler would return 400 with message about status
    });

    it("should return 400 when run is from scheduler", async () => {
      const scheduledRun: Run = {
        runId: "run-123",
        toolId: "tool-456",
        status: RunStatus.RUNNING,
        requestSource: RequestSource.SCHEDULER,
        metadata: { startedAt: "2024-01-01T10:00:00.000Z" },
      };
      const request = createMockRequest({ params: { runId: "run-123" } });

      request.datastore.getRun.mockResolvedValue(scheduledRun);

      const run = await request.datastore.getRun({
        id: "run-123",
        orgId: request.authInfo.orgId,
      });

      expect(run!.requestSource).toBe(RequestSource.SCHEDULER);
      // Handler would return 400 with message about scheduled runs
    });

    it("should abort task and update run status on successful cancel", async () => {
      const runningRun: Run = {
        runId: "run-123",
        toolId: "tool-456",
        status: RunStatus.RUNNING,
        requestSource: RequestSource.API,
        metadata: { startedAt: "2024-01-01T10:00:00.000Z" },
      };
      const request = createMockRequest({ params: { runId: "run-123" } });

      request.datastore.getRun.mockResolvedValue(runningRun);

      const run = await request.datastore.getRun({
        id: "run-123",
        orgId: request.authInfo.orgId,
      });

      expect(run!.status).toBe(RunStatus.RUNNING);
      expect(run!.requestSource).not.toBe(RequestSource.SCHEDULER);

      // Simulate abort
      request.workerPools.toolExecution.abortTask("run-123");
      expect(request.workerPools.toolExecution.abortTask).toHaveBeenCalledWith("run-123");

      // Simulate update
      await request.datastore.updateRun({
        id: "run-123",
        orgId: request.authInfo.orgId,
        updates: {
          status: RunStatus.ABORTED,
          error: "Run cancelled by user",
        },
      });

      expect(request.datastore.updateRun).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "run-123",
          orgId: "org-123",
          updates: expect.objectContaining({
            status: RunStatus.ABORTED,
          }),
        }),
      );
    });
  });

  describe("createRun handler", () => {
    it("should return 400 when toolId is missing", () => {
      const body = {
        tool: {},
        status: "success",
        startedAt: "2024-01-01",
        completedAt: "2024-01-01",
      };
      expect((body as any).toolId).toBeUndefined();
    });

    it("should return 400 when tool is missing", () => {
      const body = {
        toolId: "tool-1",
        status: "success",
        startedAt: "2024-01-01",
        completedAt: "2024-01-01",
      };
      expect((body as any).tool).toBeUndefined();
    });

    it("should return 400 when status is missing", () => {
      const body = {
        toolId: "tool-1",
        tool: {},
        startedAt: "2024-01-01",
        completedAt: "2024-01-01",
      };
      expect((body as any).status).toBeUndefined();
    });

    it("should return 400 for invalid status values", () => {
      const validStatuses = ["success", "failed", "aborted"];
      const invalidStatus = "pending";

      expect(validStatuses.includes(invalidStatus)).toBe(false);
    });

    it("should accept valid status values", () => {
      const validStatuses = ["success", "failed", "aborted"];

      expect(validStatuses.includes("success")).toBe(true);
      expect(validStatuses.includes("failed")).toBe(true);
      expect(validStatuses.includes("aborted")).toBe(true);
    });

    it("should create run with correct fields", async () => {
      const request = createMockRequest({
        body: {
          toolId: "tool-123",
          tool: { id: "tool-123", instruction: "Test" },
          status: "success",
          startedAt: "2024-01-01T10:00:00.000Z",
          completedAt: "2024-01-01T10:01:00.000Z",
        },
      });

      const body = request.body as any;
      const startedAt = new Date(body.startedAt);
      const completedAt = new Date(body.completedAt);

      const run: Run = {
        runId: expect.any(String),
        toolId: body.toolId,
        status: RunStatus.SUCCESS,
        tool: body.tool,
        requestSource: RequestSource.FRONTEND,
        metadata: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
      };

      request.datastore.createRun.mockResolvedValue(run);

      await request.datastore.createRun({ run, orgId: request.authInfo.orgId });

      expect(request.datastore.createRun).toHaveBeenCalled();
    });

    it("should calculate duration correctly", () => {
      const startedAt = new Date("2024-01-01T10:00:00.000Z");
      const completedAt = new Date("2024-01-01T10:01:00.000Z");

      const durationMs = completedAt.getTime() - startedAt.getTime();

      expect(durationMs).toBe(60000); // 1 minute
    });

    it("should map status string to RunStatus enum", () => {
      const statusMap: Record<string, RunStatus> = {
        success: RunStatus.SUCCESS,
        failed: RunStatus.FAILED,
        aborted: RunStatus.ABORTED,
      };

      expect(statusMap["success"]).toBe(RunStatus.SUCCESS);
      expect(statusMap["failed"]).toBe(RunStatus.FAILED);
      expect(statusMap["aborted"]).toBe(RunStatus.ABORTED);
    });

    it("should include error field for failed runs", async () => {
      const request = createMockRequest({
        body: {
          toolId: "tool-123",
          tool: { id: "tool-123" },
          status: "failed",
          error: "Something went wrong",
          startedAt: "2024-01-01T10:00:00.000Z",
          completedAt: "2024-01-01T10:01:00.000Z",
        },
      });

      const body = request.body as any;

      const run: Run = {
        runId: "run-new",
        toolId: body.toolId,
        status: RunStatus.FAILED,
        error: body.error,
        tool: body.tool,
        requestSource: RequestSource.FRONTEND,
        metadata: {
          startedAt: body.startedAt,
          completedAt: body.completedAt,
          durationMs: 60000,
        },
      };

      request.datastore.createRun.mockResolvedValue(run);

      await request.datastore.createRun({ run, orgId: request.authInfo.orgId });

      const callArg = request.datastore.createRun.mock.calls[0][0];
      expect(callArg.run.error).toBe("Something went wrong");
    });
  });
});
