import Anthropic from "@anthropic-ai/sdk";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { ToolCall, ToolCallResult, ToolDefinition } from "../tools/tools.js";
import { parseJSON } from "../utils/json-parser.js";
import { LLM, LLMAgentResponse, LLMObjectResponse, LLMResponse } from "./llm.js";

export class AnthropicModel implements LLM {
    public contextLength: number = 200000; // Claude 3 supports up to 200k tokens
    private client: Anthropic;
    private model: string;

    constructor(model: string = null) {
        this.model = model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || "",
        });
    }

    async generateText(messages: ChatCompletionMessageParam[], temperature: number = 0): Promise<LLMResponse> {
        const { system, anthropicMessages } = this.convertToAnthropicFormat(messages);

        const dateMessage = `The current date and time is ${new Date().toISOString()}`;
        const fullSystem = system ? `${system}\n\n${dateMessage}` : dateMessage;

        const response = await this.client.messages.create({
            model: this.model,
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
            model: this.model,
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
                generatedObject = parseJSON(xmlMatch[1]);
            } catch (e) {
                extractionError = `Failed to parse JSON from XML tags: ${e}`;
            }
        }

        // Strategy 2: Extract from code blocks
        if (!generatedObject) {
            const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                try {
                    generatedObject = parseJSON(codeBlockMatch[1]);
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
                    const parsed = parseJSON(match[0]);
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

    async executeTaskWithTools(
        messages: ChatCompletionMessageParam[],
        tools: ToolDefinition[],
        toolExecutor: (toolCall: ToolCall) => Promise<ToolCallResult>,
        options?: {
            maxIterations?: number;
            temperature?: number;
            shouldAbort?: (step: { toolCall: ToolCall; result: ToolCallResult }) => boolean;
        }
    ): Promise<LLMAgentResponse> {
        const { maxIterations = 10, temperature = 0.2 } = options || {};
        const anthropicTools = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.arguments
        }));

        const executionTrace: LLMAgentResponse['executionTrace'] = [];
        const allToolCalls: ToolCall[] = [];
        let lastSuccessfulToolCall: LLMAgentResponse['lastSuccessfulToolCall'] = undefined;
        let lastError: string | undefined = undefined;

        for (let i = 0; i < maxIterations; i++) {
            const { system, anthropicMessages } = this.convertToAnthropicFormat(messages);

            const response = await this.client.messages.create({
                model: this.model,
                messages: anthropicMessages,
                system,
                tools: anthropicTools,
                tool_choice: { type: "auto" },
                temperature,
                max_tokens: 4096,
            });

            const textContent = response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text').map(block => block.text).join('\n');
            const toolUseBlocks = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');

            const assistantMessage: ChatCompletionMessageParam = { role: "assistant", content: textContent || null };
            if (toolUseBlocks.length > 0) {
                assistantMessage.tool_calls = toolUseBlocks.map(tu => ({
                    id: tu.id,
                    type: "function",
                    function: { name: tu.name, arguments: JSON.stringify(tu.input) }
                }));
            }
            messages.push(assistantMessage);

            const toolResultContents = [];
            for (const toolUseBlock of toolUseBlocks) {
                const toolCall: ToolCall = {
                    id: toolUseBlock.id,
                    name: toolUseBlock.name,
                    arguments: toolUseBlock.input as Record<string, any>
                };
                allToolCalls.push(toolCall);

                const result = await toolExecutor(toolCall);
                executionTrace.push({ toolCall, result });

                // Track successful results
                if (result.success) {
                    lastSuccessfulToolCall = {
                        toolCall: toolCall,
                        result: result.data
                    };
                } else if (result.error) {
                    lastError = result.error;
                }

                toolResultContents.push({
                    type: "tool_result" as const,
                    tool_use_id: toolUseBlock.id,
                    content: JSON.stringify(result.data || null)
                });

                if (options?.shouldAbort?.({ toolCall, result })) {
                    return {
                        finalResult: lastSuccessfulToolCall?.result ?? "Execution aborted by caller.",
                        toolCalls: allToolCalls,
                        executionTrace,
                        messages: messages,
                        success: !!lastSuccessfulToolCall,
                        lastSuccessfulToolCall,
                        lastError,
                        terminationReason: lastSuccessfulToolCall ? 'success' : 'abort'
                    };
                }
            }

            // Push tool results as a user message if there were any tool calls
            if (toolResultContents.length > 0) {
                messages.push({ role: "user", content: toolResultContents });
            }
        }
        return {
            finalResult: lastSuccessfulToolCall?.result ?? null,
            toolCalls: allToolCalls,
            executionTrace,
            messages: messages,
            success: false,
            lastSuccessfulToolCall,
            lastError: lastError || `Maximum iterations (${maxIterations}) reached`,
            terminationReason: 'max_iterations'
        };
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
            } else if (message.role === 'user') {
                // Check if this is a tool result message
                if (Array.isArray(message.content) && message.content.length > 0 &&
                    typeof message.content[0] === 'object' && 'type' in message.content[0] &&
                    (message.content[0] as any).type === 'tool_result') {
                    // This is already in Anthropic format, use as-is
                    anthropicMessages.push({
                        role: 'user',
                        content: message.content as any
                    });
                } else {
                    // Regular user message
                    anthropicMessages.push({
                        role: 'user',
                        content: String(message.content)
                    });
                }
            } else if (message.role === 'assistant') {
                // Build content array for assistant message
                const content: any[] = [];

                // Add text content if present
                if (message.content) {
                    content.push({
                        type: 'text',
                        text: String(message.content)
                    });
                }

                // Add tool uses if present
                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
                        if (toolCall.type === 'function') {
                            content.push({
                                type: 'tool_use',
                                id: toolCall.id,
                                name: toolCall.function.name,
                                input: parseJSON(toolCall.function.arguments)
                            });
                        }
                    }
                }

                anthropicMessages.push({
                    role: 'assistant',
                    content: content
                });
            }
        }

        return { system, anthropicMessages };
    }
} 