import OpenAI from "openai";
import type { SystemModelMessage, UserModelMessage, AssistantModelMessage, ToolModelMessage } from "ai";
import { ToolCall, ToolCallResult, ToolDefinition } from "../tools/tools.js";
import { VercelAIModel } from "./vercel-ai-model.js";

export type LLMMessage = SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage;

export interface LLM {
    contextLength: number;
    generateText(messages: LLMMessage[], temperature?: number): Promise<LLMResponse>;
    generateObject(messages: LLMMessage[], schema: any, temperature?: number, customTools?: ToolDefinition[], context?: any): Promise<LLMObjectResponse>;
}

export interface LLMToolResponse {
    toolCall: ToolCall | null;
    textResponse?: string;
    messages: LLMMessage[];
    responseId?: string;
}

export interface LLMAgentResponse {
    finalResult: any;
    toolCalls: ToolCall[];
    executionTrace: Array<{
        toolCall: ToolCall;
        result: ToolCallResult;
    }>;
    messages: LLMMessage[];
    responseId?: string;
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
    messages: LLMMessage[];
}

export interface LLMObjectResponse {
    response: any;
    messages: LLMMessage[];
}

// Lazy initialization to ensure environment variables are loaded
let _languageModel: LLM | null = null;

export const LanguageModel = {
    get contextLength(): number {
        return this._getInstance().contextLength;
    },

    generateText(messages: LLMMessage[], temperature?: number): Promise<LLMResponse> {
        return this._getInstance().generateText(messages, temperature);
    },

    generateObject(messages: LLMMessage[], schema: any, temperature?: number, customTools?: ToolDefinition[], context?: any): Promise<LLMObjectResponse> {
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
    // switch (String(process.env.LLM_PROVIDER).toLowerCase()) {
    //     case "openai":
    //         logMessage("info", "Using OpenAI model: " + process.env.OPENAI_MODEL);
    //         return new OpenAIModel();
    //     case "openai_legacy":
    //         logMessage("info", "Using OpenAI model with legacy chat completions API: " + process.env.OPENAI_MODEL);
    //         return new OpenAILegacyModel();
    //     case "gemini":
    //         logMessage("info", "Using Gemini model: " + process.env.GEMINI_MODEL);
    //         return new GeminiModel();
    //     case "anthropic":
    //         logMessage("info", "Using Anthropic model: " + process.env.ANTHROPIC_MODEL);
    //         return new AnthropicModel();
    //     default:
    //         const defaultModel = new OpenAIModel();
    //         logMessage("info", "Using default model: " + defaultModel.model);
    //         return defaultModel;
    // }
    return new VercelAIModel();
}
