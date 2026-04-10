import type { Tool } from "@superglue/shared";
import type { ToolExecutionContext } from "../agent-types";

const MAIN_AGENT_ID = "main";
const PLAYGROUND_AGENT_ID = "playground";

export function shouldDefaultSaveOnAccept(ctx: ToolExecutionContext): boolean {
  return ctx.agentId === MAIN_AGENT_ID || ctx.agentId === PLAYGROUND_AGENT_ID;
}

export function canKeepDraftOnlyOnAccept(ctx: ToolExecutionContext): boolean {
  return ctx.agentId === PLAYGROUND_AGENT_ID;
}

export async function createNewTool(ctx: ToolExecutionContext, tool: Tool): Promise<Tool> {
  try {
    return await ctx.superglueClient.createWorkflow(tool.id, tool);
  } catch (error: any) {
    if (error?.message?.includes("already exists") || error?.message?.includes("409")) {
      throw new Error(
        `Tool '${tool.id}' already exists. Build a new tool with a different id, or edit the existing tool instead.`,
      );
    }
    throw error;
  }
}
