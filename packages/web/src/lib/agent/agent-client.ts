import { Message } from "@superglue/shared";
import { initializeAIModel } from "@superglue/shared/utils";
import { LanguageModel, stepCountIs, streamText } from "ai";
import { GraphQLSubscriptionClient } from "../graphql-subscriptions";
import {
  AgentRequest,
  ExecutionMode,
  ToolExecutionContext,
  ValidatedAgentRequest,
} from "./agent-types";
import {
  validateAgentRequest,
  prepareMessages,
  buildToolsForAISDK,
  processConfirmations,
} from "./agent-request";
import { TOOL_REGISTRY } from "./registry/tool-definitions";
import { getEffectiveMode, getPendingOutput } from "./registry/tool-policies";
import { EESuperglueClient } from "../ee-superglue-client";

export interface StreamChunk {
  type:
    | "content"
    | "system_message"
    | "tool_call_start"
    | "tool_call_complete"
    | "tool_call_update"
    | "done"
    | "paused";
  content?: string;
  systemMessage?: {
    id: string;
    content: string;
  };
  toolCall?: {
    id: string;
    name: string;
    input?: any;
    output?: any;
    status?: "completed" | "declined" | "awaiting_confirmation";
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
  executionMode?: ExecutionMode;
  awaitingConfirmation?: boolean;
  pauseReason?: "awaiting_confirmation";
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
  private superglueClient: SuperglueClient;

  constructor(config: AgentClientConfig) {
    this.config = config;

    this.model = initializeAIModel({
      providerEnvVar: "FRONTEND_LLM_PROVIDER",
      defaultModel: "claude-sonnet-4-5",
    });

    this.superglueClient = new SuperglueClient({
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

  private convertToAIMessages(messages: Array<Message>): any[] {
    const aiMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        aiMessages.push({ role: "system", content: msg.content });
      } else if (msg.role === "user") {
        aiMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        if (msg.parts) {
          const hasConfirmedTool = msg.parts.some((part) => {
            if (part.type !== "tool" || !part.tool?.output) return false;
            try {
              const output =
                typeof part.tool.output === "string"
                  ? JSON.parse(part.tool.output)
                  : part.tool.output;
              return output?.success === true && part.tool.status === "completed";
            } catch {
              return false;
            }
          });

          for (const part of msg.parts) {
            if (part.type === "content") {
              if (hasConfirmedTool) {
                continue;
              }
              aiMessages.push({
                role: "assistant",
                content: [{ type: "text", text: part.content }],
              });
            } else if (part.type === "tool") {
              if (part.tool?.status === "awaiting_confirmation") {
                continue;
              }

              if (part.tool?.id && part.tool?.name) {
                let output: { type: "error-text" | "json"; value: any };

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
                  case "error": {
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
                  }
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

  async *streamResponse(validated: ValidatedAgentRequest): AsyncGenerator<StreamChunk> {
    const unwrappedFilePayloads = validated.filePayloads
      ? Object.fromEntries(
          Object.entries(validated.filePayloads).map(([key, { content }]) => [key, content]),
        )
      : {};

    const executionContext: ToolExecutionContext = {
      superglueClient: this.superglueClient,
      filePayloads: unwrappedFilePayloads,
      messages: [],
      subscriptionClient: this.subscriptionClient ?? undefined,
      abortSignal: this.config.abortSignal,
      toolExecutionPolicies: validated.toolExecutionPolicies,
    };

    const { messages: preparedMessages, systemMessage } = await prepareMessages(
      validated,
      executionContext,
    );
    executionContext.messages = preparedMessages;

    if (systemMessage) {
      yield {
        type: "system_message",
        systemMessage,
      };
    }

    const confirmationResults = await processConfirmations(preparedMessages, executionContext);
    for (const result of confirmationResults) {
      yield {
        type: "tool_call_complete",
        toolCall: {
          id: result.toolId,
          name: result.toolName,
          output: result.output,
          status: result.status,
        },
      };
    }

    const tools = buildToolsForAISDK(validated.agent.toolSet, TOOL_REGISTRY, executionContext);

    yield* this.streamLLMResponse(preparedMessages, tools, executionContext);
  }

  private async *streamLLMResponse(
    messages: Array<Message>,
    tools: Record<string, any>,
    ctx: ToolExecutionContext,
  ): AsyncGenerator<StreamChunk> {
    try {
      const toolInputQueues = new Map<string, string[]>();
      const toolCallIdMap = new Map<string, string>();
      const toolInputMap = new Map<string, any>();

      if (Object.keys(tools).length === 0) {
        yield {
          type: "content",
          content: "Tools are temporarily unavailable. Please try again.",
        };
        yield { type: "done" };
        return;
      }

      const aiMessages = this.convertToAIMessages(messages);

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
            yield { type: "content", content: part.text };
            break;
          }

          case "tool-call": {
            const queue = toolInputQueues.get(part.toolName);
            const generatedId = queue?.shift();

            const effectiveMode = getEffectiveMode(
              part.toolName,
              ctx.toolExecutionPolicies,
              part.input,
            );

            const toolId = generatedId || part.toolCallId;
            toolCallIdMap.set(part.toolCallId, toolId);
            toolInputMap.set(part.toolCallId, part.input);

            yield {
              type: "tool_call_start",
              toolCall: { id: toolId, name: part.toolName, input: part.input },
              executionMode: effectiveMode,
            };

            const hasExecuteFunction = !!tools[part.toolName]?.execute;
            if (effectiveMode === "confirm_before_execution" && !hasExecuteFunction) {
              const pendingOutput = getPendingOutput(part.toolName, part.input);
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: part.toolName,
                  input: part.input,
                  output: pendingOutput,
                  status: "awaiting_confirmation",
                },
                awaitingConfirmation: true,
              };
              yield { type: "paused", pauseReason: "awaiting_confirmation" };
              return;
            }
            break;
          }

          case "tool-input-start": {
            const generatedId = crypto.randomUUID();
            yield {
              type: "tool_call_start",
              toolCall: { id: generatedId, name: part.toolName, input: undefined },
            };

            const queue = toolInputQueues.get(part.toolName) || [];
            queue.push(generatedId);
            toolInputQueues.set(part.toolName, queue);
            break;
          }

          case "tool-result": {
            const toolId = toolCallIdMap.get(part.toolCallId) || part.toolCallId;
            const toolInput = toolInputMap.get(part.toolCallId);
            const outputObj = part.output as any;

            if (part.toolName === "web_search") {
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: part.toolName,
                  output: { message: "Web search completed" },
                },
              };
              break;
            }

            const effectiveMode = getEffectiveMode(
              part.toolName,
              ctx.toolExecutionPolicies,
              toolInput,
            );
            const shouldAwaitConfirmation = effectiveMode === "confirm_after_execution";

            if (effectiveMode === "confirm_before_execution" && part.output === undefined) {
              const pendingOutput = getPendingOutput(part.toolName, toolInput);
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: part.toolName,
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
                toolCall: { id: toolId, name: part.toolName, logs: outputObj.toolCall?.logs },
              };
              break;
            }

            if (outputObj?.type === "tool_call_complete") {
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: part.toolName,
                  input: outputObj.toolCall?.input,
                  output: outputObj.toolCall?.output,
                  ...(shouldAwaitConfirmation && { status: "awaiting_confirmation" as const }),
                },
                ...(shouldAwaitConfirmation && { awaitingConfirmation: true }),
              };
              if (shouldAwaitConfirmation) {
                yield { type: "paused", pauseReason: "awaiting_confirmation" };
                return;
              }
              break;
            }

            const finalOutput = outputObj?.toolCall?.output ?? part.output;
            if (shouldAwaitConfirmation) {
              yield {
                type: "tool_call_complete",
                toolCall: {
                  id: toolId,
                  name: part.toolName,
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
              toolCall: { id: toolId, name: part.toolName, output: finalOutput },
            };
            break;
          }

          case "tool-error": {
            console.warn("[Vercel AI] Tool error:", part.error);
            const toolId = toolCallIdMap.get(part.toolCallId) || part.toolCallId;

            yield {
              type: "tool_call_complete",
              toolCall: {
                id: toolId,
                name: part.toolName,
                output: JSON.stringify({ success: false, error: String(part.error) }),
              },
            };
            break;
          }

          case "finish": {
            yield { type: "done" };
            return;
          }

          case "error": {
            console.error("[Vercel AI] Stream error:", part.error);
            const errorMessage =
              part.error instanceof Error ? part.error.message : String(part.error);
            const isPromptTooLong =
              errorMessage.includes("prompt is too long") || errorMessage.includes("tokens > ");

            if (isPromptTooLong) {
              yield {
                type: "content",
                content: `🔄 **Your conversation has gotten too long!**\n\nThe conversation history has exceeded the model's maximum context length. Please start a new chat to continue.\n\nYou can create a new chat by clicking the **"New"** button.`,
              };
            } else {
              yield { type: "content", content: `Error: ${part.error}` };
            }
            yield { type: "done" };
            return;
          }
        }
      }

      yield { type: "done" };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        yield { type: "done" };
        return;
      }
      console.error("Vercel AI SDK streaming error:", error);
      yield {
        type: "content",
        content: "Sorry, I encountered an error. Please try again.",
      };
      yield { type: "done" };
    }
  }
}
