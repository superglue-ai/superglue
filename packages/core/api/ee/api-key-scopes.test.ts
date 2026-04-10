/**
 * Tests for API Key Scopes and Multi-Tenancy Permission Logic
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemAccessLevel } from "@superglue/shared";
import type { Role } from "@superglue/shared";
import { checkToolExecutionPermissionAsync, filterToolsByPermissionAsync } from "./scope-hooks.js";

import "./api-key-scopes.js";

vi.mock("../../datastore/ee/types.js", () => ({
  isEEDataStore: (ds: any) => ds._isEE === true,
}));

function makeRole(overrides: Partial<Role> & { id: string }): Role {
  return {
    name: "Test",
    tools: "ALL",
    systems: "ALL",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Multi-Tenancy Permission Logic", () => {
  describe("checkToolExecutionPermissionAsync", () => {
    const createMockDataStore = (options: {
      systems?: Record<string, { id?: string; multiTenancyMode?: string }>;
      credentials?: string[];
      roles?: Role[];
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
      getEndUser: vi.fn(() =>
        Promise.resolve({
          credentials: (options.credentials || []).map((systemId) => ({
            systemId,
            hasCredentials: true,
          })),
        }),
      ),
      getRolesForUser: vi.fn(() => Promise.resolve(options.roles ?? [])),
    });

    it("should allow member with no roles (no datastore)", async () => {
      const result = await checkToolExecutionPermissionAsync(
        { orgId: "org-1", roles: [makeRole({ id: "member" })], dataStore: {} as any },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow end user with no role assignments", async () => {
      const dataStore = createMockDataStore({ systems: {}, credentials: [], roles: [] });
      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [makeRole({ id: "enduser" })],
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: [] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should deny when multi-tenancy system requires credentials user doesn't have", async () => {
      const dataStore = createMockDataStore({
        systems: { "system-1": { multiTenancyMode: "enabled" } },
        credentials: [],
        roles: [],
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [makeRole({ id: "enduser" })],
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
        credentials: ["system-1"],
        roles: [],
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [makeRole({ id: "enduser" })],
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow non-multi-tenancy systems without credentials", async () => {
      const dataStore = createMockDataStore({
        systems: { "system-1": { multiTenancyMode: "disabled" } },
        credentials: [],
        roles: [],
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [makeRole({ id: "enduser" })],
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(true);
    });

    it("should deny when role restricts tool", async () => {
      const restrictedRole = makeRole({ id: "eu-role", tools: ["other-tool"], systems: "ALL" });
      const dataStore = createMockDataStore({
        systems: {},
        credentials: [],
        roles: [restrictedRole],
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [restrictedRole],
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: [] },
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("tool-1");
    });

    it("should deny when role restricts system", async () => {
      const restrictedRole = makeRole({ id: "eu-role", tools: "ALL", systems: {} });
      const dataStore = createMockDataStore({
        systems: {},
        credentials: [],
        roles: [restrictedRole],
      });

      const result = await checkToolExecutionPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [restrictedRole],
          dataStore: dataStore as any,
        },
        { id: "tool-1", systemIds: ["system-1"] },
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("system-1");
    });
  });

  describe("filterToolsByPermissionAsync", () => {
    const createMockDataStore = (options: {
      systems?: Record<string, { id?: string; multiTenancyMode?: string }>;
      credentials?: string[];
      roles?: Role[];
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
      getEndUser: vi.fn(() =>
        Promise.resolve({
          credentials: (options.credentials || []).map((systemId) => ({
            systemId,
            hasCredentials: true,
          })),
        }),
      ),
      getRolesForUser: vi.fn(() => Promise.resolve(options.roles ?? [])),
    });

    const tools = [
      { id: "tool-1", systemIds: ["system-1"] },
      { id: "tool-2", systemIds: ["system-2"] },
      { id: "tool-3", systemIds: [] },
      { id: "tool-4", systemIds: ["system-1", "system-2"] },
    ];

    it("should return all tools for member with no roles", async () => {
      const result = await filterToolsByPermissionAsync(
        { orgId: "org-1", roles: [makeRole({ id: "member" })], dataStore: {} as any },
        tools,
      );
      expect(result).toHaveLength(4);
    });

    it("should return all tools for end user with no roles (no multi-tenancy)", async () => {
      const dataStore = createMockDataStore({
        systems: {
          "system-1": { multiTenancyMode: "disabled" },
          "system-2": { multiTenancyMode: "disabled" },
        },
        credentials: [],
        roles: [],
      });
      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [makeRole({ id: "enduser" })],
          dataStore: dataStore as any,
        },
        tools,
      );
      expect(result).toHaveLength(4);
    });

    it("should filter by multi-tenancy credential requirements", async () => {
      const dataStore = createMockDataStore({
        systems: {
          "system-1": { multiTenancyMode: "enabled" },
          "system-2": { multiTenancyMode: "disabled" },
        },
        credentials: ["system-1"],
        roles: [],
      });

      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [makeRole({ id: "enduser" })],
          dataStore: dataStore as any,
        },
        tools,
      );

      expect(result.map((t) => t.id)).toEqual(["tool-1", "tool-2", "tool-3", "tool-4"]);
    });

    it("should exclude tools requiring multi-tenancy systems without credentials", async () => {
      const dataStore = createMockDataStore({
        systems: {
          "system-1": { multiTenancyMode: "enabled" },
          "system-2": { multiTenancyMode: "enabled" },
        },
        credentials: ["system-1"],
        roles: [],
      });

      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [makeRole({ id: "enduser" })],
          dataStore: dataStore as any,
        },
        tools,
      );

      expect(result.map((t) => t.id)).toEqual(["tool-1", "tool-3"]);
    });

    it("should filter by tool allowlist from role", async () => {
      const restrictedRole = makeRole({
        id: "eu-role",
        tools: ["tool-1", "tool-3"],
        systems: "ALL",
      });
      const dataStore = createMockDataStore({
        systems: {
          "system-1": { multiTenancyMode: "disabled" },
          "system-2": { multiTenancyMode: "disabled" },
        },
        credentials: [],
        roles: [restrictedRole],
      });

      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [restrictedRole],
          dataStore: dataStore as any,
        },
        tools,
      );

      expect(result.map((t) => t.id)).toEqual(["tool-1", "tool-3"]);
    });

    it("should filter by system allowlist from role", async () => {
      const restrictedRole = makeRole({
        id: "eu-role",
        tools: "ALL",
        systems: { "system-1": SystemAccessLevel.READ_WRITE },
      });
      const dataStore = createMockDataStore({
        systems: {
          "system-1": { multiTenancyMode: "disabled" },
          "system-2": { multiTenancyMode: "disabled" },
        },
        credentials: [],
        roles: [restrictedRole],
      });

      const result = await filterToolsByPermissionAsync(
        {
          orgId: "org-1",
          userId: "user-1",
          roles: [restrictedRole],
          dataStore: dataStore as any,
        },
        tools,
      );

      expect(result.map((t) => t.id)).toEqual(["tool-1", "tool-3"]);
    });
  });
});
