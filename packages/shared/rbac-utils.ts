import type { SystemPermission, CustomRule, Role } from "./types.js";

export function isCustomRulePermission(
  p: SystemPermission,
): p is import("./types.js").CustomRulePermission {
  return typeof p === "object" && p !== null && "rules" in p;
}

export function getSystemRules(
  systems: "ALL" | Record<string, SystemPermission>,
  systemId: string,
): CustomRule[] {
  if (systems === "ALL" || !systems[systemId]) return [];
  const p = systems[systemId];
  return isCustomRulePermission(p) ? p.rules : [];
}

export const PREDEFINED_ROLE_IDS = ["admin", "member", "enduser"] as const;
export const RESERVED_ROLE_IDS = ["admin", "member", "enduser", "__admin__"] as const;
export const RESERVED_ROLE_NAMES = ["member", "end user", "enduser", "admin"] as const;

export function isPredefinedRole(roleId: string): boolean {
  return (PREDEFINED_ROLE_IDS as readonly string[]).includes(roleId);
}

export function isReservedRoleId(roleId: string): boolean {
  return (RESERVED_ROLE_IDS as readonly string[]).includes(roleId);
}

export function isReservedRoleName(name: string): boolean {
  return (RESERVED_ROLE_NAMES as readonly string[]).includes(name.toLowerCase().trim());
}

export function hasRole(roles: Role[], roleId: string): boolean {
  return roles.some((r) => r.id === roleId);
}

export function getRoleIds(roles: Role[]): string[] {
  return roles.map((r) => r.id);
}

export function getBaseRole(roles: Role[]): Role | null {
  const baseRoles = roles.filter((r) => r.isBaseRole);
  return baseRoles.length === 1 ? baseRoles[0] : null;
}

export function getBaseRoleId(roles: Role[]): string | null {
  const base = getBaseRole(roles);
  return base ? base.id : null;
}
