import { Message } from "@superglue/shared";
import { jsonSchema } from "ai";
import { tavilySearch } from "@tavily/ai-sdk";
import { AgentType, getAgent } from "./registry/agents";
import { TOOL_EVENTS, GLOBAL_EVENTS, resolveEventMessage } from "./registry/tool-events";
import { TOOL_REGISTRY } from "./registry/tool-definitions";
import { truncateToolResult } from "../general-utils";
import {
  ToolExecutionContext,
  ToolRegistryEntry,
  ValidatedAgentRequest,
  UserAction,
  ToolEventAction,
  GlobalEventAction,
} from "./agent-types";
import { getEffectiveMode } from "./registry/tool-policies";
import { needsSystemMessage } from "./agent-helpers";

export interface ConfirmationResult {
  toolId: string;
  toolName: string;
  output: string;
  status: "completed" | "declined";
}

function validateUserActions(actions: UserAction[]): void {
  for (const action of actions) {
    if (action.type === "tool_event") {
      if (!action.toolCallId || !action.toolName || !action.event) {
        throw new Error("ToolEventAction requires toolCallId, toolName, and event");
      }
      const eventDef = TOOL_EVENTS[action.toolName]?.[action.event];
      if (!eventDef) {
        throw new Error(`Unknown event "${action.event}" for tool "${action.toolName}"`);
      }
    } else if (action.type === "global_event") {
      if (!action.event) {
        throw new Error("GlobalEventAction requires event");
      }
      const eventDef = GLOBAL_EVENTS[action.event];
      if (!eventDef) {
        throw new Error(`Unknown global event "${action.event}"`);
      }
    } else {
      throw new Error(`Unknown UserAction type: ${(action as any).type}`);
    }
  }
}

export function validateAgentRequest(body: any): ValidatedAgentRequest {
  if (!body.agentId || !Object.values(AgentType).includes(body.agentId)) {
    throw new Error(`Invalid agentId. Must be one of: ${Object.values(AgentType).join(", ")}`);
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    throw new Error("messages is required and must be an array");
  }

  if (body.userActions) {
    validateUserActions(body.userActions);
  }

  if (
    !body.userMessage &&
    (!body.userActions || body.userActions.length === 0) &&
    !body.hiddenContext
  ) {
    throw new Error("Request must have userMessage, userActions, or hiddenContext");
  }

  const agent = getAgent(body.agentId);

  if (body.toolExecutionPolicies && typeof body.toolExecutionPolicies !== "object") {
    throw new Error("toolExecutionPolicies must be an object");
  }

  return {
    agentId: body.agentId,
    messages: body.messages,
    userMessage: body.userMessage,
    userActions: body.userActions,
    filePayloads: body.filePayloads,
    hiddenContext: body.hiddenContext,
    toolExecutionPolicies: body.toolExecutionPolicies,
    agent,
  };
}

type ToolStatus =
  | "pending"
  | "declined"
  | "completed"
  | "awaiting_confirmation"
  | "running"
  | "stopped"
  | "failed";

function updateToolInMessages(
  messages: Message[],
  toolCallId: string,
  updates: { status?: ToolStatus; confirmationData?: any; confirmationState?: string },
): Message[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant" || !msg.parts) return msg;

    const updatedParts = msg.parts.map((part) => {
      if (part.type === "tool" && part.tool?.id === toolCallId) {
        let updatedOutput = part.tool.output;
        if (updates.confirmationState || updates.confirmationData) {
          if (updatedOutput) {
            try {
              const parsed =
                typeof updatedOutput === "string" ? JSON.parse(updatedOutput) : updatedOutput;
              if (updates.confirmationState) {
                parsed.confirmationState = updates.confirmationState;
              }
              if (updates.confirmationData) {
                parsed.confirmationData = updates.confirmationData;
              }
              updatedOutput = JSON.stringify(parsed);
            } catch {
              updatedOutput = JSON.stringify({
                confirmationState: updates.confirmationState,
                confirmationData: updates.confirmationData,
              });
            }
          } else {
            updatedOutput = JSON.stringify({
              confirmationState: updates.confirmationState,
              confirmationData: updates.confirmationData,
            });
          }
        }
        return {
          ...part,
          tool: {
            ...part.tool,
            ...(updates.status && { status: updates.status }),
            ...(updatedOutput && { output: updatedOutput }),
          },
        };
      }
      return part;
    });

    return { ...msg, parts: updatedParts };
  }) as Message[];
}

function processToolEvent(
  action: ToolEventAction,
  messages: Message[],
): { messages: Message[]; continuation: string } {
  const eventDef = TOOL_EVENTS[action.toolName]?.[action.event];
  if (!eventDef) {
    throw new Error(`Unknown event "${action.event}" for tool "${action.toolName}"`);
  }

  const continuation = resolveEventMessage(eventDef.message, action.payload);

  const updatedMessages = eventDef.statusUpdate
    ? updateToolInMessages(messages, action.toolCallId, {
        status: eventDef.statusUpdate,
        confirmationState: action.event,
        ...(action.payload && { confirmationData: action.payload }),
      })
    : messages;

  return { messages: updatedMessages, continuation };
}

