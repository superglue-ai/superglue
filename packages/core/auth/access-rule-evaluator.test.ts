import { describe, expect, it } from "vitest";
import {
  getAllowedToolIds,
  isToolAllowed,
  isSystemVisible,
  isRequestAllowed,
  getSystemAccessLevel,
  evaluateExpression,
} from "./access-rule-evaluator.js";
import type { Role } from "@superglue/shared";
import { SystemAccessLevel } from "@superglue/shared";

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

describe("isToolAllowed", () => {
  it("should allow when role has tools: ALL", () => {
    const role = makeRole({ id: "r1", tools: "ALL" });
    expect(isToolAllowed([role], "any-tool").allowed).toBe(true);
  });

  it("should allow when tool is in the allowlist", () => {
    const role = makeRole({ id: "r1", tools: ["tool-a", "tool-b"] });
    expect(isToolAllowed([role], "tool-a").allowed).toBe(true);
  });

  it("should deny when tool is not in the allowlist", () => {
    const role = makeRole({ id: "r1", tools: ["tool-a"] });
    const result = isToolAllowed([role], "tool-b");
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("tool-b");
  });

  it("should allow via union — tool blocked in one role, ALL in another", () => {
    const r1 = makeRole({ id: "r1", tools: ["tool-a"] });
    const r2 = makeRole({ id: "r2", tools: "ALL" });
    expect(isToolAllowed([r1, r2], "tool-b").allowed).toBe(true);
  });

  it("should allow via union — tool in second role's allowlist", () => {
    const r1 = makeRole({ id: "r1", tools: ["tool-a"] });
    const r2 = makeRole({ id: "r2", tools: ["tool-b"] });
    expect(isToolAllowed([r1, r2], "tool-b").allowed).toBe(true);
  });

  it("should deny when tool is not in any role's allowlist", () => {
    const r1 = makeRole({ id: "r1", tools: ["tool-a"] });
    const r2 = makeRole({ id: "r2", tools: ["tool-b"] });
    expect(isToolAllowed([r1, r2], "tool-c").allowed).toBe(false);
  });

  it("should deny when tools is empty array", () => {
    const role = makeRole({ id: "r1", tools: [] });
    expect(isToolAllowed([role], "any-tool").allowed).toBe(false);
  });
});

describe("getAllowedToolIds", () => {
  it("should return undefined when any role has ALL tool access", () => {
    const roles = [makeRole({ id: "r1", tools: ["tool-a"] }), makeRole({ id: "r2", tools: "ALL" })];

    expect(getAllowedToolIds(roles)).toBeUndefined();
  });

  it("should return the deduplicated union of allowed tool ids", () => {
    const roles = [
      makeRole({ id: "r1", tools: ["tool-a", "tool-b"] }),
      makeRole({ id: "r2", tools: ["tool-b", "tool-c"] }),
    ];

    expect(getAllowedToolIds(roles)).toEqual(["tool-a", "tool-b", "tool-c"]);
  });

  it("should return an empty array when no roles allow any tools", () => {
    const roles = [makeRole({ id: "r1", tools: [] })];

    expect(getAllowedToolIds(roles)).toEqual([]);
  });
});

