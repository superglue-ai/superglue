import type { AgentDefinition } from "../agent-types";
import {
  AGENT_TOOL_SET,
  TOOL_PLAYGROUND_TOOL_SET,
  SYSTEM_PLAYGROUND_TOOL_SET,
} from "./tool-definitions";
import {
  generateMainAgentSystemPrompt,
  generatePlaygroundSystemPrompt,
  generateSystemPlaygroundSystemPrompt,
} from "../agent-context";

export enum AgentType {
  MAIN = "main",
  PLAYGROUND = "playground",
  SYSTEM_PLAYGROUND = "system_playground",
}

export const AGENT_REGISTRY: Record<AgentType, AgentDefinition> = {
  [AgentType.MAIN]: {
    id: AgentType.MAIN,
    toolSet: AGENT_TOOL_SET,
    systemPromptGenerator: generateMainAgentSystemPrompt,
  },
  [AgentType.PLAYGROUND]: {
    id: AgentType.PLAYGROUND,
    toolSet: TOOL_PLAYGROUND_TOOL_SET,
    systemPromptGenerator: generatePlaygroundSystemPrompt,
  },
  [AgentType.SYSTEM_PLAYGROUND]: {
    id: AgentType.SYSTEM_PLAYGROUND,
    toolSet: SYSTEM_PLAYGROUND_TOOL_SET,
    systemPromptGenerator: generateSystemPlaygroundSystemPrompt,
  },
};

export function getAgent(agentId: AgentType): AgentDefinition {
  const agent = AGENT_REGISTRY[agentId];
  if (!agent) {
    throw new Error(
      `Unknown agent: ${agentId}. Available agents: ${Object.values(AgentType).join(", ")}`,
    );
  }
  return agent;
}
