import { ServiceMetadata } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";
import { generateInstructionsToolDefinition, generateInstructionsToolImplementation } from "./llm-tools.js";
import { searchDocumentationToolDefinition, searchDocumentationToolImplementation } from "./llm-tools.js";

export interface LLMToolDefinition {
    name: string;
    description: string;
    arguments: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
    execute?: LLMToolImplementation;
}

export interface LLMToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

export interface LLMToolCallResult {
    toolCallId: string;
    success: boolean;
    error?: string;
    data?: any;
}

export type LLMToolImplementation<TContext extends ServiceMetadata = ServiceMetadata> = (
    args: any,
    context: TContext
) => Promise<{
    success: boolean;
    error?: string;
    data?: any;
}>;

const toolRegistry: Record<string, LLMToolImplementation<any>> = {
    generate_instructions: generateInstructionsToolImplementation,
    search_documentation: searchDocumentationToolImplementation,
};

export const allLLMToolDefinitions = [
    generateInstructionsToolDefinition,
    searchDocumentationToolDefinition,
];

export async function executeLLMTool<TContext extends ServiceMetadata>(toolCall: LLMToolCall, context: TContext): Promise<LLMToolCallResult> {
    const implementation = toolRegistry[toolCall.name];

    if (!implementation) {
        return {
            toolCallId: toolCall.id,
            success: false,
            error: `Tool '${toolCall.name}' not found`
        };
    }

    try {
        const result = await implementation(toolCall.arguments, context);
        return {
            toolCallId: toolCall.id,
            success: result.success,
            data: result.data,
            error: result.error
        };
    } catch (error) {
        return {
            toolCallId: toolCall.id,
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export function getLLMToolDefinitions(toolNames?: string[]): LLMToolDefinition[] {
    if (!toolNames) return allLLMToolDefinitions;

    return allLLMToolDefinitions.filter(def => toolNames.includes(def.name));
} 

export function logToolExecution(toolName: string, input: any, output: any, metadata?: ServiceMetadata): void {
    let outputStr: string;
    try {
        outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    } catch {
        outputStr = '[unstringifiable]';
    }

    switch (toolName) {
        case 'search_documentation': {
            const query = input?.query || 'no query';
            logMessage('debug', `search_documentation: query="${query}" → ${outputStr.length} chars`, metadata);
            break;
        }
        case 'inspect_source_data': {
            const expression = input?.expression || 'no expression';
            logMessage('debug', `inspect_source_data: expr="${expression}" → ${outputStr.length} chars`, metadata);
            break;
        }
        case 'web_search': {
            const query = input?.query || 'no query';
            logMessage('debug', `web_search: query="${query}" → ${outputStr.length} chars`, metadata);
            break;
        }
    }
}