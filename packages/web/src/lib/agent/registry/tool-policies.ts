import { getProtocol } from "../agent-helpers";
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
  call_system: (input, policies) => {
    const autoExecute = policies?.autoExecute || "ask_every_time";
    if (autoExecute === "run_everything") return { shouldAutoExecute: true };
    if (autoExecute === "ask_every_time") return { shouldAutoExecute: false };
    const protocol = getProtocol(input.url || "");
    const shouldAutoExecute =
      autoExecute === "run_gets_only" && protocol === "http" && (input.method || "GET") === "GET";
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
