import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { ToolDefinition } from "../tools/tools.js";
import { addNullableToOptional } from "../utils/tools.js";
import { LLM, LLMObjectResponse, LLMResponse } from "./llm.js";


export class OpenAIModel implements LLM {
  public contextLength: number = 128000;
  private client: OpenAI;
  readonly model: string;

  constructor(model: string = null) {
    this.model = model || process.env.OPENAI_MODEL || "gpt-4.1";
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }

  private isGpt5(): boolean {
    return String(this.model).toLowerCase().includes("gpt-5");
  }

  private supportsTemperature(): boolean {
    if (this.isGpt5()) return false;
    return !String(this.model).toLowerCase().startsWith("o");
  }

  async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
    const input = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content)
    }));

    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    };
    input.unshift(dateMessage as any);

    try {
      const request: any = {
        model: this.model,
        input: input as any,
        store: false
      };

      if (this.supportsTemperature()) {
        request.temperature = temperature;
      }

      if (this.isGpt5()) {
        request.reasoning = { effort: "low" };
        request.verbosity = "low";
      }

      const response = await (this.client.responses.create as any)(request) as any;

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

      const updatedMessages = [...messages, {
        role: "assistant",
        content: responseText
      }];

      return {
        response: responseText,
        messages: updatedMessages
      } as LLMResponse;
    } catch (error) {
      const result = await this.client.chat.completions.create({
        messages: [dateMessage as ChatCompletionMessageParam, ...messages],
        model: this.model || "gpt-4.1",
        temperature: this.supportsTemperature() ? temperature : undefined
      });

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

    if (isRoot && schema.type !== 'object') {
      schema = {
        type: 'object',
        properties: {
          ___results: { ...schema }
        },
        required: ['___results']
      };
    }

    if (schema.type === 'object' || schema.type === 'array') {
      schema.additionalProperties = false;
      schema.strict = true;
      if (schema.properties) {
        schema.required = Object.keys(schema.properties);
        delete schema.patternProperties;
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
      let finalResult = typeof args === "string" ? JSON.parse(args) : args;
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
      let error = typeof args === "string" ? JSON.parse(args) : args;
      return { finalResult: { "error": error?.reason || "Unknown error" }, shouldBreak: true };
    } else {
      const tool = tools.find(t => t.name === name);
      if (tool && tool.execute) {
        const toolResult = await tool.execute(typeof args === "string" ? JSON.parse(args) : args, context);
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
    schema = addNullableToOptional(schema);
    schema = this.enforceStrictSchema(schema, true);

    if (!this.supportsTemperature()) {
      temperature = undefined as any;
    }

    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    } as ChatCompletionMessageParam;

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
          model: this.model || "gpt-4.1",
          tools: tools,
          tool_choice: "required",
          temperature: this.supportsTemperature() ? temperature : undefined
        };

        if (this.isGpt5()) {
          requestParams.reasoning = { effort: "low" };
          requestParams.verbosity = "low";
        }

        requestParams.input = conversationMessages;
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

    } catch (error: any) {
      const updatedMessages = [...messages, {
        role: "assistant",
        content: "Error: " + error.message
      }];

      return {
        response: "Error: " + error.message,
        messages: updatedMessages
      } as LLMObjectResponse;
    }
  }
}