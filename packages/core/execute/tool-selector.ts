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
    steps: Array<{
        integrationId?: string;
        instruction?: string;
    }>;
    reason: string;
}

export class ToolSelector {
    private metadata: Metadata;

    constructor(metadata: Metadata) {
        this.metadata = metadata;
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
            return tools.map(tool => ({
                id: tool.id,
                instruction: tool.instruction,
                steps: tool.steps.map(s => ({
                    integrationId: s.integrationId,
                    instruction: s.apiConfig?.instruction
                })),
                reason: "Available tool (no specific query provided)"
            }));
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

        const userPrompt = getFindRelevantToolsContext(contextInput, { characterBudget: 50000 });

        const messages: ChatMessage[] = [
            { role: "system", content: FIND_RELEVANT_TOOLS_SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
        ];

        try {
            const { response: rawSelection } = await LanguageModel.generateObject(
                messages,
                selectionSchema
            );

            if (rawSelection && rawSelection.suggestedTools && Array.isArray(rawSelection.suggestedTools)) {
                const suggestions = rawSelection.suggestedTools
                    .map(suggestion => {
                        const tool = tools.find(t => t.id === suggestion.id);
                        if (!tool) {
                            return null;
                        }
                        return {
                            id: tool.id,
                            instruction: tool.instruction,
                            steps: tool.steps.map(s => ({
                                integrationId: s.integrationId,
                                instruction: s.apiConfig?.instruction
                            })),
                            reason: suggestion.reason
                        };
                    })
                    .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion !== null);

                if (suggestions.length === 0) {
                    logMessage('info', 'Tool selector returned no specific tools. Returning all available tools as a fallback.', this.metadata);
                    return tools.map(tool => ({
                        id: tool.id,
                        instruction: tool.instruction,
                        steps: tool.steps.map(s => ({
                            integrationId: s.integrationId,
                            instruction: s.apiConfig?.instruction
                        })),
                        reason: "No specific match found for your query, but this tool is available for use"
                    }));
                }

                return suggestions;
            }

            logMessage('warn', "Tool selection returned an unexpected format. Returning all available tools as fallback.", this.metadata);
            return tools.map(tool => ({
                id: tool.id,
                instruction: tool.instruction,
                steps: tool.steps.map(s => ({
                    integrationId: s.integrationId,
                    instruction: s.apiConfig?.instruction
                })),
                reason: "Selection failed, but this tool is available for use"
            }));

        } catch (error) {
            logMessage('error', `Error during tool selection: ${error}`, this.metadata);
            logMessage('info', 'Returning all available tools as fallback due to selection error.', this.metadata);
            return tools.map(tool => ({
                id: tool.id,
                instruction: tool.instruction,
                steps: tool.steps.map(s => ({
                    integrationId: s.integrationId,
                    instruction: s.apiConfig?.instruction
                })),
                reason: "Selection failed due to error, but this tool is available for use"
            }));
        }
    }
}

