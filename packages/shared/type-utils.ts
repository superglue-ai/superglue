import type { ExecutionStep, Tool, OpenAPITool, OpenAPIToolStep } from "./types.js";

// Pagination type mapping
export const PAGINATION_TYPE_MAP: Record<string, string> = {
  OFFSET_BASED: "offsetBased",
  PAGE_BASED: "pageBased",
  CURSOR_BASED: "cursorBased",
  DISABLED: "disabled",
};

export function mapPaginationType(internalType?: string): string {
  if (!internalType) return "disabled";
  return PAGINATION_TYPE_MAP[internalType] || internalType.toLowerCase();
}

export function mapFailureBehavior(internal?: string): "fail" | "continue" | undefined {
  if (!internal) return undefined;
  return internal.toLowerCase() as "fail" | "continue";
}

/**
 * Convert an ExecutionStep to OpenAPI format
 */
export function mapStepToOpenAPI(step: ExecutionStep): OpenAPIToolStep {
  const apiConfig = step.apiConfig;
  const url = (apiConfig.urlHost || "") + (apiConfig.urlPath || "");

  const result: OpenAPIToolStep = {
    id: step.id,
    url,
    method: apiConfig.method || "GET",
  };

  if (apiConfig.queryParams) result.queryParams = apiConfig.queryParams;
  if (apiConfig.headers) result.headers = apiConfig.headers;
  if (apiConfig.body) result.body = apiConfig.body;
  if (step.systemId) result.systemId = step.systemId;
  if (apiConfig.instruction) result.instruction = apiConfig.instruction;
  if (step.modify !== undefined) result.modify = step.modify;
  if (step.loopSelector) result.dataSelector = step.loopSelector;
  if (step.failureBehavior) result.failureBehavior = mapFailureBehavior(step.failureBehavior);

  if (apiConfig.pagination) {
    result.pagination = {
      type: mapPaginationType(apiConfig.pagination.type),
      pageSize: apiConfig.pagination.pageSize,
      cursorPath: apiConfig.pagination.cursorPath,
      stopCondition: apiConfig.pagination.stopCondition,
    };
  }

  return result;
}

/**
 * Convert a Tool to OpenAPI format
 */
export function mapToolToOpenAPI(tool: Tool): OpenAPITool {
  return {
    id: tool.id,
    name: tool.id,
    version: tool.version || "1.0.0",
    instruction: tool.instruction,
    inputSchema: tool.inputSchema as Record<string, unknown>,
    outputSchema: tool.responseSchema as Record<string, unknown>,
    steps: tool.steps.map(mapStepToOpenAPI),
    outputTransform: tool.finalTransform,
    archived: tool.archived ?? false,
    createdAt: tool.createdAt?.toISOString?.() || (tool.createdAt as unknown as string),
    updatedAt: tool.updatedAt?.toISOString?.() || (tool.updatedAt as unknown as string),
  };
}
