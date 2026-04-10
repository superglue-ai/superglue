import { isRequestConfig, isTransformConfig, Tool } from "./types.js";

// Pagination type mapping from legacy UPPER_CASE to camelCase
export const PAGINATION_TYPE_MAP: Record<string, string> = {
  OFFSET_BASED: "offsetBased",
  PAGE_BASED: "pageBased",
  CURSOR_BASED: "cursorBased",
  DISABLED: "disabled",
};

export function mapPaginationType(internalType?: string): string {
  if (!internalType) return "disabled";
  // If already camelCase, return as-is
  if (PAGINATION_TYPE_MAP[internalType]) {
    return PAGINATION_TYPE_MAP[internalType];
  }
  return internalType;
}

export function mapFailureBehavior(internal?: string): "fail" | "continue" | undefined {
  if (!internal) return undefined;
  return internal.toLowerCase() as "fail" | "continue";
}

export function validateToolStructure(
  tool: unknown,
): { valid: true } | { valid: false; error: string } {
  if (!tool || typeof tool !== "object") {
    return { valid: false, error: "Tool must be an object" };
  }

  const candidate = tool as Partial<Tool>;
  if (!candidate.id || typeof candidate.id !== "string") {
    return { valid: false, error: "Tool must have a valid 'id' string" };
  }

  if (!Array.isArray(candidate.steps)) {
    return { valid: false, error: "Tool must have a 'steps' array" };
  }

  if (candidate.steps.length === 0 && !candidate.outputTransform) {
    return { valid: false, error: "Tool must have at least one step or an outputTransform" };
  }

  for (let i = 0; i < candidate.steps.length; i++) {
    const step = candidate.steps[i];
    const stepLabel = step?.id ? `Step ${i + 1} (${step.id})` : `Step ${i + 1}`;

    if (!step?.id) {
      return { valid: false, error: `Step ${i + 1}: missing 'id'` };
    }

    if (!step.config) {
      return { valid: false, error: `${stepLabel}: missing 'config'` };
    }

    if (isTransformConfig(step.config)) {
      if (!step.config.transformCode) {
        return {
          valid: false,
          error: `${stepLabel}: transform step missing 'transformCode'`,
        };
      }
      continue;
    }

    if (!isRequestConfig(step.config)) {
      return {
        valid: false,
        error: `${stepLabel}: unknown step config type`,
      };
    }

    if (typeof step.config.url !== "string" || step.config.url.trim().length === 0) {
      return { valid: false, error: `${stepLabel}: request step missing 'url'` };
    }
  }

  return { valid: true };
}
