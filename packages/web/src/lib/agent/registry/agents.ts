import type { AgentDefinition } from "../agent-types";
import { AGENT_TOOL_SET, PLAYGROUND_TOOL_SET, SYSTEM_PLAYGROUND_TOOL_SET } from "./tools";
import {
  MAIN_AGENT_SYSTEM_PROMPT,
  TOOL_PLAYGROUND_AGENT_SYSTEM_PROMPT,
  SYSTEM_PLAYGROUND_AGENT_PROMPT,
} from "../agent-prompts";
import {
  initializeMainAgentContext,
  initializeToolPlaygroundAgentContext,
  initializeSystemPlaygroundContext,
} from "../agent-context";

export enum AgentType {
  MAIN = "main",
  PLAYGROUND = "playground",
}

export const AGENT_REGISTRY: Record<AgentType, AgentDefinition> = {
  [AgentType.MAIN]: {
    id: AgentType.MAIN,
    systemPrompt: MAIN_AGENT_SYSTEM_PROMPT,
    toolSet: AGENT_TOOL_SET,
    initialContextGenerator: initializeMainAgentContext,
  },
  [AgentType.PLAYGROUND]: {
    id: AgentType.PLAYGROUND,
    systemPrompt: TOOL_PLAYGROUND_AGENT_SYSTEM_PROMPT,
    toolSet: PLAYGROUND_TOOL_SET,
    initialContextGenerator: initializeToolPlaygroundAgentContext,
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
