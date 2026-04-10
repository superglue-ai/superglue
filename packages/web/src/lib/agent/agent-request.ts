import { Message } from "@superglue/shared";
import { jsonSchema } from "ai";
import { tavilySearch } from "@tavily/ai-sdk";
import { AgentType, getAgent } from "./registries/agent-registry";
import { TOOL_REGISTRY, SKILL_GATED_TOOLS } from "./registries/tool-registry";
import { truncateToolResult } from "../general-utils";
import {
  recordConfirmationObservation,
  updateActiveToolObservation,
} from "./observability/langfuse";
import {
  PrepareMessagesResult,
  ToolExecutionContext,
  ToolRegistryEntry,
  ValidatedAgentRequest,
} from "./agent-types";
import { getEffectiveMode } from "./agent-tools/tool-policies";
import { needsSystemMessage } from "./agent-helpers";
import { type SkillName } from "./skills/index";

export interface ConfirmationResult {
  toolId: string;
  toolName: string;
  output: string;
  status: "completed" | "declined";
  confirmationState?: string | null;
  confirmationData?: unknown;
}

export function validateAgentRequest(body: any): ValidatedAgentRequest {
  if (!body.agentId || !Object.values(AgentType).includes(body.agentId)) {
    throw new Error(`Invalid agentId. Must be one of: ${Object.values(AgentType).join(", ")}`);
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    throw new Error("messages is required and must be an array");
  }

  if (!body.userMessage && !body.resumeToolCallId) {
    throw new Error("Request must have userMessage or resumeToolCallId");
  }

  const agent = getAgent(body.agentId);

  if (body.toolExecutionPolicies && typeof body.toolExecutionPolicies !== "object") {
    throw new Error("toolExecutionPolicies must be an object");
  }

  return {
    agentId: body.agentId,
    messages: body.messages,
    userMessage: body.userMessage,
    visibleUserMessageId: body.visibleUserMessageId,
    resumeToolCallId: body.resumeToolCallId,
    filePayloads: body.filePayloads,
    toolExecutionPolicies: body.toolExecutionPolicies,
    loadedSkills: body.loadedSkills,
    playgroundDraft: body.playgroundDraft,
    systemPlaygroundContext: body.systemPlaygroundContext,
    accessRulesContext: body.accessRulesContext,
    agent,
  };
}

export async function prepareMessages(
  request: ValidatedAgentRequest,
  ctx: ToolExecutionContext,
): Promise<PrepareMessagesResult> {
  let messages = [...request.messages];
  let systemMessage: { id: string; content: string } | undefined;

  if (needsSystemMessage(messages)) {
    const result = await request.agent.systemPromptGenerator(ctx);

    const systemMessageObj: Message = {
      id: `system-${Date.now()}`,
      role: "system",
      content: result.content,
      timestamp: new Date(),
    };

    messages = [systemMessageObj, ...messages];
    systemMessage = { id: systemMessageObj.id, content: result.content };
  }

  const userMessageAlreadyInHistory = request.visibleUserMessageId
    ? messages.some((m) => m.id === request.visibleUserMessageId && m.role === "user")
    : messages[messages.length - 1]?.role === "user" &&
      messages[messages.length - 1]?.content === request.userMessage;

  if (!userMessageAlreadyInHistory && request.userMessage) {
    messages = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: request.userMessage,
        timestamp: new Date(),
      },
    ];
  }

  return { messages, systemMessage };
}

/**
 * Extracts a tool part that has a pending confirmation needing processing.
 * Returns null if the part is not a tool, has no confirmation config,
 * or its confirmationState is not in the tool's declared validActions.
 *
 * Each tool declares its own processable states via validActions:
 * - create_system, edit_system, call_system: confirmed, declined
 * - edit_tool: confirmed, declined, partial
 * - authenticate_oauth: oauth_success, oauth_failure, declined
 */
function extractPendingConfirmation(part: any): {
  tool: any;
  toolEntry: ToolRegistryEntry;
  normalizedOutput: any;
} | null {
  if (part.type !== "tool" || !part.tool) return null;

  const toolEntry = TOOL_REGISTRY[part.tool.name];
  if (!toolEntry?.confirmation) return null;

  let parsedOutput: Record<string, unknown> = {};
  if (part.tool.output !== undefined && part.tool.output !== null) {
    try {
      if (typeof part.tool.output === "string") {
        try {
          const parsed = JSON.parse(part.tool.output);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            parsedOutput = parsed;
          } else {
            parsedOutput = { result: parsed };
          }
        } catch {
          parsedOutput = { result: part.tool.output };
        }
      } else if (typeof part.tool.output === "object" && !Array.isArray(part.tool.output)) {
        parsedOutput = part.tool.output;
      } else {
        parsedOutput = { result: part.tool.output };
      }
    } catch {
      return null;
    }
  }

  const confirmationState =
    part.tool.confirmationState !== undefined
      ? part.tool.confirmationState
      : parsedOutput.confirmationState;
  const confirmationData =
    part.tool.confirmationData !== undefined
      ? part.tool.confirmationData
      : parsedOutput.confirmationData;

  if (!confirmationState) return null;

  const processableStates = new Set<string>(toolEntry.confirmation.validActions);
  if (!processableStates.has(confirmationState)) return null;

  return {
    tool: part.tool,
    toolEntry,
    normalizedOutput: {
      ...parsedOutput,
      confirmationState,
      ...(confirmationData !== undefined ? { confirmationData } : {}),
    },
  };
}

