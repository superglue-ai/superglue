import { Tool } from "./types.js";
import { composeUrl } from "./utils.js";

/**
 * Normalizes ApiConfig from old urlHost/urlPath to new url field.
 * Deletes deprecated fields after normalization.
 */
export function normalizeApiConfig(config: any): any {
  if (!config) return config;

  // Compose url from old fields if url doesn't exist
  if (!config.url && (config.urlHost || config.urlPath)) {
    config.url = composeUrl(config.urlHost || "", config.urlPath || "");
  }

  // Delete deprecated fields
  delete config.urlHost;
  delete config.urlPath;

  return config;
}

// Pagination type mapping from legacy UPPER_CASE to camelCase
const PAGINATION_TYPE_MAP: Record<string, string> = {
  OFFSET_BASED: "offsetBased",
  PAGE_BASED: "pageBased",
  CURSOR_BASED: "cursorBased",
  DISABLED: "disabled",
};

function mapPaginationType(internalType?: string): string {
  if (!internalType) return "disabled";
  // If already camelCase, return as-is
  if (PAGINATION_TYPE_MAP[internalType]) {
    return PAGINATION_TYPE_MAP[internalType];
  }
  return internalType;
}

export function normalizeTool(tool: any): Tool {
  if (!tool) return tool;

  const normalizedSteps = tool.steps?.map((step: any) => {
    const { integrationId, apiConfig, config, executionMode, loopSelector, systemId, ...rest } =
      step;

    // Migration: apiConfig -> config (prefer config if both exist)
    let stepConfig = config || apiConfig;

    // Extract integrationId from apiConfig if it exists there (legacy format)
    const legacyIntegrationId = integrationId ?? apiConfig?.integrationId;

    // Extract instruction from config to step level
    let instruction: string | undefined;

    if (stepConfig) {
      // Normalize old apiConfig format (urlHost/urlPath -> url)
      stepConfig = normalizeApiConfig(stepConfig);

      // Add type for frontend convenience (not stored in DB for URL-based steps)
      // URL-based steps (HTTP, SFTP, Postgres) get type: "request"
      // Transform steps already have type: "transform" and should be preserved
      if (!stepConfig.type) {
        // Only default to "request" if step has URL (request step)
        // Transform steps have transformCode instead of URL
        stepConfig.type = stepConfig.url || !stepConfig.transformCode ? "request" : "transform";
      }

      // Remove legacy config.id - step.id is used instead
      delete stepConfig.id;

      // Remove integrationId from config (it's moved to systemId)
      delete stepConfig.integrationId;

      // Move instruction from config to step level (only for request steps)
      instruction = step.instruction ?? stepConfig.instruction;
      delete stepConfig.instruction;

      // Move systemId into config for request steps (not transform steps)
      if (stepConfig.type === "request") {
        const stepSystemId = systemId ?? legacyIntegrationId;
        if (stepSystemId) {
          stepConfig.systemId = stepSystemId;
        }
      }

      // Normalize pagination type to camelCase (only for request steps)
      if (stepConfig.pagination?.type) {
        stepConfig.pagination.type = mapPaginationType(stepConfig.pagination.type);
      }
    }

    // Normalize failureBehavior to lowercase
    let failureBehavior: string | undefined = rest.failureBehavior;
    if (failureBehavior) {
      failureBehavior = failureBehavior.toLowerCase();
    }

    // Rename loopSelector -> dataSelector
    const dataSelector = rest.dataSelector ?? loopSelector;

    return {
      id: step.id,
      config: stepConfig,
      instruction,
      modify: rest.modify,
      dataSelector,
      failureBehavior,
    };
  });

  // Build the normalized tool with new field names
  // responseSchema -> outputSchema, finalTransform -> outputTransform
  return {
    id: tool.id,
    name: tool.name,
    version: tool.version,
    instruction: tool.instruction,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema ?? tool.responseSchema,
    steps: normalizedSteps,
    outputTransform: tool.outputTransform ?? tool.finalTransform,
    folder: tool.folder,
    archived: tool.archived,
    responseFilters: tool.responseFilters,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
}
