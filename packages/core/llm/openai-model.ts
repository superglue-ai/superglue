import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { addNullableToOptional } from "../utils/tools.js";
import { LLM, LLMObjectResponse, LLMResponse } from "./llm.js";


export class OpenAIModel implements LLM {
  public contextLength: number = 128000;
  private model: OpenAI;

  /**
   * Internet search is available in generateObject() method using OpenAI's Responses API.
   * 
   * The Responses API allows web search with any OpenAI model (gpt-4o, gpt-4o-mini, etc),
   * not just the search-preview models.
   * 
   * When the Responses API is available, the model has access to web_search as a tool
   * and can search for information before generating the final result.
   * 
   * If the Responses API is not available (e.g., in older SDK versions), the method
   * will fall back to the Chat Completions API without web search.
   * 
   * Note: The Responses API is a newer API that may require an updated OpenAI SDK version.
   */
  constructor() {
    this.model = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }
  async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
    // o models don't support temperature
    if (process.env.OPENAI_MODEL?.startsWith('o')) {
      temperature = undefined;
    }
    const dateMessage = {
      role: "system",
      content: "The current date and time is " + new Date().toISOString()
    } as ChatCompletionMessageParam;

    const result = await this.model.chat.completions.create({
      messages: [dateMessage, ...messages],
      model: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: temperature
    });
    let responseText = result.choices[0].message.content;

    // Add response to messages history
    const updatedMessages = [...messages, {
      role: "assistant",
      content: responseText
    }];

    return {
      response: responseText,
      messages: updatedMessages
    } as LLMResponse;
  }

  private enforceStrictSchema(schema: any, isRoot: boolean) {
    if (!schema || typeof schema !== 'object') return schema;

    // wrap non-object in object with ___results key
    if (isRoot && schema.type !== 'object') {
      schema = {
        type: 'object',
        properties: {
          ___results: schema,
        },
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

  async generateObject(messages: ChatCompletionMessageParam[], schema: any, temperature: number = 0, customTools?: any[]): Promise<LLMObjectResponse> {
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
        description: "Submit the final result in the required format",
        parameters: schema
      },
      {
        type: "web_search" as const
      },
      // Add custom tools if provided
      ...(customTools || [])
    ];

    try {
      // Use the Responses API with multi-turn support
      let finalResult = null;
      let conversationMessages: any = [dateMessage, ...messages];

      // Continue until the model calls submit
      while (finalResult === null) {
        const requestParams: any = {
          model: process.env.OPENAI_MODEL || "gpt-4o",
          tools: tools,
          temperature: temperature
        };

        requestParams.input = conversationMessages;
        const response = await (this.model as any).responses.create(requestParams);

        // Extract the result from the response
        const output = response.output || [];

        for (const item of output) {
          // Check for direct function calls
          conversationMessages.push(item);
          if (item?.type === "function_call" && item?.name === "submit") {
            const args = item.arguments;
            finalResult = typeof args === "string" ? JSON.parse(args) : args;
            if (finalResult.___results) {
              finalResult = finalResult.___results;
            }
            conversationMessages.push({
              type: "function_call_output",
              call_id: item.call_id || item.id,
              output: "Done"
            });
            break;
          }
          else if (item?.type === "function_call") {
            const tool = tools.find(tool => tool.name === item.name);
            if (tool) {
              const toolResult = await tool.execute(item.arguments);
              conversationMessages.push({
                type: "function_call_output",
                call_id: item.call_id || item.id,
                output: JSON.stringify(toolResult || {})
              });
            }
          }
          // Also check for tool calls within messages
          if (item?.type === "message") {
            for (const toolCall of item?.tool_calls || []) {
              if (toolCall?.function?.name === "submit" || toolCall?.name === "submit") {
                const args = toolCall.function?.arguments || toolCall.arguments;
                finalResult = typeof args === "string" ? JSON.parse(args) : args;
                if (finalResult.___results) {
                  finalResult = finalResult.___results;
                }
                conversationMessages.push({
                  type: "function_call_output",
                  call_id: toolCall.call_id || toolCall.id,
                  output: "Done"
                });
                break;
              }
              else {
                const tool = tools.find(tool => tool.name === item.name);
                const toolResult = await tool?.execute(item.arguments);
                conversationMessages.push({
                  type: "function_call_output",
                  call_id: toolCall.call_id || toolCall.id,
                  output: JSON.stringify(toolResult || {})
                });
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