export async function processConfirmations(
  messages: Message[],
  ctx: ToolExecutionContext,
): Promise<ConfirmationResult[]> {
  const results: ConfirmationResult[] = [];

  for (const message of messages) {
    if (message.role !== "assistant" || !message.parts) continue;

    for (const part of message.parts) {
      const pending = extractPendingConfirmation(part);
      if (!pending) continue;

      const { tool, toolEntry, normalizedOutput } = pending;
      const result = await toolEntry.confirmation!.processConfirmation(
        tool.input,
        normalizedOutput,
        ctx,
      );

      if (result) {
        try {
          await recordConfirmationObservation({
            toolName: tool.name,
            toolCallId: tool.id,
            action: normalizedOutput.confirmationState as string,
            status: result.status,
            input: tool.input,
            normalizedOutput,
          });
        } catch (error) {
          console.error("Failed to record confirmation observation:", error);
        }

        tool.output = result.output;
        tool.status = result.status;
        delete tool.confirmationState;
        delete tool.confirmationData;
        const siblingTool = message.tools?.find((candidate) => candidate.id === tool.id);
        if (siblingTool && siblingTool !== tool) {
          siblingTool.output = result.output;
          siblingTool.status = result.status;
          delete siblingTool.confirmationState;
          delete siblingTool.confirmationData;
        }
        results.push({
          toolId: tool.id,
          toolName: tool.name,
          output: result.output,
          status: result.status,
          confirmationState: null,
          confirmationData: null,
        });
      }
    }
  }

  return results;
}

