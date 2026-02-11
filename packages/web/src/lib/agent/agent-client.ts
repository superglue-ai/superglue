import { Message } from "@superglue/shared";
import { getConfiguredModelContextLength, initializeAIModel } from "@superglue/shared/utils";
import { LanguageModel, stepCountIs, streamText, TextStreamPart, ToolSet } from "ai";
import { GraphQLSubscriptionClient } from "../graphql-subscriptions";
import {
  AgentRequest,
  ToolExecutionContext,
  ToolRegistryEntry,
  ValidatedAgentRequest,
} from "./agent-types";
import {
  processConfirmation,
  validateAgentRequest,
  prepareMessages,
  buildToolsForAISDK,
} from "./agent-request";
import { TOOL_REGISTRY } from "./registry/tools";
import { processToolPolicy } from "./registry/tool-policies";
import type { ToolConfirmationMetadata } from "@/src/components/agent/hooks/types";

// Helper to extract error message from unknown error type
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as Record<string, unknown>).message);
  }
  return String(err);
}

// Type helpers for AI SDK stream parts - Extract specific part types from the union
type StreamPart = TextStreamPart<ToolSet>;
type TextDeltaPart = Extract<StreamPart, { type: "text-delta" }>;
type ToolCallPart = Extract<StreamPart, { type: "tool-call" }>;
type ToolInputStartPart = Extract<StreamPart, { type: "tool-input-start" }>;
type ToolResultPart = Extract<StreamPart, { type: "tool-result" }>;
type ToolErrorPart = Extract<StreamPart, { type: "tool-error" }>;
type ErrorPart = Extract<StreamPart, { type: "error" }>;

// Token estimation constants
const CHARS_PER_TOKEN = 3.5; // Conservative estimate (~4 chars/token for English, less for code/JSON)
const CONTEXT_SAFETY_MARGIN = 0.95; // Leave 5% headroom for output tokens and safety

function estimateTokenCount(messages: any[]): number {
  // Use a simple length check on stringified messages
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.text) totalChars += part.text.length;
        if (part.input) totalChars += JSON.stringify(part.input).length;
        if (part.output) {
          const outputStr =
            typeof part.output === "string" ? part.output : JSON.stringify(part.output);
          totalChars += outputStr.length;
        }
      }
    }
  }
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

function wouldExceedContextLimit(messages: any[], contextLimit: number): boolean {
  const estimatedTokens = estimateTokenCount(messages);
  const effectiveLimit = contextLimit * CONTEXT_SAFETY_MARGIN;
  return estimatedTokens > effectiveLimit;
}

export interface StreamChunk {
  type:
    | "content"
    | "tool_call_start"
    | "tool_call_complete"
    | "tool_call_error"
    | "tool_call_update"
    | "done"
    | "paused"
    | "error";
  content?: string;
  errorDetails?: string; // Technical error details for collapsible display
  systemMessage?: {
    id: string;
    content: string;
  };
  toolCall?: {
    id: string;
    name: string;
    input?: any;
    output?: any;
    status?: "completed" | "declined";
    error?: string;
    logs?: Array<{
      id: string;
      message: string;
      level: string;
      timestamp: Date;
      traceId?: string;
      orgId?: string;
    }>;
  };
  confirmation?: ToolConfirmationMetadata;
}

export interface AgentClientConfig {
  token: string;
  graphqlEndpoint: string;
  apiEndpoint?: string;
  abortSignal?: AbortSignal;
}

export class AgentClient {
  private config: AgentClientConfig;
  private model: LanguageModel;
  private subscriptionClient: GraphQLSubscriptionClient | null = null;
  private superglueClient: EESuperglueClient;
  private contextLimit: number;

  constructor(config: AgentClientConfig) {
    this.config = config;

    this.model = initializeAIModel({
      providerEnvVar: "FRONTEND_LLM_PROVIDER",
      defaultModel: "claude-sonnet-4-5",
    });

    this.contextLimit = getConfiguredModelContextLength();

    this.superglueClient = new EESuperglueClient({
      endpoint: config.graphqlEndpoint,
      apiKey: config.token,
      apiEndpoint: config.apiEndpoint,
    });

    this.subscriptionClient = new GraphQLSubscriptionClient(config.graphqlEndpoint, config.token);
  }

  disconnect(): void {
    this.subscriptionClient?.disconnect();
  }

