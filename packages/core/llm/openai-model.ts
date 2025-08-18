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
      timeout: 60000,
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
        temperature: process.env.OPENAI_MODEL?.startsWith('o') ? undefined : temperature,
        store: false  // Don't store for simple text generation
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
      console.error('Error in generateText with Responses API:', error);
      // Fall back to chat completions API
      const result = await this.client.chat.completions.create({
        messages: [dateMessage as ChatCompletionMessageParam, ...messages],
        model: process.env.OPENAI_MODEL || "gpt-4.1",
        temperature: process.env.OPENAI_MODEL?.startsWith('o') ? undefined : temperature
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
      // Use the Responses API with multi-turn support
      let finalResult = null;
      // if the first message is the date message, don't add it again
      let conversationMessages: any = String(messages[0]?.content)?.startsWith("The current date and time is") ? 
        messages : [dateMessage, ...messages];

      // Continue until the model calls submit
      while (finalResult === null) {
        const requestParams: any = {
          model: process.env.OPENAI_MODEL || "gpt-4.1",
          tools: tools,
          temperature: temperature,
          tool_choice: "required"
        };

        requestParams.input = conversationMessages;
        const response = await (this.client.responses.create as any)(requestParams);

        // Extract the result from the response
        const output = response.output || [];

        for (const item of output) {
          conversationMessages.push(item);
          
          // Check for direct function calls
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
          
          // Check for tool calls within messages
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

        // Add a safety check to prevent infinite loops
        // If we've made too many attempts, throw an error
        if (!finalResult && output.length === 0) {
          throw new Error("No output received from the model");
        }
      }

      // Convert back to messages format for compatibility
      const updatedMessages = [...conversationMessages, {
        role: "assistant",
        content: JSON.stringify(finalResult)
      }];

      return {
        response: finalResult,
        messages: updatedMessages
      } as LLMObjectResponse;

    } catch (error) {
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