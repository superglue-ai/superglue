import OpenAI from "openai";
import { logMessage } from "../utils/logs.js";
import { GeminiModel } from "./gemini-model.js";
import { OpenAIModel } from "./openai-model.js";

export interface LLM {
    contextLength: number;
    generateText(messages: OpenAI.Chat.ChatCompletionMessageParam[], temperature?: number): Promise<LLMResponse>;
    generateObject(messages: OpenAI.Chat.ChatCompletionMessageParam[], schema: any, temperature?: number, customTools?: any[]): Promise<LLMObjectResponse>;
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
    switch (String(process.env.LLM_PROVIDER).toUpperCase()) {
        case "OPENAI":
            logMessage("info", "Using OpenAI model: " + process.env.OPENAI_MODEL);
            return new OpenAIModel();
        case "GEMINI":
            logMessage("info", "Using Gemini model: " + process.env.GEMINI_MODEL);
            return new GeminiModel();
        default:
            logMessage("info", "Using default model: " + process.env.OPENAI_MODEL);
            return new OpenAIModel();
    }
}
