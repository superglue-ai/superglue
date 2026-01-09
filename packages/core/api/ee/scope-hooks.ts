/**
 * EE Scope Hooks
 *
 * This module provides the hook interface for permission checks.
 * Default implementations allow everything - EE modules can override them.
 */

export interface ScopeContext {
  isRestricted?: boolean;
  allowedTools?: string[] | null;
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

// Public API - called by core code
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
