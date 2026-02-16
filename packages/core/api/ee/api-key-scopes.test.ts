/**
 * Tests for API Key Scopes and Multi-Tenancy Permission Logic
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkToolExecutionPermission,
  filterToolsByPermission,
  checkGraphQLAccess,
  checkToolExecutionPermissionAsync,
  filterToolsByPermissionAsync,
} from "./scope-hooks.js";

// Import to trigger registration of hooks
import "./api-key-scopes.js";

// Mock the EE datastore type guard
vi.mock("../../datastore/ee/types.js", () => ({
  isEEDataStore: (ds: any) => ds._isEE === true,
}));

describe("API Key Scopes", () => {
  describe("checkToolExecutionPermission (sync)", () => {
    // Sync check now always allows - actual filtering is done by allowedSystems in async
    it("should allow unrestricted keys to execute any tool", () => {
      const result = checkToolExecutionPermission({ isRestricted: false }, "any-tool");
      expect(result.allowed).toBe(true);
    });

    it("should allow restricted keys to execute any tool (filtering done by allowedSystems)", () => {
      const result = checkToolExecutionPermission(
        { isRestricted: true, allowedTools: ["tool-1", "tool-2"] },
        "tool-3",
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow restricted keys with empty allowedTools (filtering done by allowedSystems)", () => {
      const result = checkToolExecutionPermission(
        { isRestricted: true, allowedTools: [] },
        "any-tool",
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("filterToolsByPermission (sync)", () => {
    const tools = [{ id: "tool-1" }, { id: "tool-2" }, { id: "tool-3" }];

    // Sync filter now returns all tools - actual filtering is done by allowedSystems in async
    it("should return all tools for unrestricted keys", () => {
      const result = filterToolsByPermission({ isRestricted: false }, tools);
      expect(result).toHaveLength(3);
    });

    it("should return all tools for restricted keys (filtering done by allowedSystems)", () => {
      const result = filterToolsByPermission(
        { isRestricted: true, allowedTools: ["tool-1"] },
        tools,
      );
      expect(result).toHaveLength(3);
    });

    it("should return all tools for restricted keys with empty allowedTools", () => {
      const result = filterToolsByPermission({ isRestricted: true, allowedTools: [] }, tools);
      expect(result).toHaveLength(3);
    });
  });

  describe("checkGraphQLAccess", () => {
    it("should allow unrestricted keys to access GraphQL", () => {
      const result = checkGraphQLAccess({ isRestricted: false });
      expect(result.allowed).toBe(true);
    });

    it("should deny restricted keys from accessing GraphQL", () => {
      const result = checkGraphQLAccess({ isRestricted: true });
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("GraphQL API");
    });
  });
});

describe("Multi-Tenancy Permission Logic", () => {
  describe("checkToolExecutionPermissionAsync", () => {
    const createMockDataStore = (options: {
      systems?: Record<string, { id?: string; multiTenancyMode?: string }>;
      credentials?: string[];
    }) => ({
      _isEE: true,
      getSystem: vi.fn(({ id }) => Promise.resolve(options.systems?.[id] || null)),
      getManySystems: vi.fn(({ ids }) =>
        Promise.resolve(
          ids
            .map((id: string) => (options.systems?.[id] ? { id, ...options.systems[id] } : null))
            .filter(Boolean),
        ),
      ),
      listEndUserCredentials: vi.fn(() =>
        Promise.resolve(
          (options.credentials || []).map((systemId) => ({ systemId, hasCredentials: true })),
        ),
      ),
    });

    it("should allow when no endUserId (not an end-user request)", async () => {
      const result = await checkToolExecutionPermissionAsync(
        { orgId: "org-1", dataStore: {} as any },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow tools without systems", async () => {
      const result = await checkToolExecutionPermissionAsync(
        { orgId: "org-1", endUserId: "user-1", dataStore: {} as any },
        { id: "tool-1", systemIds: [] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should deny when end user is not allowed to access system", async () => {
      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: ["system-1"], // Only allowed system-1
          dataStore: {} as any,
        },
        { id: "tool-1", systemIds: ["system-2"] }, // Tool requires system-2
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("not authorized to access systems");
    });

    it("should allow when end user has all systems access (['*'])", async () => {
      const dataStore = createMockDataStore({
        systems: { "system-1": { multiTenancyMode: "disabled" } },
        credentials: [],
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: ["*"], // All systems allowed
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should deny when multi-tenancy system requires credentials user doesn't have", async () => {
      const dataStore = createMockDataStore({
        systems: { "system-1": { multiTenancyMode: "enabled" } },
        credentials: [], // No credentials
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: ["*"], // All systems allowed, but no credentials
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("must authenticate");
      expect(result.missingSystemIds).toContain("system-1");
    });

    it("should allow when user has credentials for multi-tenancy system", async () => {
      const dataStore = createMockDataStore({
        systems: { "system-1": { multiTenancyMode: "enabled" } },
        credentials: ["system-1"], // Has credentials
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: ["*"],
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow non-multi-tenancy systems without credentials", async () => {
      const dataStore = createMockDataStore({
        systems: { "system-1": { multiTenancyMode: "disabled" } },
        credentials: [], // No credentials needed
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: ["*"],
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should deny when allowedSystems is null (no access)", async () => {
      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: null, // No access
          dataStore: {} as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("not authorized to access systems");
    });

    it("should deny when allowedSystems is empty array (no access)", async () => {
      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: [], // No access
          dataStore: {} as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("not authorized to access systems");
    });
  });

  describe("filterToolsByPermissionAsync", () => {
    const createMockDataStore = (options: {
      systems?: Record<string, { id?: string; multiTenancyMode?: string }>;
      credentials?: string[];
    }) => ({
      _isEE: true,
      getSystem: vi.fn(({ id }) => Promise.resolve(options.systems?.[id] || null)),
      getManySystems: vi.fn(({ ids }) =>
        Promise.resolve(
          ids
            .map((id: string) => (options.systems?.[id] ? { id, ...options.systems[id] } : null))
            .filter(Boolean),
        ),
      ),
      listEndUserCredentials: vi.fn(() =>
        Promise.resolve(
          (options.credentials || []).map((systemId) => ({ systemId, hasCredentials: true })),
        ),
      ),
    });

    const tools = [
      { id: "tool-1", systemIds: ["system-1"] },
      { id: "tool-2", systemIds: ["system-2"] },
      { id: "tool-3", systemIds: [] }, // No systems
      { id: "tool-4", systemIds: ["system-1", "system-2"] }, // Multiple systems
    ];

    it("should return all tools when no endUserId", async () => {
      const result = await filterToolsByPermissionAsync(
        { orgId: "org-1", dataStore: {} as any },
        tools,
      );
      expect(result).toHaveLength(4);
    });

    it("should filter by end-user allowed systems", async () => {
      const dataStore = createMockDataStore({
        systems: {
          "system-1": { multiTenancyMode: "disabled" },
          "system-2": { multiTenancyMode: "disabled" },
        },
        credentials: [],
      });

      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: ["system-1"], // Only allowed system-1
          dataStore: dataStore as any,
        },
        tools,
      );

      // Should include: tool-1 (system-1), tool-3 (no systems)
      // Should exclude: tool-2 (system-2), tool-4 (requires both)
      expect(result.map((t) => t.id)).toEqual(["tool-1", "tool-3"]);
    });

    it("should filter by multi-tenancy credential requirements", async () => {
      const dataStore = createMockDataStore({
        systems: {
          "system-1": { multiTenancyMode: "enabled" },
          "system-2": { multiTenancyMode: "disabled" },
        },
        credentials: ["system-1"], // Only has credentials for system-1
      });

      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: ["*"], // All systems allowed
          dataStore: dataStore as any,
        },
        tools,
      );

      // Should include: tool-1 (has creds), tool-2 (not multi-tenancy), tool-3 (no systems)
      // tool-4 requires system-1 (has creds) AND system-2 (not multi-tenancy) = allowed
      expect(result.map((t) => t.id)).toEqual(["tool-1", "tool-2", "tool-3", "tool-4"]);
    });

    it("should exclude tools requiring multi-tenancy systems without credentials", async () => {
      const dataStore = createMockDataStore({
        systems: {
          "system-1": { multiTenancyMode: "enabled" },
          "system-2": { multiTenancyMode: "enabled" },
        },
        credentials: ["system-1"], // Only has credentials for system-1
      });

      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: ["*"], // All systems allowed
          dataStore: dataStore as any,
        },
        tools,
      );

      // Should include: tool-1 (has creds), tool-3 (no systems)
      // Should exclude: tool-2 (no creds for system-2), tool-4 (no creds for system-2)
      expect(result.map((t) => t.id)).toEqual(["tool-1", "tool-3"]);
    });

    it("should return only tools without systems when allowedSystems is null", async () => {
      const dataStore = createMockDataStore({
        systems: {},
        credentials: [],
      });

      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          endUserId: "user-1",
          allowedSystems: null, // No access to any systems
          dataStore: dataStore as any,
        },
        tools,
      );

      // Should only include tool-3 (no systems required)
      expect(result.map((t) => t.id)).toEqual(["tool-3"]);
    });
  });
});