  private checkAborted(): void {
    if (this.config.abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  }

  private sanitizeAIMessages(messages: any[]): any[] {
    return messages.map((msg) => {
      if (!("content" in msg)) return msg;

      if (typeof msg.content === "string") {
        return msg.content?.trim() ? msg : { ...msg, content: "<empty message>" };
      }

      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((part: any) =>
            part.type === "text" && !part.text?.trim()
              ? { ...part, text: "<empty message>" }
              : part,
          ),
        };
      }

      return msg;
    });
  }

  private async *preprocessConfirmations(
    messages: Message[],
    toolRegistry: Record<string, ToolRegistryEntry>,
    ctx: ToolExecutionContext,
  ): AsyncGenerator<StreamChunk> {
    for (const message of messages) {
      if (message.role !== "assistant" || !message.parts) continue;

      for (const part of message.parts) {
        if (part.type !== "tool" || !part.tool) continue;

        const tool = part.tool;
        const toolEntry = toolRegistry[tool.name];
        if (!toolEntry?.confirmation) continue;
        if (!tool.output) continue;

        let parsedOutput: any;
        try {
          parsedOutput = typeof tool.output === "string" ? JSON.parse(tool.output) : tool.output;
        } catch {
          continue;
        }

        if (!parsedOutput.confirmationState) continue;

        const result = await processConfirmation(tool.name, tool.input, tool.output, ctx);

        if (result) {
          tool.output = result.output;
          tool.status = result.status;

          yield {
            type: "tool_call_complete",
            toolCall: {
              id: tool.id,
              name: tool.name,
              output: result.output,
              status: result.status,
            },
          };
        }
      }
    }
  }

  private convertToAIMessages(messages: Array<Message>): any[] {
    const aiMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        aiMessages.push({ role: "system", content: msg.content });
      } else if (msg.role === "user") {
        aiMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        if (msg.parts) {
          for (const part of msg.parts) {
            if (part.type === "content") {
              aiMessages.push({
                role: "assistant",
                content: [{ type: "text", text: part.content }],
              });
            } else if (part.type === "error") {
              // Include error messages in the conversation so the LLM knows what happened
              const errorText = part.errorDetails
                ? `[Error: ${part.content}]\nDetails: ${part.errorDetails}`
                : `[Error: ${part.content}]`;
              aiMessages.push({
                role: "assistant",
                content: [{ type: "text", text: errorText }],
              });
            } else if (part.type === "tool") {
              if (part.tool?.status === "awaiting_confirmation") {
                continue;
              }

              if (part.tool?.id && part.tool?.name) {
                let output: { type: "error-text" | "json" | "text"; value: any };

                switch (part.tool.status) {
                  case "pending":
                    output = { type: "error-text", value: "Tool pending" };
                    break;
                  case "declined":
                    output = { type: "error-text", value: "Tool execution declined by user" };
                    break;
                  case "running":
                    output = { type: "error-text", value: "Tool running" };
                    break;
                  case "completed":
                    let outputObj = part.tool.output ?? {};
                    if (typeof outputObj === "string") {
                      try {
                        outputObj = JSON.parse(outputObj);
                      } catch {
                        outputObj = { result: outputObj };
                      }
                    }
                    if (Array.isArray(outputObj)) {
                      outputObj = { result: outputObj };
                    } else if (typeof outputObj !== "object") {
                      outputObj = { result: outputObj };
                    }
                    output = { type: "json", value: outputObj };
                    break;
                  case "error":
                    output = {
                      type: "error-text",
                      value: part.tool.error || "Unknown error",
                    };
                    break;
                  default:
                    output = { type: "error-text", value: "Unknown tool status" };
                }

                aiMessages.push({
                  role: "assistant",
                  content: [
                    {
                      type: "tool-call",
                      toolName: part.tool.name,
                      toolCallId: part.tool.id,
                      input: part.tool.input ?? {},
                    },
                  ],
                });

                aiMessages.push({
                  role: "tool",
                  content: [
                    {
                      type: "tool-result",
                      toolCallId: part.tool.id,
                      toolName: part.tool.name,
                      output: output,
                    },
                  ],
                });
              }
            }
          }
        } else if (msg.content) {
          aiMessages.push({
            role: "assistant",
            content: [{ type: "text", text: msg.content }],
          });
        }
      }
    }

    return this.sanitizeAIMessages(aiMessages);
  }

  validateRequest(body: AgentRequest): ValidatedAgentRequest {
    return validateAgentRequest(body);
  }

  async *streamResponse(request: AgentRequest): AsyncGenerator<StreamChunk> {
    const validated = validateAgentRequest(request);

    const unwrappedFilePayloads = validated.filePayloads
      ? Object.fromEntries(
          Object.entries(validated.filePayloads).map(([key, { content }]) => [key, content]),
        )
      : {};

    const executionContext: ToolExecutionContext = {
      superglueClient: this.superglueClient,
      filePayloads: unwrappedFilePayloads,
      messages: [],
      orgId: "",
      subscriptionClient: this.subscriptionClient ?? undefined,
      abortSignal: this.config.abortSignal,
      toolExecutionPolicies: validated.toolExecutionPolicies,
    };

    const preparedMessages = await prepareMessages(validated, executionContext);
    executionContext.messages = preparedMessages;

    const tools = buildToolsForAISDK(validated.agent.toolSet, TOOL_REGISTRY, executionContext);

    yield* this.streamLLMResponse(preparedMessages, tools, TOOL_REGISTRY, executionContext);
  }

  private async *streamLLMResponse(
    messages: Array<Message>,
    tools: Record<string, any>,
    toolRegistry: Record<string, ToolRegistryEntry>,
    ctx: ToolExecutionContext,
  ): AsyncGenerator<StreamChunk> {
    try {
      const toolInputQueues = new Map<string, string[]>();
      const toolCallIdMap = new Map<string, string>();

      if (Object.keys(tools).length === 0) {
        yield {
          type: "content",
          content: "Tools are temporarily unavailable. Please try again.",
        };
        yield { type: "done" };
        return;
      }

      yield* this.preprocessConfirmations(messages, toolRegistry, ctx);

      const aiMessages = this.convertToAIMessages(messages);

      // Pre-flight context limit check
      if (wouldExceedContextLimit(aiMessages, this.contextLimit)) {
        yield {
          type: "content",
          content: `**Conversation limit reached**\n\nThis conversation has become too long for me to process. Please start a new chat to continue working together.`,
        };
        yield { type: "done" };
        return;
      }

      const result = streamText({
        model: this.model,
        messages: aiMessages,
        tools,
        stopWhen: stepCountIs(10),
      });

      for await (const part of result.fullStream) {
        this.checkAborted();

        switch (part.type) {
          case "text-delta": {
            const p = part as TextDeltaPart;
            yield { type: "content", content: p.text };
            break;
          }

          case "tool-call": {
            const p = part as ToolCallPart;
            const queue = toolInputQueues.get(p.toolName);
            const generatedId = queue?.shift();

            const effectiveMode = getEffectiveMode(p.toolName, ctx.toolExecutionPolicies, p.input);

            const toolId = generatedId || p.toolCallId;
            toolCallIdMap.set(p.toolCallId, toolId);
            toolInputMap.set(p.toolCallId, p.input);

            yield {
              type: "tool_call_start",
              toolCall: { id: toolId, name: p.toolName, input: p.input },
              executionMode: effectiveMode,
            };

            const hasExecuteFunction = !!tools[p.toolName]?.execute;
            if (effectiveMode === "confirm_before_execution" && !hasExecuteFunction) {
              const pendingOutput = getPendingOutput(p.toolName, p.input);
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: p.toolName,
                  input: p.input,
                  output: pendingOutput,
                  status: "awaiting_confirmation",
                },
                awaitingConfirmation: true,
              };
            }
            break;
          }

          case "tool-input-start": {
            const p = part as ToolInputStartPart;
            const generatedId = crypto.randomUUID();
            yield {
              type: "tool_call_start",
              toolCall: { id: generatedId, name: p.toolName, input: undefined },
            };

            const queue = toolInputQueues.get(p.toolName) || [];
            queue.push(generatedId);
            toolInputQueues.set(p.toolName, queue);
            break;
          }

          case "tool-result": {
            const p = part as ToolResultPart;
            const toolId = toolCallIdMap.get(p.toolCallId) || p.toolCallId;
            const toolInput = toolInputMap.get(p.toolCallId);
            const outputObj = p.output as any;

            if (p.toolName === "web_search") {
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: p.toolName,
                  output: { message: "Web search completed" },
                },
              };
              break;
            }

            const effectiveMode = getEffectiveMode(
              p.toolName,
              ctx.toolExecutionPolicies,
              toolInput,
            );
            const shouldAwaitConfirmation = effectiveMode === "confirm_after_execution";

            if (effectiveMode === "confirm_before_execution" && p.output === undefined) {
              const pendingOutput = getPendingOutput(p.toolName, toolInput);
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: p.toolName,
                  input: toolInput,
                  output: pendingOutput,
                  status: "awaiting_confirmation",
                },
                awaitingConfirmation: true,
              };
              yield { type: "paused", pauseReason: "awaiting_confirmation" };
              return;
            }

            if (outputObj?.type === "tool_call_update") {
              yield {
                type: "tool_call_update",
                toolCall: { id: toolId, name: p.toolName, logs: outputObj.toolCall?.logs },
              };
              break;
            }

            if (outputObj?.type === "tool_call_complete") {
              // Don't await confirmation if the tool execution failed
              const toolOutput = outputObj.toolCall?.output;
              let executionFailed = false;
              try {
                const parsedToolOutput =
                  typeof toolOutput === "string" ? JSON.parse(toolOutput) : toolOutput;
                executionFailed = parsedToolOutput?.success === false;
              } catch {
                // If parsing fails, assume it's not a failure
              }
              const shouldPause = shouldAwaitConfirmation && !executionFailed;

              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: p.toolName,
                  input: outputObj.toolCall?.input,
                  output: outputObj.toolCall?.output,
                  ...(shouldPause && { status: "awaiting_confirmation" as const }),
                },
                ...(shouldPause && { awaitingConfirmation: true }),
              };
              if (shouldPause) {
                yield { type: "paused", pauseReason: "awaiting_confirmation" };
                return;
              }
              break;
            }

            const finalOutput = outputObj?.toolCall?.output ?? p.output;

            // Don't await confirmation if the tool execution failed
            let executionFailed = false;
            try {
              const parsedFinalOutput =
                typeof finalOutput === "string" ? JSON.parse(finalOutput) : finalOutput;
              executionFailed = parsedFinalOutput?.success === false;
            } catch {
              // If parsing fails, assume it's not a failure
            }
            const shouldPause = shouldAwaitConfirmation && !executionFailed;

            if (shouldPause) {
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: p.toolName,
                  output: finalOutput,
                  status: "awaiting_confirmation",
                },
                awaitingConfirmation: true,
              };
              yield { type: "paused", pauseReason: "awaiting_confirmation" };
              return;
            }

            yield {
              type: "tool_call_complete",
              toolCall: { id: toolId, name: p.toolName, output: finalOutput },
            };
            break;
          }

          case "tool-error": {
            const p = part as ToolErrorPart;
            console.warn("[Vercel AI] Tool error:", p.error);
            const toolId = toolCallIdMap.get(p.toolCallId) || p.toolCallId;

            yield {
              type: "tool_call_complete",
              toolCall: {
                id: toolId,
                name: p.toolName,
                output: JSON.stringify({ success: false, error: String(p.error) }),
              },
            };
            break;
          }

          case "finish": {
            yield { type: "done" };
            return;
          }

          case "error": {
            const p = part as ErrorPart;
            console.error("[Vercel AI] Stream error:", p.error);
            const errorMessage = getErrorMessage(p.error);
            const isPromptTooLong =
              errorMessage.includes("prompt is too long") ||
              errorMessage.includes("tokens > ") ||
              errorMessage.includes("Input is too long");

            if (isPromptTooLong) {
              yield {
                type: "content",
                content: `**Conversation limit reached**\n\nThis conversation has become too long for me to process. Please start a new chat to continue working together.`,
              };
            } else {
              yield {
                type: "error",
                content: "Something went wrong while processing your request. Please try again.",
                errorDetails: errorMessage,
              };
            }
            yield { type: "done" };
            return;
          }
        }
      }

      yield { type: "done" };
    } catch (error) {
      console.error("Vercel AI SDK streaming error:", error);
      const errorMessage = getErrorMessage(error);
      yield {
        type: "error",
        content: "Something went wrong while processing your request. Please try again.",
        errorDetails: errorMessage,
      };
      yield { type: "done" };
    }
  }
}
