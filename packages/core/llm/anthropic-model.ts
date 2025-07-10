import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { LLM, LLMObjectResponse, LLMResponse } from "./llm.js";

export class AnthropicModel implements LLM {
    public contextLength: number = 200000; // Claude 3 supports up to 200k tokens
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || "",
        });
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
        
        // Add schema instruction to the last user message
        let lastUserIdx = -1;
        for (let i = anthropicMessages.length - 1; i >= 0; i--) {
            if (anthropicMessages[i].role === 'user') {
                lastUserIdx = i;
                break;
            }
        }
        
        if (lastUserIdx !== -1) {
            const schemaInstruction = `\n\nPlease respond with a JSON object that matches this schema:\n${JSON.stringify(schema, null, 2)}`;
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

        // Extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No valid JSON found in response");
        }

        const generatedObject = JSON.parse(jsonMatch[0]);

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