/**
 * EE: API Key Scope Implementation
 *
 * This module registers permission checks based on API key restrictions:
 * - isRestricted: false = full access (GraphQL + all tools)
 * - isRestricted: true = REST/MCP only, limited to allowedTools
 *
 * It also registers async hooks for multi-tenancy and end-user system scopes:
 * - endUserId present = check end-user's allowed systems
 * - multiTenancyMode enabled = check end-user has credentials for required systems
 *
 * If this module is not loaded, the default hooks allow everything.
 */

import { isEEDataStore } from "../../datastore/ee/types.js";
import { logMessage } from "../../utils/logs.js";
import {
  registerGraphQLAccessCheck,
  registerToolExecutionCheck,
  registerToolsFilter,
  registerToolExecutionCheckAsync,
  registerToolsFilterAsync,
  type ScopeContext,
  type AsyncScopeContext,
  type ToolWithSystemIds,
} from "./scope-hooks.js";

// Helper to check if allowedTools means "all tools"
const isAllToolsAllowed = (allowedTools: string[] | undefined): boolean => {
  return allowedTools?.length === 1 && allowedTools[0] === "*";
};

// Helper to check if a system is allowed for an end user
const isSystemAllowedForEndUser = (
  systemId: string,
  allowedSystems: string[] | null | undefined,
): boolean => {
  // null/undefined/[] = no access
  if (!allowedSystems || allowedSystems.length === 0) {
    return false;
  }
  // ['*'] = all systems allowed
  if (allowedSystems.includes("*")) {
    return true;
  }
  // Check if specific system is in the allowed list
  return allowedSystems.includes(systemId);
};

// Register the tool execution permission check (synchronous - API key scopes only)
registerToolExecutionCheck((ctx: ScopeContext, toolId: string) => {
  // Unrestricted keys can execute any tool
  if (!ctx.isRestricted) return { allowed: true };

  // Restricted key with ['*'] = all tools allowed
  if (isAllToolsAllowed(ctx.allowedTools)) {
    return { allowed: true };
  }

  // Restricted key with allowedTools list = check if tool is in list
  if (ctx.allowedTools?.includes(toolId)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    error: "This API key is not authorized to execute this tool",
  };
});

// Register the tools filter (synchronous - API key scopes only)
registerToolsFilter(<T extends { id: string }>(ctx: ScopeContext, tools: T[]): T[] => {
  logMessage(
    "debug",
    `[api-key-scopes] filterTools sync: isRestricted=${ctx.isRestricted}, allowedTools=${JSON.stringify(ctx.allowedTools)}, toolCount=${tools.length}`,
  );

  // Unrestricted keys see all tools
  if (!ctx.isRestricted) {
    logMessage(
      "debug",
      `[api-key-scopes] filterTools sync: unrestricted, returning all ${tools.length} tools`,
    );
    return tools;
  }

  // Restricted key with ['*'] = all tools
  if (isAllToolsAllowed(ctx.allowedTools)) {
    logMessage(
      "debug",
      `[api-key-scopes] filterTools sync: allowedTools=['*'], returning all ${tools.length} tools`,
    );
    return tools;
  }

  // Restricted key with allowedTools list = filter
  const filtered = tools.filter((t) => ctx.allowedTools?.includes(t.id));
  logMessage(
    "debug",
    `[api-key-scopes] filterTools sync: filtered ${tools.length} -> ${filtered.length} tools`,
  );
  return filtered;
});

// Register the GraphQL access check
registerGraphQLAccessCheck((ctx: ScopeContext) => {
  if (ctx.isRestricted === true) {
    return {
      allowed: false,
      error:
        "This API key does not have access to the GraphQL API. Use the REST API or MCP instead.",
    };
  }
  return { allowed: true };
});

// Register async tool execution check (multi-tenancy + end-user system scopes)
registerToolExecutionCheckAsync(
  async (
    ctx: AsyncScopeContext,
    tool: ToolWithSystemIds,
  ): Promise<{ allowed: boolean; error?: string; missingSystemIds?: string[] }> => {
    // If no endUserId, this is not an end-user request - allow
    if (!ctx.endUserId) {
      return { allowed: true };
    }

    // Tools without systems are allowed
    if (!tool.systemIds || tool.systemIds.length === 0) {
      return { allowed: true };
    }

    // Check end-user system scopes first (fast, no DB call needed if already loaded)
    const disallowedSystems: string[] = [];
    for (const systemId of tool.systemIds) {
      if (!isSystemAllowedForEndUser(systemId, ctx.allowedSystems)) {
        disallowedSystems.push(systemId);
      }
    }

    if (disallowedSystems.length > 0) {
      return {
        allowed: false,
        error: `End user is not authorized to access systems: ${disallowedSystems.join(", ")}`,
      };
    }

    // If dataStore doesn't support EE features, allow (no multi-tenancy check)
    if (!isEEDataStore(ctx.dataStore)) {
      return { allowed: true };
    }

    // Check multi-tenancy credential requirements
    const missingSystemIds: string[] = [];

    // Get end user's credential status
    const credentialStatuses = await ctx.dataStore.listEndUserCredentials({
      endUserId: ctx.endUserId,
      orgId: ctx.orgId,
    });
    const credentialSystemIds = new Set(credentialStatuses.map((c) => c.systemId));

    // Batch fetch all systems to check multiTenancyMode
    const systems = await ctx.dataStore.getManySystems({
      ids: tool.systemIds,
      orgId: ctx.orgId,
    });

    for (const system of systems) {
      if (system.multiTenancyMode === "enabled" && !credentialSystemIds.has(system.id)) {
        missingSystemIds.push(system.id);
      }
    }

    if (missingSystemIds.length > 0) {
      return {
        allowed: false,
        error: `End user must authenticate with the following systems: ${missingSystemIds.join(", ")}`,
        missingSystemIds,
      };
    }

    return { allowed: true };
  },
);

