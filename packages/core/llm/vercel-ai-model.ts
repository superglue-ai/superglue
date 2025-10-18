import { generateText, generateObject, jsonSchema } from "ai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { initializeAIModel, getModelContextLength } from "@superglue/shared/utils";
import { server_defaults } from "../default.js";
import { ToolDefinition } from "../tools/tools.js";
import { LLM, LLMObjectResponse, LLMResponse } from "./llm.js";
import { logMessage } from "../utils/logs.js";

type MessageParam = 
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "tool"; content: Array<{ type: "tool-result"; toolCallId: string; toolName: string; result: unknown }> };

export class VercelAIModel implements LLM {
  public contextLength: number;
  private model: any;
  private modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId || this.getConfiguredModelId() || 'gpt-4.1';
    this.model = initializeAIModel({
      providerEnvVar: 'LLM_PROVIDER',
      defaultModel: this.modelId
    });
    this.contextLength = getModelContextLength(this.modelId);
  }

  private getConfiguredModelId(): string | undefined {
    const provider = process.env.LLM_PROVIDER?.toUpperCase();
    switch (provider) {
      case 'ANTHROPIC':
        return process.env.ANTHROPIC_MODEL;
      case 'OPENAI':
      case 'OPENAI_LEGACY':
        return process.env.OPENAI_MODEL;
      case 'GEMINI':
        return process.env.GEMINI_MODEL;
      case 'AZURE':
        return process.env.AZURE_MODEL;
      default:
        return undefined;
    }
  }

  private convertMessages(messages: ChatCompletionMessageParam[]): MessageParam[] {
    return messages.map(msg => {
      if (msg.role === "system" || msg.role === "user" || msg.role === "assistant") {
        return {
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : String(msg.content)
        };
      }
      return msg as unknown as MessageParam;
    });
  }

  async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
    const dateMessage = {
      role: "system" as const,
      content: "The current date and time is " + new Date().toISOString()
    };

    const convertedMessages = this.convertMessages([dateMessage, ...messages]);

    try {
      const result = await generateText({
        model: this.model,
        messages: convertedMessages as any,
        temperature,
        maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES,
      });

      const updatedMessages = [...messages, {
        role: "assistant" as const,
        content: result.text
      }];

      return {
        response: result.text,
        messages: updatedMessages
      };
    } catch (error) {
      logMessage('error', 'Error in Vercel AI generateText:', error);
      throw error;
    }
  }

  async generateObject(
    messages: ChatCompletionMessageParam[],
    schema: any,
    temperature: number = 0,
    customTools?: ToolDefinition[],
    context?: any
  ): Promise<LLMObjectResponse> {
    const dateMessage = {
      role: "system" as const,
      content: "The current date and time is " + new Date().toISOString()
    };

    const convertedMessages = this.convertMessages(
      String(messages[0]?.content)?.startsWith("The current date and time is") ? messages : [dateMessage, ...messages]
    );

    if (customTools && customTools.length > 0) {
      logMessage('warn', 'VercelAIModel does not support custom tools with generateObject. Tools will be ignored.');
    }

    try {
      const schemaObj = jsonSchema(schema);

      const result = await generateObject({
        model: this.model,
        messages: convertedMessages as any,
        schema: schemaObj,
        temperature,
        maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES,
      });

      const updatedMessages = [...messages, {
        role: "assistant" as const,
        content: JSON.stringify(result.object)
      }];

      return {
        response: result.object,
        messages: updatedMessages
      };
    } catch (error) {
      logMessage('error', 'Error in Vercel AI generateObject:', error);
      const updatedMessages = [...messages, {
        role: "assistant" as const,
        content: "Error: Vercel AI API Error: " + error.message
      }];

      return {
        response: "Error: Vercel AI API Error: " + error.message,
        messages: updatedMessages
      };
    }
  }
}

