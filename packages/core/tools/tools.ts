import { ToolCall, ToolDefinition, ToolResult } from "../llm/llm.js";
import { generateInstructionsDefinition, generateInstructionsImplementation } from "../utils/instructions.js";
import { executeWorkflowStepDefinition, executeWorkflowStepImplementation, modifyStepConfigDefinition, modifyStepConfigImplementation } from "../workflow/workflow-execution-tools.js";
import { buildWorkflowDefinition, buildWorkflowImplementation, planWorkflowDefinition, planWorkflowImplementation, searchDocumentationDefinition, searchDocumentationImplementation } from "../workflow/workflow-tools.js";

export type ToolImplementation = (args: any, metadata?: any) => Promise<any>;

export const tools: Record<string, ToolImplementation> = {
    generate_instructions: generateInstructionsImplementation,
    search_documentation: searchDocumentationImplementation,
    plan_workflow: planWorkflowImplementation,
    build_workflow: buildWorkflowImplementation,
    execute_workflow_step: executeWorkflowStepImplementation,
    modify_step_config: modifyStepConfigImplementation
};

export const toolDefinitions: ToolDefinition[] = [
    generateInstructionsDefinition,
    searchDocumentationDefinition,
    planWorkflowDefinition,
    buildWorkflowDefinition,
    executeWorkflowStepDefinition,
    modifyStepConfigDefinition
];

export async function executeTool(toolCall: ToolCall, metadata?: any): Promise<ToolResult> {
    const implementation = tools[toolCall.name];

    if (!implementation) {
        return {
            toolCallId: toolCall.id,
            result: null,
            error: `Tool '${toolCall.name}' not found`
        };
    }

    try {
        const result = await implementation(toolCall.arguments, metadata);
        return {
            toolCallId: toolCall.id,
            result
        };
    } catch (error) {
        return {
            toolCallId: toolCall.id,
            result: null,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

export function createToolExecutor(metadata?: any) {
    return (toolCall: ToolCall) => executeTool(toolCall, metadata);
}

export function getToolDefinitions(toolNames?: string[]): ToolDefinition[] {
    if (!toolNames) return toolDefinitions;

    return toolDefinitions.filter(def => toolNames.includes(def.name));
} 