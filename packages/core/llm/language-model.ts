import type { AssistantModelMessage, SystemModelMessage, ToolModelMessage, UserModelMessage } from "ai";
import { ToolCall, ToolCallResult, ToolDefinition } from "../execute/tools.js";
import { AiSdkModel } from "./ai-sdk-model.js";

export type LLMMessage = SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage;

export interface LLM {
    contextLength: number;
    generateText(messages: LLMMessage[], temperature?: number): Promise<LLMResponse>;
    generateObject<T>(input: LLMObjectGeneratorInput): Promise<LLMObjectResponse<T>>;
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

export type LLMObjectResponse<T> = 
    | { success: true; response: T; messages: LLMMessage[] }
    | { success: false; response: string; messages: LLMMessage[] };

export interface LLMObjectGeneratorInput {
    messages: LLMMessage[];
    schema: any;
    temperature?: number;
    tools?: (ToolDefinition | any)[];
    toolContext?: any;
    toolChoice?: 'auto' | 'required' | 'none' | { type: 'tool'; toolName: string };
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

    generateObject<T>(input: LLMObjectGeneratorInput): Promise<LLMObjectResponse<T>> {
        return this._getInstance().generateObject(input) as Promise<LLMObjectResponse<T>>;
    },

    _getInstance(): LLM {
        if (!_languageModel) {
            _languageModel = new AiSdkModel();
        }
        return _languageModel;
    }
};