async function* executeToolWithLogs(
  entry: ToolRegistryEntry,
  input: any,
  context: ToolExecutionContext,
): AsyncGenerator<{
  type: "tool_call_update" | "tool_call_complete";
  toolCall: {
    id: string;
    name: string;
    input?: any;
    output?: any;
    logs?: Array<{ id: string; message: string; level: string; timestamp: Date; traceId?: string }>;
  };
  confirmation?: { validActions: string[] };
}> {
  const toolCallId = crypto.randomUUID();
  let logUpdates: any[] = [];
  let filterTraceId: string | undefined;
  const executionMode = getEffectiveMode(entry.name, context.toolExecutionPolicies, input);
  const awaitingConfirmation =
    executionMode === "confirm_after_execution" || executionMode === "confirm_before_execution";

  const logCallback = (message: string) => {
    // Handle TRACE_ID messages from run_tool, build_tool, and edit_tool
    const traceIdMatch = message.match(
      /^TOOL_CALL_UPDATE:(?:run_tool|build_tool|edit_tool):TRACE_ID:(.+)$/,
    );
    if (traceIdMatch) {
      filterTraceId = traceIdMatch[1];
      return;
    }
    logUpdates.push({
      id: crypto.randomUUID(),
      message,
      level: "debug",
      timestamp: new Date(),
      traceId: toolCallId,
    });
  };

  const unsubscribe = context.subscriptionClient?.subscribeLogs({
    onLog: (log) => {
      if (!filterTraceId || log.traceId === filterTraceId) {
        logUpdates.push({
          id: log.id,
          message: log.message,
          level: log.level,
          timestamp: log.timestamp,
          traceId: log.traceId,
        });
      }
    },
    onError: (err) => console.error("Log subscription error:", err),
  });

  try {
    if (!entry.execute) throw new Error(`Tool ${entry.name} has no execute function`);

    let result: any;
    let completed = false;
    let error: Error | null = null;

    entry
      .execute(input, { ...context, logCallback })
      .then((res) => {
        result = res;
        if (res?.traceId) filterTraceId = res.traceId;
      })
      .catch((e) => {
        error = e;
      })
      .finally(() => {
        completed = true;
      });

    while (!completed) {
      if (context.abortSignal?.aborted) throw new DOMException("Aborted", "AbortError");

      if (logUpdates.length > 0) {
        yield {
          type: "tool_call_update",
          toolCall: { id: toolCallId, name: entry.name, logs: logUpdates.splice(0) },
        };
      }

      await new Promise((r) => setTimeout(r, 50));
    }

    if (error) throw error;

    await new Promise((r) => setTimeout(r, 100));

    if (logUpdates.length > 0) {
      yield {
        type: "tool_call_update",
        toolCall: { id: toolCallId, name: entry.name, logs: logUpdates.splice(0) },
      };
    }

    const toolResultAsString = truncateToolResult(result, 80_000);

    try {
      updateActiveToolObservation({
        toolName: entry.name,
        toolCallId,
        executionMode,
        awaitingConfirmation,
        input,
        result,
      });
    } catch (metadataError) {
      console.error("Failed to enrich tool observation:", metadataError);
    }

    context.messages.push({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      role: "assistant",
      content: "",
      parts: [
        {
          id: crypto.randomUUID(),
          type: "tool",
          tool: { id: toolCallId, name: entry.name, input, output: result, status: "completed" },
        },
      ],
    } as Message);

    yield {
      type: "tool_call_complete",
      toolCall: { id: toolCallId, name: entry.name, input, output: toolResultAsString },
      confirmation: entry.confirmation
        ? { validActions: entry.confirmation.validActions }
        : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult = { success: false, error: errorMessage };
    const errorResultAsString = truncateToolResult(errorResult, 50000);

    try {
      updateActiveToolObservation({
        toolName: entry.name,
        toolCallId,
        executionMode,
        awaitingConfirmation,
        input,
        result: errorResult,
        error: errorMessage,
      });
    } catch (metadataError) {
      console.error("Failed to enrich tool observation:", metadataError);
    }

    context.messages.push({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      role: "assistant",
      content: "",
      parts: [
        {
          id: crypto.randomUUID(),
          type: "tool",
          tool: {
            id: toolCallId,
            name: entry.name,
            input,
            output: errorResult,
            status: "completed",
          },
        },
      ],
    } as Message);

    yield {
      type: "tool_call_complete",
      toolCall: { id: toolCallId, name: entry.name, input, output: errorResultAsString },
    };
  } finally {
    unsubscribe?.();
  }
}

export function buildToolsForAISDK(
  toolSet: string[],
  registry: Record<string, ToolRegistryEntry>,
  context: ToolExecutionContext,
): Record<string, any> {
  const tools: Record<string, any> = {};

  for (const toolName of toolSet) {
    const entry = registry[toolName];
    if (!entry) {
      console.warn(`Tool not found in registry: ${toolName}`);
      continue;
    }

    const definition = entry.definition();
    let schema = definition.inputSchema;

    if (!schema || !schema.type || schema.type !== "object") {
      schema = {
        type: "object",
        properties: schema?.properties || {},
        required: schema?.required || [],
        additionalProperties: false,
      };
    }

    const toolDef: any = {
      description: definition.description || "",
      inputSchema: jsonSchema(schema),
    };

    const effectiveMode = getEffectiveMode(toolName, context.toolExecutionPolicies);
    const shouldAttachExecute =
      entry.execute && (effectiveMode === "auto" || effectiveMode === "confirm_after_execution");

    if (shouldAttachExecute) {
      toolDef.execute = async function* (input: any) {
        const actualMode = getEffectiveMode(toolName, context.toolExecutionPolicies, input);
        if (actualMode === "confirm_before_execution") {
          return;
        }
        yield* executeToolWithLogs(entry, input, context);
      };
    }

    tools[definition.name] = toolDef;
  }

  if (process.env.TAVILY_API_KEY) {
    tools["web_search"] = tavilySearch({
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: true,
    });
  }

  return tools;
}

export function registerSkillGatedTools(
  tools: Record<string, any>,
  baseToolSet: string[],
  loadedSkills: Set<SkillName>,
  registry: Record<string, ToolRegistryEntry>,
  context: ToolExecutionContext,
): string[] {
  const gatedToolNames = new Set<string>();
  for (const skill of loadedSkills) {
    const gated = SKILL_GATED_TOOLS[skill];
    if (gated) gated.forEach((t) => gatedToolNames.add(t));
  }

  const newlyAdded: string[] = [];
  for (const toolName of gatedToolNames) {
    if (tools[toolName] || baseToolSet.includes(toolName)) continue;
    const entry = registry[toolName];
    if (!entry) continue;

    const definition = entry.definition();
    let schema = definition.inputSchema;
    if (!schema || !schema.type || schema.type !== "object") {
      schema = {
        type: "object",
        properties: schema?.properties || {},
        required: schema?.required || [],
        additionalProperties: false,
      };
    }

    const toolDef: any = {
      description: definition.description || "",
      inputSchema: jsonSchema(schema),
    };

    const effectiveMode = getEffectiveMode(toolName, context.toolExecutionPolicies);
    const shouldAttachExecute =
      entry.execute && (effectiveMode === "auto" || effectiveMode === "confirm_after_execution");

    if (shouldAttachExecute) {
      toolDef.execute = async function* (input: any) {
        const actualMode = getEffectiveMode(toolName, context.toolExecutionPolicies, input);
        if (actualMode === "confirm_before_execution") {
          return;
        }
        yield* executeToolWithLogs(entry, input, context);
      };
    }

    tools[definition.name] = toolDef;
    newlyAdded.push(definition.name);
  }

  return newlyAdded;
}
