import { logMessage } from "../utils/logs.js";
import { generateInstructionsDefinition, generateInstructionsImplementation } from "./llm-tools.js";
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

// Base context with common metadata
export interface BaseLLMToolContext {
    runId: string;
    orgId: string;
}

export type LLMToolImplementation<TContext extends BaseLLMToolContext = BaseLLMToolContext> = (
    args: any,
    context: TContext
) => Promise<{
    success: boolean;
    error?: string;
    data?: any;
}>;

const toolRegistry: Record<string, LLMToolImplementation<any>> = {
    generate_instructions: generateInstructionsImplementation,
    search_documentation: searchDocumentationToolImplementation,
};

export const allLLMToolDefinitions = [
    generateInstructionsDefinition,
    searchDocumentationToolDefinition,
];

export async function executeLLMTool<TContext extends BaseLLMToolContext>(toolCall: LLMToolCall, context: TContext): Promise<LLMToolCallResult> {
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

export function logToolExecution(toolName: string, input: any, output: any): void {
    switch (toolName) {
      case 'search_documentation': {
        const query = input?.query || 'unknown';
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        logMessage('info', `search_documentation tool executed with keywords: ${query}" returned ${outputStr.length} chars`);
        break;
      }
    }
  }