describe("getSystemAccessLevel", () => {
  it("should return READ_WRITE when systems is ALL", () => {
    const role = makeRole({ id: "r1", systems: "ALL" });
    expect(getSystemAccessLevel([role], "sys-1")).toBe(SystemAccessLevel.READ_WRITE);
  });

  it("should return NONE for unlisted systems (deny by default)", () => {
    const role = makeRole({ id: "r1", systems: {} });
    expect(getSystemAccessLevel([role], "sys-1")).toBe(SystemAccessLevel.NONE);
  });

  it("should return NONE for systems not in the map", () => {
    const role = makeRole({ id: "r1", systems: { "sys-2": SystemAccessLevel.READ_WRITE } });
    expect(getSystemAccessLevel([role], "sys-1")).toBe(SystemAccessLevel.NONE);
  });

  it("should return the configured level", () => {
    const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_ONLY } });
    expect(getSystemAccessLevel([role], "sys-1")).toBe(SystemAccessLevel.READ_ONLY);
  });

  it("should return NONE when explicitly set", () => {
    const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.NONE } });
    expect(getSystemAccessLevel([role], "sys-1")).toBe(SystemAccessLevel.NONE);
  });

  it("should pick most permissive across roles (union)", () => {
    const r1 = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.NONE } });
    const r2 = makeRole({ id: "r2", systems: { "sys-1": SystemAccessLevel.READ_ONLY } });
    expect(getSystemAccessLevel([r1, r2], "sys-1")).toBe(SystemAccessLevel.READ_ONLY);
  });

  it("should pick READ_WRITE over READ_ONLY (union)", () => {
    const r1 = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_ONLY } });
    const r2 = makeRole({ id: "r2", systems: { "sys-1": SystemAccessLevel.READ_WRITE } });
    expect(getSystemAccessLevel([r1, r2], "sys-1")).toBe(SystemAccessLevel.READ_WRITE);
  });

  it("should use ALL from one role even if another restricts", () => {
    const r1 = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.NONE } });
    const r2 = makeRole({ id: "r2", systems: "ALL" });
    expect(getSystemAccessLevel([r1, r2], "sys-1")).toBe(SystemAccessLevel.READ_WRITE);
  });

  it("should deny unlisted system when no role has ALL", () => {
    const r1 = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_WRITE } });
    const r2 = makeRole({ id: "r2", systems: { "sys-2": SystemAccessLevel.READ_WRITE } });
    expect(getSystemAccessLevel([r1, r2], "sys-3")).toBe(SystemAccessLevel.NONE);
  });

  it("should return READ_WRITE for system with custom rule permission", () => {
    const role = makeRole({
      id: "r1",
      systems: {
        "sys-1": { rules: [{ id: "cr1", name: "Rule", expression: "true", isActive: true }] },
      },
    });
    expect(getSystemAccessLevel([role], "sys-1")).toBe(SystemAccessLevel.READ_WRITE);
  });
});

describe("isSystemVisible", () => {
  it("should allow when systems is ALL", () => {
    const role = makeRole({ id: "r1", systems: "ALL" });
    expect(isSystemVisible([role], "sys-1").allowed).toBe(true);
  });

  it("should allow when system is explicitly listed", () => {
    const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_ONLY } });
    expect(isSystemVisible([role], "sys-1").allowed).toBe(true);
  });

  it("should deny when systems is empty map (nothing listed)", () => {
    const role = makeRole({ id: "r1", systems: {} });
    expect(isSystemVisible([role], "sys-1").allowed).toBe(false);
  });

  it("should deny when system is NONE", () => {
    const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.NONE } });
    expect(isSystemVisible([role], "sys-1").allowed).toBe(false);
  });

  it("should allow when system has custom rule permission", () => {
    const role = makeRole({
      id: "r1",
      systems: {
        "sys-1": { rules: [{ id: "cr1", name: "Rule", expression: "true", isActive: true }] },
      },
    });
    expect(isSystemVisible([role], "sys-1").allowed).toBe(true);
  });
});