// Register async tools filter (multi-tenancy + end-user system scopes)
registerToolsFilterAsync(
  async <T extends ToolWithSystemIds>(ctx: AsyncScopeContext, tools: T[]): Promise<T[]> => {
    logMessage(
      "debug",
      `[api-key-scopes] filterTools async: endUserId=${ctx.endUserId}, allowedSystems=${JSON.stringify(ctx.allowedSystems)}, toolCount=${tools.length}`,
    );

    // If no endUserId, this is not an end-user request - return all tools
    if (!ctx.endUserId) {
      logMessage(
        "debug",
        `[api-key-scopes] filterTools async: no endUserId, returning all ${tools.length} tools`,
      );
      return tools;
    }

    // First filter by end-user allowed systems (fast, no DB call)
    let filteredTools = tools.filter((tool) => {
      if (!tool.systemIds || tool.systemIds.length === 0) {
        return true;
      }
      // Tool is allowed if ALL its systems are allowed for the end user
      return tool.systemIds.every((systemId: string) =>
        isSystemAllowedForEndUser(systemId, ctx.allowedSystems),
      );
    });

    logMessage(
      "debug",
      `[api-key-scopes] filterTools async: after allowedSystems filter: ${tools.length} -> ${filteredTools.length} tools`,
    );

    // If dataStore doesn't support EE features, return filtered tools
    if (!isEEDataStore(ctx.dataStore)) {
      logMessage(
        "debug",
        `[api-key-scopes] filterTools async: not EE datastore, returning ${filteredTools.length} tools`,
      );
      return filteredTools;
    }

    // Collect all unique system IDs from remaining tools
    const allSystemIds = new Set<string>();
    for (const tool of filteredTools) {
      if (tool.systemIds) {
        for (const id of tool.systemIds) {
          allSystemIds.add(id);
        }
      }
    }

    if (allSystemIds.size === 0) {
      logMessage(
        "debug",
        `[api-key-scopes] filterTools async: no systemIds in tools, returning ${filteredTools.length} tools`,
      );
      return filteredTools;
    }

    logMessage(
      "debug",
      `[api-key-scopes] filterTools async: checking multiTenancy for systems: ${Array.from(allSystemIds).join(", ")}`,
    );

    // Batch fetch all systems to check multiTenancyMode
    const systems = await ctx.dataStore.getManySystems({
      ids: Array.from(allSystemIds),
      orgId: ctx.orgId,
    });
    const systemsMap = new Map(
      systems.map((s) => [s.id, { multiTenancyMode: s.multiTenancyMode }]),
    );

    logMessage(
      "debug",
      `[api-key-scopes] filterTools async: fetched ${systems.length} systems, multiTenancyModes: ${JSON.stringify(Object.fromEntries(systemsMap))}`,
    );

    // Get end user's credential status for all systems
    const credentialStatuses = await ctx.dataStore.listEndUserCredentials({
      endUserId: ctx.endUserId,
      orgId: ctx.orgId,
    });
    const credentialSystemIds = new Set(credentialStatuses.map((c) => c.systemId));

    logMessage(
      "debug",
      `[api-key-scopes] filterTools async: endUser has credentials for: ${Array.from(credentialSystemIds).join(", ")}`,
    );

    // Filter tools by multi-tenancy credential requirements
    const finalFiltered = filteredTools.filter((tool) => {
      // Tools without systems pass through
      if (!tool.systemIds || tool.systemIds.length === 0) {
        return true;
      }

      // Check each system the tool uses
      for (const systemId of tool.systemIds) {
        const system = systemsMap.get(systemId);

        // If system has multiTenancyMode enabled, end user must have credentials
        if (system?.multiTenancyMode === "enabled") {
          if (!credentialSystemIds.has(systemId)) {
            logMessage(
              "debug",
              `[api-key-scopes] filterTools async: tool ${tool.id} REJECTED - missing credentials for multi-tenancy system ${systemId}`,
            );
            return false;
          }
        }
      }

      return true;
    });

    logMessage(
      "debug",
      `[api-key-scopes] filterTools async: after multiTenancy filter: ${filteredTools.length} -> ${finalFiltered.length} tools`,
    );
    return finalFiltered;
  },
);
