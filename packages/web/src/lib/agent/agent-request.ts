import { Message, getDateMessage } from "@superglue/shared";
import { jsonSchema } from "ai";
import { tavilySearch } from "@tavily/ai-sdk";
import { resolveSystemPrompt, generateAgentInitialContext } from "./agent-context";
import { AgentType, getAgent } from "./registry/agents";
import { TOOL_CONTINUATION_MESSAGES, TOOL_REGISTRY } from "./registry/tools";
import {
  ToolExecutionContext,
  ToolRegistryEntry,
  ValidatedAgentRequest,
  UserAction,
  ToolConfirmationAction,
  ToolExecutionFeedback,
  FileUploadAction,
} from "./agent-types";
import { TOOL_POLICY_PROCESSORS, processToolPolicy } from "./registry/tool-policies";

function validateUserActions(actions: any[]): void {
  for (const action of actions) {
    if (!action.type) {
      throw new Error("UserAction must have a type");
    }
    if (action.type === "tool_confirmation") {
      if (!action.toolCallId || !action.toolName || !action.action) {
        throw new Error("ToolConfirmationAction requires toolCallId, toolName, and action");
      }
      if (!["confirmed", "declined", "partial"].includes(action.action)) {
        throw new Error("ToolConfirmationAction.action must be confirmed, declined, or partial");
      }
    } else if (action.type === "tool_execution_feedback") {
      if (!action.toolCallId || !action.toolName || !action.feedback) {
        throw new Error("ToolExecutionFeedback requires toolCallId, toolName, and feedback");
      }
      if (
        ![
          "manual_run",
          "manual_run_success",
          "manual_run_failure",
          "request_fix",
          "save_success",
          "oauth_success",
          "oauth_failure",
        ].includes(action.feedback)
      ) {
        throw new Error(
          "ToolExecutionFeedback.feedback must be manual_run, manual_run_success, manual_run_failure, request_fix, save_success, oauth_success, or oauth_failure",
        );
      }
    } else if (action.type === "file_upload") {
      if (!action.files || !Array.isArray(action.files)) {
        throw new Error("FileUploadAction requires files array");
      }
    } else {
      throw new Error(`Unknown UserAction type: ${action.type}`);
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

  if (!body.userMessage && (!body.userActions || body.userActions.length === 0)) {
    throw new Error("Request must have userMessage or userActions");
  }

  const agent = getAgent(body.agentId);

  if (agent.agentParamsSchema && body.agentParams) {
    try {
      agent.agentParamsSchema.parse(body.agentParams);
    } catch (error: any) {
      if (error?.issues) {
        throw new Error(
          `Invalid agentParams: ${error.issues.map((e: any) => e.message).join(", ")}`,
        );
      }
      throw error;
    }
  }

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
    agentParams: body.agentParams,
    toolExecutionPolicies: body.toolExecutionPolicies,
    agent,
  };
}

function isNewConversation(messages: Message[]): boolean {
  return messages.length === 1 && messages[0].role === "user";
}

type ToolStatus =
  | "pending"
  | "declined"
  | "completed"
  | "awaiting_confirmation"
  | "running"
  | "stopped"
  | "error";

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
        if (updates.confirmationState) {
          if (updatedOutput) {
            try {
              const parsed =
                typeof updatedOutput === "string" ? JSON.parse(updatedOutput) : updatedOutput;
              parsed.confirmationState = updates.confirmationState;
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

function getConfirmationStateForAction(toolName: string, action: string): string | undefined {
  const entry = TOOL_REGISTRY[toolName];
  return entry?.confirmation?.states?.[action as keyof typeof entry.confirmation.states];
}

function processToolConfirmation(
  action: ToolConfirmationAction,
  messages: Message[],
): { messages: Message[]; continuation: string | null } {
  const statusMap: Record<string, ToolStatus> = {
    confirmed: "running",
    declined: "declined",
    partial: "completed",
  };

  const confirmationState = getConfirmationStateForAction(action.toolName, action.action);

  const updatedMessages = updateToolInMessages(messages, action.toolCallId, {
    status: statusMap[action.action],
    confirmationState,
    ...(action.data && { confirmationData: action.data }),
  });

  const continuationMessages =
    TOOL_CONTINUATION_MESSAGES[action.toolName as keyof typeof TOOL_CONTINUATION_MESSAGES];
  const continuation =
    continuationMessages?.[action.action as keyof typeof continuationMessages] ?? null;

  return { messages: updatedMessages, continuation };
}

function buildFeedbackContinuation(action: ToolExecutionFeedback): string {
  switch (action.feedback) {
    case "manual_run":
      return `[USER ACTION] User manually ran tool "${action.toolName}". Result: ${JSON.stringify(action.data)}`;
    case "manual_run_success": {
      const successData = action.data || {};
      const changesApplied =
        successData.appliedChanges > 0
          ? ` with ${successData.appliedChanges} pending change(s) applied`
          : "";
      const truncatedResult =
        successData.result !== undefined
          ? JSON.stringify(successData.result).substring(0, 500)
          : "No result data";
      return `[USER ACTION] User tested the tool "${action.toolName}"${changesApplied}. Execution succeeded. Result preview: ${truncatedResult}`;
    }
    case "manual_run_failure": {
      const failData = action.data || {};
      const failChangesApplied =
        failData.appliedChanges > 0
          ? ` with ${failData.appliedChanges} pending change(s) applied`
          : "";
      return `[USER ACTION] User tested the tool "${action.toolName}"${failChangesApplied} but it FAILED with error: ${failData.error || "Unknown error"}. Please analyze the error and fix the tool configuration using edit_tool.`;
    }
    case "request_fix":
      return `[USER ACTION] User clicked "Request Fix" for tool "${action.toolName}". Error: ${action.data}. Please fix using edit_tool.`;
    case "save_success":
      return `[SYSTEM] Tool "${action.toolName}" saved successfully.`;
    case "oauth_success":
      return `[SYSTEM] OAuth authentication for "${action.data?.systemId}" completed successfully. Access token saved. Inform the user that authentication is complete and the system is ready to use, suggest to test it.`;
    case "oauth_failure":
      return `[SYSTEM] OAuth authentication for "${action.data?.systemId}" failed: ${action.data?.error}. Help the user troubleshoot the issue.`;
  }
}

function processToolFeedback(
  action: ToolExecutionFeedback,
  messages: Message[],
): { messages: Message[]; continuation: string | null } {
  const continuation = buildFeedbackContinuation(action);
  return { messages, continuation };
}

function processFileUpload(
  _action: FileUploadAction,
  messages: Message[],
): { messages: Message[]; continuation: string | null } {
  return { messages, continuation: null };
}

function processUserAction(
  action: UserAction,
  messages: Message[],
): { messages: Message[]; continuation: string | null } {
  switch (action.type) {
    case "tool_confirmation":
      return processToolConfirmation(action, messages);
    case "tool_execution_feedback":
      return processToolFeedback(action, messages);
    case "file_upload":
      return processFileUpload(action, messages);
  }
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

function buildContextInjection(
  hiddenContext?: string,
  filePayloads?: Record<string, { name: string; content: any }>,
  userActions?: UserAction[],
  messages?: Message[],
): string | null {
  const parts: string[] = [];

  if (hiddenContext) {
    parts.push(hiddenContext);
  }

  const hasFiles = filePayloads && Object.keys(filePayloads).length > 0;

  if (hasFiles) {
    const fileRefs = Object.entries(filePayloads!)
      .map(([key, { name }]) => `- ${name} => file::${key}`)
      .join("\n");
    parts.push(`[SYSTEM] Files available in session (use file::key to reference):\n${fileRefs}`);
  } else {
    const conversationMentionsFiles =
      messages?.some((m) => {
        if (m.content?.includes("file::") || m.content?.includes("uploaded")) return true;
        if (m.tools) {
          return m.tools.some((t: any) => {
            const resultStr = JSON.stringify(t.result || t.args || {});
            return resultStr.includes("file::") || resultStr.includes("Files available");
          });
        }
        return false;
      }) ?? false;

    if (conversationMentionsFiles) {
      parts.push(
        `[SYSTEM] IMPORTANT: No files are currently available in this session. Files are stored in browser memory and are cleared on page refresh. If a past chat mentions files that were previously uploaded, those files are NO LONGER AVAILABLE. You MUST ask the user to re-upload the files before making any tool calls that require file content. Do NOT attempt to use file:: references until the user has re-uploaded the files.`,
      );
    }
  }

  const fileUploadAction = userActions?.find(
    (a): a is FileUploadAction => a.type === "file_upload",
  );
  if (fileUploadAction && fileUploadAction.files.length > 0) {
    const previews = fileUploadAction.files
      .map((f) => `### ${f.name} (file::${f.key})\n\`\`\`\n${f.contentPreview}\n\`\`\``)
      .join("\n\n");
    parts.push(`[SYSTEM] File content previews:\n${previews}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

function buildUserTurn(
  contextInjection: string | null,
  continuations: string[],
  userMessage?: string,
): Message | null {
  const parts: string[] = [];

  if (contextInjection) parts.push(contextInjection);
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

function createPlaygroundDraftMessage(toolConfig: any): Message {
  return {
    id: `playground-draft-${Date.now()}`,
    timestamp: new Date(),
    role: "assistant",
    content: "",
    parts: [
      {
        id: `playground-draft-part-${Date.now()}`,
        type: "tool",
        tool: {
          id: `playground-draft-tool-${Date.now()}`,
          name: "build_tool",
          input: { instruction: toolConfig.instruction },
          output: {
            success: true,
            draftId: "playground-draft",
            config: {
              id: toolConfig.toolId,
              instruction: toolConfig.instruction,
              steps: toolConfig.steps,
              finalTransform: toolConfig.finalTransform,
              inputSchema: toolConfig.inputSchema,
              responseSchema: toolConfig.responseSchema,
              systemIds: toolConfig.systemIds,
            },
            systemIds: toolConfig.systemIds || [],
          },
          status: "completed",
        },
      },
    ],
  } as Message;
}

export async function prepareMessages(
  request: ValidatedAgentRequest,
  ctx: ToolExecutionContext,
): Promise<Message[]> {
  let messages = [...request.messages];

  const isNew = isNewConversation(messages);

  if (isNew) {
    const systemPrompt = resolveSystemPrompt(request.agent, request.agentParams);
    const dateMessage = getDateMessage();
    const initialContext = await generateAgentInitialContext(
      request.agent,
      ctx,
      request.agentParams,
    );

    let fullSystemContent = systemPrompt;
    if (initialContext) {
      fullSystemContent += `\n\n${initialContext}`;
    }
    fullSystemContent += `\n\n${dateMessage.content}`;

    const systemMessage: Message = {
      id: `system-${Date.now()}`,
      role: "system",
      content: fullSystemContent,
      timestamp: new Date(),
    };

    messages = [systemMessage, ...messages];
  }

  if (request.agentId === AgentType.PLAYGROUND && request.agentParams?.playgroundToolConfig) {
    const draftMessage = createPlaygroundDraftMessage(request.agentParams.playgroundToolConfig);
    const systemIndex = messages.findIndex((m) => m.role === "system");
    if (systemIndex !== -1) {
      messages.splice(systemIndex + 1, 0, draftMessage);
    } else {
      messages.unshift(draftMessage);
    }
  }

  let continuations: string[] = [];
  if (request.userActions && request.userActions.length > 0) {
    const result = processUserActions(request.userActions, messages);
    messages = result.messages;
    continuations = result.continuations;
  }

  const contextInjection = buildContextInjection(
    request.hiddenContext,
    request.filePayloads,
    request.userActions,
    messages,
  );

  const lastMessage = messages[messages.length - 1];
  const userMessageAlreadyInHistory =
    lastMessage?.role === "user" && lastMessage?.content === request.userMessage;

  const userTurn = buildUserTurn(
    contextInjection,
    continuations,
    userMessageAlreadyInHistory ? undefined : request.userMessage,
  );
  if (userTurn) {
    messages = [...messages, userTurn];
  }

  return messages;
}

async function* executeToolWithLogs(
  entry: ToolRegistryEntry,
  input: any,
  context: ToolExecutionContext,
): AsyncGenerator<{
  type: "tool_call_update" | "tool_call_complete" | "tool_call_error";
  toolCall: {
    id: string;
    name: string;
    input?: any;
    output?: any;
    error?: string;
    logs?: Array<{ id: string; message: string; level: string; timestamp: Date; traceId?: string }>;
  };
  confirmation?: { timing: "before" | "after"; validActions: string[] };
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
        ? { timing: entry.confirmation.timing, validActions: entry.confirmation.validActions }
        : undefined,
    };
  } catch (error) {
    yield {
      type: "tool_call_error",
      toolCall: {
        id: toolCallId,
        name: entry.name,
        error: error instanceof Error ? error.message : String(error),
      },
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

    const hasPolicyProcessor = TOOL_POLICY_PROCESSORS[entry.name] !== undefined;
    const shouldAutoExecute =
      entry.execute && (entry.confirmation?.timing !== "before" || hasPolicyProcessor);

    if (shouldAutoExecute) {
      toolDef.execute = async function* (input: any) {
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

export async function processConfirmation(
  toolName: string,
  toolInput: any,
  toolOutput: any,
  ctx: ToolExecutionContext,
): Promise<{ output: string; status: "completed" | "declined" } | null> {
  const entry = TOOL_REGISTRY[toolName];
  if (!entry?.confirmation?.processConfirmation) {
    return null;
  }

  return entry.confirmation.processConfirmation(toolInput, toolOutput, ctx);
}