describe("isRequestAllowed", () => {
  it("should allow everything when systems is ALL", () => {
    const role = makeRole({ id: "r1", systems: "ALL" });
    expect(isRequestAllowed([role], "sys-1", { isMutating: true }).allowed).toBe(true);
  });

  it("should deny unlisted system", () => {
    const role = makeRole({ id: "r1", systems: {} });
    expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(false);
  });

  it("should allow non-mutating request on read-only system", () => {
    const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_ONLY } });
    expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(true);
  });

  it("should deny mutating request on read-only system", () => {
    const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_ONLY } });
    const result = isRequestAllowed([role], "sys-1", { isMutating: true });
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("read-only");
  });

  it("should deny everything on NONE system", () => {
    const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.NONE } });
    expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(false);
  });

  it("should allow everything on read-write system", () => {
    const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_WRITE } });
    expect(isRequestAllowed([role], "sys-1", { isMutating: true }).allowed).toBe(true);
  });

  describe("custom rules (inline in systems map)", () => {
    it("should allow when expression returns true", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [
              {
                id: "cr1",
                name: "Allow deletes",
                expression: "stepConfig.method === 'DELETE'",
                isActive: true,
              },
            ],
          },
        },
      });
      expect(
        isRequestAllowed([role], "sys-1", { isMutating: true, stepConfig: { method: "DELETE" } })
          .allowed,
      ).toBe(true);
    });

    it("should block when expression returns false", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [
              {
                id: "cr1",
                name: "Allow deletes",
                expression: "stepConfig.method === 'DELETE'",
                isActive: true,
              },
            ],
          },
        },
      });
      const result = isRequestAllowed([role], "sys-1", {
        isMutating: false,
        stepConfig: { method: "GET" },
      });
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Allow deletes");
    });

    it("should not affect other systems (rules are per-system)", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": SystemAccessLevel.READ_WRITE,
          "sys-2": {
            rules: [{ id: "cr1", name: "Rule for sys-2", expression: "true", isActive: true }],
          },
        },
      });
      expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(true);
    });

    it("should skip inactive rules", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Block all", expression: "false", isActive: false }],
          },
        },
      });
      expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(true);
    });

    it("should allow when one role has custom rule blocking but another role has systems: ALL", () => {
      const r1 = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Block sys-1", expression: "false", isActive: true }],
          },
        },
      });
      const r2 = makeRole({ id: "r2", systems: "ALL" });
      expect(isRequestAllowed([r1, r2], "sys-1", { isMutating: false }).allowed).toBe(true);
    });

    it("should allow via second role when first role blocks (union across roles)", () => {
      const r1 = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_WRITE } });
      const r2 = makeRole({
        id: "r2",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Block sys-1", expression: "false", isActive: true }],
          },
        },
      });
      expect(isRequestAllowed([r1, r2], "sys-1", { isMutating: false }).allowed).toBe(true);
    });

    it("should allow POST when one role allows POST-only and another allows GET-only (conflicting custom rules)", () => {
      const engineering = makeRole({
        id: "engineering",
        systems: {
          gmail: {
            rules: [
              {
                id: "cr1",
                name: "POST only",
                expression: "stepConfig.method === 'POST'",
                isActive: true,
              },
            ],
          },
        },
      });
      const member = makeRole({
        id: "member",
        systems: {
          gmail: {
            rules: [
              {
                id: "cr2",
                name: "GET only",
                expression: "stepConfig.method === 'GET'",
                isActive: true,
              },
            ],
          },
        },
      });
      expect(
        isRequestAllowed([engineering, member], "gmail", {
          isMutating: true,
          stepConfig: { method: "POST" },
        }).allowed,
      ).toBe(true);
      expect(
        isRequestAllowed([engineering, member], "gmail", {
          isMutating: false,
          stepConfig: { method: "GET" },
        }).allowed,
      ).toBe(true);
    });

    it("should block when ALL roles have blocking custom rules for the same request", () => {
      const r1 = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [
              {
                id: "cr1",
                name: "Block GET on r1",
                expression: "stepConfig.method !== 'GET'",
                isActive: true,
              },
            ],
          },
        },
      });
      const r2 = makeRole({
        id: "r2",
        systems: {
          "sys-1": {
            rules: [
              {
                id: "cr2",
                name: "Block GET on r2",
                expression: "stepConfig.method !== 'GET'",
                isActive: true,
              },
            ],
          },
        },
      });
      expect(
        isRequestAllowed([r1, r2], "sys-1", { isMutating: false, stepConfig: { method: "GET" } })
          .allowed,
      ).toBe(false);
    });

    it("should block with a rule that has no expression (treated as false)", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Block all on sys-1", isActive: true }],
          },
        },
      });
      expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(false);
    });

    it("should allow when expression returns true (allowlist)", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Allow everything", expression: "true", isActive: true }],
          },
        },
      });
      expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(true);
    });
  });

  describe("multi-role union (system access level)", () => {
    it("should upgrade NONE to READ_ONLY across roles", () => {
      const r1 = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.NONE } });
      const r2 = makeRole({ id: "r2", systems: { "sys-1": SystemAccessLevel.READ_ONLY } });
      expect(isRequestAllowed([r1, r2], "sys-1", { isMutating: false }).allowed).toBe(true);
      expect(isRequestAllowed([r1, r2], "sys-1", { isMutating: true }).allowed).toBe(false);
    });

    it("should upgrade READ_ONLY to READ_WRITE across roles", () => {
      const r1 = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_ONLY } });
      const r2 = makeRole({ id: "r2", systems: { "sys-1": SystemAccessLevel.READ_WRITE } });
      expect(isRequestAllowed([r1, r2], "sys-1", { isMutating: true }).allowed).toBe(true);
    });

    it("should allow unlisted system when one role has ALL", () => {
      const r1 = makeRole({ id: "r1", systems: {} });
      const r2 = makeRole({ id: "r2", systems: "ALL" });
      expect(isRequestAllowed([r1, r2], "sys-1", { isMutating: true }).allowed).toBe(true);
    });
  });

  describe("custom rules via isRequestAllowed", () => {
    it("should allow when system has no custom rules (plain access level)", () => {
      const role = makeRole({ id: "r1", systems: { "sys-1": SystemAccessLevel.READ_WRITE } });
      expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(true);
    });

    it("should allow when expression returns true", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Allow all", expression: "true", isActive: true }],
          },
        },
      });
      expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(true);
    });

    it("should block when expression returns false", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Block all", expression: "false", isActive: true }],
          },
        },
      });
      expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(false);
    });

    it("should block with blanket rule (no expression = false)", () => {
      const role = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Blanket block", isActive: true }],
          },
        },
      });
      expect(isRequestAllowed([role], "sys-1", { isMutating: false }).allowed).toBe(false);
    });

    it("should allow when one role blocks but another role has no custom rules (union)", () => {
      const r1 = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [{ id: "cr1", name: "Block all", expression: "false", isActive: true }],
          },
        },
      });
      const r2 = makeRole({
        id: "r2",
        systems: { "sys-1": SystemAccessLevel.READ_WRITE },
      });
      expect(isRequestAllowed([r1, r2], "sys-1", { isMutating: false }).allowed).toBe(true);
    });

    it("should allow when one role's rule passes even if another role's rule fails (union)", () => {
      const r1 = makeRole({
        id: "r1",
        systems: {
          "sys-1": {
            rules: [
              {
                id: "cr1",
                name: "POST only",
                expression: "stepConfig.method === 'POST'",
                isActive: true,
              },
            ],
          },
        },
      });
      const r2 = makeRole({
        id: "r2",
        systems: {
          "sys-1": {
            rules: [
              {
                id: "cr2",
                name: "GET only",
                expression: "stepConfig.method === 'GET'",
                isActive: true,
              },
            ],
          },
        },
      });
      expect(
        isRequestAllowed([r1, r2], "sys-1", { isMutating: true, stepConfig: { method: "POST" } })
          .allowed,
      ).toBe(true);
      expect(
        isRequestAllowed([r1, r2], "sys-1", { isMutating: false, stepConfig: { method: "GET" } })
          .allowed,
      ).toBe(true);
    });
  });
});

describe("evaluateExpression", () => {
  it("should return true when expression matches stepConfig", () => {
    expect(evaluateExpression("stepConfig.method === 'DELETE'", { method: "DELETE" })).toBe(true);
  });

  it("should return false when expression does not match", () => {
    expect(evaluateExpression("stepConfig.method === 'DELETE'", { method: "GET" })).toBe(false);
  });

  it("should return false (fail-closed) on invalid expression", () => {
    expect(evaluateExpression("this is not valid javascript!!!", {})).toBe(false);
  });

  it("should return false (fail-closed) when stepConfig is undefined", () => {
    expect(evaluateExpression("stepConfig.method === 'DELETE'")).toBe(false);
  });

  it("should handle complex expressions", () => {
    const config = {
      url: "https://api.example.com/admin/users",
      headers: { authorization: "Bearer token" },
    };
    expect(evaluateExpression("stepConfig.url.includes('/admin/')", config)).toBe(true);
    expect(evaluateExpression("stepConfig.url.includes('/public/')", config)).toBe(false);
  });
});
