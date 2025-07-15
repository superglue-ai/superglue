import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { LLM, LLMAutonomousResponse, LLMObjectResponse, LLMResponse, LLMToolResponse, ToolCall, ToolDefinition, ToolResult } from "./llm.js";

export class AnthropicModel implements LLM {
    public contextLength: number = 200000; // Claude 3 supports up to 200k tokens
    private client: Anthropic;
    private model: string;

    constructor() {
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || "",
        });
        this.model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    }

    async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
        const { system, anthropicMessages } = this.convertToAnthropicFormat(messages);

        const dateMessage = `The current date and time is ${new Date().toISOString()}`;
        const fullSystem = system ? `${system}\n\n${dateMessage}` : dateMessage;

        const response = await this.client.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
            system: fullSystem,
            messages: anthropicMessages,
            temperature,
            max_tokens: 8192,
        });

        const responseText = response.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');

        // Add response to messages history
        const updatedMessages = [...messages, {
            role: "assistant",
            content: responseText
        } as ChatCompletionMessageParam];

        return {
            response: responseText,
            messages: updatedMessages
        };
    }

    async generateObject(messages: ChatCompletionMessageParam[], schema: any, temperature: number = 0): Promise<LLMObjectResponse> {
        const { system, anthropicMessages } = this.convertToAnthropicFormat(messages);

        // Add schema instruction to the last user message with XML tags for better extraction
        let lastUserIdx = -1;
        for (let i = anthropicMessages.length - 1; i >= 0; i--) {
            if (anthropicMessages[i].role === 'user') {
                lastUserIdx = i;
                break;
            }
        }

        if (lastUserIdx !== -1) {
            let schemaInstruction: string;
            if (schema) {
                schemaInstruction = `\n\nPlease respond with a JSON object that matches this schema, wrapped in <json> tags:
<json>
${JSON.stringify(schema, null, 2)}
</json>

Your response must contain ONLY the JSON object within the <json> tags, with no additional text or explanation.`;
            } else {
                // When no schema is provided, just ask for valid JSON
                schemaInstruction = `\n\nPlease respond with a valid JSON object wrapped in <json> tags:
<json>
{your JSON response here}
</json>

Your response must contain ONLY the JSON object within the <json> tags, with no additional text or explanation.`;
            }
            anthropicMessages[lastUserIdx].content += schemaInstruction;
        }

        const dateMessage = `The current date and time is ${new Date().toISOString()}`;
        const fullSystem = system ? `${system}\n\n${dateMessage}` : dateMessage;

        const response = await this.client.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
            system: fullSystem,
            messages: anthropicMessages,
            temperature,
            max_tokens: 8192,
        });

        const responseText = response.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n');

        // Try multiple extraction strategies
        let generatedObject: any = null;
        let extractionError: string | null = null;

        // Strategy 1: Extract from XML tags
        const xmlMatch = responseText.match(/<json>\s*([\s\S]*?)\s*<\/json>/);
        if (xmlMatch) {
            try {
                generatedObject = JSON.parse(xmlMatch[1]);
            } catch (e) {
                extractionError = `Failed to parse JSON from XML tags: ${e}`;
            }
        }

        // Strategy 2: Extract from code blocks
        if (!generatedObject) {
            const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                try {
                    generatedObject = JSON.parse(codeBlockMatch[1]);
                } catch (e) {
                    extractionError = `Failed to parse JSON from code block: ${e}`;
                }
            }
        }

        // Strategy 3: Extract largest valid JSON object
        if (!generatedObject) {
            // Find all potential JSON objects
            const jsonMatches = responseText.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
            let largestJson: any = null;
            let largestSize = 0;

            for (const match of jsonMatches) {
                try {
                    const parsed = JSON.parse(match[0]);
                    const size = JSON.stringify(parsed).length;
                    if (size > largestSize) {
                        largestJson = parsed;
                        largestSize = size;
                    }
                } catch (e) {
                    // Continue trying other matches
                }
            }

            if (largestJson) {
                generatedObject = largestJson;
            } else {
                extractionError = extractionError || "No valid JSON object found in response";
            }
        }

        if (!generatedObject) {
            throw new Error(`JSON extraction failed: ${extractionError}\nResponse: ${responseText.slice(0, 500)}...`);
        }

        // Validate against schema if provided
        if (schema) {
            try {
                // Basic validation - check required fields
                if (schema.properties) {
                    const required = schema.required || [];
                    for (const field of required) {
                        if (!(field in generatedObject)) {
                            throw new Error(`Missing required field: ${field}`);
                        }
                    }
                }
            } catch (validationError) {
                throw new Error(`Schema validation failed: ${validationError}`);
            }
        }

        // Add response to messages history
        const updatedMessages = [...messages, {
            role: "assistant",
            content: responseText
        } as ChatCompletionMessageParam];

        return {
            response: generatedObject,
            messages: updatedMessages
        };
    }

    async executeTool(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        tools: ToolDefinition[],
        temperature: number = 0.2,
        forceToolUse: boolean = false,
        previousResponseId?: string  // Not used by Anthropic, but needed for interface compatibility
    ): Promise<LLMToolResponse> {
        const anthropicTools = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters
        }));

        const anthropicMessages = this.convertToAnthropicFormat(messages);

        const response = await this.client.messages.create({
            model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
            messages: anthropicMessages.anthropicMessages,
            system: anthropicMessages.system,
            tools: anthropicTools,
            tool_choice: forceToolUse ? { type: "any" as const } : { type: "auto" as const },
            temperature,
            max_tokens: 4096,
        });

        // Convert Anthropic response back to OpenAI format
        const textContent = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map(block => block.text)
            .join('\n');
        
        const toolUseBlock = response.content.find((block): block is Anthropic.ToolUseBlock => 
            block.type === 'tool_use'
        );

        const assistantMessage: ChatCompletionMessageParam = toolUseBlock ? {
            role: "assistant",
            content: textContent || null,
            tool_calls: [{
                id: toolUseBlock.id,
                type: "function",
                function: {
                    name: toolUseBlock.name,
                    arguments: JSON.stringify(toolUseBlock.input)
                }
            }]
        } : {
            role: "assistant",
            content: textContent
        };

        const updatedMessages = [...messages, assistantMessage];

        if (toolUseBlock) {
            return {
                toolCall: {
                    id: toolUseBlock.id,
                    name: toolUseBlock.name,
                    arguments: toolUseBlock.input as Record<string, any>
                },
                textResponse: textContent || undefined,
                messages: updatedMessages
            };
        }

        return {
            toolCall: null,
            textResponse: textContent || undefined,
            messages: updatedMessages
        };
    }

    async executeTaskWithTools(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        tools: ToolDefinition[],
        toolExecutor: (toolCall: ToolCall) => Promise<ToolResult>,
        options?: {
            maxIterations?: number;
            temperature?: number;
        }
    ): Promise<LLMAutonomousResponse> {
        const maxIterations = options?.maxIterations || 10;
        const temperature = options?.temperature || 0.2;

        const anthropicTools = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters
        }));

        // Add agentic system message for consistency
        const agenticSystemMessage: OpenAI.Chat.ChatCompletionMessageParam = {
            role: "system",
            content: `You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved.

If you are not sure about something, use your tools to gather the relevant information: do NOT guess or make up an answer.

You MUST plan extensively before each function call, and reflect extensively on the outcomes of the previous function calls.`
        };

        let currentMessages = [agenticSystemMessage, ...messages];
        const executionTrace: LLMAutonomousResponse['executionTrace'] = [];
        const allToolCalls: ToolCall[] = [];

        for (let i = 0; i < maxIterations; i++) {
            const anthropicMessages = this.convertToAnthropicFormat(currentMessages);

            const response = await this.client.messages.create({
                model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
                messages: anthropicMessages.anthropicMessages,
                system: anthropicMessages.system,
                tools: anthropicTools,
                tool_choice: { type: "auto" as const },
                temperature,
                max_tokens: 4096,
            });

            // Convert response to OpenAI format
            const textContent = response.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map(block => block.text)
                .join('\n');
            
            const toolUseBlocks = response.content.filter((block): block is Anthropic.ToolUseBlock => 
                block.type === 'tool_use'
            );

            if (toolUseBlocks.length > 0) {
                currentMessages.push({
                    role: "assistant",
                    content: textContent || null,
                    tool_calls: toolUseBlocks.map(tu => ({
                        id: tu.id,
                        type: "function" as const,
                        function: {
                            name: tu.name,
                            arguments: JSON.stringify(tu.input)
                        }
                    }))
                });
            } else {
                currentMessages.push({
                    role: "assistant",
                    content: textContent
                });
            }

            if (toolUseBlocks.length === 0) {
                // Model decided to stop calling tools
                return {
                    finalResult: textContent,
                    toolCalls: allToolCalls,
                    executionTrace,
                    messages: currentMessages
                };
            }

            // Execute all tool calls in this response
            for (const toolUseBlock of toolUseBlocks) {
                const tc: ToolCall = {
                    id: toolUseBlock.id,
                    name: toolUseBlock.name,
                    arguments: toolUseBlock.input as Record<string, any>
                };
                allToolCalls.push(tc);

                const result = await toolExecutor(tc);
                executionTrace.push({ toolCall: tc, result });

                // Add tool result to messages
                currentMessages.push({
                    role: "user",
                    content: [{
                        type: "tool_result",
                        tool_use_id: toolUseBlock.id,
                        content: JSON.stringify(result.result)
                    }] as any
                });
            }
        }

        // Max iterations reached
        throw new Error(`Maximum iterations (${maxIterations}) reached in executeTaskWithTools`);
    }

    private convertToAnthropicFormat(messages: ChatCompletionMessageParam[]): {
        system: string;
        anthropicMessages: Anthropic.MessageParam[];
    } {
        let system = "";
        const anthropicMessages: Anthropic.MessageParam[] = [];

        for (const message of messages) {
            if (message.role === 'system') {
                system += (system ? '\n\n' : '') + message.content;
            } else if (message.role === 'user' || message.role === 'assistant') {
                anthropicMessages.push({
                    role: message.role,
                    content: String(message.content)
                });
            }
        }

        return { system, anthropicMessages };
    }
} 