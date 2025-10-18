// import { GoogleGenerativeAI } from "@google/generative-ai";
// import { ToolCall, ToolCallResult, ToolDefinition } from "../tools/tools.js";
// import { LLM, LLMAgentResponse, LLMMessage, LLMObjectResponse, LLMResponse, LLMToolResponse } from "./llm.js";

// export class GeminiModel implements LLM {
//     public contextLength: number = 1000000;
//     private genAI: GoogleGenerativeAI;
//     private model: string;
//     constructor(model: string = null) {
//         this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
//         this.model = model || process.env.GEMINI_MODEL || "gemini-2.5-flash";
//     }
//     async generateText(messages: LLMMessage[], temperature: number = 0): Promise<LLMResponse> {
//         const { geminiHistory, systemInstruction, userPrompt } = this.convertToGeminiHistory(messages);
//         const model = this.genAI.getGenerativeModel({
//             model: this.model,
//             systemInstruction: systemInstruction + "\n\n" + "The current date and time is " + new Date().toISOString(),
//         });

//         const chatSession = model.startChat({
//             generationConfig: {
//                 temperature: temperature,
//                 topP: 0.95,
//                 topK: 64,
//                 maxOutputTokens: 65536,
//                 responseMimeType: "text/plain"
//             } as any,
//             history: geminiHistory
//         });
//         const result = await chatSession.sendMessage(userPrompt);
//         let responseText = result.response.text();

//         // Add response to messages history
//         messages.push({
//             role: "assistant",
//             content: responseText
//         });
//         return {
//             response: responseText,
//             messages: messages
//         };
//     }
//     async generateObject(messages: LLMMessage[], schema: any, temperature: number = 0): Promise<LLMObjectResponse> {
//         // Remove additionalProperties and make all properties required
//         const cleanSchema = schema ? this.cleanSchemaForGemini(schema) : undefined;

//         const { geminiHistory, systemInstruction, userPrompt } = this.convertToGeminiHistory(messages);
//         const model = this.genAI.getGenerativeModel({
//             model: this.model,
//             systemInstruction: systemInstruction + "\n\n" + "The current date and time is " + new Date().toISOString(),
//         });
//         const chatSession = model.startChat({
//             generationConfig: {
//                 temperature: temperature,
//                 topP: 0.95,
//                 topK: 64,
//                 maxOutputTokens: 65536,
//                 responseMimeType: "application/json",
//                 responseSchema: cleanSchema,
//             },
//             history: geminiHistory
//         });
//         const result = await chatSession.sendMessage(userPrompt);
//         let responseText = result.response.text();

//         // Clean up any potential prefixes/suffixes while preserving arrays
//         responseText = responseText.replace(/^[^[{]*/, '').replace(/[^}\]]*$/, '');
//         const generatedObject = JSON.parse(responseText);

//         // Add response to messages history
//         messages.push({
//             role: "assistant",
//             content: responseText
//         });
//         return {
//             response: generatedObject,
//             messages: messages
//         };
//     }

//     async executeTool(
//         messages: LLMMessage[],
//         tools: ToolDefinition[],
//         temperature: number = 0.2,
//         forceToolUse: boolean = false,
//         previousResponseId?: string
//     ): Promise<LLMToolResponse> {
//         // Convert tools to Gemini function declarations
//         const functionDeclarations = tools.map(tool => ({
//             name: tool.name,
//             description: tool.description,
//             parameters: this.cleanSchemaForGemini(tool.arguments)
//         }));

//         const { geminiHistory, systemInstruction, userPrompt } = this.convertToGeminiHistory(messages);

//         // Add instruction for forced tool use if needed
//         const enhancedSystemInstruction = forceToolUse
//             ? `${systemInstruction}\n\nYou MUST use one of the provided tools to respond to this request.`
//             : systemInstruction;

//         const model = this.genAI.getGenerativeModel({
//             model: this.model,
//             systemInstruction: enhancedSystemInstruction + "\n\n" + "The current date and time is " + new Date().toISOString(),
//             tools: [{
//                 functionDeclarations
//             }]
//         });

//         const chatSession = model.startChat({
//             generationConfig: {
//                 temperature: temperature,
//                 topP: 0.95,
//                 topK: 64,
//                 maxOutputTokens: 65536,
//             },
//             history: geminiHistory
//         });

//         const result = await chatSession.sendMessage(userPrompt);
//         const response = result.response;

