import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { getModelContextLength, initializeAIModel } from "@superglue/shared/utils";
import { AssistantModelMessage, TextPart, ToolCallPart, ToolResultPart, generateText, jsonSchema, tool } from "ai";
import { Validator } from "jsonschema";
import { server_defaults } from "../default.js";
import { ToolDefinition } from "../execute/tools.js";
import { logMessage } from "../utils/logs.js";
import { LLM, LLMMessage, LLMObjectResponse, LLMResponse } from "./language-model.js";

export class AiSdkModel implements LLM {
  public contextLength: number;
  private model: any;
  private modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId || 'claude-sonnet-4-5';
    this.model = initializeAIModel({
      providerEnvVar: 'LLM_PROVIDER',
      defaultModel: this.modelId
    });
    this.contextLength = getModelContextLength(this.modelId);
  }

  private getDateMessage(): LLMMessage {
    return {
      role: "system" as const,
      content: "The current date and time is " + new Date().toISOString()
    } as LLMMessage;
  }

  private buildTools(
    schemaObj: any,
    customTools?: ToolDefinition[],
    toolContext?: any
  ): Record<string, any> {
    const tools: Record<string, any> = {
      submit: tool({
        description: "Submit the final result in the required format. Submit the result even if it's an error and keep submitting until we stop. Keep non-function messages short and concise because they are only for debugging.",
        inputSchema: schemaObj,
      }),
      abort: tool({
        description: "There is absolutely no way given the input to complete the request successfully, abort the request",
        inputSchema: jsonSchema({
          type: "object",
          properties: {
            reason: { type: "string", description: "The reason for aborting" }
          },
          required: ["reason"]
        }),
      }),
    };

    const provider = process.env.LLM_PROVIDER?.toLowerCase();
    switch (provider) {
      case 'openai':
        tools["web_search"] = openai.tools.webSearch();
        break;
      case 'anthropic':
        tools["web_search"] = anthropic.tools.webSearch_20250305({
          maxUses: 5,
        });
        break;
      case 'gemini':
        tools["web_search"] = google.tools.googleSearch({});
        break;
      default:
        break;
    }

    if (customTools && customTools.length > 0) {
      for (const customTool of customTools) {
        tools[customTool.name] = tool({
          description: customTool.description,
          inputSchema: jsonSchema(customTool.arguments),
          execute: customTool.execute ? async (args) => {
            return await customTool.execute!(args, toolContext);
          } : undefined,
        });
      }
    }

    return tools;
  }

  private cleanSchema(schema: any, isRoot: boolean = true): any {
    if (!schema || typeof schema !== 'object') return schema;

    const cleaned = { ...schema };

    // Normalize object/array schemas
    if (cleaned.type === 'object' || cleaned.type === 'array') {
      cleaned.additionalProperties = false;
      cleaned.strict = true;

      delete cleaned.patternProperties;

      if (cleaned.properties) {
        for (const key in cleaned.properties) {
          cleaned.properties[key] = this.cleanSchema(cleaned.properties[key], false);
        }
      }

      if (cleaned.items) {
        cleaned.items = this.cleanSchema(cleaned.items, false);
        delete cleaned.minItems;
        delete cleaned.maxItems;
      }
    }

    // Anthropic tool input must be an object at the root. If the root
    // schema is an array, wrap it into an object under `result`.
    if (isRoot && cleaned.type === 'array') {
      const arraySchema = this.cleanSchema(cleaned, false);
      return {
        type: 'object',
        properties: {
          result: arraySchema,
        },
        required: ['result'],
        additionalProperties: false,
        strict: true,
      };
    }

    return cleaned;
  }

  async generateText(messages: LLMMessage[], temperature: number = 0): Promise<LLMResponse> {
    const dateMessage = this.getDateMessage();
    messages = [dateMessage, ...messages] as LLMMessage[];

    const result = await generateText({
      model: this.model,
      messages: messages,
      temperature,
      maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES,
    });

    const updatedMessages = [...messages, {
      role: "assistant" as const,
      content: result.text
    } as LLMMessage];

    return {
      response: result.text,
      messages: updatedMessages
    };
  }

  /**
   This function is used to generate an object response from the language model.
   This is done by calling the generateText function together with a submit tool that has the input schema of our desired output object.
   We set the tool choice to required so that the LLM is forced to call a tool.
   When the LLM returns, we check for the submit tool call and return the result.
   If the LLM does not return a submit tool call, we try again.
   */
  async generateObject(
    messages: LLMMessage[],
    schema: any,
    temperature: number = 0,
    customTools?: ToolDefinition[],
    toolContext?: any,
    toolChoice?: 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string }
  ): Promise<LLMObjectResponse> {
    const dateMessage = this.getDateMessage();

    // Clean schema: remove patternProperties, minItems/maxItems, set strict/additionalProperties
    schema = this.cleanSchema(schema);

    // Handle O-model temperature
    let temperatureToUse: number | undefined = temperature;
    if (this.modelId.startsWith('o')) {
      temperatureToUse = undefined;
    }

    const schemaObj = jsonSchema(schema);
    const tools = this.buildTools(schemaObj, customTools, toolContext);

    let conversationMessages: LLMMessage[] = String(messages[0]?.content)?.startsWith("The current date and time is")
      ? messages
      : [dateMessage, ...messages];

    try {
      let finalResult: any = null;

      while (finalResult === null) {

        const result = await generateText({
          model: this.model,
          messages: conversationMessages,
          tools,
          toolChoice: toolChoice || 'required',
          temperature: temperatureToUse,
          maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES,
        });

        // Check for submit/abort in tool calls
        for (const toolCall of result.toolCalls) {
          if (toolCall.toolName === 'submit') {
            finalResult = (toolCall.input as any)?.result ?? toolCall.input;
            break;
          }
          if (toolCall.toolName === 'abort') {
            finalResult = { error: (toolCall.input as any)?.reason || "Unknown error" };
            break;
          }
        }

        if (result.text.trim().length > 0) {
          conversationMessages.push({
            role: "assistant" as const,
            content: [{ type: "text", text: result.text } as TextPart],
          } as LLMMessage);
        }

        for (const toolCall of result.toolCalls) {
          // if we can find the tool id in the toolResults
          conversationMessages.push({
            role: 'assistant', content: [{
              type: 'tool-call',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.input ?? {}
            } as ToolCallPart]
          } as AssistantModelMessage);
          const toolResult = result.toolResults.find(tr => tr.toolCallId === toolCall.toolCallId);
          if (toolResult) {
            conversationMessages.push({
              role: 'tool', content: [{
                type: 'tool-result',
                toolCallId: toolResult.toolCallId,
                toolName: toolResult.toolName,
                output: { "type": "text", "value": toolResult.output?.toString() ?? "" }
              } as ToolResultPart]
            });
          } else {
            conversationMessages.push({
              role: 'tool', content: [{
                type: 'tool-result',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                output: { "type": "text", "value": "Tool did not output anything" }
              } as ToolResultPart]
            });
          }
        }

        if (!finalResult && result.toolCalls.length === 0) {
          throw new Error("No tool calls received from the model");
        }
      }

      const updatedMessages = [...conversationMessages, {
        role: "assistant" as const,
        content: JSON.stringify(finalResult)
      }];

      if (finalResult) {
        try {
          const validator = new Validator();
          const validation = validator.validate(finalResult, schema);
          if (!validation.valid) {
            throw new Error(`Generated result does not match schema ${validation.errors.map(e => e.stack).join(', ')}`);
          }
        } catch (validationError) {
          throw new Error(`Schema validation error: ${validationError.message} for result: ${JSON.stringify(finalResult)}`);
        }
      }

      return {
        response: finalResult,
        messages: updatedMessages
      };
    } catch (error) {
      logMessage('error', `Error in Vercel AI generateObject: ${error}`, { orgId: 'ai-sdk' });
      const updatedMessages = [...messages, {
        role: "assistant" as const,
        content: "Error: Vercel AI API Error: " + (error as any)?.message
      } as LLMMessage];

      return {
        response: null,
        error: "Error: Vercel AI API Error: " + error.message,
        messages: updatedMessages
      };
    }
  }
}

