import { describe, expect, it } from "vitest";
import { ToolScheduleInternal } from "../datastore/types.js";
import { toPublicSchedule } from "./schedules.js";

// Need to import the function via a workaround since mapScheduleToOpenAPI is not exported
// We'll test it indirectly through the module or export it for testing
describe("schedules API", () => {
  const baseSchedule: ToolScheduleInternal = {
    id: "schedule-123",
    orgId: "org-456",
    toolId: "tool-789",
    cronExpression: "0 9 * * *",
    timezone: "America/New_York",
    enabled: true,
    payload: { input: "test" },
    options: { retries: 3 },
    lastRunAt: new Date("2024-01-01T09:00:00Z"),
    nextRunAt: new Date("2024-01-02T14:00:00Z"),
    createdAt: new Date("2023-12-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T09:00:00Z"),
  };

  describe("toPublicSchedule", () => {
    it("should map all basic fields correctly", () => {
      const result = toPublicSchedule(baseSchedule);

      expect(result.id).toBe("schedule-123");
      expect(result.toolId).toBe("tool-789");
      expect(result.cronExpression).toBe("0 9 * * *");
      expect(result.timezone).toBe("America/New_York");
      expect(result.enabled).toBe(true);
    });

    it("should include payload and options", () => {
      const result = toPublicSchedule(baseSchedule);

      expect(result.payload).toEqual({ input: "test" });
      expect(result.options).toEqual({ retries: 3 });
    });

    it("should preserve Date objects for timestamps", () => {
      const result = toPublicSchedule(baseSchedule);

      expect(result.lastRunAt).toBeInstanceOf(Date);
      expect(result.nextRunAt).toBeInstanceOf(Date);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it("should handle schedule without lastRunAt", () => {
      const scheduleWithoutLastRun: ToolScheduleInternal = {
        ...baseSchedule,
        lastRunAt: undefined,
      };

      const result = toPublicSchedule(scheduleWithoutLastRun);

      expect(result.lastRunAt).toBeUndefined();
    });

    it("should handle schedule without payload", () => {
      const scheduleWithoutPayload: ToolScheduleInternal = {
        ...baseSchedule,
        payload: undefined,
      };

      const result = toPublicSchedule(scheduleWithoutPayload);

      expect(result.payload).toBeUndefined();
    });

    it("should handle schedule without options", () => {
      const scheduleWithoutOptions: ToolScheduleInternal = {
        ...baseSchedule,
        options: undefined,
      };

      const result = toPublicSchedule(scheduleWithoutOptions);

      expect(result.options).toBeUndefined();
    });

    it("should strip orgId from internal schedule", () => {
      const result = toPublicSchedule(baseSchedule);

      expect(result).not.toHaveProperty("orgId");
    });

    it("should handle disabled schedule", () => {
      const disabledSchedule: ToolScheduleInternal = {
        ...baseSchedule,
        enabled: false,
      };

      const result = toPublicSchedule(disabledSchedule);

      expect(result.enabled).toBe(false);
    });

    it("should handle various cron expressions", () => {
      const minutelyCron: ToolScheduleInternal = {
        ...baseSchedule,
        cronExpression: "* * * * *",
      };
      expect(toPublicSchedule(minutelyCron).cronExpression).toBe("* * * * *");

      const weeklyCron: ToolScheduleInternal = {
        ...baseSchedule,
        cronExpression: "0 0 * * 0",
      };
      expect(toPublicSchedule(weeklyCron).cronExpression).toBe("0 0 * * 0");

      const complexCron: ToolScheduleInternal = {
        ...baseSchedule,
        cronExpression: "0 9,17 * * 1-5",
      };
      expect(toPublicSchedule(complexCron).cronExpression).toBe("0 9,17 * * 1-5");
    });

    it("should handle different timezones", () => {
      const utcSchedule: ToolScheduleInternal = {
        ...baseSchedule,
        timezone: "UTC",
      };
      expect(toPublicSchedule(utcSchedule).timezone).toBe("UTC");

      const tokyoSchedule: ToolScheduleInternal = {
        ...baseSchedule,
        timezone: "Asia/Tokyo",
      };
      expect(toPublicSchedule(tokyoSchedule).timezone).toBe("Asia/Tokyo");
    });

    it("should handle complex payload", () => {
      const scheduleWithComplexPayload: ToolScheduleInternal = {
        ...baseSchedule,
        payload: {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          string: "test",
        },
      };

      const result = toPublicSchedule(scheduleWithComplexPayload);

      expect(result.payload).toEqual({
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        string: "test",
      });
    });

    it("should handle complex options", () => {
      const scheduleWithComplexOptions: ToolScheduleInternal = {
        ...baseSchedule,
        options: {
          retries: 5,
          timeout: 30000,
          headers: { "X-Custom": "value" },
        },
      };

      const result = toPublicSchedule(scheduleWithComplexOptions);

      expect(result.options).toEqual({
        retries: 5,
        timeout: 30000,
        headers: { "X-Custom": "value" },
      });
    });
  });
});
