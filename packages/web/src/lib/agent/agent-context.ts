import { PlaygroundToolContext } from "@/src/components/agent/hooks/types";
import { Message, SuperglueClient, Tool } from "@superglue/shared";
import { systems } from "@superglue/shared/templates";
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

export const getToolsForContext = async (client: SuperglueClient) => {
  try {
    const result = await client.findRelevantTools("*");

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
};

export const getSystemsForContext = async (client: SuperglueClient) => {
  try {
    const result = await client.listSystems(1000, 0);

    const formattedSystems = result.items.map((system: any) => {
      const credentialKeys = system?.credentials ? Object.keys(system.credentials) : [];

      return {
        id: system?.id,
        urlHost: system?.urlHost,
        availableCredentials: credentialKeys.map((key) => `<<${system?.id}_${key}>>`),
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
};

export const formatDiffSummary = (diff: {
  op?: string;
  path?: string;
  value?: any;
  from?: string;
  old_string?: string;
  new_string?: string;
}): string => {
  // Handle legacy format
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

  // New patch format
  const valuePreview = diff.value
    ? JSON.stringify(diff.value).slice(0, 80) +
      (JSON.stringify(diff.value).length > 80 ? "..." : "")
    : "";
  return `[${diff.op}] ${diff.path}${valuePreview ? `: ${valuePreview}` : ""}`;
};

export async function generateInitialContext(superglueClient: SuperglueClient): Promise<string> {
  const [toolsResult, systemsResult] = await Promise.all([
    getToolsForContext(superglueClient),
    getSystemsForContext(superglueClient),
  ]);

  const templateIds = Object.keys(systems);

  const context = `
    [PRELOADED CONTEXT - Your available tools and systems are listed below]${SUPERGLUE_INFORMATION_PROMPT}

    AVAILABLE TOOLS:
    ${JSON.stringify(toolsResult.tools || [])}

    AVAILABLE SYSTEMS (use EXACTLY the credential placeholders shown):
    ${JSON.stringify(systemsResult.systems || [])}

    AVAILABLE SYSTEM TEMPLATES (use find_system_templates for OAuth URLs, scopes, etc. BEFORE creating systems or authenticating):
    ${templateIds.join(", ")}
    `;

  return context;
}

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

function buildToolFromPlaygroundContext(ctx: PlaygroundToolContext): Tool {
  let parsedInputSchema = null;
  let parsedResponseSchema = null;
  try {
    if (ctx.inputSchema) parsedInputSchema = JSON.parse(ctx.inputSchema);
  } catch {}
  try {
    if (ctx.responseSchema) parsedResponseSchema = JSON.parse(ctx.responseSchema);
  } catch {}

  return {
    id: ctx.toolId || "playground-draft",
    instruction: ctx.instruction,
    steps: ctx.steps,
    finalTransform: ctx.finalTransform,
    inputSchema: parsedInputSchema,
    responseSchema: parsedResponseSchema,
    systemIds: ctx.systemIds,
  } as Tool;
}

function createSyntheticDraftMessage(ctx: PlaygroundToolContext): Message {
  const tool = buildToolFromPlaygroundContext(ctx);

  return {
    id: `synthetic-draft-${Date.now()}`,
    role: "assistant",
    content: "",
    timestamp: new Date(),
    parts: [
      {
        type: "tool",
        id: `build_tool-${Date.now()}`,
        tool: {
          id: `build_tool-${Date.now()}`,
          name: "build_tool",
          input: {},
          output: JSON.stringify({
            success: true,
            draftId: "playground-draft",
            config: tool,
            systemIds: ctx.systemIds,
            instruction: ctx.instruction || "",
            note: "Synthetic draft from playground context",
          }),
          status: "completed",
        },
      },
    ],
  };
}

export function injectPlaygroundContext(
  messages: Message[],
  ctx: PlaygroundToolContext,
): Message[] {
  const result = [...messages];

  const hasSyntheticDraft = result.some((msg) =>
    msg.parts?.some(
      (p) =>
        p.type === "tool" &&
        p.tool?.name === "build_tool" &&
        typeof p.tool?.output === "string" &&
        p.tool.output.includes("playground-draft"),
    ),
  );

  if (!hasSyntheticDraft) {
    result.unshift(createSyntheticDraftMessage(ctx));
  }

  const payloadStr = ctx.currentPayload || "{}";
  const truncatedPayload =
    payloadStr.length > 2000
      ? payloadStr.substring(0, 2000) + `\n... [truncated, ${payloadStr.length} chars total]`
      : payloadStr;

  const contextMessage = `[PLAYGROUND CONTEXT]
<current_tool_config>
Tool ID: ${ctx.toolId || "(unsaved)"}
Instruction: ${ctx.instruction?.substring(0, 200) || "(none)"}
Steps: ${ctx.steps.length} step(s)
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

  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === "user") {
      result[i] = {
        ...result[i],
        content: `${contextMessage}\n\n${result[i].content}`,
      };
      break;
    }
  }

  return result;
}