//         // Extract function calls from the response
//         let toolCall: ToolCall | null = null;
//         let textResponse: string | undefined;

//         // Get text content
//         try {
//             textResponse = response.text();
//         } catch (e) {
//             // No text content, likely only function calls
//         }

//         // Check for function calls
//         const functionCalls = response.functionCalls();
//         if (functionCalls && functionCalls.length > 0) {
//             const fc = functionCalls[0]; // Take the first function call
//             toolCall = {
//                 id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
//                 name: fc.name,
//                 arguments: fc.args as Record<string, any>
//             };
//         }

//         // Build updated messages
//         const updatedMessages = [...messages];
//         if (toolCall || textResponse) {
//             const assistantMessage: LLMMessage = {
//                 role: "assistant",
//                 content: textResponse || null
//             };

//             if (toolCall) {
//                 assistantMessage.tool_calls = [{
//                     id: toolCall.id,
//                     type: "function",
//                     function: {
//                         name: toolCall.name,
//                         arguments: JSON.stringify(toolCall.arguments)
//                     }
//                 }];
//             }

//             updatedMessages.push(assistantMessage);
//         }

//         return {
//             toolCall,
//             textResponse,
//             messages: updatedMessages
//         };
//     }

//     async executeTaskWithTools(
//         messages: LLMMessage[],
//         tools: ToolDefinition[],
//         toolExecutor: (toolCall: ToolCall) => Promise<ToolCallResult>,
//         options?: {
//             maxIterations?: number;
//             temperature?: number;
//             shouldAbort?: (step: { toolCall: ToolCall; result: ToolCallResult }) => boolean;
//         }
//     ): Promise<LLMAgentResponse> {
//         const { maxIterations = 10, temperature = 0.2 } = options || {};
//         const functionDeclarations = tools.map(tool => ({
//             name: tool.name,
//             description: tool.description,
//             parameters: this.cleanSchemaForGemini(tool.arguments)
//         }));

//         const model = this.genAI.getGenerativeModel({
//             model: this.model,
//             tools: [{ functionDeclarations }]
//         });

//         const { geminiHistory, systemInstruction, userPrompt } = this.convertToGeminiHistory(messages);

//         const chatSession = model.startChat({
//             generationConfig: { temperature, topP: 0.95, topK: 64, maxOutputTokens: 8192 },
//             history: geminiHistory
//         });

//         let currentMessages = [...messages];
//         const executionTrace: LLMAgentResponse['executionTrace'] = [];
//         const allToolCalls: ToolCall[] = [];
//         let pendingFunctionResponses: any[] = [];
//         let lastSuccessfulToolCall: LLMAgentResponse['lastSuccessfulToolCall'] = undefined;
//         let lastError: string | undefined = undefined;

//         for (let i = 0; i < maxIterations; i++) {
//             let result;

//             if (i === 0) {
//                 result = await chatSession.sendMessage(userPrompt);
//             } else if (pendingFunctionResponses.length > 0) {
//                 // Send function responses back to the model
//                 result = await chatSession.sendMessage(pendingFunctionResponses);
//                 pendingFunctionResponses = [];
//             } else {
//                 result = await chatSession.sendMessage("Continue.");
//             }

//             const response = result.response;
//             const textContent = response.text();
//             const functionCalls = response.functionCalls() || [];

//             currentMessages.push({ role: 'assistant', content: textContent || null });

//             if (functionCalls.length === 0) {
//                 return {
//                     finalResult: textContent,
//                     toolCalls: allToolCalls,
//                     executionTrace,
//                     messages: currentMessages,
//                     success: false,
//                     lastSuccessfulToolCall,
//                     lastError: lastError || "No tool calls made",
//                     terminationReason: 'abort'
//                 };
//             }

//             // Process all function calls and collect responses
//             for (const fc of functionCalls) {
//                 const toolCall: ToolCall = {
//                     id: `call_${Date.now()}_${i}`,
//                     name: fc.name,
//                     arguments: fc.args as Record<string, any>
//                 };
//                 allToolCalls.push(toolCall);
//                 const toolResult = await toolExecutor(toolCall);
//                 executionTrace.push({ toolCall, result: toolResult });

//                 // Track successful results
//                 if (toolResult.success) {
//                     lastSuccessfulToolCall = {
//                         toolCall: toolCall,
//                         result: toolResult.data,
//                     };
//                 } else if (toolResult.error) {
//                     lastError = toolResult.error;
//                 }

