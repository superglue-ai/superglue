import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { LLM, LLMAutonomousResponse, LLMObjectResponse, LLMResponse, LLMToolResponse, ToolCall, ToolDefinition, ToolResult } from "./llm.js";


export class GeminiModel implements LLM {
    public contextLength: number = 1000000;
    private genAI: GoogleGenerativeAI;
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
        const { geminiHistory, systemInstruction, userPrompt } = this.convertToGeminiHistory(messages);
        const model = this.genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-04-17",
            systemInstruction: systemInstruction + "\n\n" + "The current date and time is " + new Date().toISOString(),
        });

        const chatSession = model.startChat({
            generationConfig: {
                temperature: temperature,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 65536,
                responseMimeType: "text/plain"
            } as any,
            history: geminiHistory
        });
        const result = await chatSession.sendMessage(userPrompt);
        let responseText = result.response.text();

        // Add response to messages history
        messages.push({
            role: "assistant",
            content: responseText
        });
        return {
            response: responseText,
            messages: messages
        };
    }
    async generateObject(messages: ChatCompletionMessageParam[], schema: any, temperature: number = 0): Promise<LLMObjectResponse> {
        // Remove additionalProperties and make all properties required
        const cleanSchema = schema ? this.cleanSchemaForGemini(schema) : undefined;

        const { geminiHistory, systemInstruction, userPrompt } = this.convertToGeminiHistory(messages);
        const model = this.genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-04-17",
            systemInstruction: systemInstruction + "\n\n" + "The current date and time is " + new Date().toISOString(),
        });
        const chatSession = model.startChat({
            generationConfig: {
                temperature: temperature,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 65536,
                responseMimeType: "application/json",
                responseSchema: cleanSchema,
            },
            history: geminiHistory
        });
        const result = await chatSession.sendMessage(userPrompt);
        let responseText = result.response.text();

        // Clean up any potential prefixes/suffixes while preserving arrays
        responseText = responseText.replace(/^[^[{]*/, '').replace(/[^}\]]*$/, '');
        const generatedObject = JSON.parse(responseText);

        // Add response to messages history
        messages.push({
            role: "assistant",
            content: responseText
        });
        return {
            response: generatedObject,
            messages: messages
        };
    }

    async executeTool(
        messages: ChatCompletionMessageParam[],
        tools: ToolDefinition[],
        temperature: number = 0.2,
        forceToolUse: boolean = false,
        previousResponseId?: string  // Not used by Gemini, but needed for interface compatibility
    ): Promise<LLMToolResponse> {
        // Convert tools to Gemini function declarations
        const functionDeclarations = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: this.cleanSchemaForGemini(tool.parameters)
        }));

        const { geminiHistory, systemInstruction, userPrompt } = this.convertToGeminiHistory(messages);

        // Add instruction for forced tool use if needed
        const enhancedSystemInstruction = forceToolUse
            ? `${systemInstruction}\n\nYou MUST use one of the provided tools to respond to this request.`
            : systemInstruction;

        const model = this.genAI.getGenerativeModel({
            model: process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-04-17",
            systemInstruction: enhancedSystemInstruction + "\n\n" + "The current date and time is " + new Date().toISOString(),
            tools: [{
                functionDeclarations
            }]
        });

        const chatSession = model.startChat({
            generationConfig: {
                temperature: temperature,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 65536,
            },
            history: geminiHistory
        });

        const result = await chatSession.sendMessage(userPrompt);
        const response = result.response;

        // Extract function calls from the response
        let toolCall: ToolCall | null = null;
        let textResponse: string | undefined;

        // Get text content
        try {
            textResponse = response.text();
        } catch (e) {
            // No text content, likely only function calls
        }

        // Check for function calls
        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            const fc = functionCalls[0]; // Take the first function call
            toolCall = {
                id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                name: fc.name,
                arguments: fc.args as Record<string, any>
            };
        }

        // Build updated messages
        const updatedMessages = [...messages];
        if (toolCall || textResponse) {
            const assistantMessage: ChatCompletionMessageParam = {
                role: "assistant",
                content: textResponse || null
            };

            if (toolCall) {
                assistantMessage.tool_calls = [{
                    id: toolCall.id,
                    type: "function",
                    function: {
                        name: toolCall.name,
                        arguments: JSON.stringify(toolCall.arguments)
                    }
                }];
            }

            updatedMessages.push(assistantMessage);
        }

        return {
            toolCall,
            textResponse,
            messages: updatedMessages
        };
    }

    async executeTaskWithTools(
        messages: ChatCompletionMessageParam[],
        tools: ToolDefinition[],
        toolExecutor: (toolCall: ToolCall) => Promise<ToolResult>,
        options?: {
            maxIterations?: number;
            temperature?: number;
        }
    ): Promise<LLMAutonomousResponse> {
        const maxIterations = options?.maxIterations || 10;
        const temperature = options?.temperature || 0.2;

        // Convert tools to Gemini function declarations
        const functionDeclarations = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: this.cleanSchemaForGemini(tool.parameters)
        }));

        let currentMessages = [...messages];
        const executionTrace: LLMAutonomousResponse['executionTrace'] = [];
        const allToolCalls: ToolCall[] = [];

        // Add agentic system message similar to OpenAI implementation
        const agenticInstruction = `You are an agent - please keep going until the user's query is completely resolved. Only stop when you are sure that the problem is solved.

If you are not sure about something, use your tools to gather the relevant information: do NOT guess or make up an answer.

Plan before each function call and reflect on the outcomes of previous function calls.`;

        for (let i = 0; i < maxIterations; i++) {
            const { geminiHistory, systemInstruction, userPrompt } = this.convertToGeminiHistory(currentMessages);

            const enhancedSystemInstruction = i === 0
                ? `${systemInstruction}\n\n${agenticInstruction}`
                : systemInstruction;

            const model = this.genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || "gemini-2.5-flash-preview-04-17",
                systemInstruction: enhancedSystemInstruction + "\n\n" + "The current date and time is " + new Date().toISOString(),
                tools: [{
                    functionDeclarations
                }]
            });

            const chatSession = model.startChat({
                generationConfig: {
                    temperature: temperature,
                    topP: 0.95,
                    topK: 64,
                    maxOutputTokens: 65536,
                },
                history: geminiHistory
            });

            const result = await chatSession.sendMessage(userPrompt);
            const response = result.response;

            // Extract text and function calls
            let textContent: string | undefined;
            try {
                textContent = response.text();
            } catch (e) {
                // No text content
            }

            const functionCalls = response.functionCalls();

            // Build assistant message
            const assistantMessage: ChatCompletionMessageParam = {
                role: "assistant",
                content: textContent || null
            };

            if (functionCalls && functionCalls.length > 0) {
                assistantMessage.tool_calls = functionCalls.map(fc => ({
                    id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    type: "function" as const,
                    function: {
                        name: fc.name,
                        arguments: JSON.stringify(fc.args)
                    }
                }));
            }

            currentMessages.push(assistantMessage);

            // If no function calls, we have our final response
            if (!functionCalls || functionCalls.length === 0) {
                return {
                    finalResult: textContent || "",
                    toolCalls: allToolCalls,
                    executionTrace,
                    messages: currentMessages
                };
            }

            // Execute all function calls
            for (const fc of functionCalls) {
                const toolCall: ToolCall = {
                    id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    name: fc.name,
                    arguments: fc.args as Record<string, any>
                };
                allToolCalls.push(toolCall);

                const result = await toolExecutor(toolCall);
                executionTrace.push({ toolCall, result });

                // Add tool result as a user message (Gemini doesn't have a specific tool result role)
                currentMessages.push({
                    role: "user",
                    content: `Tool "${toolCall.name}" returned: ${JSON.stringify(result.result)}`
                });
            }
        }

        // Max iterations reached
        throw new Error(`Maximum iterations (${maxIterations}) reached in executeTaskWithTools`);
    }

    private cleanSchemaForGemini(schema: any): any {
        // Remove $schema property
        if (schema.$schema !== undefined) {
            delete schema.$schema;
        }

        // Remove additionalProperties and optional flags
        if (schema.additionalProperties !== undefined) {
            delete schema.additionalProperties;
        }
        if (schema.optional !== undefined) {
            delete schema.optional;
        }

        // Make all properties required
        if (schema.properties && typeof schema.properties === 'object') {
            // Add a 'required' array with all property names
            schema.required = Object.keys(schema.properties);

            for (const prop of Object.values(schema.properties)) {
                if (typeof prop === 'object') {
                    this.cleanSchemaForGemini(prop); // Recurse for nested properties
                }
            }
        }

        // Handle arrays
        if (schema.items) {
            if (typeof schema.items === 'object') {
                this.cleanSchemaForGemini(schema.items); // Recurse for items in arrays
            }
        }
        return schema;
    }

    private convertToGeminiHistory(messages: OpenAI.Chat.ChatCompletionMessageParam[]): { geminiHistory: any; systemInstruction: any; userPrompt: any; } {
        const geminiHistory: any[] = [];
        let userPrompt: any;
        let systemInstruction: any;
        for (var i = 0; i < messages.length; i++) {
            if (messages[i].role == "system") {
                systemInstruction = messages[i].content;
                continue;
            }
            if (i == messages.length - 1) {
                userPrompt = messages[i].content;
                continue;
            }

            geminiHistory.push({
                role: messages[i].role == "assistant" ? "model" : messages[i].role,
                parts: [{ text: messages[i].content }]
            });
        }
        return { geminiHistory, systemInstruction, userPrompt };
    }
}

