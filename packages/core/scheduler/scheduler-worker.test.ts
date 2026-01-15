import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataStore } from "../datastore/types.js";
import { WorkerPools } from "../graphql/types.js";
import { ToolSchedulerWorker } from "./scheduler-worker.js";

vi.mock("../graphql/resolvers/workflow.js", () => ({
  executeWorkflowResolver: vi.fn(),
}));

const MOCK_NEXT_RUN = new Date("2024-01-02T00:00:00Z");

vi.mock("@superglue/shared", async () => {
  const actual = await vi.importActual<typeof import("@superglue/shared")>("@superglue/shared");
  return {
    ...actual,
    calculateNextRun: vi.fn(() => MOCK_NEXT_RUN),
  };
});


const mockDatastore = {
  listDueToolSchedules: vi.fn(),
  updateScheduleNextRun: vi.fn(),
} as unknown as DataStore;

const mockWorkerPools = {
  toolExecution: {
    runTask: vi.fn(),
    abortTask: vi.fn(),
  },
} as unknown as WorkerPools;

describe("ToolScheduler", () => {
  let scheduler: ToolSchedulerWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new ToolSchedulerWorker(mockDatastore, mockWorkerPools, 100);
  });

  it("should start and stop interval correctly", async () => {
    vi.useFakeTimers();

    const mockSchedule = {
      id: "schedule-1",
      toolId: "tool-1",
      orgId: "org-1",
      cronExpression: "0 0 * * *",
    };

    mockDatastore.listDueToolSchedules = vi.fn().mockResolvedValue([mockSchedule]);
    mockDatastore.updateScheduleNextRun = vi.fn().mockResolvedValue(undefined);

    scheduler.start();

    await vi.advanceTimersByTimeAsync(250);
    expect(mockDatastore.listDueToolSchedules).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(250);

    expect(mockDatastore.listDueToolSchedules).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("should execute due tools when started", async () => {
    vi.useFakeTimers();

    const mockSchedule = {
      id: "schedule-1",
      toolId: "tool-1",
      orgId: "org-1",
      cronExpression: "0 0 * * *",
      payload: { test: "data" },
      options: {},
    };

    mockDatastore.listDueToolSchedules = vi.fn().mockResolvedValue([mockSchedule]);
    mockDatastore.updateScheduleNextRun = vi.fn().mockResolvedValue(undefined);

    const { executeWorkflowResolver } = await import("../graphql/resolvers/workflow.js");

    scheduler.start();
    await vi.advanceTimersByTimeAsync(105);

    expect(mockDatastore.listDueToolSchedules).toHaveBeenCalledOnce();
    expect(mockDatastore.updateScheduleNextRun).toHaveBeenCalledWith({
      id: "schedule-1",
      nextRunAt: MOCK_NEXT_RUN,
      lastRunAt: expect.any(Date),
    });
    expect(executeWorkflowResolver).toHaveBeenCalledWith(
      {},
      {
        input: { id: "tool-1" },
        payload: { test: "data" },
        credentials: {},
        options: { selfHealing: undefined },
      },
      expect.objectContaining({
        datastore: mockDatastore,
        workerPools: mockWorkerPools,
        orgId: "org-1",
        traceId: expect.any(String),
        toMetadata: expect.any(Function),
      }),
      {},
    );

    scheduler.stop();
    vi.useRealTimers();
  });

  it("should handle execution errors gracefully", async () => {
    vi.useFakeTimers();

    const mockSchedule = {
      id: "schedule-1",
      toolId: "tool-1",
      orgId: "org-1",
      cronExpression: "0 0 * * *",
    };

    mockDatastore.listDueToolSchedules = vi.fn().mockResolvedValue([mockSchedule]);
    const { executeWorkflowResolver } = await import("../graphql/resolvers/workflow.js");
    (executeWorkflowResolver as any).mockRejectedValue(new Error("Execution failed"));

    scheduler.start();
    await vi.advanceTimersByTimeAsync(105);

    expect(executeWorkflowResolver).toHaveBeenCalled();

    scheduler.stop();
    vi.useRealTimers();
  });
});
