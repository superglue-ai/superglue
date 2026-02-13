import { Message } from "@superglue/shared";
import { initializeAIModel } from "@superglue/shared/utils";
import { LanguageModel, stepCountIs, streamText, TextStreamPart, ToolSet } from "ai";
import { writeFile } from "fs/promises";
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

export interface StreamChunk {
  type:
    | "content"
    | "tool_call_start"
    | "tool_call_complete"
    | "tool_call_error"
    | "tool_call_update"
    | "done";
  content?: string;
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

  constructor(config: AgentClientConfig) {
    this.config = config;

    this.model = initializeAIModel({
      providerEnvVar: "FRONTEND_LLM_PROVIDER",
      defaultModel: "claude-sonnet-4-5",
    });

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

    yield* this.streamLLMResponse(preparedMessages, tools, executionContext);
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

            const toolEntry = toolRegistry[part.toolName];
            const policyResult = processToolPolicy(
              part.toolName,
              part.input,
              ctx.toolExecutionPolicies,
            );
            const confirmationMetadata: ToolConfirmationMetadata | undefined =
              toolEntry?.confirmation
                ? {
                    timing: toolEntry.confirmation.timing,
                    validActions: toolEntry.confirmation.validActions,
                    shouldAutoExecute: policyResult.shouldAutoExecute,
                  }
                : undefined;

            if (generatedId) {
              toolCallIdMap.set(part.toolCallId, generatedId);
              yield {
                type: "tool_call_start",
                toolCall: { id: generatedId, name: part.toolName, input: part.input },
                confirmation: confirmationMetadata,
              };
            } else {
              toolCallIdMap.set(part.toolCallId, part.toolCallId);
              yield {
                type: "tool_call_start",
                toolCall: { id: part.toolCallId, name: part.toolName, input: part.input },
                confirmation: confirmationMetadata,
              };
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

            yield {
              ...(part.output as any),
              toolCall: { ...((part.output as any).toolCall ?? {}), id: toolId },
            };
            break;
          }

          case "tool-error": {
            console.warn("[Vercel AI] Tool error:", part.error);
            const toolId = toolCallIdMap.get(part.toolCallId) || part.toolCallId;

            yield {
              type: "tool_call_error",
              toolCall: { id: toolId, name: part.toolName, error: String(part.error) },
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
      console.error("Vercel AI SDK streaming error:", error);
      yield {
        type: "content",
        content: "Sorry, I encountered an error. Please try again.",
      };
      yield { type: "done" };
    }
  }
}
