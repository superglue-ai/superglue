import OpenAI from "openai";
import { GeminiModel } from "./gemini-model.js";
import { OpenAIModel } from "./openai-model.js";

export interface LLM {
    contextLength: number;
    generateText(messages: OpenAI.Chat.ChatCompletionMessageParam[], temperature?: number): Promise<LLMResponse>;
    generateObject(messages: OpenAI.Chat.ChatCompletionMessageParam[], schema: any, temperature?: number): Promise<LLMObjectResponse>;
}

export interface LLMResponse {
    response: string;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
}

export interface LLMObjectResponse {
    response: any;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
}

export const LanguageModel = selectLanguageModel();

function selectLanguageModel(): LLM {
    switch(String(process.env.LLM_PROVIDER).toUpperCase()) {
        case "OPENAI":
            return new OpenAIModel();
        case "GEMINI":
            return new GeminiModel();
        default:
            return new OpenAIModel();
    }
}
