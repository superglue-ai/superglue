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

    private enrichTools(suggestions: Array<{ id: string, reason: string }>, allTools: Workflow[]): SuggestedTool[] {
        return suggestions
            .map(({ id, reason }) => {
                const tool = allTools.find(t => t.id === id);
                if (!tool) return null;
                
                return {
                    id: tool.id,
                    instruction: tool.instruction,
                    inputSchema: tool.inputSchema,
                    responseSchema: tool.responseSchema,
                    steps: tool.steps.map(s => ({
                        integrationId: s.integrationId,
                        instruction: s.apiConfig?.instruction
                    })),
                    reason
                };
            })
            .filter(t => t !== null);
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
            return this.enrichTools(tools.map(t => ({ id: t.id, reason: "Available tool" })), tools);
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
            const { response: rawSelection, error: rawSelectionError } = await LanguageModel.generateObject(
                messages,
                selectionSchema
            );

            if (rawSelectionError || rawSelection?.error) {
                throw new Error(`Error selecting tools: ${rawSelectionError || rawSelection?.error}`);
            }

            if (!rawSelection?.suggestedTools || !Array.isArray(rawSelection.suggestedTools)) {
                logMessage('warn', "Tool selection returned unexpected format.", this.metadata);
                return [];
            }

            return this.enrichTools(rawSelection.suggestedTools, tools);
        } catch (error) {
            logMessage('error', `Error during tool selection: ${error}`, this.metadata);
            return [];
        }
    }
}

