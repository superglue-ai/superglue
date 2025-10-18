// import OpenAI, { AzureOpenAI } from "openai";
// import { server_defaults } from "../default.js";
// import type { ToolDefinition } from "../tools/tools.js";
// import { parseJSON } from "../utils/json-parser.js";
// import { logMessage } from "../utils/logs.js";
// import { addNullableToOptional } from "../utils/tools.js";
// import type { LLM, LLMMessage, LLMObjectResponse, LLMResponse } from "./llm.js";

// export class OpenAILegacyModel implements LLM {
//     public contextLength: number = 128000;
//     private client: OpenAI | AzureOpenAI;
//     readonly model: string;
//     private isAzure: boolean;

//     constructor(model: string | null = null) {
//         this.model = model || process.env.OPENAI_MODEL || "gpt-4.1";
//         const baseURL = process.env.OPENAI_BASE_URL;
//         const apiKey = process.env.OPENAI_API_KEY || "";
//         this.isAzure = !!(baseURL && baseURL.includes(".azure.com"));
//         const apiVersion = process.env.OPENAI_API_VERSION || (this.isAzure ? "2025-01-01-preview" : undefined);

//         if (this.isAzure) {

//             try {

//                 const savedBaseUrl = process.env.OPENAI_BASE_URL;
//                 process.env.AZURE_OPENAI_ENDPOINT = baseURL!;
//                 delete process.env.OPENAI_BASE_URL;

//                 this.client = new AzureOpenAI({
//                     apiKey,
//                     apiVersion: apiVersion!,
//                     deployment: this.model,
//                     //httpAgent: new SocksProxyAgent("socks://localhost:1080")
//                 });

//                 if (savedBaseUrl) process.env.OPENAI_BASE_URL = savedBaseUrl; else delete process.env.OPENAI_BASE_URL;
//             } catch (error: any) {
//                 logMessage("error", `✗ Failed to create Azure client: ${error.message}`);
//                 throw error;
//             }
//         } else {
//             this.client = new OpenAI({
//                 apiKey,
//                 baseURL: baseURL || undefined,
//                 timeout: server_defaults.LLM.REQUEST_TIMEOUT_MS,
//                 maxRetries: server_defaults.LLM.MAX_INTERNAL_RETRIES
//             });
//         }

//     }

//     async generateText(messages: LLMMessage[], temperature: number = 0): Promise<LLMResponse> {
//         const dateMessage: LLMMessage = {
//             role: "system",
//             content: "The current date and time is " + new Date().toISOString()
//         };

//         const requestParams: any = {
//             messages: [dateMessage, ...messages],
//             temperature
//         };

//         if (!this.isAzure) {
//             requestParams.model = this.model;
//         }

//         try {
//             const result = await this.client.chat.completions.create(requestParams);
//             return this.processTextResponse(result, messages);
//         } catch (error: any) {
//             logMessage("error", `✗ chat.completions.create failed: ${error.message}`);
//             logMessage("error", `Error details: ${JSON.stringify({ status: error.status, code: error.code })}`);
//             throw error;
//         }
//     }

//     private processTextResponse(result: any, messages: LLMMessage[]): LLMResponse {
//         const responseText = result.choices[0].message.content;
//         const updatedMessages = [...messages, { role: "assistant", content: responseText } as LLMMessage];
//         return { response: responseText, messages: updatedMessages } as LLMResponse;
//     }

//     private enforceStrictSchema(schema: any, isRoot: boolean) {
//         if (!schema || typeof schema !== "object") return schema;

//         if (isRoot && schema.type !== "object") {
//             schema = {
//                 type: "object",
//                 properties: { ___results: { ...schema } },
//                 required: ["___results"]
//             };
//         }

//         if (schema.type === "object" || schema.type === "array") {
//             schema.additionalProperties = false;
//             schema.strict = true;
//             if (schema.properties) {
//                 schema.required = Object.keys(schema.properties);
//                 delete schema.patternProperties;
//                 Object.values(schema.properties).forEach((prop: any) => this.enforceStrictSchema(prop, false));
//             }
//             if (schema.items) {
//                 schema.items = this.enforceStrictSchema(schema.items, false);
//                 delete schema.minItems;
//                 delete schema.maxItems;
//             }
//         }
//         return schema;
//     }

//     private async processToolCall(
//         toolCall: any,
//         tools: any[],
//         conversationMessages: any[],
//         context?: any
//     ): Promise<{ finalResult: any; shouldBreak: boolean }> {
//         const name = toolCall.function?.name;
//         const callId = toolCall.id;
//         const args = toolCall.function?.arguments;

