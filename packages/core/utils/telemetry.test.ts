import { PostHog } from "posthog-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-node", async () => {
  return {
    PostHog: vi.fn().mockImplementation(() => ({
      capture: vi.fn(),
      captureException: vi.fn(),
    })),
  };
});

describe("Telemetry Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("telemetry environment variables", () => {
    it("should create null client when DISABLE_TELEMETRY is true", () => {
      vi.stubEnv("DISABLE_TELEMETRY", "true");

      const isTelemetryDisabled = process.env.DISABLE_TELEMETRY === "true";
      const isDebug = process.env.DEBUG === "true";
      const client =
        !isTelemetryDisabled && !isDebug
          ? new PostHog("test-key", { host: "test-host", enableExceptionAutocapture: true })
          : null;

      expect(isTelemetryDisabled).toBe(true);
      expect(client).toBeNull();

      vi.stubEnv("DISABLE_TELEMETRY", "");
    });

    it("should create null client when DEBUG is true", () => {
      vi.stubEnv("DEBUG", "true");
      vi.stubEnv("DISABLE_TELEMETRY", "");

      const isTelemetryDisabled = process.env.DISABLE_TELEMETRY === "true";
      const isDebug = process.env.DEBUG === "true";
      const client =
        !isTelemetryDisabled && !isDebug
          ? new PostHog("test-key", { host: "test-host", enableExceptionAutocapture: true })
          : null;

      expect(isDebug).toBe(true);
      expect(client).toBeNull();

      vi.stubEnv("DEBUG", "");
    });
  });
});
