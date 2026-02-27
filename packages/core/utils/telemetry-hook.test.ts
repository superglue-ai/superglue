import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }));

vi.mock("./telemetry.js", () => ({
  telemetryClient: { capture: mockCapture },
  sessionId: "test-session-id",
  isSelfHosted: false,
}));

import { registerTelemetryHook } from "./telemetry-hook.js";

function createMockFastify() {
  const hooks: Record<string, Function> = {};
  return {
    addHook: vi.fn((name: string, fn: Function) => {
      hooks[name] = fn;
    }),
    _hooks: hooks,
  };
}

function createMockRequest({
  method = "GET",
  url = "/v1/tools",
  routeUrl = "/v1/tools",
  orgId = "org-123",
  extraTelemetry,
}: {
  method?: string;
  url?: string;
  routeUrl?: string;
  orgId?: string;
  extraTelemetry?: Record<string, any>;
} = {}) {
  const req: any = {
    method,
    url,
    routeOptions: { url: routeUrl },
    authInfo: { orgId },
  };
  if (extraTelemetry) req._telemetry = extraTelemetry;
  return req;
}

function createMockReply({
  statusCode = 200,
  elapsedTime = 42,
}: { statusCode?: number; elapsedTime?: number } = {}) {
  return { statusCode, elapsedTime };
}

describe("registerTelemetryHook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should register an onResponse hook", () => {
    const fastify = createMockFastify();
    registerTelemetryHook(fastify as any);
    expect(fastify.addHook).toHaveBeenCalledWith("onResponse", expect.any(Function));
  });

  it("should capture event with correct properties on success", async () => {
    const fastify = createMockFastify();
    registerTelemetryHook(fastify as any);

    const hook = fastify._hooks["onResponse"];
    await hook(createMockRequest(), createMockReply());

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "org-123",
      event: "GET /v1/tools",
      properties: {
        method: "GET",
        route: "/v1/tools",
        statusCode: 200,
        success: true,
        durationMs: 42,
        orgId: "org-123",
        isSelfHosted: false,
      },
      groups: { orgId: "org-123" },
    });
  });

  it("should capture both main and error event on failure", async () => {
    const fastify = createMockFastify();
    registerTelemetryHook(fastify as any);

    const hook = fastify._hooks["onResponse"];
    await hook(createMockRequest(), createMockReply({ statusCode: 500 }));

    expect(mockCapture).toHaveBeenCalledTimes(2);

    const mainCall = mockCapture.mock.calls[0][0];
    expect(mainCall.event).toBe("GET /v1/tools");
    expect(mainCall.properties.success).toBe(false);
    expect(mainCall.properties.statusCode).toBe(500);

    const errorCall = mockCapture.mock.calls[1][0];
    expect(errorCall.event).toBe("GET /v1/tools_error");
  });

  it("should skip health check route", async () => {
    const fastify = createMockFastify();
    registerTelemetryHook(fastify as any);

    const hook = fastify._hooks["onResponse"];
    await hook(createMockRequest({ url: "/v1/health", routeUrl: "/v1/health" }), createMockReply());

    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("should merge _telemetry enrichment from request", async () => {
    const fastify = createMockFastify();
    registerTelemetryHook(fastify as any);

    const hook = fastify._hooks["onResponse"];
    await hook(
      createMockRequest({
        method: "POST",
        routeUrl: "/v1/tools/:toolId/run",
        extraTelemetry: { toolId: "tool-abc", toolSuccess: true, stepCount: 3 },
      }),
      createMockReply(),
    );

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const props = mockCapture.mock.calls[0][0].properties;
    expect(props.toolId).toBe("tool-abc");
    expect(props.toolSuccess).toBe(true);
    expect(props.stepCount).toBe(3);
  });

  it("should use sessionId as distinctId when no orgId", async () => {
    const fastify = createMockFastify();
    registerTelemetryHook(fastify as any);

    const hook = fastify._hooks["onResponse"];
    const req: any = {
      method: "GET",
      url: "/v1/tools",
      routeOptions: { url: "/v1/tools" },
      authInfo: {},
    };
    await hook(req, createMockReply());

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture.mock.calls[0][0].distinctId).toBe("test-session-id");
  });

  it("should not include groups when no orgId", async () => {
    const fastify = createMockFastify();
    registerTelemetryHook(fastify as any);

    const hook = fastify._hooks["onResponse"];
    const req: any = {
      method: "GET",
      url: "/v1/tools",
      routeOptions: { url: "/v1/tools" },
      authInfo: {},
    };
    await hook(req, createMockReply());

    expect(mockCapture.mock.calls[0][0].groups).toBeUndefined();
  });
});