//         if (name === "submit") {
//             let finalResult = typeof args === "string" ? parseJSON(args) : args;
//             if (finalResult.___results) finalResult = finalResult.___results;
//             conversationMessages.push({ role: "tool", tool_call_id: callId, content: "Done" } as any);
//             return { finalResult, shouldBreak: true };
//         } else if (name === "abort") {
//             const error = typeof args === "string" ? parseJSON(args) : args;
//             return { finalResult: { error: error?.reason || "Unknown error" }, shouldBreak: true };
//         } else {
//             const tool = tools.find(t => t.function?.name === name);
//             if (tool && tool.execute) {
//                 const toolResult = await tool.execute(typeof args === "string" ? parseJSON(args) : args, context);
//                 conversationMessages.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(toolResult || {}) } as any);
//             }
//             else {
//                 console.log(`Tool ${name} not found`);
//                 conversationMessages.push({ role: "tool", tool_call_id: callId, content: JSON.stringify({ error: `Tool ${name} not found - continue without it` }) } as any);
//             }
//             return { finalResult: null, shouldBreak: false };
//         }
//     }

//     async generateObject(
//         messages: LLMMessage[],
//         schema: any,
//         temperature: number = 0,
//         customTools?: ToolDefinition[],
//         context?: any
//     ): Promise<LLMObjectResponse> {
//         schema = addNullableToOptional(schema);
//         const hasCustomTools = !!(customTools && customTools.length > 0);
//         if (!hasCustomTools) {
//             schema = this.enforceStrictSchema(schema, true);
//         } else {
//         }

//         const dateMessage: LLMMessage = {
//             role: "system",
//             content: "The current date and time is " + new Date().toISOString()
//         };

//         const tools = [
//             {
//                 type: "function" as const,
//                 function: { name: "submit", description: "Submit the final result in the required format. Submit the result even if it's an error and keep submitting until we stop. Keep non-function messages short and concise because they are only for debugging.", parameters: schema, strict: !hasCustomTools }
//             },
//             {
//                 type: "function" as const,
//                 function: {
//                     name: "abort",
//                     description: "ONLY call this if the request is technically impossible due API limitations or missing information that is critical to the request.",
//                     parameters: {
//                         type: "object",
//                         properties: { reason: { type: "string", description: "The critical technical error" } },
//                         required: ["reason"],
//                         additionalProperties: false,
//                         strict: !hasCustomTools
//                     }
//                 }
//             },
//             ...(customTools?.map(t => ({
//                 type: "function" as const,
//                 function: { name: t.name, description: t.description, parameters: t.arguments },
//                 execute: t.execute
//             })) || [])
//         ];

//         try {
//             let finalResult: any = null;
//             let conversationMessages: LLMMessage[] = String(messages[0]?.content)?.startsWith("The current date and time is")
//                 ? messages
//                 : [dateMessage, ...messages];
//             let forceSubmit: boolean = false;

//             while (finalResult === null) {
//                 const requestParams: any = {
//                     messages: conversationMessages,
//                     tools: tools.map(t => ({ type: t.type, function: t.function })),
//                     temperature
//                 };

//                 // Decide tool choice strategy
//                 let toolChoice: any = (customTools && customTools.length > 0) ? "auto" : "required";
//                 if (forceSubmit) toolChoice = { type: "function", function: { name: "submit" } };
//                 requestParams.tool_choice = toolChoice;

//                 // Azure SDK with deployment doesn't need model param, OpenAI does
//                 if (!this.isAzure) {
//                     requestParams.model = this.model;
//                 }

//                 try {
//                     const response = await this.client.chat.completions.create(requestParams);
//                     const choice = response.choices[0];
//                     const message = choice.message;

//                     const assistantMessage: LLMMessage = { role: "assistant", content: message.content || "" };
//                     if (message.tool_calls && message.tool_calls.length > 0) {
//                         (assistantMessage as any).tool_calls = message.tool_calls;
//                     }
//                     conversationMessages.push(assistantMessage);

//                     if (message.tool_calls) {
//                         for (const toolCall of message.tool_calls) {
//                             const { finalResult: result, shouldBreak } = await this.processToolCall(toolCall, tools as any[], conversationMessages as any[], context);
//                             if (shouldBreak) {
//                                 finalResult = result;
//                             }
//                         }
//                     }

//                     if (!finalResult && !message.tool_calls) {
//                         if (!(customTools && customTools.length > 0)) { forceSubmit = true; continue; }
//                         throw new Error("No tool calls received from the model");
//                     }
//                 } catch (error: any) {
//                     logMessage("error", `✗ generateObject request failed: ${error.message}`);
//                     throw error;
//                 }
//             }

//             const updatedMessages = [...conversationMessages, { role: "assistant", content: JSON.stringify(finalResult) } as LLMMessage];

//             return { response: finalResult, messages: updatedMessages } as LLMObjectResponse;
//         } catch (error: any) {
//             logMessage("error", "Error in OpenAI Legacy generateObject:", error);
//             const updatedMessages = [...messages, { role: "assistant", content: "Error: OpenAI API Error: " + error.message } as LLMMessage];
//             return { response: "Error: OpenAI API Error: " + error.message, messages: updatedMessages } as LLMObjectResponse;
//         }
//     }
// }
