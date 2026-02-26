import { sampleResultObject, safeStringify } from "@superglue/shared";
import { server_defaults } from "../default.js";

export function validateWorkflowExecutionArgs(args: any) {
  const errors: string[] = [];

  if (!args.id) {
    errors.push("Tool ID is required. Use superglue_find_relevant_tools to find valid IDs.");
  }

  if (args.payload && typeof args.payload !== "object") {
    errors.push("Payload must be an object. E.g. { 'key': 'value' }");
  }

  if (args.options !== undefined) {
    errors.push(
      "Options parameter is not supported via MCP. Remove the options field from your request.",
    );
  }

  const allowedKeys = ["id", "payload", "client", "orgId"];
  const extraKeys = Object.keys(args).filter((k) => !allowedKeys.includes(k));
  if (extraKeys.length > 0) {
    errors.push(
      `Unexpected parameters: ${extraKeys.join(", ")}. Only 'id' and 'payload' are allowed.`,
    );
  }

  return errors;
}

/**
 * Samples and stringifies a tool execution result for MCP responses.
 * Only samples if the result exceeds the character limit, preserving full data when possible.
 * Uses sampleResultObject to intelligently truncate large arrays/objects,
 * then enforces a hard character limit as a safety net.
 */
export function truncateToolExecutionResult(result: any, sampleSize = 10): string {
  if (result === undefined || result === null) {
    return "no result";
  }

  const limit = server_defaults.MCP.TOOL_EXECUTION_RESULT_CHARACTER_LIMIT;

  // Try full result first
  const fullStr = safeStringify(result);
  if (fullStr.length <= limit) {
    return fullStr;
  }

  // Sample if over limit
  const sampled = sampleResultObject(result, sampleSize);
  const sampledStr = safeStringify(sampled);

  if (sampledStr.length <= limit) {
    return sampledStr;
  }

  // Hard truncate as safety net
  return `${sampledStr.slice(0, limit)}\n\n[TRUNCATED: exceeded ${limit} char limit]`;
}
