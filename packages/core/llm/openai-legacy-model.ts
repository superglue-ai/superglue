import OpenAI, { AzureOpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { server_defaults } from "../default.js";
import { ToolDefinition } from "../tools/tools.js";
import { parseJSON } from "../utils/json-parser.js";
import { logMessage } from "../utils/logs.js";
import { addNullableToOptional } from "../utils/tools.js";
import { LLM, LLMObjectResponse, LLMResponse } from "./llm.js";

export class OpenAILegacyModel implements LLM {
    public contextLength: number = 128000;
    private client: OpenAI | AzureOpenAI;
    readonly model: string;
    private isAzure: boolean;

    constructor(model: string = null) {
        this.model = model || process.env.OPENAI_MODEL || "gpt-4.1";
        const baseURL = process.env.OPENAI_BASE_URL;
        const apiVersion = process.env.OPENAI_API_VERSION;

        this.isAzure = !!(baseURL && apiVersion);

        if (this.isAzure) {
            this.client = new AzureOpenAI({
                apiKey: process.env.OPENAI_API_KEY || "",
                endpoint: baseURL,
                apiVersion: apiVersion,
                deployment: this.model,
                timeout: server_defaults.LLM.REQUEST_TIMEOUT_MS,
                maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES,
            });
        } else {
            this.client = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY || "",
                baseURL: baseURL,
                timeout: server_defaults.LLM.REQUEST_TIMEOUT_MS,
                maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES,
            });
        }
    }

    async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
        const dateMessage = {
            role: "system",
            content: "The current date and time is " + new Date().toISOString()
        };

        const requestParams: any = {
            messages: [dateMessage as ChatCompletionMessageParam, ...messages],
            temperature,
        };

        if (!this.isAzure) {
            requestParams.model = this.model;
        }

        const result = await this.client.chat.completions.create(requestParams);

        const responseText = result.choices[0].message.content;

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
    }

    private async processToolCall(
        toolCall: any,
        tools: any[],
        conversationMessages: any[],
        context?: any
    ): Promise<{ finalResult: any; shouldBreak: boolean }> {
        const name = toolCall.function?.name;
        const callId = toolCall.id;
        const args = toolCall.function?.arguments;

        if (name === "submit") {
            let finalResult = typeof args === "string" ? parseJSON(args) : args;
            if (finalResult.___results) {
                finalResult = finalResult.___results;
            }
            conversationMessages.push({
                role: "tool",
                tool_call_id: callId,
                content: "Done"
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
                    role: "tool",
                    tool_call_id: callId,
                    content: JSON.stringify(toolResult || {})
                });
            }
            return { finalResult: null, shouldBreak: false };
        }
    }

    async generateObject(messages: ChatCompletionMessageParam[], schema: any, temperature: number = 0, customTools?: ToolDefinition[], context?: any): Promise<LLMObjectResponse> {
        schema = addNullableToOptional(schema);
        const hasCustomTools = customTools && customTools.length > 0;
        if (!hasCustomTools) {
            schema = this.enforceStrictSchema(schema, true);
        }

        const dateMessage = {
            role: "system",
            content: "The current date and time is " + new Date().toISOString()
        } as ChatCompletionMessageParam;

        const tools = [
            {
                type: "function" as const,
                function: {
                    name: "submit",
                    description: "Submit the final result in the required format. Submit the result even if it's an error and keep submitting until we stop. Keep non-function messages short and concise because they are only for debugging.",
                    parameters: schema,
                    strict: !hasCustomTools
                }
            },
            {
                type: "function" as const,
                function: {
                    name: "abort",
                    description: "ONLY call this if the request is technically impossible due API limitations or missing information that is critical to the request.",
                    parameters: {
                        type: "object",
                        properties: {
                            reason: { type: "string", description: "The critical technical error" }
                        },
                        required: ["reason"],
                        additionalProperties: false,
                        strict: !hasCustomTools
                    }
                }
            },
            ...(customTools?.map(t => ({
                type: "function" as const,
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.arguments
                },
                execute: t.execute
            })) || [])
        ];

        try {
            let finalResult = null;
            let conversationMessages: ChatCompletionMessageParam[] = String(messages[0]?.content)?.startsWith("The current date and time is") ?
                messages : [dateMessage, ...messages];

            while (finalResult === null) {
                const requestParams: any = {
                    messages: conversationMessages,
                    tools: tools.map(t => ({ type: t.type, function: t.function })),
                    tool_choice: "auto",
                    temperature
                };

                if (!this.isAzure) {
                    requestParams.model = this.model;
                }

                const response = await this.client.chat.completions.create(requestParams);

                const choice = response.choices[0];
                const message = choice.message;

                const assistantMessage: ChatCompletionMessageParam = {
                    role: "assistant",
                    content: message.content
                };

                if (message.tool_calls && message.tool_calls.length > 0) {
                    assistantMessage.tool_calls = message.tool_calls;
                }

                conversationMessages.push(assistantMessage);

                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
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
                }

                if (!finalResult && !message.tool_calls) {
                    throw new Error("No tool calls received from the model");
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
            logMessage('error', 'Error in OpenAI Legacy generateObject:', error);
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
}
