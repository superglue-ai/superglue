import { Integration } from "@superglue/client";
import { Metadata } from "@superglue/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getFindRelevantIntegrationsContext } from "../context/context-builders.js";
import { FIND_RELEVANT_INTEGRATIONS_SYSTEM_PROMPT } from "../context/context-prompts.js";
import { LanguageModel, LLMMessage } from "../llm/language-model.js";
import { logMessage } from "../utils/logs.js";

type ChatMessage = LLMMessage;

export interface SuggestedIntegration {
    integration: Integration;
    reason: string;
}

export class IntegrationSelector {
    private metadata: Metadata;

    constructor(metadata: Metadata) {
        this.metadata = metadata;
    }

    public async select(
        instruction: string | undefined,
        integrations: Integration[]
    ): Promise<SuggestedIntegration[]> {

        if (!integrations || integrations.length === 0) {
            logMessage('info', 'No integrations available for selection.', this.metadata);
            return [];
        }

        if (!instruction || instruction.trim() === "" || instruction.trim() === "*" || instruction.trim() === "all") {
            logMessage('info', 'No specific instruction provided, returning all available integrations.', this.metadata);
            return integrations.map(int => ({
                integration: int,
                reason: "Available integration (no specific instruction provided)"
            }));
        }

        const selectionSchema = zodToJsonSchema(z.object({
            suggestedIntegrations: z.array(z.object({
                id: z.string().describe("The ID of the suggested integration."),
                reason: z.string().describe("A brief explanation of why this integration is relevant to the user's instruction.")
            })).describe("A list of integrations that are relevant to the user's request.")
        }));

        const messages: ChatMessage[] = [
            { role: "system", content: FIND_RELEVANT_INTEGRATIONS_SYSTEM_PROMPT },
            {
                role: "user",
                content: getFindRelevantIntegrationsContext({ searchTerms: instruction, availableIntegrations: integrations }, { characterBudget: LanguageModel.contextLength / 10 })
            }
        ];

        try {
            const { response: rawSelection, error: rawSelectionError } = await LanguageModel.generateObject(
                messages,
                selectionSchema
            );
            if (rawSelectionError || rawSelection?.error) {
                throw new Error(`Error selecting integrations: ${rawSelectionError || rawSelection?.error}`);
            }
            
            if (rawSelection && rawSelection.suggestedIntegrations && Array.isArray(rawSelection.suggestedIntegrations)) {
                // Enrich LLM suggestions with full integration data
                const suggestions = rawSelection.suggestedIntegrations
                    .map(suggestion => {
                        const integration = integrations.find(int => int.id === suggestion.id);
                        if (!integration) {
                            return null;
                        }
                        return {
                            integration,
                            reason: suggestion.reason
                        };
                    })
                    .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion !== null);

                // If LLM returned no specific integrations, fallback to all integrations
                if (suggestions.length === 0) {
                    logMessage('info', 'Integration selector returned no specific integrations. Returning all available integrations as a fallback.', this.metadata);
                    return integrations.map(int => ({
                        integration: int,
                        reason: "No specific match found for your request, but this integration is available for use"
                    }));
                }

                return suggestions;
            }

            logMessage('warn', "Integration selection returned an unexpected format. Returning all available integrations as fallback.", this.metadata);
            // Return all integrations as fallback if the format is not as expected
            return integrations.map(int => ({
                integration: int,
                reason: "Selection failed, but this integration is available for use"
            }));

        } catch (error) {
            logMessage('error', `Error during integration selection: ${error}`, this.metadata);
            logMessage('info', 'Returning all available integrations as fallback due to selection error.', this.metadata);
            return integrations.map(int => ({
                integration: int,
                reason: "Selection failed due to error, but this integration is available for use"
            }));
        }
    }
} 