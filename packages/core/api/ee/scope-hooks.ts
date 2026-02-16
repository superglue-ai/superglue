/**
 * EE Scope Hooks
 *
 * This module provides the hook interface for permission checks.
 * Default implementations allow everything - EE modules can override them.
 *
 * There are two types of hooks:
 * 1. Synchronous hooks - for simple API key scope checks
 * 2. Async hooks - for checks requiring database access (multi-tenancy, end-user scopes)
 */

import type { Tool } from "@superglue/shared";
import type { DataStore } from "../../datastore/types.js";

export interface ScopeContext {
  isRestricted?: boolean;
  allowedTools?: string[]; // ['*'] means all tools allowed
  allowedSystems?: string[] | null; // null or ['*'] means no restrictions
  endUserId?: string;
  orgId?: string;
}

export interface AsyncScopeContext extends ScopeContext {
  dataStore: DataStore;
  orgId: string;
}

// Tool with computed systemIds for scope checking
export interface ToolWithSystemIds {
  id: string;
  systemIds: string[];
}

// Default implementations (allow everything)
let _checkToolExecutionPermission = (
  _ctx: ScopeContext,
  _toolId: string,
): { allowed: boolean; error?: string } => ({ allowed: true });

let _filterToolsByPermission = <T extends { id: string }>(_ctx: ScopeContext, tools: T[]): T[] =>
  tools;

let _checkGraphQLAccess = (_ctx: ScopeContext): { allowed: boolean; error?: string } => ({
  allowed: true,
});

// Async hooks for multi-tenancy checks (default: allow everything)
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

// Registration functions for EE modules to override defaults
export function registerToolExecutionCheck(fn: typeof _checkToolExecutionPermission) {
  _checkToolExecutionPermission = fn;
}

export function registerToolsFilter(fn: typeof _filterToolsByPermission) {
  _filterToolsByPermission = fn;
}

export function registerGraphQLAccessCheck(fn: typeof _checkGraphQLAccess) {
  _checkGraphQLAccess = fn;
}

export function registerToolExecutionCheckAsync(fn: typeof _checkToolExecutionPermissionAsync) {
  _checkToolExecutionPermissionAsync = fn;
}

export function registerToolsFilterAsync(fn: typeof _filterToolsByPermissionAsync) {
  _filterToolsByPermissionAsync = fn;
}

// Public API - called by core code

// Synchronous checks (API key scopes only)
export function checkToolExecutionPermission(
  ctx: ScopeContext,
  toolId: string,
): { allowed: boolean; error?: string } {
  return _checkToolExecutionPermission(ctx, toolId);
}

export function filterToolsByPermission<T extends { id: string }>(
  ctx: ScopeContext,
  tools: T[],
): T[] {
  return _filterToolsByPermission(ctx, tools);
}

export function checkGraphQLAccess(ctx: ScopeContext): { allowed: boolean; error?: string } {
  return _checkGraphQLAccess(ctx);
}

// Async checks (includes multi-tenancy and end-user system scopes)
export async function checkToolExecutionPermissionAsync(
  ctx: AsyncScopeContext,
  tool: ToolWithSystemIds,
): Promise<{ allowed: boolean; error?: string; missingSystemIds?: string[] }> {
  // First check synchronous API key permissions
  const syncCheck = _checkToolExecutionPermission(ctx, tool.id);
  if (!syncCheck.allowed) {
    return syncCheck;
  }

  // Then check async permissions (multi-tenancy, end-user scopes)
  return _checkToolExecutionPermissionAsync(ctx, tool);
}

export async function filterToolsByPermissionAsync<T extends ToolWithSystemIds>(
  ctx: AsyncScopeContext,
  tools: T[],
): Promise<T[]> {
  // First apply synchronous API key filter
  let filtered = _filterToolsByPermission(ctx, tools);

  // Then apply async filters (multi-tenancy, end-user scopes)
  filtered = await _filterToolsByPermissionAsync(ctx, filtered);

  return filtered;
}
