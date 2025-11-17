import { getModelContextLength, initializeAIModel } from "@superglue/shared/utils";
import { AssistantModelMessage, TextPart, ToolCallPart, ToolResultPart, Tool, generateText, jsonSchema, tool } from "ai";
import { server_defaults } from "../default.js";
import { LLMToolDefinition } from "./llm-tool-utils.js";
import { logMessage } from "../utils/logs.js";
import { LLM, LLMMessage, LLMObjectGeneratorInput, LLMObjectResponse, LLMResponse } from "./llm-base-model.js";

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
    tools?: (LLMToolDefinition | Record<string, Tool>)[],
    toolContext?: any
  ): Record<string, Tool> {
    const defaultTools: Record<string, Tool> = {
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

    if (tools && tools.length > 0) {
      for (const item of tools) {
        
        const isCustomTool = item.name && item.arguments && item.description;
        
        if (isCustomTool) {
          const toolDef = item as LLMToolDefinition;
          defaultTools[toolDef.name] = tool({
            description: toolDef.description,
            inputSchema: jsonSchema(toolDef.arguments),
            execute: toolDef.execute ? async (args) => {
              return await toolDef.execute!(args, toolContext);
            } : undefined,
          });
        } else {
          Object.assign(defaultTools, item);
        }
      }
    }

    return defaultTools;
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
  async generateObject<T>(
    input: LLMObjectGeneratorInput
  ): Promise<LLMObjectResponse<T>> {
    const dateMessage = this.getDateMessage();
    
    // Clean schema: remove patternProperties, minItems/maxItems, set strict/additionalProperties
    const schema = this.cleanSchema(input.schema);

    // Handle O-model temperature
    let temperatureToUse: number | undefined = input.temperature;
    if (this.modelId.startsWith('o')) {
      temperatureToUse = undefined;
    }

    const schemaObj = jsonSchema(schema);
    const availableTools = this.buildTools(schemaObj, input.tools, input.toolContext);

    let conversationMessages: LLMMessage[] = String(input.messages[0]?.content)?.startsWith("The current date and time is")
      ? input.messages
      : [dateMessage, ...input.messages];

    try {
      let finalResult: any = null;
      while (finalResult === null) {

        const result = await generateText({
          model: this.model,
          messages: conversationMessages,
          tools: availableTools,
          toolChoice: input.toolChoice || 'required',
          temperature: temperatureToUse,
          maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES,
        });

        if(result.finishReason === 'error' || result.finishReason === 'content-filter' || result.finishReason === 'other') {
          throw new Error("Error generating LLM response: " + JSON.stringify(result.content || "no content"));
        }

        // Check for submit/abort in tool calls
        for (const toolCall of result.toolCalls) {
          if (toolCall.toolName === 'submit') {
            finalResult = (toolCall.input as any)?.result ?? toolCall.input;
            break;
          }
          if (toolCall.toolName === 'abort') {

            const updatedMessages = [...conversationMessages, {
              role: "assistant" as const,
              content: JSON.stringify(finalResult)
            }];

            return {
              success: false,
              response: (toolCall.input as any)?.reason,
              messages: updatedMessages
            };
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

      return {
        success: true,
        response: finalResult,
        messages: updatedMessages
      };
    } catch (error) {
      logMessage('error', `Error generating LLM response: ${error}`, { orgId: 'ai-sdk' });
      const updatedMessages = [...input.messages, {
        role: "assistant" as const,
        content: "Error: Vercel AI API Error: " + (error as any)?.message
      } as LLMMessage];

      return {
        success: false,
        response: "Error: Vercel AI API Error: " + (error as Error).message,
        messages: updatedMessages
      };
    }
  }
}