import {
  getDateMessage,
  Log,
  Message,
  sampleResultObject,
  SuperglueClient,
} from "@superglue/shared";
import { initializeAIModel } from "@superglue/shared/utils";
import { tavilySearch } from "@tavily/ai-sdk";
import {
  AssistantModelMessage,
  jsonSchema,
  stepCountIs,
  streamText,
  SystemModelMessage,
  TextPart,
  ToolCallPart,
  ToolModelMessage,
  ToolResultPart,
  UserModelMessage,
} from "ai";
import { GraphQLSubscriptionClient } from "../graphql-subscriptions";
import { requiresConfirmationAfterExec, requiresConfirmationBeforeExec } from "./agent-helpers";
import { PLAYGROUND_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./agent-prompts";
import {
  executeAgentTool,
  getAgentToolDefinitions,
  getPlaygroundToolDefinitions,
  processIntermediateToolResult as processUserActionResult,
} from "./agent-tools";

export type ToolSet = "agent" | "playground";

const MAX_TOOL_RESPONSE_LENGTH = 100000;

export class AgentClient {
  private superglueClient: SuperglueClient;
  private subscriptionClient: GraphQLSubscriptionClient | null = null;
  private model: any;
  private provider: string;
  private tools: Record<string, any> | null = null;
  private orgId: string = "";
  private filePayloads: Record<string, any> = {};
  private abortSignal?: AbortSignal;
  private currentMessages: Message[] = [];
  private toolSet: ToolSet;

  constructor(
    superglueKey: string,
    filePayloads?: Record<string, any>,
    abortSignal?: AbortSignal,
    toolSet: ToolSet = "agent",
  ) {
    if (!process.env.GRAPHQL_ENDPOINT) {
      throw new Error("GRAPHQL_ENDPOINT is not set");
    }
    if (!process.env.API_ENDPOINT) {
      throw new Error("API_ENDPOINT is not set");
    }
    this.superglueClient = new SuperglueClient({
      endpoint: process.env.GRAPHQL_ENDPOINT,
      apiKey: superglueKey,
      apiEndpoint: process.env.API_ENDPOINT,
    });
    this.subscriptionClient = new GraphQLSubscriptionClient(
      process.env.GRAPHQL_ENDPOINT,
      superglueKey,
    );
    this.model = initializeAIModel({
      providerEnvVar: "FRONTEND_LLM_PROVIDER",
      defaultModel: "claude-sonnet-4-5",
    });
    this.provider = process.env.FRONTEND_LLM_PROVIDER
      ? process.env.FRONTEND_LLM_PROVIDER
      : this.model.split("/")[0] || "openai";

    this.filePayloads = filePayloads || {};
    this.abortSignal = abortSignal;
    this.toolSet = toolSet;
  }

  private checkAborted(): void {
    if (this.abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  }

  private async getAISDKTools(): Promise<Record<string, any>> {
    if (this.tools) return this.tools;

    const agentTools =
      this.toolSet === "playground" ? getPlaygroundToolDefinitions() : getAgentToolDefinitions();
    const tools: Record<string, any> = {};
    const self = this;

    for (const agentTool of agentTools) {
      const toolName = agentTool.name;
      let schema = agentTool.inputSchema;

      // Fix invalid schemas - AI SDK requires type: "object"
      if (!schema || !schema.type || schema.type !== "object") {
        schema = {
          type: "object",
          properties: schema?.properties || {},
          required: schema?.required || [],
          additionalProperties: false,
        };
      }

      const toolDef: any = {
        description: agentTool.description || "",
        inputSchema: jsonSchema(schema),
      };

      if (!requiresConfirmationBeforeExec(toolName)) {
        toolDef.execute = async function* (input: any) {
          try {
            for await (const toolResult of self.executeToolWithLogs({
              // This ID is for internal logging/tracing only.
              // The actual UI-facing ID is assigned in the tool-result handler
              // by mapping the Vercel SDK's toolCallId to our generated UI ID.
              id: crypto.randomUUID(),
              name: toolName,
              input: input,
            })) {
              yield toolResult;
            }
          } catch (error) {
            console.error(`[Vercel AI] Tool ${toolName} execution error:`, error);
            throw error;
          }
        };
      }

      tools[toolName] = toolDef;
    }

    if (process.env.TAVILY_API_KEY) {
      tools["web_search"] = tavilySearch({
        searchDepth: "advanced",
        maxResults: 5,
        includeAnswer: true,
      });
    }

    this.tools = tools;
    return tools;
  }

  private sanitizeAIMessages(
    messages: Array<
      SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage
    >,
  ): typeof messages {
    return messages.map((msg) => {
      if (!("content" in msg)) return msg;

      if (typeof msg.content === "string") {
        return msg.content?.trim() ? msg : { ...msg, content: "<empty message>" };
      }

      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((part) =>
            part.type === "text" && !part.text?.trim()
              ? { ...part, text: "<empty message>" }
              : part,
          ),
        };
      }

      return msg;
    }) as typeof messages;
  }

  private async *preprocessToolResults(messages: Array<Message>) {
    if (messages.length === 0) return;

    for (const message of messages) {
      if (message.role !== "assistant" || !message.parts) continue;

      for (const part of message.parts) {
        if (part.type !== "tool" || !part.tool) continue;

        const tool = part.tool;

        if (!requiresConfirmationBeforeExec(tool.name) && !requiresConfirmationAfterExec(tool.name))
          continue;
        if (!tool.output) continue;

        const result = await processUserActionResult(
          tool.name,
          tool.input,
          tool.output,
          this.superglueClient,
        );

        if (result) {
          tool.output = result.output;
          tool.status = result.status;

          yield {
            type: "tool_call_complete" as const,
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

  private convertToAIMessages(
    messages: Array<Message>,
  ): Array<SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage> {
    const aiMessages: Array<
      SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage
    > = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        aiMessages.push({ role: "user", content: msg.content } as UserModelMessage);
      } else if (msg.role === "assistant") {
        if (msg.parts) {
          for (const part of msg.parts) {
            if (part.type === "content") {
              aiMessages.push({
                role: "assistant",
                content: [{ type: "text", text: part.content } as TextPart],
              } as AssistantModelMessage);
            } else if (part.type === "tool") {
              if (part.tool?.status === "awaiting_confirmation") {
                continue;
              }

              if (part.tool?.id && part.tool?.name) {
                let output: { type: "error-text" | "json" | "text"; value: string };

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
                  case "stopped":
                    output = { type: "error-text", value: "Tool manually stopped" };
                    break;
                  case "error":
                    output = { type: "error-text", value: part.tool.error ?? "Tool error" };
                    break;
                }
                if (output !== undefined) {
                  aiMessages.push({
                    role: "assistant",
                    content: [
                      {
                        type: "tool-call",
                        toolCallId: part.tool.id,
                        toolName: part.tool.name,
                        input: part.tool.input ?? {},
                      } as ToolCallPart,
                    ],
                  } as AssistantModelMessage);
                  aiMessages.push({
                    role: "tool",
                    content: [
                      {
                        type: "tool-result",
                        toolCallId: part.tool.id,
                        toolName: part.tool.name,
                        output: output,
                      } as ToolResultPart,
                    ],
                  });
                }
              }
            }
          }
        } else {
          aiMessages.push({
            role: "assistant",
            content: [{ type: "text", text: msg.content } as TextPart],
          });
        }
      } else if (msg.role === "system") {
        aiMessages.push({ role: "system", content: msg.content });
      }
    }

    return this.sanitizeAIMessages(aiMessages);
  }

  private async *executeToolWithLogs(toolCall: {
    id: string;
    name: string;
    input: any;
  }): AsyncGenerator<{
    type: "tool_call_update" | "tool_call_complete" | "tool_call_error";
    toolCall: {
      id: string;
      name: string;
      input?: any;
      output?: any;
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
  }> {
    // Declare subscription outside try so it's accessible in finally
    let logSubscription: { unsubscribe: () => void } | null = null;

    try {
      // Special treatment for create_system tool - normalize credentials (flatten object and convert to snake case) and handle OAuth detection
      if (toolCall.name === "create_system") {
        if (
          toolCall.input?.credentials &&
          typeof toolCall.input.credentials === "object" &&
          !Array.isArray(toolCall.input.credentials)
        ) {
          const isPlainObject = (value: any) =>
            value && typeof value === "object" && !Array.isArray(value);
          const toSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

          const normalized = Object.entries(toolCall.input.credentials).reduce<Record<string, any>>(
            (acc, [key, value]) => {
              if (isPlainObject(value)) {
                Object.entries(value).forEach(([nestedKey, nestedVal]) => {
                  acc[toSnake(nestedKey)] = nestedVal;
                });
              } else {
                acc[toSnake(key)] = value;
              }
              return acc;
            },
            {},
          );

          // if normalized object is different from the original object, log the difference
          if (JSON.stringify(normalized) !== JSON.stringify(toolCall.input.credentials)) {
            console.log(
              `[Vercel AI] create_system credentials normalized. original keys: ${Object.keys(toolCall.input.credentials).join(", ")}, normalized keys: ${Object.keys(normalized).join(", ")}`,
            );
          }

          toolCall.input = {
            ...toolCall.input,
            credentials: normalized,
          };
        }
      }

      let logUpdates: any[] = [];
      let filterTraceId: string | undefined;

      const unsubscribe = this.subscriptionClient!.subscribeLogs({
        onLog: (log: Log) => {
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
        onError: (error) => {
          console.error("Log subscription error:", error);
        },
      });
      logSubscription = { unsubscribe };

      const logCallback = (message: string) => {
        // Handle trace ID extraction for run_tool (only tool that streams logs)
        if (message.startsWith("TOOL_CALL_UPDATE:run_tool:TRACE_ID:")) {
          const extractedTraceId = message.split(":").pop();
          if (extractedTraceId) {
            filterTraceId = extractedTraceId;
          }
          return;
        }

        logUpdates.push({
          id: crypto.randomUUID(),
          message: message,
          level: "debug",
          timestamp: new Date(),
          traceId: toolCall.id,
        });
      };

      const toolCallPromise = executeAgentTool(
        toolCall.name,
        toolCall.input,
        this.superglueClient,
        this.orgId,
        logCallback,
        this.filePayloads,
        this.currentMessages,
      );

      let result: any;
      let toolCompleted = false;

      toolCallPromise
        .then((res) => {
          result = res;
          if (res.traceId) {
            filterTraceId = res.traceId;
          }
        })
        .finally(() => {
          toolCompleted = true;
        });

      // Stream logs until the tool completes
      while (!toolCompleted) {
        // Check if aborted
        if (this.abortSignal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        // Yield any pending log updates
        while (logUpdates.length > 0) {
          const logs = logUpdates.splice(0, logUpdates.length);
          yield {
            type: "tool_call_update",
            toolCall: {
              id: toolCall.id,
              name: toolCall.name,
              logs: logs, // No need to map again
            },
          };
        }

        // Small delay to prevent tight loop
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Yield any remaining log updates
      while (logUpdates.length > 0) {
        const logs = logUpdates.splice(0, logUpdates.length);
        yield {
          type: "tool_call_update",
          toolCall: {
            id: toolCall.id,
            name: toolCall.name,
            logs: logs.map((log) => ({
              id: log.id,
              message: log.message,
              level: log.level,
              timestamp: log.timestamp,
              traceId: log.traceId,
              orgId: log.orgId,
            })),
          },
        };
      }

      // Wait for the result
      result = await toolCallPromise;

      // Give a tiny bit of time for any final logs
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Yield any final log updates
      while (logUpdates.length > 0) {
        const logs = logUpdates.splice(0, logUpdates.length);
        yield {
          type: "tool_call_update",
          toolCall: {
            id: toolCall.id,
            name: toolCall.name,
            logs: logs.map((log) => ({
              id: log.id,
              message: log.message,
              level: log.level,
              timestamp: log.timestamp,
              traceId: log.traceId,
              orgId: log.orgId,
            })),
          },
        };
      }
      let toolResultAsString = typeof result === "string" ? result : JSON.stringify(result);

      try {
        const toolResultAsJSON = JSON.parse(toolResultAsString);

        if (toolResultAsString.length > MAX_TOOL_RESPONSE_LENGTH) {
          toolResultAsString = JSON.stringify(sampleResultObject(toolResultAsJSON, 10), null, 2);
        }
        if (toolResultAsString.length > MAX_TOOL_RESPONSE_LENGTH) {
          toolResultAsString = JSON.stringify(sampleResultObject(toolResultAsJSON, 5), null, 2);
        }
        if (toolResultAsString.length > MAX_TOOL_RESPONSE_LENGTH) {
          toolResultAsString = JSON.stringify(sampleResultObject(toolResultAsJSON, 3), null, 2);
        }
        if (toolResultAsString.length > MAX_TOOL_RESPONSE_LENGTH) {
          toolResultAsString = JSON.stringify(sampleResultObject(toolResultAsJSON, 1), null, 2);
        }
        if (toolResultAsString.length > MAX_TOOL_RESPONSE_LENGTH) {
          toolResultAsString =
            toolResultAsString.slice(0, MAX_TOOL_RESPONSE_LENGTH) + "\n...(truncated)";
        }
      } catch {
        // Not JSON, keep as-is
      }
      // Ensure it's always a string for the LLM
      toolResultAsString = String(toolResultAsString);

      yield {
        type: "tool_call_complete",
        toolCall: {
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          output: toolResultAsString,
        },
      };

      // Update currentMessages with this tool's output so subsequent tools in the same turn
      // can find the updated draft (e.g., run_tool finding fix_tool's output)
      this.currentMessages = [
        ...this.currentMessages,
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          role: "assistant",
          content: "",
          parts: [
            {
              id: crypto.randomUUID(),
              type: "tool",
              tool: {
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.input,
                output: result, // Use the raw result object, not the stringified version
                status: "completed",
              },
            },
          ],
        } as Message,
      ];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      yield {
        type: "tool_call_error",
        toolCall: {
          id: toolCall.id,
          name: toolCall.name,
          error: errorMsg,
        },
      };
    } finally {
      logSubscription?.unsubscribe();
    }
  }

  async *streamLLMResponse(messages: Array<Message>): AsyncGenerator<{
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
  }> {
    try {
      // Store messages for draft lookup in tool execution
      this.currentMessages = messages;

      // Queue per tool name to handle parallel calls to the same tool
      // When tool-input-start fires, we push a generated ID to the queue
      // When tool-call fires, we shift from the queue to get the matching ID
      const toolInputQueues = new Map<string, string[]>();
      // Map from Vercel's toolCallId to our generated ID for result/error lookup
      const toolCallIdMap = new Map<string, string>();

      const tools = await this.getAISDKTools();

      if (Object.keys(tools).length === 0) {
        yield {
          type: "content",
          content: "Tools are temporarily unavailable. Please try again.",
        };
        yield { type: "done" };
        return;
      }

      // Yield any preprocessed tool results (e.g., confirmed/declined tools)
      yield* this.preprocessToolResults(messages);

      const aiMessages = this.convertToAIMessages(messages);

      const basePrompt = this.toolSet === "playground" ? PLAYGROUND_SYSTEM_PROMPT : SYSTEM_PROMPT;
      const dateMessage = getDateMessage();
      const systemPrompt = `${basePrompt}\n\n${dateMessage.content}`;

      const result = streamText({
        model: this.model,
        system: systemPrompt,
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
            // Pop the first generated ID from the queue for this tool name
            const queue = toolInputQueues.get(part.toolName);
            const generatedId = queue?.shift();

            if (generatedId) {
              // We have a matching tool-input-start, map Vercel's ID to our ID
              toolCallIdMap.set(part.toolCallId, generatedId);
              // For confirmation tools (no execute), we must send the input now
              // since there won't be a tool-result event to carry it
              if (requiresConfirmationBeforeExec(part.toolName)) {
                yield {
                  type: "tool_call_start",
                  toolCall: { id: generatedId, name: part.toolName, input: part.input },
                };
              }
              // For auto-execute tools, don't yield - input comes via tool-result
            } else {
              // No tool-input-start was received, use Vercel's ID directly
              toolCallIdMap.set(part.toolCallId, part.toolCallId);
              yield {
                type: "tool_call_start",
                toolCall: { id: part.toolCallId, name: part.toolName, input: part.input },
              };
            }
            break;
          }

          case "tool-input-start": {
            // Generate a unique ID for this tool call and queue it
            const generatedId = crypto.randomUUID();
            yield {
              type: "tool_call_start",
              toolCall: { id: generatedId, name: part.toolName, input: undefined },
            };

            // Push to queue - handles multiple parallel calls to the same tool
            const queue = toolInputQueues.get(part.toolName) || [];
            queue.push(generatedId);
            toolInputQueues.set(part.toolName, queue);
            break;
          }

          case "tool-result": {
            // Look up our UI ID from the Vercel SDK's toolCallId.
            // We intentionally keep entries in the map (no delete) because:
            // - executeToolWithLogs yields multiple times (updates + complete)
            // - Each yield becomes a separate tool-result event
            // - All need the same UI ID mapping
            // - Map is small and gets GC'd when stream ends
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
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { type: "done" };
    }
  }
}
