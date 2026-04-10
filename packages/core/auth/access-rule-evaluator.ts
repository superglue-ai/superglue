import type { Role, SystemPermission } from "@superglue/shared";
import { SystemAccessLevel, isCustomRulePermission } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";

export type CheckResult = { allowed: boolean; error?: string };

export type BeforeRequestHook = (params: {
  systemId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  stepConfig: object;
  isMutating: boolean;
}) => Promise<{ allowed: boolean; error?: string }>;

export function getAllowedToolIds(roles: Role[]): string[] | undefined {
  const allowedToolIds = new Set<string>();

  for (const role of roles) {
    if (role.tools === "ALL") {
      return undefined;
    }

    if (!Array.isArray(role.tools)) {
      continue;
    }

    for (const toolId of role.tools) {
      allowedToolIds.add(toolId);
    }
  }

  return Array.from(allowedToolIds);
}

export function isToolAllowed(roles: Role[], toolId: string): CheckResult {
  const allowedToolIds = getAllowedToolIds(roles);
  if (allowedToolIds === undefined) {
    return { allowed: true };
  }

  if (allowedToolIds.includes(toolId)) {
    return { allowed: true };
  }

  return { allowed: false, error: `Tool '${toolId}' is not allowed by any assigned role` };
}

export function getSystemAccessLevel(roles: Role[], systemId: string): SystemAccessLevel {
  let best: SystemAccessLevel = SystemAccessLevel.NONE;
  for (const role of roles) {
    if (role.systems === "ALL") return SystemAccessLevel.READ_WRITE;
    const perm = role.systems[systemId];
    if (!perm) continue;
    if (isCustomRulePermission(perm)) {
      best = SystemAccessLevel.READ_WRITE;
      continue;
    }
    if (perm === SystemAccessLevel.READ_WRITE) return SystemAccessLevel.READ_WRITE;
    if (perm === SystemAccessLevel.READ_ONLY && best === SystemAccessLevel.NONE) best = perm;
  }
  return best;
}

export function isSystemVisible(roles: Role[], systemId: string): CheckResult {
  const level = getSystemAccessLevel(roles, systemId);
  if (level === SystemAccessLevel.NONE) {
    return { allowed: false, error: `System '${systemId}' is blocked by role policy` };
  }
  return { allowed: true };
}

export function hasAllSystems(roles: Role[]): boolean {
  return roles.some((role) => role.systems === "ALL");
}

export function isRequestAllowed(
  roles: Role[],
  systemId: string,
  request: { isMutating: boolean; stepConfig?: object },
): CheckResult {
  const { isMutating } = request;
  let lastError: string | undefined;

  for (const role of roles) {
    const { level, perm } = resolvePermission(role, systemId);
    if (level === SystemAccessLevel.NONE) continue;
    if (level === SystemAccessLevel.READ_ONLY && isMutating) {
      lastError = `System '${systemId}' is read-only; mutating request not allowed`;
      continue;
    }
    if (role.systems === "ALL") return { allowed: true };

    if (perm && isCustomRulePermission(perm)) {
      const ruleCheck = evaluateRules(perm.rules, systemId, request.stepConfig);
      if (ruleCheck.allowed) return { allowed: true };
      lastError = ruleCheck.error;
    } else {
      return { allowed: true };
    }
  }

  if (lastError) return { allowed: false, error: lastError };
  return { allowed: false, error: `System '${systemId}' is blocked by role policy` };
}

function resolvePermission(
  role: Role,
  systemId: string,
): { level: SystemAccessLevel; perm?: SystemPermission } {
  if (role.systems === "ALL") return { level: SystemAccessLevel.READ_WRITE };
  const perm = role.systems[systemId];
  if (!perm) return { level: SystemAccessLevel.NONE };
  if (isCustomRulePermission(perm)) return { level: SystemAccessLevel.READ_WRITE, perm };
  return { level: perm };
}

function evaluateRules(
  rules: Array<{ expression?: string; name: string; isActive: boolean }>,
  systemId: string,
  stepConfig?: object,
): CheckResult {
  for (const rule of rules) {
    if (!rule.isActive) continue;
    const allowed = rule.expression ? evaluateExpression(rule.expression, stepConfig) : false;
    if (!allowed) {
      return {
        allowed: false,
        error: `Blocked by custom rule '${rule.name}' on system '${systemId}'`,
      };
    }
  }
  return { allowed: true };
}

export function evaluateExpression(expression: string, stepConfig?: object): boolean {
  try {
    // Create a function that evaluates the expression with stepConfig in scope
    // This is safe because expressions are admin-defined, not user input
    const fn = new Function("stepConfig", `return Boolean(${expression})`);
    return fn(stepConfig ?? {});
  } catch (error) {
    logMessage("warn", `Custom rule expression evaluation failed (fail-closed): ${error}`);
    return false;
  }
}

export function createRoleBasedRequestHook(roles: Role[]): BeforeRequestHook {
  return ({ systemId, isMutating, stepConfig }) =>
    Promise.resolve(isRequestAllowed(roles, systemId, { isMutating, stepConfig }));
}
