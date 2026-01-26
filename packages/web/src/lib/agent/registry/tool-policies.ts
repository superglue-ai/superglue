import { ToolExecutionContext } from "../agent-types";

export interface PolicyProcessorResult {
  shouldAutoExecute: boolean;
}

export type PolicyProcessor = (
  input: any,
  policies: Record<string, any> | undefined,
  ctx: ToolExecutionContext,
) => PolicyProcessorResult;

export const TOOL_POLICY_PROCESSORS: Record<string, PolicyProcessor> = {
  call_endpoint: (input, policies) => {
    const autoExecute = policies?.autoExecute || "ask_every_time";
    const shouldAutoExecute =
      autoExecute === "run_everything" ||
      (autoExecute === "run_gets_only" && input.method === "GET");
    return { shouldAutoExecute };
  },
};

export function processToolPolicy(
  toolName: string,
  input: any,
  ctx: ToolExecutionContext,
): PolicyProcessorResult {
  const processor = TOOL_POLICY_PROCESSORS[toolName];
  if (!processor) {
    return { shouldAutoExecute: false };
  }
  const policies = ctx.toolExecutionPolicies?.[toolName];
  return processor(input, policies, ctx);
}