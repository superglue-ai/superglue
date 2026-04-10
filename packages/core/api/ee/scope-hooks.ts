import type { DataStore } from "../../datastore/types.js";
import type { Role, RequestSource } from "@superglue/shared";

export interface ScopeContext {
  userId?: string;
  orgId?: string;
  roles?: Role[];
  requestSource?: RequestSource;
}

export interface AsyncScopeContext extends ScopeContext {
  dataStore: DataStore;
  orgId: string;
}

export interface ToolWithSystemIds {
  id: string;
  systemIds: string[];
}

export interface SystemWithId {
  id: string;
}

// --- Default implementations (allow everything) ---

let _checkMultiTenancyAsync = async (
  _ctx: AsyncScopeContext,
  _tool: ToolWithSystemIds,
): Promise<{ allowed: boolean; error?: string; missingSystemIds?: string[] }> => ({
  allowed: true,
});

let _filterMultiTenancyAsync = async <T extends ToolWithSystemIds>(
  _ctx: AsyncScopeContext,
  tools: T[],
): Promise<T[]> => tools;

let _checkToolExecutionPermissionAsync = async (
  _ctx: AsyncScopeContext,
  _tool: ToolWithSystemIds,
): Promise<{ allowed: boolean; error?: string }> => ({
  allowed: true,
});

let _filterToolsByPermissionAsync = async <T extends ToolWithSystemIds>(
  _ctx: AsyncScopeContext,
  tools: T[],
): Promise<T[]> => tools;

let _filterSystemsByPermissionAsync = async <T extends SystemWithId>(
  _ctx: AsyncScopeContext,
  systems: T[],
): Promise<T[]> => systems;

// --- Registration functions ---

export function registerMultiTenancyCheckAsync(fn: typeof _checkMultiTenancyAsync) {
  _checkMultiTenancyAsync = fn;
}

export function registerMultiTenancyFilterAsync(fn: typeof _filterMultiTenancyAsync) {
  _filterMultiTenancyAsync = fn;
}

export function registerToolExecutionCheckAsync(fn: typeof _checkToolExecutionPermissionAsync) {
  _checkToolExecutionPermissionAsync = fn;
}

export function registerToolsFilterAsync(fn: typeof _filterToolsByPermissionAsync) {
  _filterToolsByPermissionAsync = fn;
}

export function registerSystemsFilterAsync(fn: typeof _filterSystemsByPermissionAsync) {
  _filterSystemsByPermissionAsync = fn;
}

// --- Public API ---

export async function checkToolExecutionPermissionAsync(
  ctx: AsyncScopeContext,
  tool: ToolWithSystemIds,
): Promise<{ allowed: boolean; error?: string; missingSystemIds?: string[] }> {
  const multiTenancy = await _checkMultiTenancyAsync(ctx, tool);
  if (!multiTenancy.allowed) return multiTenancy;
  return _checkToolExecutionPermissionAsync(ctx, tool);
}

export async function filterToolsByPermissionAsync<T extends ToolWithSystemIds>(
  ctx: AsyncScopeContext,
  tools: T[],
): Promise<T[]> {
  const afterMultiTenancy = await _filterMultiTenancyAsync(ctx, tools);
  return _filterToolsByPermissionAsync(ctx, afterMultiTenancy);
}

export async function filterSystemsByPermissionAsync<T extends SystemWithId>(
  ctx: AsyncScopeContext,
  systems: T[],
): Promise<T[]> {
  return _filterSystemsByPermissionAsync(ctx, systems);
}
