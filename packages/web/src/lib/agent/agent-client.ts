import { Message } from "@superglue/shared";
import { initializeAIModel } from "@superglue/shared/utils/ai-model-init";
import { LanguageModel, stepCountIs, streamText } from "ai";
import { SSESubscriptionClient } from "../sse-subscriptions";
import {
  AgentRequest,
  ExecutionMode,
  ToolExecutionContext,
  ValidatedAgentRequest,
  TextDeltaPart,
  ToolCallPart,
  ToolInputStartPart,
  ToolResultPart,
  ToolErrorPart,
  ErrorPart,
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
import { getErrorMessage } from "./agent-helpers";

export interface StreamChunk {
  type:
    | "content"
    | "system_message"
    | "tool_call_start"
    | "tool_call_complete"
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
  apiEndpoint: string;
  abortSignal?: AbortSignal;
}

export class AgentClient {
  private config: AgentClientConfig;
  private model: LanguageModel;
  private subscriptionClient: SSESubscriptionClient;
  private superglueClient: EESuperglueClient;

  constructor(config: AgentClientConfig) {
    this.config = config;

    this.model = initializeAIModel({
      providerEnvVar: "FRONTEND_LLM_PROVIDER",
      defaultModel: "claude-sonnet-4-5",
    });

    this.superglueClient = new EESuperglueClient({
      apiKey: config.token,
      apiEndpoint: config.apiEndpoint,
    });

    this.subscriptionClient = new SSESubscriptionClient(config.apiEndpoint, config.token);
  }

  disconnect(): void {
    this.subscriptionClient.disconnect();
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
          for (const part of msg.parts) {
            if (part.type === "content") {
              if (!part.content?.trim()) continue;
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
      subscriptionClient: this.subscriptionClient,
      abortSignal: this.config.abortSignal,
      toolExecutionPolicies: validated.toolExecutionPolicies,
      playgroundDraft: validated.playgroundDraft,
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

    yield* this.streamLLMResponse(preparedMessages, tools, executionContext, validated.agentId);
  }

  private async *streamLLMResponse(
    messages: Array<Message>,
    tools: Record<string, any>,
    ctx: ToolExecutionContext,
    agentId?: string,
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
        abortSignal: ctx.abortSignal,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "superglue-agent-chat",
          metadata: {
            agentId: agentId ?? "unknown",
          },
        },
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

            const toolId = generatedId || part.toolCallId;
            toolCallIdMap.set(part.toolCallId, toolId);
            toolInputMap.set(part.toolCallId, part.input);

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
              yield { type: "paused", pauseReason: "awaiting_confirmation" };
              return;
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

            if (part.toolName === "web_search") {
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
      if (error instanceof Error && error.name === "AbortError") {
        yield { type: "done" };
        return;
      }
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
