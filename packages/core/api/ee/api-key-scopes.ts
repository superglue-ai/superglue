/**
 * EE: API Key Scope Implementation
 *
 * Registers permission checks using the structured role model:
 * - Tool allowlists
 * - System access levels (none / read-only / read-write)
 * - Custom rules (expression-based)
 * - Multi-tenancy credential requirements for end users (separate hook)
 *
 * If this module is not loaded, the default hooks allow everything.
 */

import { hasRole } from "@superglue/shared";
import type { Role } from "@superglue/shared";
import type { EEDataStore } from "../../datastore/ee/types.js";
import { isEEDataStore } from "../../datastore/ee/types.js";
import { isToolAllowed, isSystemVisible } from "../../auth/access-rule-evaluator.js";
import {
  registerToolExecutionCheckAsync,
  registerMultiTenancyCheckAsync,
  registerToolsFilterAsync,
  registerMultiTenancyFilterAsync,
  registerSystemsFilterAsync,
  type AsyncScopeContext,
  type ToolWithSystemIds,
  type SystemWithId,
} from "./scope-hooks.js";

async function resolveEndUserCredentialContext(
  ctx: AsyncScopeContext & { userId: string },
  systemIds: string[],
): Promise<{
  systemsMap: Map<string, { multiTenancyMode?: string }>;
  credentialSystemIds: Set<string>;
}> {
  const eeStore = ctx.dataStore as EEDataStore;
  const [systems, endUser] = await Promise.all([
    eeStore.getManySystems({ ids: systemIds, orgId: ctx.orgId }),
    eeStore.getEndUser({ id: ctx.userId, orgId: ctx.orgId }),
  ]);
  const systemsMap = new Map(systems.map((s) => [s.id, { multiTenancyMode: s.multiTenancyMode }]));
  const credentialSystemIds = new Set(
    (endUser?.credentials || []).filter((c) => c.hasCredentials).map((c) => c.systemId),
  );
  return { systemsMap, credentialSystemIds };
}

function isMultiTenantAndMissingCredentials(
  systemId: string,
  systemsMap: Map<string, { multiTenancyMode?: string }>,
  credentialSystemIds: Set<string>,
): boolean {
  const system = systemsMap.get(systemId);
  return system?.multiTenancyMode === "enabled" && !credentialSystemIds.has(systemId);
}

function checkToolSystemDependencies(
  roles: Role[],
  tool: ToolWithSystemIds,
): { allowed: boolean; error?: string } {
  for (const systemId of tool.systemIds || []) {
    const systemCheck = isSystemVisible(roles, systemId);
    if (!systemCheck.allowed) return systemCheck;
  }
  return { allowed: true };
}

registerMultiTenancyCheckAsync(async (ctx: AsyncScopeContext, tool: ToolWithSystemIds) => {
  const roles = ctx.roles || [];
  const isApplicable = isEEDataStore(ctx.dataStore) && hasRole(roles, "enduser") && !!ctx.userId;
  const hasSystemDeps = tool.systemIds && tool.systemIds.length > 0;
  if (!isApplicable || !hasSystemDeps) return { allowed: true };

  const { systemsMap, credentialSystemIds } = await resolveEndUserCredentialContext(
    ctx as AsyncScopeContext & { userId: string },
    tool.systemIds,
  );

  const missingSystemIds = tool.systemIds.filter((id) =>
    isMultiTenantAndMissingCredentials(id, systemsMap, credentialSystemIds),
  );

  if (missingSystemIds.length > 0) {
    return {
      allowed: false,
      error: `End user must authenticate with the following systems: ${missingSystemIds.join(", ")}`,
      missingSystemIds,
    };
  }
  return { allowed: true };
});

registerMultiTenancyFilterAsync(
  async <T extends ToolWithSystemIds>(ctx: AsyncScopeContext, tools: T[]): Promise<T[]> => {
    const roles = ctx.roles || [];
    const isApplicable = isEEDataStore(ctx.dataStore) && hasRole(roles, "enduser") && !!ctx.userId;
    if (!isApplicable) return tools;

    const allSystemIds = [...new Set(tools.flatMap((t) => t.systemIds || []))];
    if (allSystemIds.length === 0) return tools;

    const { systemsMap, credentialSystemIds } = await resolveEndUserCredentialContext(
      ctx as AsyncScopeContext & { userId: string },
      allSystemIds,
    );

    return tools.filter((tool) => {
      if (!tool.systemIds || tool.systemIds.length === 0) return true;
      return !tool.systemIds.some((id) =>
        isMultiTenantAndMissingCredentials(id, systemsMap, credentialSystemIds),
      );
    });
  },
);

registerToolExecutionCheckAsync(async (ctx: AsyncScopeContext, tool: ToolWithSystemIds) => {
  const roles = ctx.roles || [];
  const toolCheck = isToolAllowed(roles, tool.id);
  if (!toolCheck.allowed) return toolCheck;
  return checkToolSystemDependencies(roles, tool);
});

registerToolsFilterAsync(
  async <T extends ToolWithSystemIds>(ctx: AsyncScopeContext, tools: T[]): Promise<T[]> => {
    const roles = ctx.roles || [];
    return tools.filter((tool) => {
      const toolCheck = isToolAllowed(roles, tool.id);
      if (!toolCheck.allowed) return false;
      return checkToolSystemDependencies(roles, tool).allowed;
    });
  },
);

registerSystemsFilterAsync(
  async <T extends SystemWithId>(ctx: AsyncScopeContext, systems: T[]): Promise<T[]> => {
    const roles = ctx.roles || [];
    return systems.filter((system) => isSystemVisible(roles, system.id).allowed);
  },
);
