import { Message, Run, Tool } from "@superglue/shared";
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

      const isEditTool = part.tool.name === "edit_tool";
      if (isEditTool && part.tool.status !== "completed") {
        continue;
      }

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
  uploadedFiles?: Array<{ name: string; key: string; status?: string }>;
  mergedPayload?: string;
}

export function formatPlaygroundRuntimeContext(ctx: PlaygroundContextData): string {
  const truncatedPayload =
    ctx.currentPayload.length > 2000
      ? ctx.currentPayload.substring(0, 2000) +
        `\n... [truncated, ${ctx.currentPayload.length} chars total]`
      : ctx.currentPayload;

  const hasFiles = ctx.uploadedFiles && ctx.uploadedFiles.length > 0;

  let fileSection = "";
  if (hasFiles) {
    const fileList = ctx
      .uploadedFiles!.map((f) => `  - ${f.name} (key: "${f.key}", status: ${f.status || "ready"})`)
      .join("\n");
    fileSection = `
<uploaded_files>
${fileList}
Note: File data is automatically parsed and merged with the manual payload. Each file's parsed content is available under its "key" in the merged payload.
</uploaded_files>
`;
  }

  let mergedPayloadSection = "";
  if (hasFiles && ctx.mergedPayload) {
    const truncatedMerged =
      ctx.mergedPayload.length > 2000
        ? ctx.mergedPayload.substring(0, 2000) +
          `\n... [truncated, ${ctx.mergedPayload.length} chars total]`
        : ctx.mergedPayload;
    mergedPayloadSection = `
<merged_payload_preview>
This is the ACTUAL payload that will be sent when the tool executes (manual payload + file data merged):
${truncatedMerged}
</merged_payload_preview>
`;
  }

  return `[PLAYGROUND CONTEXT]
<current_tool_config>
Tool ID: ${ctx.toolId || "(unsaved)"}
Instruction: ${ctx.instruction?.substring(0, 200) || "(none)"}
Steps: ${ctx.stepsCount} step(s)
</current_tool_config>

<current_test_payload>
${hasFiles ? "Manual payload (before file merge):" : ""}
${truncatedPayload}
</current_test_payload>
${fileSection}${mergedPayloadSection}
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
      instruction: tool.instruction?.substring(0, 100) || "",
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
        name: system?.name || system?.id,
        credentialKeys: credentialKeys.length > 0 ? credentialKeys : undefined,
        systemSpecificInstructions: system?.specificInstructions,
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
    [PRELOADED CONTEXT - The user's available superglue tools and systems are listed below]${SUPERGLUE_INFORMATION_PROMPT}

    AVAILABLE SUPERGLUE TOOLS:
    ${JSON.stringify(toolsResult.tools || [])}

    AVAILABLE SUPERGLUE SYSTEMS (credentials with hasValue:true are configured, use the placeholder format shown):
    ${JSON.stringify(systemsResult.systems || [])}

    AVAILABLE SYSTEM TEMPLATES:
    ${templateIds.join(", ")}
    `;
  return result;
}

