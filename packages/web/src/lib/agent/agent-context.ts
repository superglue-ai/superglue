import { Message, Tool } from "@superglue/shared";
import { systems } from "@superglue/shared/templates";
import { AgentDefinition, ToolExecutionContext } from "./agent-types";
import { SUPERGLUE_INFORMATION_PROMPT } from "./agent-prompts";

export interface DraftLookup {
  config: Tool;
  systemIds: string[];
  instruction: string;
}

export function findDraftInMessages(messages: Message[], draftId: string): DraftLookup | null {
  const DRAFT_SOURCE_TOOLS = new Set(["build_tool", "edit_tool"]);
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.parts) continue;

    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (part.type !== "tool" || !part.tool?.output) continue;
      if (!DRAFT_SOURCE_TOOLS.has(part.tool.name)) continue;

      try {
        const output =
          typeof part.tool.output === "string" ? JSON.parse(part.tool.output) : part.tool.output;

        if (output.draftId === draftId && output.config) {
          return {
            config: output.config,
            systemIds: output.config.systemIds || [],
            instruction: output.config.instruction || "",
          };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

export const formatDiffSummary = (diff: {
  op?: string;
  path?: string;
  value?: any;
  from?: string;
  old_string?: string;
  new_string?: string;
}): string => {
  if ("old_string" in diff || "new_string" in diff) {
    const oldPreview =
      (diff.old_string?.length || 0) > 100
        ? diff.old_string?.slice(0, 100) + "..."
        : diff.old_string || "";
    const newPreview =
      (diff.new_string?.length || 0) > 100
        ? diff.new_string?.slice(0, 100) + "..."
        : diff.new_string || "";
    return `"${oldPreview}" → "${newPreview}"`;
  }

  const valuePreview = diff.value
    ? JSON.stringify(diff.value).slice(0, 80) +
      (JSON.stringify(diff.value).length > 80 ? "..." : "")
    : "";
  return `[${diff.op}] ${diff.path}${valuePreview ? `: ${valuePreview}` : ""}`;
};

export function isNewConversation(messages: Array<{ role: string }>): boolean {
  return messages.length === 1 && messages[0].role === "user";
}

export function injectContextIntoMessages(messages: Message[], context: string): Message[] {
  if (messages.length === 0) return messages;
  return [
    {
      ...messages[0],
      content: `${context}\n\n---\nUSER MESSAGE:\n${messages[0].content}`,
    },
    ...messages.slice(1),
  ];
}

export interface PlaygroundContextData {
  toolId: string;
  instruction: string;
  stepsCount: number;
  currentPayload: string;
  executionSummary: string;
}

export function formatPlaygroundRuntimeContext(ctx: PlaygroundContextData): string {
  const truncatedPayload =
    ctx.currentPayload.length > 2000
      ? ctx.currentPayload.substring(0, 2000) +
        `\n... [truncated, ${ctx.currentPayload.length} chars total]`
      : ctx.currentPayload;

  return `[PLAYGROUND CONTEXT]
<current_tool_config>
Tool ID: ${ctx.toolId || "(unsaved)"}
Instruction: ${ctx.instruction?.substring(0, 200) || "(none)"}
Steps: ${ctx.stepsCount} step(s)
</current_tool_config>

<current_test_payload>
${truncatedPayload}
</current_test_payload>

<execution_state>
${ctx.executionSummary}
</execution_state>

<draft_info>
The current tool is available as draft ID: "playground-draft". Use this draftId with edit_tool to make changes.
The test payload above is managed separately - do NOT include payload in edit_tool calls. Use edit_payload if the user wants to change test data.
</draft_info>
`;
}

async function getToolsForContext(ctx: ToolExecutionContext) {
  try {
    const result = await ctx.superglueClient.findRelevantTools("*");

    if (!result || result.length === 0) {
      return {
        success: true,
        tools: [],
        toolIds: [],
      };
    }

    const toolsWithTruncatedInstructions = result.map(({ reason, ...tool }: any) => ({
      id: tool.id,
      instruction: tool.instruction?.substring(0, 300) || tool.instruction,
      systemIds: tool.systemIds,
      inputSchema: tool.inputSchema,
    }));

    return {
      success: true,
      toolIds: result.map((t: any) => t.id),
      tools: toolsWithTruncatedInstructions,
    };
  } catch (error: any) {
    return {
      success: false,
      tools: [],
      toolIds: [],
      error: error.message,
    };
  }
}

async function getSystemsForContext(ctx: ToolExecutionContext) {
  try {
    const result = await ctx.superglueClient.listSystems(1000);

    const formattedSystems = result.items.map((system: any) => {
      const credentials = system?.credentials || {};
      const credentialStatus = Object.entries(credentials).map(([key, value]) => ({
        key,
        placeholder: `<<${system?.id}_${key}>>`,
        hasValue: !!value && value !== "",
      }));

      return {
        id: system?.id,
        urlHost: system?.urlHost,
        credentials: credentialStatus,
      };
    });

    return {
      success: true,
      systems: formattedSystems,
    };
  } catch (error: any) {
    return {
      success: false,
      systems: [],
      error: error.message,
    };
  }
}

export async function initializeMainAgentContext(ctx: ToolExecutionContext): Promise<string> {
  const [toolsResult, systemsResult] = await Promise.all([
    getToolsForContext(ctx),
    getSystemsForContext(ctx),
  ]);

  const templateIds = Object.keys(systems);

  const result = `
    [PRELOADED CONTEXT - Your available tools and systems are listed below]${SUPERGLUE_INFORMATION_PROMPT}

    AVAILABLE TOOLS:
    ${JSON.stringify(toolsResult.tools || [])}

    AVAILABLE SYSTEMS (credentials with hasValue:true are configured, use the placeholder format shown):
    ${JSON.stringify(systemsResult.systems || [])}

    AVAILABLE SYSTEM TEMPLATES (use find_system_templates for OAuth URLs, scopes, etc. BEFORE creating systems or authenticating):
    ${templateIds.join(", ")}
    `;
  return result;
}

export async function initializePlaygroundAgentContext(ctx: ToolExecutionContext): Promise<string> {
  const systemsResult = await getSystemsForContext(ctx);
  const templateIds = Object.keys(systems);

  return `
    [PRELOADED CONTEXT - Your available systems are listed below]${SUPERGLUE_INFORMATION_PROMPT}

    AVAILABLE SYSTEMS (credentials with hasValue:true are configured, use the placeholder format shown):
    ${JSON.stringify(systemsResult.systems || [])}

    AVAILABLE SYSTEM TEMPLATES (use find_system_templates for OAuth URLs, scopes, etc. BEFORE creating systems or authenticating):
    ${templateIds.join(", ")}
    `;
}

export function getDiscoveryContext(systemIds: string[]): string {
  const isSingleIntegration = systemIds.length === 1;
  const systemList = systemIds.join(", ");

  if (isSingleIntegration) {
    return `You are helping a user set up and test a single integration: ${systemList}

CONTEXT:
The user wants to configure and test this integration before building tools with it. Focus on:
- Understanding what this integration can do
- Verifying credentials and authentication are working
- Testing API endpoints to confirm connectivity
- Building a first simple tool to demonstrate the integration works

INSTRUCTIONS:
1. Start by using search_documentation for ${systemList} to understand its capabilities in depth
2. Check the system's current configuration - what's already set up vs missing
3. Guide the user through any missing configuration (credentials, endpoints, etc.)
4. Test connectivity by making a simple API call
5. Help build a basic "hello world" tool to prove the integration is working

TONE:
Be thorough and methodical. This is about getting the foundation right before building more complex tools.
Focus on: "Let's make sure ${systemList} is fully configured and working."

ADDITIONAL CAPABILITIES TO MENTION:
- You can test API endpoints to verify the system is working
- You can search external documentation if the system docs are incomplete
- If the user has existing scripts or workflows, they can upload them to recreate as superglue tools

Be conversational and helpful. The goal is a working, tested integration.`;
  }

  return `You are helping a user build tools that connect multiple systems: ${systemList}

CONTEXT:
The user has ${systemIds.length} integrations they want to use together. Focus on:
- Understanding how these systems can work together
- Identifying data flows and integration patterns between them
- Building tools that leverage multiple systems

INSTRUCTIONS:
1. Start by using search_documentation for each system (${systemList}) to understand their capabilities
2. Identify potential connection points - what data can flow between these systems?
3. Suggest practical tool ideas that combine multiple systems
4. Help build tools that demonstrate the systems working together

TOOL SUGGESTIONS - IMPORTANT:
Your tool suggestions MUST be grounded in what the documentation actually describes. Focus on:
- Specific API endpoints and their documented purposes
- How data from one system could be used by another
- Documented use cases, workflows, or integration patterns
- Technical capabilities like webhooks, batch operations, or sync features

Only suggest speculative combinations if the documentation provides little actionable information. When documentation is rich, stick closely to documented capabilities.

TONE:
Be creative but practical. This is about discovering valuable integrations between systems.
Focus on: "Here's what you can do with ${systemList} together."

ADDITIONAL CAPABILITIES TO MENTION:
- If the user has existing workflows (Python scripts, n8n flows, Zapier zaps), they can upload the code and you can help recreate it
- You can test API endpoints to verify the systems are working before building tools
- You can search external documentation if the system docs are incomplete

Be conversational and helpful. Guide them toward building useful tools that leverage their systems together.`;
}

export function getDiscoveryPrompts(systemIds: string[]): {
  systemPrompt: string;
  userPrompt: string;
} {
  const isSingleIntegration = systemIds.length === 1;
  const systemList = systemIds.join(", ");

  const systemPrompt = getDiscoveryContext(systemIds);

  const userPrompt = isSingleIntegration
    ? `I want to set up and test ${systemList}. Help me configure it and build a simple tool to verify it's working.`
    : `I want to build tools using ${systemList}. What can I do with them together?`;

  return { systemPrompt, userPrompt };
}

export function resolveSystemPrompt(agent: AgentDefinition, params?: Record<string, any>): string {
  if (typeof agent.systemPrompt === "function") {
    return agent.systemPrompt(params || {});
  }
  return agent.systemPrompt;
}

export async function generateAgentInitialContext(
  agent: AgentDefinition,
  ctx: ToolExecutionContext,
  agentParams?: Record<string, any>,
): Promise<string | null> {
  if (!agent.initialContextGenerator) {
    return null;
  }
  return agent.initialContextGenerator(ctx, agentParams);
}
