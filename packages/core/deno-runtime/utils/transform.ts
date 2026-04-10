/**
 * Transform execution for Deno runtime
 *
 * Executes JavaScript transform code natively in Deno.
 * Safe because Deno's permission system prevents dangerous operations.
 */

import type { TransformResult, ServiceMetadata } from "../types.ts";
import { DENO_DEFAULTS } from "../types.ts";
import { debug } from "./logging.ts";

/**
 * Validate that code is a valid arrow function
 */
function isValidArrowFunction(code: string): boolean {
  const trimmed = code.trim();
  // Match arrow function patterns:
  // (x) => ...
  // x => ...
  // (x, y) => ...
  // () => ...
  const arrowFunctionPattern = /^\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/;
  return arrowFunctionPattern.test(trimmed);
}

/**
 * Assert and wrap code as a valid arrow function
 */
export function assertValidArrowFunction(code: string): string {
  const trimmed = code.trim();

  // Already an arrow function
  if (isValidArrowFunction(trimmed)) {
    return trimmed;
  }

  // If it's a simple expression, wrap it
  // e.g., "$.data" becomes "(input) => input.data"
  if (trimmed.startsWith("$")) {
    return `(input) => input${trimmed.slice(1)}`;
  }

  // If it starts with a property access, assume it's meant to be applied to input
  if (trimmed.startsWith(".")) {
    return `(input) => input${trimmed}`;
  }

  // Otherwise, wrap as identity or expression
  return `(input) => (${trimmed})`;
}

/**
 * Execute a transform function with timeout
 */
export async function executeTransform(
  data: unknown,
  code: string,
  metadata?: ServiceMetadata,
): Promise<TransformResult> {
  // Handle special cases
  if (!code) {
    return { success: true, code, data: {} };
  }
  if (code === "$") {
    return { success: true, code, data };
  }

  const wrappedCode = assertValidArrowFunction(code);

  debug(`Executing transform: ${wrappedCode.slice(0, 100)}...`, metadata);

  // Create the function via eval (safe due to Deno permissions)
  let fn: (input: unknown) => unknown;
  try {
    fn = eval(wrappedCode);
    if (typeof fn !== "function") {
      return {
        success: false,
        code,
        error: `Transform code did not evaluate to a function: ${typeof fn}`,
      };
    }
  } catch (evalError) {
    return {
      success: false,
      code,
      error: `Invalid transform code: ${(evalError as Error).message}`,
    };
  }

  // Execute with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DENO_DEFAULTS.TRANSFORM_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      (async () => {
        const output = fn(data);
        // Handle async transforms
        return output instanceof Promise ? await output : output;
      })(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`Transform timed out after 10 minutes`));
        });
      }),
    ]);

    return { success: true, code, data: result ?? null };
  } catch (execError) {
    return {
      success: false,
      code,
      error: (execError as Error).message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Replace <<expression>> variables in a template string
 */
export async function replaceVariables(
  template: string,
  payload: Record<string, unknown>,
  metadata?: ServiceMetadata,
): Promise<string> {
  if (!template) return "";

  const pattern = /<<([\s\S]*?)>>/g;
  let result = template;
  const matches = [...template.matchAll(pattern)];

  for (const match of matches) {
    const expression = match[1].trim();
    let resolvedValue: unknown;

    // Direct variable lookup
    if (expression in payload && payload[expression] !== undefined) {
      resolvedValue = payload[expression];
    } else {
      // Check if it's an arrow function expression
      const isArrowFunction = /^\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/.test(expression);

      if (isArrowFunction) {
        const transformResult = await executeTransform(payload, expression, metadata);
        if (!transformResult.success) {
          throw new Error(`Failed to run JS expression: ${expression} - ${transformResult.error}`);
        }
        resolvedValue = transformResult.data;
      } else {
        // Handle special variables
        if (expression === "sg_auth_email") {
          throw new Error(
            `Variable 'sg_auth_email' is not available. This variable requires an authenticated user context.`,
          );
        }
        resolvedValue = undefined;
      }
    }

    // Convert objects/arrays to JSON strings
    if (Array.isArray(resolvedValue) || typeof resolvedValue === "object") {
      resolvedValue = JSON.stringify(resolvedValue);
    }

    // Use a replacer function to avoid $-pattern interpretation
    result = result.replace(match[0], () => String(resolvedValue));
  }

  // Legacy variable replacement ({{var}} syntax)
  result = legacyReplaceVariables(result, payload);

  return result;
}

/**
 * Legacy variable replacement for {{var}} syntax
 */
function legacyReplaceVariables(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    if (trimmedKey in payload) {
      const value = payload[trimmedKey];
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
      return String(value);
    }
    return match;
  });
}
