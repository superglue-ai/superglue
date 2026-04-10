/**
 * Simple variable replacement utilities for main thread operations.
 * These don't require sandboxed execution and are used for documentation fetching, etc.
 */

import { oldReplaceVariables } from "./helpers.legacy.js";

/**
 * Replace <<variable>> placeholders with values from payload.
 * Does NOT support arrow function expressions - throws if encountered.
 * Use this for main thread operations like documentation fetching.
 */
export function replaceVariablesSimple(template: string, payload: Record<string, any>): string {
  if (!template) return "";

  const pattern = /<<([\s\S]*?)>>/g;

  let result = template;
  const matches = [...template.matchAll(pattern)];

  for (const match of matches) {
    const expression = match[1].trim();
    let resolvedValue: any;

    if (expression in payload && payload[expression] !== undefined) {
      resolvedValue = payload[expression];
    } else {
      const isArrowFunction = /^\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/.test(expression);

      if (isArrowFunction) {
        throw new Error(
          `Arrow function expressions are not supported in main thread variable replacement: ${expression}`,
        );
      }

      if (expression === "sg_auth_email") {
        throw new Error(
          `Variable 'sg_auth_email' is not available. This variable requires an authenticated user context.`,
        );
      }
      resolvedValue = undefined;
    }

    if (Array.isArray(resolvedValue) || typeof resolvedValue === "object") {
      resolvedValue = JSON.stringify(resolvedValue);
    }

    result = result.replace(match[0], String(resolvedValue));
  }

  return oldReplaceVariables(result, payload);
}