function processGlobalEvent(action: GlobalEventAction): { continuation: string } {
  const eventDef = GLOBAL_EVENTS[action.event];
  if (!eventDef) {
    throw new Error(`Unknown global event "${action.event}"`);
  }
  const continuation = resolveEventMessage(eventDef.message, action.payload);
  return { continuation };
}

function processUserAction(
  action: UserAction,
  messages: Message[],
): { messages: Message[]; continuation: string | null } {
  if (action.type === "tool_event") {
    return processToolEvent(action, messages);
  }
  if (action.type === "global_event") {
    const result = processGlobalEvent(action);
    return { messages, continuation: result.continuation };
  }
  return { messages, continuation: null };
}

function processUserActions(
  actions: UserAction[],
  messages: Message[],
): { messages: Message[]; continuations: string[] } {
  const continuations: string[] = [];
  let updatedMessages = [...messages];

  for (const action of actions) {
    const result = processUserAction(action, updatedMessages);
    updatedMessages = result.messages;
    if (result.continuation) {
      continuations.push(result.continuation);
    }
  }

  return { messages: updatedMessages, continuations };
}

function buildUserTurn(
  hiddenContext: string | null,
  continuations: string[],
  userMessage?: string,
): Message | null {
  const parts: string[] = [];

  if (hiddenContext) {
    try {
      const parsed = JSON.parse(hiddenContext);
      parts.push(parsed.display || hiddenContext);
    } catch {
      parts.push(hiddenContext);
    }
  }
  if (continuations.length > 0) parts.push(continuations.join("\n\n"));
  if (userMessage) parts.push(userMessage);

  if (parts.length === 0) return null;

  return {
    id: `user-${Date.now()}`,
    role: "user",
    content: parts.join("\n\n"),
    timestamp: new Date(),
  };
}

export interface PrepareMessagesResult {
  messages: Message[];
  systemMessage?: { id: string; content: string };
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

  let continuations: string[] = [];
  if (request.userActions && request.userActions.length > 0) {
    const result = processUserActions(request.userActions, messages);
    messages = result.messages;
    continuations = result.continuations;
  }

  const lastMessage = messages[messages.length - 1];
  const userMessageAlreadyInHistory =
    lastMessage?.role === "user" && lastMessage?.content === request.userMessage;

  const userTurn = buildUserTurn(
    request.hiddenContext || null,
    continuations,
    userMessageAlreadyInHistory ? undefined : request.userMessage,
  );

  if (userTurn) {
    messages = [...messages, userTurn];
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
 * - edit_tool, edit_payload: confirmed, declined, partial
 * - authenticate_oauth: oauth_success, oauth_failure, declined
 */
function extractPendingConfirmation(part: any): {
  tool: any;
  toolEntry: ToolRegistryEntry;
} | null {
  if (part.type !== "tool" || !part.tool) return null;

  const toolEntry = TOOL_REGISTRY[part.tool.name];
  if (!toolEntry?.confirmation || !part.tool.output) return null;

  let parsedOutput: any;
  try {
    parsedOutput =
      typeof part.tool.output === "string" ? JSON.parse(part.tool.output) : part.tool.output;
  } catch {
    return null;
  }

  if (!parsedOutput.confirmationState) return null;

  const processableStates = new Set<string>(toolEntry.confirmation.validActions);
  if (!processableStates.has(parsedOutput.confirmationState)) return null;

  return { tool: part.tool, toolEntry };
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

      const { tool, toolEntry } = pending;
      const result = await toolEntry.confirmation!.processConfirmation(
        tool.input,
        tool.output,
        ctx,
      );

      if (result) {
        tool.output = result.output;
        tool.status = result.status;
        results.push({
          toolId: tool.id,
          toolName: tool.name,
          output: result.output,
          status: result.status,
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

  const logCallback = (message: string) => {
    if (message.startsWith("TOOL_CALL_UPDATE:run_tool:TRACE_ID:")) {
      filterTraceId = message.split(":").pop();
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

    let toolResultAsString = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    const MAX_TOOL_RESPONSE_LENGTH = 100000;

    if (toolResultAsString.length > MAX_TOOL_RESPONSE_LENGTH) {
      try {
        const toolResultAsJSON = typeof result === "string" ? JSON.parse(result) : result;
        const { sampleResultObject } = await import("@superglue/shared");
        toolResultAsString = JSON.stringify(sampleResultObject(toolResultAsJSON, 2), null, 2);
        if (toolResultAsString.length > MAX_TOOL_RESPONSE_LENGTH) {
          toolResultAsString = JSON.stringify(sampleResultObject(toolResultAsJSON, 1), null, 2);
        }
        if (toolResultAsString.length > MAX_TOOL_RESPONSE_LENGTH) {
          toolResultAsString =
            toolResultAsString.slice(0, MAX_TOOL_RESPONSE_LENGTH) + "\n...(truncated)";
        }
      } catch {
        toolResultAsString =
          toolResultAsString.slice(0, MAX_TOOL_RESPONSE_LENGTH) + "\n...(truncated)";
      }
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
