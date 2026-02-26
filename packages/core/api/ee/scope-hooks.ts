/**
 * EE Scope Hooks
 *
 * This module provides the hook interface for permission checks.
 * Default implementations allow everything - EE modules can override them.
 */

import type { DataStore } from "../../datastore/types.js";

export interface ScopeContext {
  isRestricted?: boolean;
  allowedSystems?: string[] | null;
  endUserId?: string;
  orgId?: string;
}

export interface AsyncScopeContext extends ScopeContext {
  dataStore: DataStore;
  orgId: string;
}

export interface ToolWithSystemIds {
  id: string;
  systemIds: string[];
}

let _checkGraphQLAccess = (_ctx: ScopeContext): { allowed: boolean; error?: string } => ({
  allowed: true,
});

let _checkToolExecutionPermissionAsync = async (
  _ctx: AsyncScopeContext,
  _tool: ToolWithSystemIds,
): Promise<{ allowed: boolean; error?: string; missingSystemIds?: string[] }> => ({
  allowed: true,
});

let _filterToolsByPermissionAsync = async <T extends ToolWithSystemIds>(
  _ctx: AsyncScopeContext,
  tools: T[],
): Promise<T[]> => tools;

export function registerGraphQLAccessCheck(fn: typeof _checkGraphQLAccess) {
  _checkGraphQLAccess = fn;
}

export function registerToolExecutionCheckAsync(fn: typeof _checkToolExecutionPermissionAsync) {
  _checkToolExecutionPermissionAsync = fn;
}

export function registerToolsFilterAsync(fn: typeof _filterToolsByPermissionAsync) {
  _filterToolsByPermissionAsync = fn;
}

export function checkGraphQLAccess(ctx: ScopeContext): { allowed: boolean; error?: string } {
  return _checkGraphQLAccess(ctx);
}

export async function checkToolExecutionPermissionAsync(
  ctx: AsyncScopeContext,
  tool: ToolWithSystemIds,
): Promise<{ allowed: boolean; error?: string; missingSystemIds?: string[] }> {
  return _checkToolExecutionPermissionAsync(ctx, tool);
}

export async function filterToolsByPermissionAsync<T extends ToolWithSystemIds>(
  ctx: AsyncScopeContext,
  tools: T[],
): Promise<T[]> {
  return _filterToolsByPermissionAsync(ctx, tools);
}
