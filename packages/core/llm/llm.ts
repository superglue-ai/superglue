import OpenAI from "openai";
import { ToolCall, ToolCallResult, ToolDefinition } from "../tools/tools.js";
import { logMessage } from "../utils/logs.js";
import { AnthropicModel } from "./anthropic-model.js";
import { GeminiModel } from "./gemini-model.js";
import { OpenAIModel } from "./openai-model.js";

export interface LLM {
    contextLength: number;
    generateText(messages: OpenAI.Chat.ChatCompletionMessageParam[], temperature?: number): Promise<LLMResponse>;
    generateObject(messages: OpenAI.Chat.ChatCompletionMessageParam[], schema: any, temperature?: number, customTools?: ToolDefinition[], context?: any): Promise<LLMObjectResponse>;
}

export interface LLMToolResponse {
    toolCall: ToolCall | null;
    textResponse?: string;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    responseId?: string;  // For OpenAI conversation continuity
}

export interface LLMAgentResponse {
    finalResult: any;
    toolCalls: ToolCall[];
    executionTrace: Array<{
        toolCall: ToolCall;
        result: ToolCallResult;
    }>;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
    responseId?: string;  // For OpenAI conversation continuity
    success: boolean;
    lastSuccessfulToolCall?: {
        toolCall: ToolCall;
        result: any;
        additionalData?: any;
    };
    lastError?: string;
    terminationReason: 'success' | 'max_iterations' | 'abort' | 'error';
}

export interface LLMResponse {
    response: string;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
}

export interface LLMObjectResponse {
    response: any;
    messages: OpenAI.Chat.ChatCompletionMessageParam[];
}

// Lazy initialization to ensure environment variables are loaded
let _languageModel: LLM | null = null;

export const LanguageModel = {
    get contextLength(): number {
        return this._getInstance().contextLength;
    },

    generateText(messages: OpenAI.Chat.ChatCompletionMessageParam[], temperature?: number): Promise<LLMResponse> {
        return this._getInstance().generateText(messages, temperature);
    },

    generateObject(messages: OpenAI.Chat.ChatCompletionMessageParam[], schema: any, temperature?: number, customTools?: ToolDefinition[], context?: any): Promise<LLMObjectResponse> {
        return this._getInstance().generateObject(messages, schema, temperature, customTools, context);
    },

    _getInstance(): LLM {
        if (!_languageModel) {
            _languageModel = selectLanguageModel();
        }
        return _languageModel;
    }
};

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
            logMessage("warn", "⚠️  Anthropic models use a workaround for structured output generation. While enhanced for reliability, they may have higher failure rates than OpenAI/Gemini for complex schemas. Consider using OpenAI or Gemini for production workloads requiring high reliability.");
            return new AnthropicModel();
        default:
            const defaultModel = new OpenAIModel();
            logMessage("info", "Using default model: " + defaultModel.model);
            return defaultModel;
    }
}
