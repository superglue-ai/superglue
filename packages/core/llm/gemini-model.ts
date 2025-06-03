import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { LLM, LLMObjectResponse, LLMResponse } from "./llm.js";


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

