import { ApiConfig, Integration, RequestOptions } from "@superglue/client";
import { generateInstructionsDefinition, generateInstructionsImplementation, InstructionGenerationContext } from "../utils/instructions.js";
import {
    buildWorkflowImplementation,
    buildWorkflowToolDefinition,
    searchDocumentationToolDefinition,
    searchDocumentationToolImplementation,
    submitToolDefinition,
    submitToolDefinitionImplementation
} from "../workflow/workflow-tools.js";

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

export interface ToolCallResult {
    toolCallId: string;
    result: {
        resultForAgent: {
            success: boolean;
            error?: string;
            data?: any;
            [key: string]: any; // Allow additional fields
        };
        fullResult?: any;
    } | null;
    error?: string;
}

// Base context with common metadata
export interface BaseToolContext {
    runId: string;
    orgId: string;
}

// Specific contexts extend the base
export interface WorkflowExecutionContext extends BaseToolContext {
    endpoint: ApiConfig;
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
    resultForAgent: {
        success: boolean;
        error?: string;
        data?: any;
        [key: string]: any;
    };
    fullResult?: any;
}>;

const toolRegistry: Record<string, ToolImplementation<any>> = {
    generate_instructions: generateInstructionsImplementation,
    search_documentation: searchDocumentationToolImplementation,
    submit_tool: submitToolDefinitionImplementation,
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
            result: null,
            error: `Tool '${toolCall.name}' not found`
        };
    }

    try {
        const result = await implementation(toolCall.arguments, context);
        return {
            toolCallId: toolCall.id,
            result: result
        };
    } catch (error) {
        return {
            toolCallId: toolCall.id,
            result: null,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export function createToolExecutor(context: BaseToolContext) {
    return (toolCall: ToolCall) => executeTool(toolCall, context);
}

export function getToolDefinitions(toolNames?: string[]): ToolDefinition[] {
    if (!toolNames) return allToolDefinitions;

    return allToolDefinitions.filter(def => toolNames.includes(def.name));
} 