import { describe, expect, it } from "vitest";
import type { Role } from "@superglue/shared";
import { checkRouteAccess } from "./api-server.js";
import type { BaseRoleId } from "./types.js";

function makeRole(id: string, isBaseRole = false): Role {
  return {
    id,
    name: id,
    tools: "ALL",
    systems: "ALL",
    isBaseRole,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("checkRouteAccess", () => {
  describe("no allowedBaseRoles", () => {
    it("should allow access when no allowedBaseRoles is defined", () => {
      const result = checkRouteAccess([makeRole("member", true)], undefined);
      expect(result.allowed).toBe(true);
    });

    it("should allow access with empty roles when no allowedBaseRoles is defined", () => {
      const result = checkRouteAccess([], undefined);
      expect(result.allowed).toBe(true);
    });
  });

  describe("admin-only routes", () => {
    const allowed: BaseRoleId[] = ["admin"];

    it("should allow access when user has admin base role", () => {
      const result = checkRouteAccess([makeRole("admin", true)], allowed);
      expect(result.allowed).toBe(true);
    });

    it("should deny access when user has member base role", () => {
      const result = checkRouteAccess([makeRole("member", true)], allowed);
      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should deny access when user has enduser base role", () => {
      const result = checkRouteAccess([makeRole("enduser", true)], allowed);
      expect(result.allowed).toBe(false);
    });

    it("should deny access when no base role is found", () => {
      const result = checkRouteAccess([makeRole("custom")], allowed);
      expect(result.allowed).toBe(false);
    });
  });

  describe("admin + member routes", () => {
    const allowed: BaseRoleId[] = ["admin", "member"];

    it("should allow admin", () => {
      const result = checkRouteAccess([makeRole("admin", true)], allowed);
      expect(result.allowed).toBe(true);
    });

    it("should allow member", () => {
      const result = checkRouteAccess([makeRole("member", true), makeRole("custom")], allowed);
      expect(result.allowed).toBe(true);
    });

    it("should deny enduser", () => {
      const result = checkRouteAccess([makeRole("enduser", true)], allowed);
      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("all base roles allowed", () => {
    const allowed: BaseRoleId[] = ["admin", "member", "enduser"];

    it("should allow enduser", () => {
      const result = checkRouteAccess([makeRole("enduser", true)], allowed);
      expect(result.allowed).toBe(true);
    });

    it("should allow member", () => {
      const result = checkRouteAccess([makeRole("member", true)], allowed);
      expect(result.allowed).toBe(true);
    });
  });
});
