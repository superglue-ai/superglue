import { FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRestrictedAccess } from "./api-server.js";
import * as registry from "./registry.js";
import { AuthenticatedFastifyRequest, RoutePermission } from "./types.js";

// Mock the registry module, preserving other exports
vi.mock("./registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./registry.js")>();
  return {
    ...actual,
    getRoutePermission: vi.fn(),
  };
});

// Mock logMessage to avoid console output during tests
vi.mock("../utils/logs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/logs.js")>();
  return {
    ...actual,
    logMessage: vi.fn(),
  };
});

describe("checkRestrictedAccess", () => {
  const mockGetRoutePermission = vi.mocked(registry.getRoutePermission);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to create mock auth info
  const createAuthInfo = (
    overrides: Partial<AuthenticatedFastifyRequest["authInfo"]> = {},
  ): AuthenticatedFastifyRequest["authInfo"] => ({
    orgId: "org-123",
    isRestricted: true,
    ...overrides,
  });

  // Helper to create mock request
  const createMockRequest = (
    overrides: Partial<{
      method: string;
      url: string;
      routeOptions: { url: string };
      params: Record<string, string>;
    }> = {},
  ): FastifyRequest =>
    ({
      method: "GET",
      url: "/v1/tools",
      routeOptions: { url: "/v1/tools" },
      params: {},
      ...overrides,
    }) as unknown as FastifyRequest;

  describe("unrestricted API keys", () => {
    it("should allow access for unrestricted keys", () => {
      const authInfo = createAuthInfo({ isRestricted: false });
      const request = createMockRequest();

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should allow access when isRestricted is undefined", () => {
      const authInfo = createAuthInfo({ isRestricted: undefined });
      const request = createMockRequest();

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });
  });

  describe("restricted API keys - route permissions", () => {
    it("should deny access when routeOptions.url is undefined", () => {
      const authInfo = createAuthInfo({ isRestricted: true });
      const request = createMockRequest({ routeOptions: undefined as any });

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("This API key cannot access this endpoint");
    });

    it("should deny access when route has no permissions defined", () => {
      const authInfo = createAuthInfo({ isRestricted: true });
      const request = createMockRequest();
      mockGetRoutePermission.mockReturnValue(undefined);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("This API key cannot access this endpoint");
    });

    it("should deny access when route does not allow restricted keys", () => {
      const authInfo = createAuthInfo({ isRestricted: true });
      const request = createMockRequest();
      mockGetRoutePermission.mockReturnValue({
        type: "write",
        resource: "tool",
        allowRestricted: false,
      });

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("This API key cannot access this endpoint");
    });

    it("should allow access when route allows restricted keys and no resource check needed", () => {
      const authInfo = createAuthInfo({ isRestricted: true });
      const request = createMockRequest();
      mockGetRoutePermission.mockReturnValue({
        type: "read",
        resource: "tool",
        allowRestricted: true,
      });

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });
  });

  describe("restricted API keys - tool-level permissions", () => {
    const toolPermissions: RoutePermission = {
      type: "execute",
      resource: "tool",
      allowRestricted: true,
      checkResourceId: "toolId",
    };

    it("should allow access when tool is in allowedTools", () => {
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["tool-1", "tool-2", "tool-3"],
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "tool-2" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });

    it("should deny access when tool is NOT in allowedTools", () => {
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["tool-1", "tool-2"],
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "tool-3" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("This API key is not authorized for this tool");
    });

    it("should allow access when allowedTools is ['*'] (all tools allowed)", () => {
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["*"],
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "any-tool-id" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should deny access when allowedTools is empty array (no tools allowed)", () => {
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: [],
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "any-tool-id" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      // Empty array means "no tools allowed" - the key was created with
      // specific tool restrictions but no tools were selected
      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("This API key is not authorized for this tool");
    });

    it("should allow access when resourceId is undefined (no specific tool requested)", () => {
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["tool-1"],
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId" },
        params: {}, // No toolId in params
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });
  });

  describe("route permission lookup", () => {
    it("should call getRoutePermission with correct method and path", () => {
      const authInfo = createAuthInfo({ isRestricted: true });
      const request = createMockRequest({
        method: "POST",
        routeOptions: { url: "/v1/tools/:toolId/run" },
      });
      mockGetRoutePermission.mockReturnValue({
        type: "execute",
        resource: "tool",
        allowRestricted: true,
      });

      checkRestrictedAccess(authInfo, request);

      expect(mockGetRoutePermission).toHaveBeenCalledWith("POST", "/v1/tools/:toolId/run");
    });
  });

  describe("edge cases", () => {
    it("should handle special characters in tool IDs", () => {
      const toolPermissions: RoutePermission = {
        type: "execute",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      };
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["tool-with-dashes", "tool_with_underscores", "tool.with.dots"],
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "tool.with.dots" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });

    it("should be case-sensitive for tool IDs", () => {
      const toolPermissions: RoutePermission = {
        type: "execute",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      };
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["Tool-ABC"],
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "tool-abc" }, // lowercase
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(false);
    });
  });

  describe("regression tests", () => {
    it("should allow execute permission when allowedTools is ['*'] - all tools allowed", () => {
      // This test covers restricted keys with "all tools allowed" (allowedTools: ['*'])
      const toolPermissions: RoutePermission = {
        type: "execute",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      };
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["*"], // "all tools allowed"
      });
      const request = createMockRequest({
        method: "POST",
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "my-tool-123" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should allow read permission when allowedTools is ['*']", () => {
      const toolPermissions: RoutePermission = {
        type: "read",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      };
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["*"],
      });
      const request = createMockRequest({
        method: "GET",
        routeOptions: { url: "/v1/tools/:toolId" },
        params: { toolId: "my-tool-123" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });

    it("should correctly deny access when allowedTools has specific tools but requested tool is not included", () => {
      const toolPermissions: RoutePermission = {
        type: "execute",
        resource: "tool",
        allowRestricted: true,
        checkResourceId: "toolId",
      };
      const authInfo = createAuthInfo({
        isRestricted: true,
        allowedTools: ["allowed-tool-1", "allowed-tool-2"],
      });
      const request = createMockRequest({
        method: "POST",
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "not-allowed-tool" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(false);
      expect(result.error).toBe("This API key is not authorized for this tool");
    });
  });
});