//                 // Prepare function response for next iteration
//                 pendingFunctionResponses.push({
//                     functionResponse: {
//                         name: fc.name,
//                         response: toolResult.data || null
//                     }
//                 });

//                 if (options?.shouldAbort?.({ toolCall, result: toolResult })) {
//                     return {
//                         finalResult: lastSuccessfulToolCall?.result ?? "Execution aborted by caller.",
//                         toolCalls: allToolCalls,
//                         executionTrace,
//                         messages: currentMessages,
//                         success: !!lastSuccessfulToolCall,
//                         lastSuccessfulToolCall,
//                         lastError,
//                         terminationReason: lastSuccessfulToolCall ? 'success' : 'abort'
//                     };
//                 }
//             }
//         }

//         // Max iterations reached
//         return {
//             finalResult: lastSuccessfulToolCall?.result ?? null,
//             toolCalls: allToolCalls,
//             executionTrace,
//             messages: currentMessages,
//             success: false,
//             lastSuccessfulToolCall,
//             lastError: lastError || `Maximum iterations (${maxIterations}) reached`,
//             terminationReason: 'max_iterations'
//         };
//     }

//     private cleanSchemaForGemini(schema: any): any {
//         // Remove $schema property
//         if (schema.$schema !== undefined) {
//             delete schema.$schema;
//         }

//         // Remove additionalProperties and optional flags
//         if (schema.additionalProperties !== undefined) {
//             delete schema.additionalProperties;
//         }
//         if (schema.optional !== undefined) {
//             delete schema.optional;
//         }

//         // Make all properties required
//         if (schema.properties && typeof schema.properties === 'object') {
//             // Add a 'required' array with all property names
//             schema.required = Object.keys(schema.properties);

//             for (const prop of Object.values(schema.properties)) {
//                 if (typeof prop === 'object') {
//                     this.cleanSchemaForGemini(prop); // Recurse for nested properties
//                 }
//             }
//         }

//         // Handle arrays
//         if (schema.items) {
//             if (typeof schema.items === 'object') {
//                 this.cleanSchemaForGemini(schema.items); // Recurse for items in arrays
//             }
//         }
//         return schema;
//     }

//     private convertToGeminiHistory(messages: LLMMessage[]): { geminiHistory: any[]; systemInstruction: string | undefined; userPrompt: any; } {
//         const geminiHistory: any[] = [];
//         let systemInstruction: string | undefined;

//         const systemMessage = messages.find(m => m.role === 'system');
//         if (systemMessage) {
//             systemInstruction = systemMessage.content as string;
//         }

//         const historyMessages = messages.filter(m => m.role !== 'system');
//         const lastMessage = historyMessages.pop();
//         const userPrompt = lastMessage?.content ?? "";

//         for (const message of historyMessages) {
//             let parts: any[] = [];
//             if (message.content) {
//                 parts.push({ text: message.content });
//             }

//             if (message.role === 'assistant' && message.tool_calls) {
//                 const functionCalls = message.tool_calls.map(tc => {
//                     try {
//                         return {
//                             name: tc.function.name,
//                             args: JSON.parse(tc.function.arguments)
//                         };
//                     } catch (e) {
//                         return {
//                             name: tc.function.name,
//                             args: {}
//                         };
//                     }
//                 });

//                 if (functionCalls.length > 0) {
//                     parts = [{ functionCall: functionCalls[0] }];
//                 }
//             } else if (message.role === 'tool') {
//                 let toolContent: any;
//                 try {
//                     toolContent = JSON.parse(message.content as string);
//                 } catch (e) {
//                     toolContent = { content: message.content };
//                 }

//                 const assistantToolCall = messages
//                     .flatMap(m => (m.role === 'assistant' && m.tool_calls) ? m.tool_calls : [])
//                     .find(tc => tc.id === message.tool_call_id);

//                 parts = [{
//                     functionResponse: {
//                         name: assistantToolCall?.function.name || '',
//                         response: toolContent
//                     }
//                 }];
//             }

//             if (parts.length > 0) {
//                 geminiHistory.push({
//                     role: message.role === 'assistant' ? 'model' : 'user',
//                     parts
//                 });
//             }
//         }
//         return { geminiHistory, systemInstruction, userPrompt };
//     }
// }

