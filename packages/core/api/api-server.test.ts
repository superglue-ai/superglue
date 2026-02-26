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
    };

    // Tool-level permission is now handled by allowedSystems in the async check
    // The sync check just validates the route is accessible to restricted keys
    it("should allow access for any tool (filtering done by allowedSystems in async)", () => {
      const authInfo = createAuthInfo({
        isRestricted: true,
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "tool-3" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });

    it("should allow access for restricted keys (filtering done by allowedSystems in async)", () => {
      const authInfo = createAuthInfo({
        isRestricted: true,
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "any-tool-id" },
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
    // Tool-level permission is now handled by allowedSystems in the async check
    // These tests verify the sync check allows access for restricted keys
    it("should allow access regardless of tool ID format (filtering done in async)", () => {
      const toolPermissions: RoutePermission = {
        type: "execute",
        resource: "tool",
        allowRestricted: true,
      };
      const authInfo = createAuthInfo({
        isRestricted: true,
      });
      const request = createMockRequest({
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "tool.with.dots" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });
  });

  describe("regression tests", () => {
    // Tool-level permission is now handled by allowedSystems in the async check
    it("should allow access for any tool (filtering done by allowedSystems)", () => {
      const toolPermissions: RoutePermission = {
        type: "execute",
        resource: "tool",
        allowRestricted: true,
      };
      const authInfo = createAuthInfo({
        isRestricted: true,
      });
      const request = createMockRequest({
        method: "POST",
        routeOptions: { url: "/v1/tools/:toolId/run" },
        params: { toolId: "not-in-allowed-list" },
      });
      mockGetRoutePermission.mockReturnValue(toolPermissions);

      const result = checkRestrictedAccess(authInfo, request);

      expect(result.allowed).toBe(true);
    });
  });
});
