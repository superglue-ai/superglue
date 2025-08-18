import { ApiConfig, Integration, RequestOptions } from "@superglue/client";
import { generateInstructionsDefinition, generateInstructionsImplementation } from "../utils/instructions.js";
import {
    buildWorkflowImplementation,
    buildWorkflowToolDefinition,
    searchDocumentationToolDefinition,
    searchDocumentationToolImplementation,
    submitToolDefinition
} from "../workflow/workflow-tools.js";

export interface ToolDefinition {
    name: string;
    description: string;
    arguments: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
    execute?: ToolImplementation;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

export interface ToolCallResult {
    toolCallId: string;
    success: boolean;
    error?: string;
    data?: any;
}

// Base context with common metadata
export interface BaseToolContext {
    runId: string;
    orgId: string;
}

// Specific contexts extend the base
export interface WorkflowExecutionContext extends BaseToolContext {
    originalEndpoint: ApiConfig;
    payload: Record<string, any>;
    credentials: Record<string, string>;
    options: RequestOptions;
    integration?: Integration;
}

export interface WorkflowBuildContext extends BaseToolContext {
    messages: any[];
    integrations?: Integration[];
}


export type ToolImplementation<TContext extends BaseToolContext = BaseToolContext> = (
    args: any,
    context: TContext
) => Promise<{
    success: boolean;
    error?: string;
    data?: any;
}>;

const toolRegistry: Record<string, ToolImplementation<any>> = {
    generate_instructions: generateInstructionsImplementation,
    search_documentation: searchDocumentationToolImplementation,
    build_workflow: buildWorkflowImplementation
};

export const allToolDefinitions = [
    generateInstructionsDefinition,
    searchDocumentationToolDefinition,
    submitToolDefinition,
    buildWorkflowToolDefinition
];

export async function executeTool(toolCall: ToolCall, context: BaseToolContext): Promise<ToolCallResult> {
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

export function getToolDefinitions(toolNames?: string[]): ToolDefinition[] {
    if (!toolNames) return allToolDefinitions;

    return allToolDefinitions.filter(def => toolNames.includes(def.name));
} 