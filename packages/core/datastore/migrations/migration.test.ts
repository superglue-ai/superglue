import { RunStatus } from "@superglue/shared";
import { describe, expect, it } from "vitest";
import { extractRun, LegacyRunRow } from "./migration.js";

describe("extractRun", () => {
  const baseRow: LegacyRunRow = {
    id: "test-run-id",
    config_id: "test-config-id",
    started_at: new Date("2024-01-01T00:00:00Z"),
    completed_at: new Date("2024-01-01T00:01:00Z"),
  };

  describe("modern run format", () => {
    it("should extract run with all fields from JSON data", () => {
      const data = {
        status: RunStatus.SUCCESS,
        requestSource: "api",
        toolId: "test-tool",
        toolResult: { foo: "bar" },
      };

      const result = extractRun(data, baseRow);

      expect(result.id).toEqual(baseRow.id);
      expect(result.status).toEqual(RunStatus.SUCCESS);
      expect(result.requestSource).toEqual("api");
      expect(result.toolResult).toEqual({ foo: "bar" });
    });

    it("should normalize string status to RunStatus enum", () => {
      const data = { status: "success" };
      const result = extractRun(data, baseRow);
      expect(result.status).toEqual(RunStatus.SUCCESS);
    });

    it("should handle uppercase status strings", () => {
      const data = { status: "FAILED" };
      const result = extractRun(data, baseRow);
      expect(result.status).toEqual(RunStatus.FAILED);
    });
  });

  describe("legacy run migration", () => {
    it("should migrate legacy run with success=true to SUCCESS status", () => {
      const legacyData = {
        success: true,
        data: { foo: "bar" },
        config: { id: "test" },
      };

      const result = extractRun(legacyData, baseRow);

      expect(result.status).toEqual(RunStatus.SUCCESS);
      expect(result.toolResult).toEqual({ foo: "bar" });
    });

    it("should migrate legacy run with success=false to FAILED status", () => {
      const legacyData = {
        success: false,
        error: "Something went wrong",
        config: { id: "test" },
      };

      const result = extractRun(legacyData, baseRow);

      expect(result.status).toEqual(RunStatus.FAILED);
      expect(result.error).toEqual("Something went wrong");
    });
  });

  describe("timestamp handling", () => {
    it("should use row timestamps over JSON timestamps", () => {
      const data = {
        status: RunStatus.SUCCESS,
        startedAt: "2020-01-01T00:00:00Z",
        completedAt: "2020-01-01T00:01:00Z",
      };

      const result = extractRun(data, baseRow);

      expect(result.startedAt).toEqual(baseRow.started_at);
      expect(result.completedAt).toEqual(baseRow.completed_at);
    });

    it("should use JSON timestamps when row timestamps are null", () => {
      const data = {
        status: RunStatus.SUCCESS,
        startedAt: "2020-06-15T10:30:00Z",
        completedAt: "2020-06-15T10:35:00Z",
      };
      const row = {
        ...baseRow,
        started_at: null as any,
        completed_at: null as any,
      };

      const result = extractRun(data, row);

      expect(result.startedAt).toEqual(new Date("2020-06-15T10:30:00Z"));
      expect(result.completedAt).toEqual(new Date("2020-06-15T10:35:00Z"));
    });

    it("should default startedAt to now when both are missing", () => {
      const data = { status: RunStatus.SUCCESS };
      const row = { ...baseRow, started_at: null as any };

      const before = new Date();
      const result = extractRun(data, row);
      const after = new Date();

      expect(result.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
