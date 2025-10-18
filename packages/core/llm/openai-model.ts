import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { server_defaults } from "../default.js";
import { ToolDefinition } from "../execute/tools.js";
import { parseJSON } from "../utils/json-parser.js";
import { logMessage } from "../utils/logs.js";
import { addNullableToOptional } from "../utils/tools.js";
import { LLM, LLMObjectResponse, LLMResponse } from "./llm.js";

type ReasoningEffort = "minimal" | "low" | "medium" | "high";
type VerbosityLevel = "low" | "medium" | "high";

interface ResponsesParamsOptions {
  model: string;
  desiredTemperature?: number;
  desiredReasoningEffort?: ReasoningEffort;
  desiredVerbosity?: VerbosityLevel;
  hasWebSearchTool?: boolean;
  forceToolUse?: boolean;
}

interface ResponsesParamsConfig {
  temperature?: number;
  reasoning?: { effort: ReasoningEffort };
  text?: { verbosity: VerbosityLevel };
  tool_choice?: "auto" | "required";
}

export class OpenAIModel implements LLM {
  public contextLength: number = 128000;
  private client: OpenAI;
  readonly model: string;

  constructor(model: string = null) {
    this.model = model || process.env.OPENAI_MODEL || "gpt-4.1";
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL,
      timeout: server_defaults.LLM.REQUEST_TIMEOUT_MS,
      maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES,
    });
  }
  async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
    // Prepare input messages for Responses API
    const input = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content)
    }));

    // Add date context
    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    };
    input.unshift(dateMessage as any);

    try {
      // Call Responses API
      const response = await (this.client.responses.create as any)({
        model: this.model,
        input: input as any,
        store: false,  // Don't store for simple text generation
        ...this.getResponsesParamsForModel({ model: this.model, desiredTemperature: temperature })
      }) as any;

      // Extract text response
      let responseText = '';
      for (const output of response.output || []) {
        if (output.type === 'message' && output.role === 'assistant') {
          for (const content of output.content || []) {
            if (content.type === 'output_text') {
              responseText += content.text;
            }
          }
        }
      }

      if (!responseText) {
        throw new Error('No text output generated');
      }

      // Add response to messages history
      const updatedMessages = [...messages, {
        role: "assistant",
        content: responseText
      }];

      return {
        response: responseText,
        messages: updatedMessages
      } as LLMResponse;
    } catch (error) {
      logMessage('error', 'Error in OpenAI generateText with Responses API:', error);
      // Fall back to chat completions API
      const result = await this.client.chat.completions.create({
        messages: [dateMessage as ChatCompletionMessageParam, ...messages],
        model: this.model || process.env.OPENAI_MODEL || "gpt-4.1",
        ...this.getChatCompletionsParamsForModel({ model: this.model, desiredTemperature: temperature })
      } as any);

      let responseText = result.choices[0].message.content;

      const updatedMessages = [...messages, {
        role: "assistant",
        content: responseText
      }];

      return {
        response: responseText,
        messages: updatedMessages
      } as LLMResponse;
    }
  }

  private enforceStrictSchema(schema: any, isRoot: boolean) {
    if (!schema || typeof schema !== 'object') return schema;

    // wrap non-object in object with ___results key
    if (isRoot && schema.type !== 'object') {
      schema = {
        type: 'object',
        properties: {
          ___results: { ...schema }  // Create a copy of the schema
        },
        required: ['___results']
      };
    }

    if (schema.type === 'object' || schema.type === 'array') {
      schema.additionalProperties = false;
      schema.strict = true;
      if (schema.properties) {
        // Only set required for the top-level schema
        schema.required = Object.keys(schema.properties);
        delete schema.patternProperties;
        // Recursively process nested properties
        Object.values(schema.properties).forEach(prop => this.enforceStrictSchema(prop, false));
      }
      if (schema.items) {
        schema.items = this.enforceStrictSchema(schema.items, false);
        delete schema.minItems;
        delete schema.maxItems;
      }
    }

    return schema;
  };

  private async processToolCall(
    toolCallData: any,
    tools: any[],
    conversationMessages: any[],
    context?: any
  ): Promise<{ finalResult: any; shouldBreak: boolean }> {
    const name = toolCallData.name || toolCallData.function?.name;
    const callId = toolCallData.call_id || toolCallData.id;
    const args = toolCallData.arguments || toolCallData.function?.arguments;

    if (name === "submit") {
      let finalResult = typeof args === "string" ? parseJSON(args) : args;
      if (finalResult.___results) {
        finalResult = finalResult.___results;
      }
      conversationMessages.push({
        type: "function_call_output",
        call_id: callId,
        output: "Done"
      });
      return { finalResult, shouldBreak: true };
    } else if (name === "abort") {
      let error = typeof args === "string" ? parseJSON(args) : args;
      return { finalResult: { "error": error?.reason || "Unknown error" }, shouldBreak: true };
    } else {
      const tool = tools.find(t => t.name === name);
      if (tool && tool.execute) {
        const toolResult = await tool.execute(typeof args === "string" ? parseJSON(args) : args, context);
        conversationMessages.push({
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(toolResult || {})
        });
      }
      return { finalResult: null, shouldBreak: false };
    }
  }

  async generateObject(messages: ChatCompletionMessageParam[], schema: any, temperature: number = 0, customTools?: ToolDefinition[], context?: any): Promise<LLMObjectResponse> {
    // Prepare the schema
    schema = addNullableToOptional(schema);
    schema = this.enforceStrictSchema(schema, true);

    // o models don't support temperature
    if (process.env.OPENAI_MODEL?.startsWith('o')) {
      temperature = undefined;
    }

    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    } as ChatCompletionMessageParam;

    // Create the tools configuration for Responses API
    const tools = [
      {
        type: "function" as const,
        name: "submit",
        description: "Submit the final result in the required format. Submit the result even if it's an error and keep submitting until we stop. Keep non-function messages short and concise because they are only for debugging.",
        parameters: schema
      },
      {
        type: "function" as const,
        name: "abort",
        description: "There is absolutely no way given the input to complete the request successfully, abort the request",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "The reason for aborting" }
          },
          required: ["reason"]
        }
      },
      {
        type: "web_search" as const
      },
      ...(customTools?.map(t => ({
        type: "function" as const,
        name: t.name,
        description: t.description,
        parameters: t.arguments,
        execute: t.execute
      })) || [])
    ];

    try {
      let finalResult = null;
      let conversationMessages: any = String(messages[0]?.content)?.startsWith("The current date and time is") ?
        messages : [dateMessage, ...messages];

      while (finalResult === null) {
        const requestParams: any = {
          model: this.model || process.env.OPENAI_MODEL || "gpt-4.1",
          tools: tools,
          input: conversationMessages,
          ...this.getResponsesParamsForModel({
            model: this.model,
            desiredTemperature: temperature,
            hasWebSearchTool: true,
            forceToolUse: true
          })
        };

        const response = await (this.client.responses.create as any)(requestParams);

        const output = response.output || [];

        for (const item of output) {
          conversationMessages.push(item);

          if (item?.type === "function_call") {
            const { finalResult: result, shouldBreak } = await this.processToolCall(
              item,
              tools,
              conversationMessages,
              context
            );
            if (shouldBreak) {
              finalResult = result;
              break;
            }
          }

          if (item?.type === "message") {
            for (const toolCall of item?.tool_calls || []) {
              const { finalResult: result, shouldBreak } = await this.processToolCall(
                toolCall,
                tools,
                conversationMessages,
                context
              );
              if (shouldBreak) {
                finalResult = result;
                break;
              }
            }
            if (finalResult) break;
          }
        }

        if (!finalResult && output.length === 0) {
          throw new Error("No output received from the model");
        }
      }

      const updatedMessages = [...conversationMessages, {
        role: "assistant",
        content: JSON.stringify(finalResult)
      }];

      return {
        response: finalResult,
        messages: updatedMessages
      } as LLMObjectResponse;

    } catch (error) {
      logMessage('error', 'Error in OpenAI generateObject with Responses API:', error);
      const updatedMessages = [...messages, {
        role: "assistant",
        content: "Error: OpenAI API Error: " + error.message
      }];

      return {
        response: "Error: OpenAI API Error: " + error.message,
        messages: updatedMessages
      } as LLMObjectResponse;
    }
  }

  private getResponsesParamsForModel(options: ResponsesParamsOptions): ResponsesParamsConfig {
    const model = String(options.model || "").toLowerCase();
    const isGpt5 = model.startsWith("gpt-5");
    const isOModel = model.startsWith("o");

    const params: ResponsesParamsConfig = {};

    if (!isGpt5 && !isOModel) {
      params.temperature = options.desiredTemperature;
    } else if (isOModel) {
      // Explicitly set temperature to undefined for o-models
      params.temperature = undefined;
    }

    if (isGpt5) {
      // Reasoning effort: default to low, upgrade minimal to low if web_search is present
      let effort: ReasoningEffort = options.desiredReasoningEffort || "low";
      if (options.hasWebSearchTool && effort === "minimal") {
        effort = "low"; // web_search doesn't work with minimal
      }
      params.reasoning = { effort };
      params.text = { verbosity: options.desiredVerbosity || "low" };
      params.tool_choice = "auto"; // GPT-5 requires auto when web_search is present
    } else if (options.forceToolUse && !isOModel) {
      params.tool_choice = "required";
    }

    return params;
  }

  private getChatCompletionsParamsForModel(options: ResponsesParamsOptions): Record<string, any> {
    const model = String(options.model || "").toLowerCase();
    const isGpt5 = model.startsWith("gpt-5");
    const isOModel = model.startsWith("o");

    const params: Record<string, any> = {};

    if (!isGpt5 && !isOModel) {
      params.temperature = options.desiredTemperature;
    }

    if (isGpt5) {
      let effort: ReasoningEffort = options.desiredReasoningEffort || "low";
      if (options.hasWebSearchTool && effort === "minimal") {
        effort = "low";
      }
      params.reasoning_effort = effort;
      params.verbosity = options.desiredVerbosity || "low";
    }

    return params;
  }
}