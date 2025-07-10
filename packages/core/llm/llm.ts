import OpenAI from "openai";
import { logMessage } from "../utils/logs.js";
import { AnthropicModel } from "./anthropic-model.js";
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
    switch (String(process.env.LLM_PROVIDER).toUpperCase()) {
        case "OPENAI":
            logMessage("info", "Using OpenAI model: " + process.env.OPENAI_MODEL);
            return new OpenAIModel();
        case "GEMINI":
            logMessage("info", "Using Gemini model: " + process.env.GEMINI_MODEL);
            return new GeminiModel();
        case "ANTHROPIC":
            logMessage("info", "Using Anthropic model: " + process.env.ANTHROPIC_MODEL);
            return new AnthropicModel();
        default:
            logMessage("info", "Using default model: " + process.env.OPENAI_MODEL);
            return new OpenAIModel();
    }
}
