import { Workflow } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getFindRelevantToolsContext } from "../context/context-builders.js";
import { FIND_RELEVANT_TOOLS_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { logMessage } from "../utils/logs.js";

type ChatMessage = LLMMessage;

export interface SuggestedTool {
    id: string;
    instruction?: string;
    inputSchema?: any;
    steps: Array<{
        integrationId?: string;
        instruction?: string;
    }>;
    responseSchema?: any;
    reason: string;
}

export class ToolSelector {
    private metadata: Metadata;

    constructor(metadata: Metadata) {
        this.metadata = metadata;
    }

    private toSuggestedTools(tools: Workflow[], reason: string): SuggestedTool[] {
        return tools.map(tool => ({
            id: tool.id,
            instruction: tool.instruction,
            inputSchema: tool.inputSchema,
            responseSchema: tool.responseSchema,
            steps: tool.steps.map(s => ({
                integrationId: s.integrationId,
                instruction: s.apiConfig?.instruction
            })),
            reason
        }));
    }

    public async select(
        query: string | undefined,
        tools: Workflow[]
    ): Promise<SuggestedTool[]> {
        if (!tools || tools.length === 0) {
            logMessage('info', 'No tools available for selection.', this.metadata);
            return [];
        }

        if (!query || query.trim() === "" || query.trim() === "*" || query.trim() === "all") {
            logMessage('info', 'No specific query provided, returning all available tools.', this.metadata);
            return this.toSuggestedTools(tools, "Available tool (no specific query provided)");
        }

        const selectionSchema = zodToJsonSchema(z.object({
            suggestedTools: z.array(z.object({
                id: z.string().describe("The ID of the suggested tool."),
                reason: z.string().describe("A brief explanation of why this tool is relevant to the user's query.")
            })).describe("A list of tools that are relevant to the user's request.")
        }));

        const contextInput = {
            searchTerms: query,
            availableTools: tools
        };

        const userPrompt = getFindRelevantToolsContext(contextInput, { characterBudget: 100000 });

        const messages: ChatMessage[] = [
            { role: "system", content: FIND_RELEVANT_TOOLS_SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
        ];

        try {
            const { response: rawSelection } = await LanguageModel.generateObject(
                messages,
                selectionSchema
            );

            if (!rawSelection?.suggestedTools || !Array.isArray(rawSelection.suggestedTools)) {
                logMessage('warn', "Tool selection returned unexpected format. Returning all tools.", this.metadata);
                return this.toSuggestedTools(tools, "Available tool");
            }

            const suggestions = rawSelection.suggestedTools
                .map((suggestion) => {
                    const tool = tools.find(t => t.id === suggestion.id);
                    if (!tool) {
                        logMessage('warn', `LLM suggested tool ID '${suggestion.id}' which was not found in available tools. Available IDs: ${tools.map(t => t.id).join(', ')}`, this.metadata);
                        return null;
                    }

                    return {
                        id: tool.id,
                        instruction: tool.instruction,
                        inputSchema: tool.inputSchema,
                        responseSchema: tool.responseSchema,
                        steps: tool.steps.map(s => ({
                            integrationId: s.integrationId,
                            instruction: s.apiConfig?.instruction
                        })),
                        reason: suggestion.reason
                    };
                })
                .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion !== null);

            return suggestions.length > 0 ? suggestions : this.toSuggestedTools(tools, "Available tool");
        } catch (error) {
            logMessage('error', `Error during tool selection: ${error}`, this.metadata);
            return this.toSuggestedTools(tools, "Available tool");
        }
    }
}