export async function initializeToolPlaygroundAgentContext(
  ctx: ToolExecutionContext,
): Promise<string> {
  const systemsResult = await getSystemsForContext(ctx);
  const toolsResult = await getToolsForContext(ctx);

  return `
    [PRELOADED CONTEXT - The user's available superglue systems and tools are listed below]${SUPERGLUE_INFORMATION_PROMPT}

    AVAILABLE SYSTEMS (credentials with hasValue:true are configured, use the placeholder format shown):
    ${JSON.stringify(systemsResult.systems || [])}

    AVAILABLE SUPERGLUE TOOLS:
    ${JSON.stringify(toolsResult.tools || [])}
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

export function getInvestigationPrompts(run: Run): {
  systemPrompt: string;
  userPrompt: string;
} {
  const truncateJson = (obj: any, maxLength: number = 3000): string => {
    const str = JSON.stringify(obj, null, 2);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "\n... [truncated]";
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "unknown";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  // Check if tool exists and version info
  const toolExists = !!run.tool;
  const runToolVersion = run.tool?.version;
  const runStartedAt = formatDate(run.metadata?.startedAt);

  // Build tool existence section
  let toolExistenceSection = "";
  if (!toolExists) {
    toolExistenceSection = `
IMPORTANT - TOOL NOT FOUND:
The tool "${run.toolId}" does not currently exist in the system. This could be because:
1. The tool was deleted after this run
2. The tool was only a draft created by the agent and was never saved

Since the tool doesn't exist, you CANNOT use edit_tool to modify it. Instead:
- If the user wants to recreate the tool, use build_tool to create a new one that addresses the error
- If this was a draft from a previous agent conversation, suggest the user go back to that chat (this run was from: ${runStartedAt})

BEFORE taking any action, explain the situation to the user and ask what they would like to do:
1. Create a new tool based on what we know from this failed run
2. Go back to the original conversation where the tool was built
3. Something else

Do NOT start creating or editing tools without user confirmation.
`;
  }

  // Build version comparison section
  let versionSection = "";
  if (toolExists && runToolVersion) {
    // Note: We include the version from the run's tool snapshot
    // The agent should use get_tool to fetch the current version and compare
    versionSection = `
VERSION INFORMATION:
- Tool version at time of this run: ${runToolVersion}
- Run timestamp: ${runStartedAt}

IMPORTANT: Before analyzing the error, use get_tool to fetch the current saved version of "${run.toolId}".
Compare the current version with the version from this run (${runToolVersion}).
If the versions differ:
1. Identify what changed between versions
2. Determine if the changes might have fixed or could fix the error we're seeing
3. Let the user know they're looking at an old run and the tool has been updated since
4. Analyze whether the current version would still have this issue
`;
  }

  // Build request source section
  let requestSourceSection = "";
  if (run.requestSource === "webhook") {
    requestSourceSection = `
WEBHOOK TRIGGER ANALYSIS:
This run was triggered by a webhook. When debugging webhook-triggered runs:
1. Carefully examine the INPUT PAYLOAD below - this is what the webhook sent
2. Check if the payload structure matches what the tool's inputSchema expects
3. Look for missing required fields, incorrect data types, or unexpected values
4. The webhook sender may be sending data in a different format than expected
5. Test the tool with the exact payload to reproduce the issue
6. If the payload is the problem, either:
   - Update the tool's inputSchema and steps to handle the actual webhook format
   - Or coordinate with the webhook sender to fix their payload format
`;
  } else if (run.requestSource === "scheduler") {
    requestSourceSection = `
SCHEDULED RUN ANALYSIS:
This run was triggered by the scheduler. Consider:
1. Check if any external dependencies (APIs, services) were unavailable at the scheduled time
2. Look for rate limiting issues if this runs frequently
3. Check if credentials or tokens may have expired
`;
  } else if (run.requestSource === "tool-chain") {
    requestSourceSection = `
TOOL CHAIN ANALYSIS:
This run was triggered as part of a tool chain. Consider:
1. Check if the input from the previous tool in the chain was in the expected format
2. Look at the INPUT PAYLOAD to see what was passed from the upstream tool
3. The error might be in the upstream tool's output rather than this tool's configuration
`;
  }

  const systemPrompt = `You are helping debug a failed superglue tool run. Analyze the error and help the user fix it.

FAILED RUN DETAILS:
- Run ID: ${run.runId}
- Tool ID: ${run.toolId}
- Error: ${run.error || "Unknown error"}
- Triggered by: ${run.requestSource || "unknown"}
- Duration: ${run.metadata?.durationMs ? `${run.metadata.durationMs}ms` : "unknown"}
- Started: ${runStartedAt}
- Completed: ${formatDate(run.metadata?.completedAt)}
${toolExistenceSection}${versionSection}${requestSourceSection}
${
  run.tool
    ? `TOOL CONFIGURATION (from time of run):
${truncateJson(run.tool)}`
    : `NO TOOL CONFIGURATION AVAILABLE - The tool was not saved or has been deleted.`
}

${
  run.stepResults && run.stepResults.length > 0
    ? `STEP RESULTS:
${truncateJson(run.stepResults)}`
    : ""
}

${
  run.toolPayload
    ? `INPUT PAYLOAD:
${truncateJson(run.toolPayload)}`
    : ""
}

YOUR APPROACH:
1. First, explain the error in plain English - what went wrong and why
2. ${toolExists ? "Check the current tool version and compare with the run version" : "Acknowledge the tool doesn't exist and ask user how to proceed"}
3. Identify the root cause - is it a configuration issue, payload issue, external API issue, or transient error?
4. Provide a specific solution with concrete steps
5. ${toolExists ? "Offer to modify the tool using edit_tool if needed" : "Offer to create a new tool using build_tool if the user wants"}

IMPORTANT GUIDELINES:
- Always explain the situation clearly before taking action
- Ask for user confirmation before creating new tools or making significant changes
- If this is a transient issue (timeout, rate limit), suggest retrying before making changes
- Be specific about what needs to change and where`;

  const errorPreview = run.error ? run.error.substring(0, 150) : "Unknown error";
  const toolExistsNote = toolExists ? "" : "\n\nNote: This tool no longer exists in the system.";
  const userPrompt = `Help me investigate why my "${run.toolId}" tool failed.

Error: ${errorPreview}${run.error && run.error.length > 150 ? "..." : ""}

What went wrong and how can I fix it?${toolExistsNote}`;

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

export { type SystemContextForAgent as SystemPlaygroundContextData } from "@/src/components/systems/context/types";
import type { SystemContextForAgent } from "@/src/components/systems/context/types";

export function formatSystemRuntimeContext(ctx: SystemContextForAgent): string {
  const credentialPlaceholders = ctx.credentialKeys
    .map((key) => `<<${ctx.systemId}_${key}>>`)
    .join(", ");

  const specificInstructionsLine = ctx.specificInstructions
    ? `\nSpecific Instructions: ${ctx.specificInstructions.substring(0, 200)}${ctx.specificInstructions.length > 200 ? "..." : ""}`
    : "";

  return `[SYSTEM PLAYGROUND CONTEXT]
System ID: ${ctx.systemId || "(not set)"}
URL Host: ${ctx.urlHost || "(not set)"}
Template: ${ctx.templateName || "(custom)"}
Auth Type: ${ctx.authType}
Credentials: ${credentialPlaceholders || "(none)"}${specificInstructionsLine}

Section Status:
- Configuration: ${ctx.sectionStatuses.configuration.label}
- Authentication: ${ctx.sectionStatuses.authentication.label}
- Context: ${ctx.sectionStatuses.context.label}

Use edit_system with id="${ctx.systemId}" to make changes.
Use call_system with placeholders like ${credentialPlaceholders || "<<systemId_keyName>>"} to test.`;
}

export async function initializeSystemPlaygroundContext(
  ctx: ToolExecutionContext,
  _agentParams?: Record<string, any>,
): Promise<string> {
  const systemsResult = await getSystemsForContext(ctx);
  const templateIds = Object.keys(systems);

  return `AVAILABLE SYSTEMS (credentials with hasValue:true are configured, use the placeholder format shown):
${JSON.stringify(systemsResult.systems || [])}

AVAILABLE TEMPLATES: ${templateIds.slice(0, 30).join(", ")}${templateIds.length > 30 ? ` (+${templateIds.length - 30} more)` : ""}`;
}
