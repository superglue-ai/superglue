import { getProtocol } from "../agent-helpers";
import { ToolExecutionPolicies, ToolPolicy, ExecutionMode } from "../agent-types";

export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  build_tool: { defaultMode: "auto" },
  run_tool: { defaultMode: "auto" },
  save_tool: { defaultMode: "auto" },
  find_tool: { defaultMode: "auto" },
  find_system: { defaultMode: "auto" },
  search_documentation: { defaultMode: "auto" },
  find_system_templates: { defaultMode: "auto" },
  get_runs: { defaultMode: "auto" },

  edit_tool: { defaultMode: "confirm_after_execution" },
  edit_payload: { defaultMode: "confirm_after_execution" },
  authenticate_oauth: { defaultMode: "confirm_after_execution" },

  create_system: { defaultMode: "auto" },
  edit_system: { defaultMode: "auto" },

  call_system: {
    defaultMode: "confirm_before_execution",
    userModeOptions: ["auto", "confirm_before_execution"],
    computeModeFromInput: (input, policies) => {
      const autoExecute = policies?.autoExecute || "ask_every_time";
      if (autoExecute === "run_everything") return "auto";
      if (autoExecute === "ask_every_time") return "confirm_before_execution";

      const protocol = getProtocol(input?.url || "");
      if (
        autoExecute === "run_gets_only" &&
        protocol === "http" &&
        (input?.method || "GET").toUpperCase() === "GET"
      ) {
        return "auto";
      }
      return "confirm_before_execution";
    },
    buildPendingOutput: (input) => ({
      confirmationState: "pending",
      request: {
        url: input?.url,
        method: input?.method,
        headers: input?.headers,
        body: input?.body,
        systemId: input?.systemId,
      },
    }),
  },
};

export function getPendingOutput(toolName: string, input: any): any {
  const policy = TOOL_POLICIES[toolName];
  return policy?.buildPendingOutput?.(input) ?? { confirmationState: "pending", input };
}

export function getEffectiveMode(
  toolName: string,
  userPolicies?: ToolExecutionPolicies,
  input?: any,
): ExecutionMode {
  const policy = TOOL_POLICIES[toolName];
  if (!policy) return "auto";

  const toolUserPolicies = userPolicies?.[toolName];

  if (policy.computeModeFromInput) {
    const computedMode = policy.computeModeFromInput(input, toolUserPolicies);
    if (computedMode) return computedMode;
  }

  if (
    policy.userModeOptions?.length &&
    toolUserPolicies?.mode &&
    policy.userModeOptions.includes(toolUserPolicies.mode)
  ) {
    return toolUserPolicies.mode;
  }

  return policy.defaultMode;
}

// Legacy exports for backward compatibility
export interface PolicyProcessorResult {
  shouldAutoExecute: boolean;
}

export function processToolPolicy(
  toolName: string,
  input: any,
  userPolicies?: ToolExecutionPolicies,
): PolicyProcessorResult {
  const mode = getEffectiveMode(toolName, userPolicies, input);
  return { shouldAutoExecute: mode === "auto" };
}
