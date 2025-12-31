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

export function truncateToolExecutionResult(result: any): string {
  if (!result) return JSON.stringify(result);

  const resultStr = JSON.stringify(result);
  const limit = server_defaults.MCP.TOOL_EXECUTION_RESULT_CHARACTER_LIMIT;

  if (resultStr.length <= limit) {
    return resultStr;
  }

  const truncatedResult = resultStr.slice(0, limit);
  const prefix = `[TRUNCATED: Result exceeded ${limit} characters (original size: ${resultStr.length} chars). Showing first ${limit} characters]\n\n`;

  return prefix + truncatedResult;
}
